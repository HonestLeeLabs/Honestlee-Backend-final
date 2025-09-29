import { Request, Response, NextFunction } from 'express';
import passport from '../config/passport';
import { signJwt } from '../utils/jwt';

export const googleAuth = passport.authenticate('google', {
  scope: ['profile', 'email']
});

// Pass 'region' header or default to 'global'
export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
  const region = (req.headers['x-region'] as string) || 'global';

  passport.authenticate('google', { session: false }, (err, user, info) => {
    if (err || !user) {
      return res.redirect(`/login?error=authentication_failed&message=${encodeURIComponent(err?.message || 'Google authentication failed')}`);
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
        role: user.role
      });

      // Redirect to frontend root URL with token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/?${queryParams.toString()}`);

    } catch (error) {
      return res.redirect(`/login?error=token_generation_failed&message=${encodeURIComponent('Failed to generate authentication token')}`);
    }
  })(req, res, next);
};
