import express from 'express';
import { healthCheck, getVenues, searchVenues, getVenueById } from '../controllers/zohoController';
import { authenticate } from '../middlewares/authMiddleware';

const router = express.Router();

// Apply your existing authentication middleware
router.use(authenticate);

/**
 * Health check endpoint
 * GET /api/zoho/health
 */
router.get('/health', healthCheck);

/**
 * Get all venues with pagination
 * GET /api/zoho/venues?page=1&per_page=50
 */
router.get('/venues', getVenues);

/**
 * Search venues by name, city, or industry
 * GET /api/zoho/venues/search?q=restaurant
 */
router.get('/venues/search', searchVenues);

/**
 * Get venue details by ID
 * GET /api/zoho/venues/:venueId
 */
router.get('/venues/:venueId', getVenueById);

export default router;
