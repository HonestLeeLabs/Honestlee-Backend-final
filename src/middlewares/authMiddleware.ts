// ===== COMPLETE FIXED FILE: src/middlewares/authMiddleware.ts =====
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ✅ Define AuthRequest interface
export interface AuthRequest extends Request {
  user?: {
    id: string;
    userId: string;
    role: string;
    region?: string;
  };
  fileValidationError?: string;
}

// Helper function to extract region from request
function extractRegionFromRequest(req: Request): string {
  if (req.headers['x-region']) {
    return (req.headers['x-region'] as string).toLowerCase();
  }
  return 'ae'; // Default to Dubai/UAE
}

// ✅ MAIN AUTHENTICATION MIDDLEWARE
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthRequest;
  const authHeader = (authReq.headers.authorization || '').toString();
  
  console.log('🔐 Auth Middleware:');
  console.log('   Path:', req.path);
  console.log('   Method:', req.method);
  console.log('   Authorization Header:', authHeader ? authHeader.substring(0, 30) + '...' : 'None');
  
  if (!authHeader.startsWith('Bearer ')) {
    console.log('❌ Authorization header missing or malformed');
    return res.status(401).json({ 
      success: false,
      message: 'Authorization header missing or malformed' 
    });
  }
  
  const token = authHeader.slice(7); // Remove 'Bearer ' prefix
  
  // Get JWT_SECRET from environment
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET not configured in environment');
    return res.status(500).json({ 
      success: false,
      message: 'Server configuration error' 
    });
  }

  try {
    // ✅ Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    console.log('✅ Token decoded successfully:', {
      userId: decoded.userId,
      role: decoded.role,
      region: decoded.region,
      issued: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : 'N/A',
      expires: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'N/A'
    });

    // Get region from token, header, or default
    const region = decoded.region || extractRegionFromRequest(authReq);

    // ✅ Map JWT payload to AuthRequest.user format
    authReq.user = {
      id: decoded.userId,
      userId: decoded.userId,
      role: decoded.role,
      region: region
    };
    
    console.log('✅ User authenticated:', {
      userId: authReq.user.userId,
      role: authReq.user.role,
      region: authReq.user.region
    });
    
    next();
  } catch (error: any) {
    console.error('❌ Token verification failed:', {
      error: error.message,
      name: error.name,
      path: req.path
    });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token has expired, please login again' 
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token format' 
      });
    }

    return res.status(401).json({ 
      success: false,
      message: 'Invalid or expired token' 
    });
  }
}

// Export alias for backward compatibility
export const authenticateToken = authenticate;
