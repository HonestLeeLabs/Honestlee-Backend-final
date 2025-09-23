import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { createVenue, getVenues, getVenueById, updateVenue } from '../controllers/venueController';

const router = express.Router();

// Wrapper utility to cast Request to AuthRequest for handlers
function wrapAuthHandler(
  handler: (req: AuthRequest, res: Response, next?: NextFunction) => any
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
}

router.post('/', authenticate, wrapAuthHandler(createVenue));  // role checks inside controller
router.get('/', authenticate, wrapAuthHandler(getVenues));    // role checks inside controller
router.get('/:id', authenticate, wrapAuthHandler(getVenueById));
router.put('/:id', authenticate, wrapAuthHandler(updateVenue));

export default router;
