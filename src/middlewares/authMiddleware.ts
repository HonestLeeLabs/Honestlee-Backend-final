import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/jwt';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
    region?: string;
  };
  fileValidationError?: string; // Add this for multer file validation
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

  authReq.user = payload;
  next();
}

// Export alias for backward compatibility
export const authenticateToken = authenticate;
