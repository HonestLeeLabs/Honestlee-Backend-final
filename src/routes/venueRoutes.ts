// ===== FILE: src/routes/venueRoutes.ts =====

import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import {
  createVenue,
  getVenues,
  getVenueById,
  updateVenue,
  deleteVenue,
  getVenuesByCategory,
  getVenueVitals,
  updateVenueVitals
} from '../controllers/venueController';

// Combine Auth and Region types for requests
type CombinedRequest = AuthRequest & RegionRequest;

const router = express.Router();

// Wrapper utility: Casts Request to CombinedRequest for handlers
function wrapCombinedHandler(
  handler: (req: CombinedRequest, res: Response, next?: NextFunction) => any
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as CombinedRequest, res, next);
  };
}

// Basic CRUD routes
router.post('/', authenticate, wrapCombinedHandler(createVenue));
router.get('/', authenticate, wrapCombinedHandler(getVenues));
router.get('/:id', authenticate, wrapCombinedHandler(getVenueById));
router.put('/:id', authenticate, wrapCombinedHandler(updateVenue));
router.delete('/:id', authenticate, wrapCombinedHandler(deleteVenue));

// Category routes
router.get('/category/:category', authenticate, wrapCombinedHandler(getVenuesByCategory));

// ✅ NEW: Vitals endpoints (must be before /:id to avoid conflict)
router.get('/:id/vitals', authenticate, wrapCombinedHandler(getVenueVitals));
router.put('/:id/vitals', authenticate, wrapCombinedHandler(updateVenueVitals));

export default router;
