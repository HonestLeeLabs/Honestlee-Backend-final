import { Request, Response, NextFunction } from 'express';
import passport from '../config/passport';
import { signJwt } from '../utils/jwt';

// Helper to get frontend URL based on region/origin
const getFrontendUrl = (region: string, origin?: string): string => {
  // Try to detect from origin header
  if (origin) {
    if (origin.includes('ae.honestlee.app') || origin.includes('honestlee.ae')) {
      return 'https://ae.honestlee.app';
    }
    if (origin.includes('th.honestlee.app')) {
      return 'https://th.honestlee.app';
    }
    if (origin.includes('in.honestlee.app')) {
      return 'https://in.honestlee.app';
    }
  }
  
  // Fallback based on region
  const regionUrls: Record<string, string> = {
    ae: 'https://ae.honestlee.app',
    th: 'https://th.honestlee.app',
    in: 'https://in.honestlee.app',
    global: 'https://honestlee.app'
  };
  
  return regionUrls[region.toLowerCase()] || process.env.FRONTEND_URL || 'http://localhost:3000';
};

// Initiate Google OAuth
export const googleAuth = (req: Request, res: Response, next: NextFunction) => {
  // Get region from header or query
  const region = (req.headers['x-region'] as string) || req.query.region || 'ae';
  const hl_src = req.query.hl_src;
  const origin = req.headers.origin || req.headers.referer;
  
  // Determine frontend URL
  const frontendUrl = getFrontendUrl(region as string, origin as string);
  
  console.log('🔐 Initiating Google OAuth:', { region, frontendUrl, origin });
  
  // Create state object with all tracking data
  const stateData = {
    region: region,
    frontendUrl: frontendUrl,
    hl_src: hl_src || null,
    timestamp: Date.now()
  };
  
  // Encode state as base64 JSON
  const stateString = Buffer.from(JSON.stringify(stateData)).toString('base64');
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: stateString
  })(req, res, next);
};

// Handle Google OAuth callback
export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('google', { session: false }, (err, user, info) => {
    // Default frontend URL
    let frontendUrl = 'https://ae.honestlee.app';
    let region = 'ae';
    
    // Try to get frontend URL from state FIRST
    try {
      if (req.query.state) {
        const stateData = JSON.parse(Buffer.from(req.query.state as string, 'base64').toString('utf-8'));
        frontendUrl = stateData.frontendUrl || frontendUrl;
        region = stateData.region || region;
        console.log('✅ Decoded state:', stateData);
      }
    } catch (e) {
      console.error('❌ Failed to parse state:', e);
    }
    
    // 🔥 Handle authentication errors
    if (err || !user) {
      console.error('❌ Google auth error:', err);
      
      // Redirect to ROOT with error params (not /login)
      return res.redirect(`${frontendUrl}?error=authentication_failed&message=${encodeURIComponent(err?.message || 'Google authentication failed')}`);
    }

    try {
      // Generate JWT token with region
      const token = signJwt({
        userId: user._id.toString(),
        role: user.role,
        region: region.toLowerCase()
      });

      // Build query params with all user data
      const queryParams = new URLSearchParams({
        token: token,
        userId: user._id.toString(),
        email: user.email,
        name: user.name || '',
        role: user.role,
        loginMethod: user.loginMethod || 'google',
        region: region,
        ...(user.hl_source_token && { hl_source_token: user.hl_source_token }),
        ...(user.hl_utm_data?.utm_campaign && { utm_campaign: user.hl_utm_data.utm_campaign }),
        ...(user.hl_utm_data?.utm_source && { utm_source: user.hl_utm_data.utm_source }),
      });

      console.log('✅ Google OAuth success, redirecting to:', `${frontendUrl}/?${queryParams.toString()}`);

      // Redirect to ROOT with token params (not /login)
      res.redirect(`${frontendUrl}?${queryParams.toString()}`);

    } catch (error) {
      console.error('❌ Token generation error:', error);
      
      // Redirect to ROOT with error params (not /login)
      return res.redirect(`${frontendUrl}?error=token_generation_failed&message=${encodeURIComponent('Failed to generate authentication token')}`);
    }
  })(req, res, next);
};
