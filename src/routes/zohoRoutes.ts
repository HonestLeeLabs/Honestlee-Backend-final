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
  // 🆕 Fixed field endpoints
  getFields,           // ✅ Fixed name
  refreshFields,       // ✅ Fixed name
  getFieldUsageStats,
  debugFieldDiscovery  // ✅ Debug endpoint
} from '../controllers/zohoController';
import { authenticate } from '../middlewares/authMiddleware';

const router = express.Router();

// Apply authentication middleware
router.use(authenticate);

/**
 * READ Operations (Enhanced with dynamic fields)
 */
router.get('/health', healthCheck);
router.get('/venues', getVenues);                    // 🆕 Now with dynamic field discovery
router.get('/venues/cached', getCachedVenues);       // 🆕 Enhanced with dynamic fields
router.get('/venues/search', searchVenues);          // 🆕 Enhanced search with all fields
router.get('/venues/:venueId', getVenueById);        // 🆕 Full field analysis

/**
 * WRITE Operations (Enhanced with field tracking)
 */
router.post('/venues', createVenue);                 // 🆕 Tracks custom fields used
router.post('/venues/bulk', createVenuesBulk);       // 🆕 Analyzes bulk field data
router.put('/venues/:venueId', updateVenue);         // 🆕 Tracks field updates
router.delete('/venues/:venueId', deleteVenue);

/**
 * 🆕 FIXED: DYNAMIC FIELD MANAGEMENT
 */
router.get('/fields', getFields);                    // ✅ Get current available fields
router.post('/fields/refresh', refreshFields);       // ✅ Force refresh field cache
router.get('/fields/usage', getFieldUsageStats);     // Analyze field usage patterns
router.get('/debug/field-discovery', debugFieldDiscovery); // 🔧 Debug endpoint

export default router;
