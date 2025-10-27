import { Router, Request, Response, NextFunction } from 'express';
import {
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

// Public/authenticated routes
router.get('/upcoming', authenticateToken, authRoute(getUpcomingEvents));
router.get('/:id', authenticateToken, authRoute(getEventById));
router.get('/venue/:venueId', authenticateToken, authRoute(getEventsByVenue));
router.post('/:id/register', authenticateToken, authRoute(registerForEvent));

// Manager/Owner/Admin routes
router.post('/', authenticateToken, authRoute(createEvent));
router.put('/:id', authenticateToken, authRoute(updateEvent));
router.delete('/:id', authenticateToken, authRoute(deleteEvent));

export default router;