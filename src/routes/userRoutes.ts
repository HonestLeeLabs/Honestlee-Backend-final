import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { 
  getMyUserDetails, 
  updateMyProfile, 
  getUserById, 
  updateUserRole 
} from '../controllers/userController';

const router = express.Router();

// Wrapper utility to cast Request to AuthRequest for handlers
function wrapAuthHandler(
  handler: (req: AuthRequest, res: Response, next?: NextFunction) => any
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
}

router.get('/me', authenticate, wrapAuthHandler(getMyUserDetails));
router.put('/me', authenticate, wrapAuthHandler(updateMyProfile));

// Admin-only
router.get('/:id', authenticate, wrapAuthHandler(getUserById));
router.put('/:id/role', authenticate, wrapAuthHandler(updateUserRole));

export default router;