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
  bulkImportVenues,
  getGroups,
  getVenuesByGroup,
  getVenuesByCategory,
} from '../controllers/venueDubaiController';

const router = express.Router();

function wrapAuthHandler(handler: (req: AuthRequest, res: Response, next?: NextFunction) => any): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
}

// ============================================
// CRITICAL: Add middleware to intercept special paths
// ============================================
router.use((req: Request, res: Response, next: NextFunction) => {
  const path = req.path;
  console.log('🔍 Incoming request:', req.method, path);
  
  // Intercept special routes that should NOT go to /:id
  if (req.method === 'GET' && path === '/groups') {
    console.log('✅ Intercepted /groups - routing to getGroups');
    return getGroups(req, res);
  }
  
  if (req.method === 'GET' && path.startsWith('/groups/') && path !== '/groups/') {
    const groupId = path.replace('/groups/', '');
    console.log('✅ Intercepted /groups/:id - routing to getVenuesByGroup');
    req.params = { groupId };
    return getVenuesByGroup(req, res);
  }
  
  if (req.method === 'GET' && path.startsWith('/categories/')) {
    const categoryId = path.replace('/categories/', '');
    console.log('✅ Intercepted /categories/:id - routing to getVenuesByCategory');
    req.params = { categoryId };
    return getVenuesByCategory(req, res);
  }
  
  if (req.method === 'GET' && path === '/nearby') {
    console.log('✅ Intercepted /nearby');
    return getNearbyVenues(req, res);
  }
  
  if (req.method === 'GET' && path === '/filters') {
    console.log('✅ Intercepted /filters');
    return getFilterOptions(req, res);
  }
  
  // Let other requests continue to normal routing
  next();
});

// ============================================
// Regular routes (will be bypassed by middleware above)
// ============================================

// Root route for listing all venues
router.get('/', getAllVenues);

// Generic ID route
router.get('/:id', getVenueById);

// Protected routes
router.post('/bulk-import', authenticate, wrapAuthHandler(bulkImportVenues));
router.post('/', authenticate, wrapAuthHandler(createVenue));
router.put('/:id', authenticate, wrapAuthHandler(updateVenue));
router.delete('/:id', authenticate, wrapAuthHandler(deleteVenue));

export default router;