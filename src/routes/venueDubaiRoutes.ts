import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import {
  getAllVenues,
  getVenueById,
  createVenue,
  updateVenue,
  deleteVenue,
  getNearbyVenues,
  getFilterOptions,
  bulkImportVenues
} from '../controllers/venueDubaiController';

const router = express.Router();

// Wrapper utility to cast Request to AuthRequest for handlers
function wrapAuthHandler(
  handler: (req: AuthRequest, res: Response, next?: NextFunction) => any
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
}

// === PUBLIC ROUTES (No authentication required) ===

// GET /api/venues-dubai - Get all venues with filtering
router.get('/', getAllVenues);

// GET /api/venues-dubai/nearby - Find nearby venues
router.get('/nearby', getNearbyVenues);

// GET /api/venues-dubai/filters - Get available filter options
router.get('/filters', getFilterOptions);

// GET /api/venues-dubai/:id - Get single venue
router.get('/:id', getVenueById);

// === PROTECTED ROUTES (Authentication required) ===

// POST /api/venues-dubai - Create venue (Admin/Staff only)
router.post('/', authenticate, wrapAuthHandler(createVenue));

// PUT /api/venues-dubai/:id - Update venue (Admin/Staff only)
router.put('/:id', authenticate, wrapAuthHandler(updateVenue));

// DELETE /api/venues-dubai/:id - Delete venue (Admin only)
router.delete('/:id', authenticate, wrapAuthHandler(deleteVenue));

// POST /api/venues-dubai/bulk-import - Bulk import venues (Admin only)
router.post('/bulk-import', authenticate, wrapAuthHandler(bulkImportVenues));

export default router;
