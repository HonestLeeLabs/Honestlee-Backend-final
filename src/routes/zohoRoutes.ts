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
  createVenuesBulk,
  getVenuesAllFields,
  getFields,
  refreshFields,
  getFieldUsageStats,
  debugFieldDiscovery
} from '../controllers/zohoController';
import { authenticate } from '../middlewares/authMiddleware';

const router = express.Router();

// Apply authentication middleware
router.use(authenticate);

/**
 * READ Operations (Enhanced with dynamic fields)
 */
router.get('/health', healthCheck);
router.get('/venues', getVenues);                        // 🆕 Dynamic field discovery
router.get('/venues/cached', getCachedVenues);           // 🆕 Enhanced with dynamic fields
router.get('/venues/all-fields', getVenuesAllFields);    // 🆕 ALL fields endpoint (SINGLE DEFINITION)
router.get('/venues/search', searchVenues);              // 🆕 Enhanced search
router.get('/venues/:venueId', getVenueById);            // 🆕 Full field analysis

/**
 * WRITE Operations (Enhanced with field tracking)
 */
router.post('/venues', createVenue);                     // 🆕 Tracks custom fields used
router.post('/venues/bulk', createVenuesBulk);           // 🆕 Analyzes bulk field data
router.put('/venues/:venueId', updateVenue);             // 🆕 Tracks field updates
router.delete('/venues/:venueId', deleteVenue);

/**
 * 🆕 DYNAMIC FIELD MANAGEMENT
 */
router.get('/fields', getFields);                        // ✅ Get current available fields
router.post('/fields/refresh', refreshFields);           // ✅ Force refresh field cache
router.get('/fields/usage', getFieldUsageStats);         // Analyze field usage patterns
router.get('/debug/field-discovery', debugFieldDiscovery); // 🔧 Debug endpoint

export default router;
