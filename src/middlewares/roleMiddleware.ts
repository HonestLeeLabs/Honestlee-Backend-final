// ===== FIXED: src/middlewares/authorizeRolesMiddleware.ts =====
import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';

export function authorizeRoles(...allowedRoles: string[]) {
  return function (req: AuthRequest, res: Response, next: NextFunction) {
    // ✅ ADDED: Debug logging
    console.log('🔐 Role Authorization Check:');
    console.log('   User:', req.user ? req.user.userId : 'None');
    console.log('   User Role:', req.user ? req.user.role : 'None');
    console.log('   Allowed Roles:', allowedRoles);
    
    if (!req.user) {
      console.log('❌ Authorization failed: No user in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      console.log(`❌ Authorization failed: Role "${req.user.role}" not in [${allowedRoles.join(', ')}]`);
      return res.status(403).json({ 
        message: 'Forbidden: insufficient role',
        // ✅ ADDED: Include debug info in response
        debug: {
          userRole: req.user.role,
          allowedRoles: allowedRoles
        }
      });
    }
    
    console.log('✅ Authorization successful');
    next();
  };
}
