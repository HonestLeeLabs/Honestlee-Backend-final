import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';

export function authorizeRoles(...allowedRoles: string[]) {
  return function (req: AuthRequest, res: Response, next: NextFunction) {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
}
