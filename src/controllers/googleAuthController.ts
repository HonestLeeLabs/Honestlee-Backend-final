import { Request, Response, NextFunction } from 'express';
import passport from '../config/passport';
import { signJwt } from '../utils/jwt';

export const googleAuth = passport.authenticate('google', {
  scope: ['profile', 'email']
});

// Pass 'region' as 'global' for Google logins
export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
  const region = (req.headers['x-region'] as string) || 'global';
  passport.authenticate('google', { session: false }, (err, user, info) => {
    if (err || !user) {
      return res.status(401).json({ message: 'Google authentication failed', error: err || 'No user' });
    }
    const token = signJwt({ userId: user._id.toString(), role: user.role, region: region.toLowerCase() });
    res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name, role: user.role }
    });
  })(req, res, next);
};
