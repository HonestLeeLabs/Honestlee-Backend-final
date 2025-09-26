import express from 'express';
import { 
  healthCheck, 
  getVenues, 
  searchVenues, 
  getVenueById, 
  getCachedVenues,
  createVenue,
  updateVenue,
  deleteVenue,
  createVenuesBulk
} from '../controllers/zohoController';
import { authenticate } from '../middlewares/authMiddleware';

const router = express.Router();

// Apply authentication middleware
router.use(authenticate);

/**
 * READ Operations
 */
router.get('/health', healthCheck);
router.get('/venues', getVenues);
router.get('/venues/cached', getCachedVenues);
router.get('/venues/search', searchVenues);
router.get('/venues/:venueId', getVenueById);

/**
 * WRITE Operations (NEW - Bidirectional functionality)
 */

// CREATE: Add new venue
router.post('/venues', createVenue);

// CREATE: Bulk add venues
router.post('/venues/bulk', createVenuesBulk);

// UPDATE: Modify existing venue
router.put('/venues/:venueId', updateVenue);

// DELETE: Remove venue
router.delete('/venues/:venueId', deleteVenue);

export default router;
