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
import { getPublicVenueMedia } from '../controllers/mediaController';

type CombinedRequest = AuthRequest & RegionRequest;

const router = express.Router();

function wrapCombinedHandler(
  handler: (req: CombinedRequest, res: Response, next?: NextFunction) => any
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as CombinedRequest, res, next);
  };
}

// ✅ CRITICAL: PUBLIC ROUTES MUST BE BEFORE authenticate middleware
console.log('✅ Registering PUBLIC venue routes');

// Public media endpoint (NO authentication required)
router.get('/:id/media', (req: Request, res: Response, next: NextFunction) => {
  console.log('🔓 Public media request for venue:', req.params.id);
  return wrapCombinedHandler(getPublicVenueMedia)(req, res, next);
});

// ✅ ALL ROUTES BELOW THIS LINE REQUIRE AUTHENTICATION
router.use(authenticate);

console.log('✅ Registering AUTHENTICATED venue routes');

// Basic CRUD routes
router.post('/', wrapCombinedHandler(createVenue));
router.get('/', wrapCombinedHandler(getVenues));
router.get('/:id', wrapCombinedHandler(getVenueById)); // ✅ Must be AFTER /:id/media
router.put('/:id', wrapCombinedHandler(updateVenue));
router.delete('/:id', wrapCombinedHandler(deleteVenue));

// Category routes
router.get('/category/:category', wrapCombinedHandler(getVenuesByCategory));

// Vitals endpoints
router.get('/:id/vitals', wrapCombinedHandler(getVenueVitals));
router.put('/:id/vitals', wrapCombinedHandler(updateVenueVitals));

console.log('✅ All venue routes registered successfully');

export default router;
