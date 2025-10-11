import { Request, Response, NextFunction } from 'express';
import passport from '../config/passport';
import { signJwt } from '../utils/jwt';

// Initiate Google OAuth with QR source
export const googleAuth = (req: Request, res: Response, next: NextFunction) => {
  // 🆕 Get hl_src from query params (passed from frontend)
  const hl_src = req.query.hl_src;
  
  // Store in session or pass along
  if (hl_src) {
    req.session = req.session || {};
    (req.session as any).hl_src = hl_src;
  }
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: hl_src ? JSON.stringify(hl_src) : undefined // 🆕 Pass via OAuth state
  })(req, res, next);
};

// Handle Google OAuth callback
export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
  const region = (req.headers['x-region'] as string) || 'global';

  passport.authenticate('google', { session: false }, (err, user, info) => {
    if (err || !user) {
      console.error('Google auth error:', err);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=authentication_failed&message=${encodeURIComponent(err?.message || 'Google authentication failed')}`);
    }

    try {
      const token = signJwt({
        userId: user._id.toString(),
        role: user.role,
        region: region.toLowerCase()
      });

      const queryParams = new URLSearchParams({
        token: token,
        userId: user._id.toString(),
        email: user.email,
        name: user.name || '',
        role: user.role,
        loginMethod: user.loginMethod || 'google',
        // 🆕 Add QR tracking data to redirect
        ...(user.hl_source_token && { hl_source_token: user.hl_source_token }),
        ...(user.hl_utm_data?.utm_campaign && { utm_campaign: user.hl_utm_data.utm_campaign }),
        ...(user.hl_utm_data?.utm_source && { utm_source: user.hl_utm_data.utm_source }),
      });

      // Redirect to frontend root URL with token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/?${queryParams.toString()}`);

    } catch (error) {
      console.error('Token generation error:', error);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=token_generation_failed&message=${encodeURIComponent('Failed to generate authentication token')}`);
    }
  })(req, res, next);
};
