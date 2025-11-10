import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/jwt';

// ✅ Use the global Express.User interface defined in passport.ts
export interface AuthRequest extends Request {
  user?: Express.User;  // ✅ Changed from custom type to Express.User
  fileValidationError?: string;
}

function extractRegionFromRequest(req: Request): string | undefined {
  if (req.headers['x-region']) {
    return (req.headers['x-region'] as string).toLowerCase();
  }
  return undefined;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthRequest;
  const authHeader = (authReq.headers.authorization || '').toString();
  
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization header missing or malformed' });
  }
  
  const token = authHeader.slice(7);

  // Decode token to check claimed region
  let decoded: any = {};
  try {
    decoded = require('jsonwebtoken').decode(token) || {};
  } catch {}

  // Prefer region in token claim, then header, then fallback to 'global'
  const region = (decoded.region as string) || extractRegionFromRequest(authReq) || 'global';

  const payload = verifyJwt(token, region);

  if (!payload) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  // ✅ Map JWT payload to Express.User format
  authReq.user = {
    id: payload.userId,
    userId: payload.userId,
    role: payload.role,
    region: payload.region,
  };
  
  next();
}

// Export alias for backward compatibility
export const authenticateToken = authenticate;
