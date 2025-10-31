import { Router, Request, Response, NextFunction } from 'express';
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

// Type-safe wrapper for authenticated routes
const authRoute = (handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
};

// ✅ PUBLIC ROUTES - No authentication required
router.get('/', authRoute(getAllEvents)); // Get all events with filters
router.get('/venue/:venueId', authRoute(getEventsByVenue)); // Get events by venue name

// ✅ AUTHENTICATED ROUTES - Require authentication
router.get('/upcoming', authenticateToken, authRoute(getUpcomingEvents));
router.get('/:id', authenticateToken, authRoute(getEventById));
router.post('/:id/register', authenticateToken, authRoute(registerForEvent));

// ✅ PROTECTED ROUTES - Manager/Owner/Admin only
router.post('/', authenticateToken, authRoute(createEvent));
router.put('/:id', authenticateToken, authRoute(updateEvent));
router.delete('/:id', authenticateToken, authRoute(deleteEvent));

export default router;
