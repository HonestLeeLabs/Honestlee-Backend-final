import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import {
  getAllEvents,
  getEventById,
  getEventsByVenue,
  createEvent,
  updateEvent,
  deleteEvent,
  bulkImportEvents,
  getUpcomingEvents
} from '../controllers/eventDubaiController';

const router = express.Router();

function wrapAuthHandler(
  handler: (req: AuthRequest, res: Response, next?: NextFunction) => any
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
}

// === PUBLIC ROUTES ===
// IMPORTANT: Specific routes MUST come BEFORE dynamic parameter routes

// GET /api/events-dubai/upcoming - Get upcoming events (BEFORE /:id)
router.get('/upcoming', getUpcomingEvents);

// GET /api/events-dubai/venue/:account_name - Get events by venue (specific path)
router.get('/venue/:account_name', getEventsByVenue);

// GET /api/events-dubai - Get all events
router.get('/', getAllEvents);

// GET /api/events-dubai/:id - Get single event (MUST BE LAST among GET routes)
router.get('/:id', getEventById);

// === PROTECTED ROUTES ===

// POST /api/events-dubai/bulk-import - Bulk import (BEFORE generic POST)
router.post('/bulk-import', authenticate, wrapAuthHandler(bulkImportEvents));

// POST /api/events-dubai - Create event (Admin/Staff only)
router.post('/', authenticate, wrapAuthHandler(createEvent));

// PUT /api/events-dubai/:id - Update event (Admin/Staff only)
router.put('/:id', authenticate, wrapAuthHandler(updateEvent));

// DELETE /api/events-dubai/:id - Delete event (Admin only)
router.delete('/:id', authenticate, wrapAuthHandler(deleteEvent));

export default router;
