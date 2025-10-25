import { Router, Request, Response, NextFunction } from 'express';
import {
  initiateRedemption,
  approveRedemption,
  completeRedemption,
  getMyRedemptions,
  getVenueRedemptions,
  generateStaffQR,
  verifyStaffQR
} from '../controllers/redemptionController';
import { authenticateToken, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();

// Type-safe wrapper for authenticated routes
const authRoute = (handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
};

// User routes
router.post('/initiate', authenticateToken, authRoute(initiateRedemption));
router.post('/:id/redeem', authenticateToken, authRoute(completeRedemption));
router.get('/my', authenticateToken, authRoute(getMyRedemptions));

// Staff routes
router.post('/:id/approve', authenticateToken, authRoute(approveRedemption));
router.get('/venue/:venueId', authenticateToken, authRoute(getVenueRedemptions));
router.post('/staff-qr/generate', authenticateToken, authRoute(generateStaffQR));
router.post('/staff-qr/verify', authenticateToken, authRoute(verifyStaffQR));

export default router;
