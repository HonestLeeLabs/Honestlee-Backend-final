// ===== FILE: src/routes/eventRoutes.ts =====
import { Router, Request, Response, NextFunction } from 'express';
import { detectRegion, RegionRequest } from '../middlewares/regionMiddleware';
import {
  getAllEvents,
  getUpcomingEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsByVenue,
  registerForEvent
} from '../controllers/eventController';
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

// ✅ PUBLIC ROUTES - No authentication required
router.get('/', authRoute(getAllEvents));
router.get('/venue/:venueId', authRoute(getEventsByVenue));

// ✅ AUTHENTICATED ROUTES
router.get('/upcoming', authenticateToken, authRoute(getUpcomingEvents));
router.get('/:id', authenticateToken, authRoute(getEventById));
router.post('/:id/register', authenticateToken, authRoute(registerForEvent));

// ✅ PROTECTED ROUTES - Manager/Owner/Admin only
router.post('/', authenticateToken, authRoute(createEvent));
router.put('/:id', authenticateToken, authRoute(updateEvent));
router.delete('/:id', authenticateToken, authRoute(deleteEvent));

export default router;
