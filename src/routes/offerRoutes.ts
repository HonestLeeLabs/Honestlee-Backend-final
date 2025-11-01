// ===== FILE: src/routes/offerRoutes.ts =====
import { Router, Request, Response, NextFunction } from 'express';
import { detectRegion, RegionRequest } from '../middlewares/regionMiddleware';
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

// ✅ ADD REGION DETECTION MIDDLEWARE
router.use(detectRegion);

type StaffRequest = AuthRequest & RegionRequest;

// Type-safe wrapper for authenticated routes
const authRoute = (handler: (req: StaffRequest, res: Response, next?: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as StaffRequest, res, next);
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
