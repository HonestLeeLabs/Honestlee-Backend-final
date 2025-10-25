import { Router, Request, Response, NextFunction } from 'express';
import {
  getEligibleOffers,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
  getOffersByVenue
} from '../controllers/offerController';
import { authenticateToken, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();

// Type-safe wrapper for authenticated routes
const authRoute = (handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
};

// Public/authenticated routes
router.get('/eligible', authenticateToken, authRoute(getEligibleOffers));
router.get('/:id', authRoute(getOfferById));
router.get('/venue/:venueId', authRoute(getOffersByVenue));

// Staff/Admin routes
router.post('/', authenticateToken, authRoute(createOffer));
router.put('/:id', authenticateToken, authRoute(updateOffer));
router.delete('/:id', authenticateToken, authRoute(deleteOffer));

export default router;
