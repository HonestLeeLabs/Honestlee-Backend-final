import express from 'express';
import { healthCheck, getVenues, searchVenues, getVenueById, getCachedVenues } from '../controllers/zohoController';
import { authenticate } from '../middlewares/authMiddleware';

const router = express.Router();

// Apply authentication middleware
router.use(authenticate);

/**
 * Health check endpoint
 */
router.get('/health', healthCheck);

/**
 * Get all venues with pagination (direct from Zoho)
 */
router.get('/venues', getVenues);

/**
 * IMPORTANT: Specific routes MUST come before parameterized routes
 * Get cached venues - MUST be before /:venueId route
 */
router.get('/venues/cached', getCachedVenues);

/**
 * Search venues - MUST be before /:venueId route
 */
router.get('/venues/search', searchVenues);

/**
 * Get venue by ID - MUST be LAST (catches everything else)
 */
router.get('/venues/:venueId', getVenueById);

export default router;
