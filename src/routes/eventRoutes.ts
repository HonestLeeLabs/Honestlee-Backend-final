import { Router, Request, Response, NextFunction } from 'express';
import { detectRegion, RegionRequest } from '../middlewares/regionMiddleware';
import { uploadEventImages } from '../config/uploadConfig'; // ✅ Import event image upload
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

router.use(detectRegion);

type StaffRequest = AuthRequest & RegionRequest;

const authRoute = (handler: (req: StaffRequest, res: Response, next?: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as StaffRequest, res, next);
  };
};

// PUBLIC ROUTES
router.get('/', authRoute(getAllEvents));
router.get('/venue/:venueId', authRoute(getEventsByVenue));

// AUTHENTICATED ROUTES
router.get('/upcoming', authenticateToken, authRoute(getUpcomingEvents));
router.get('/:id', authenticateToken, authRoute(getEventById));
router.post('/:id/register', authenticateToken, authRoute(registerForEvent));

// ✅ PROTECTED ROUTES with image upload
router.post(
  '/', 
  authenticateToken, 
  uploadEventImages.array('images', 10), // ✅ Accept up to 10 images
  authRoute(createEvent)
);

router.put(
  '/:id', 
  authenticateToken, 
  uploadEventImages.array('images', 10), // ✅ Accept up to 10 images for updates
  authRoute(updateEvent)
);

router.delete('/:id', authenticateToken, authRoute(deleteEvent));

export default router;
