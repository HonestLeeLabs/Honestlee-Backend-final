import { Request, Response, NextFunction } from 'express';
import passport from '../config/passport';
import { signJwt } from '../utils/jwt';

export const googleAuth = passport.authenticate('google', {
  scope: ['profile', 'email']
});

// Pass 'region' as 'global' for Google logins with 302 redirect
export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
  const region = (req.headers['x-region'] as string) || 'global';
  
  passport.authenticate('google', { session: false }, (err, user, info) => {
    if (err || !user) {
      // Redirect to failure page with error message
      return res.redirect(`/login?error=authentication_failed&message=${encodeURIComponent(err?.message || 'Google authentication failed')}`);
    }
    
    try {
      const token = signJwt({ 
        userId: user._id.toString(), 
        role: user.role, 
        region: region.toLowerCase() 
      });
      
      // Create query parameters for successful authentication
      const queryParams = new URLSearchParams({
        token: token,
        userId: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role
      });
      
      // Redirect to dashboard/home with token and user info as query parameters
      res.redirect(`/dashboard?${queryParams.toString()}`);
      
    } catch (error) {
      // Handle JWT signing errors
      return res.redirect(`/login?error=token_generation_failed&message=${encodeURIComponent('Failed to generate authentication token')}`);
    }
  })(req, res, next);
};
