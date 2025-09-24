import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

export const optionalAuthenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth provided, continue as guest
      (req as any).user = null;
      return next();
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        // Invalid user, continue as guest
        (req as any).user = null;
        return next();
      }

      (req as any).user = user;
      next();
    } catch (jwtError) {
      // Invalid token, continue as guest
      (req as any).user = null;
      next();
    }
  } catch (error) {
    // Any other error, continue as guest
    (req as any).user = null;
    next();
  }
};
