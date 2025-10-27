// ===== FILE: src/routes/venueRoutes.ts =====
import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { 
  createVenue, 
  getVenues, 
  getVenueById, 
  updateVenue,
  deleteVenue,
  getVenuesByCategory,
  getVenueVitals, // ✅ NEW
  updateVenueVitals // ✅ NEW
} from '../controllers/venueController';

const router = express.Router();

// Wrapper utility to cast Request to AuthRequest for handlers
function wrapAuthHandler(
  handler: (req: AuthRequest, res: Response, next?: NextFunction) => any
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
}

// Basic CRUD routes
router.post('/', authenticate, wrapAuthHandler(createVenue));
router.get('/', authenticate, wrapAuthHandler(getVenues));
router.get('/:id', authenticate, wrapAuthHandler(getVenueById));
router.put('/:id', authenticate, wrapAuthHandler(updateVenue));
router.delete('/:id', authenticate, wrapAuthHandler(deleteVenue));

// Category routes
router.get('/category/:category', authenticate, wrapAuthHandler(getVenuesByCategory));

// ✅ NEW: Vitals endpoints (must be before /:id to avoid conflict)
router.get('/:id/vitals', authenticate, wrapAuthHandler(getVenueVitals));
router.put('/:id/vitals', authenticate, wrapAuthHandler(updateVenueVitals));

export default router;
