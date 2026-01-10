// ===== COMPLETE FIXED FILE: src/routes/adminRoutes.ts =====
import express from 'express';
import { NextFunction, Request, Response } from 'express';
import {
  getUsers,
  getUserById,
  updateUserById,
  deleteUserById,
  createVenue,
  getVenues,
  getVenueById,
  updateVenueById,
  deleteVenueById,
} from '../controllers/adminController';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { authorizeRoles } from '../middlewares/roleMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import * as adminAssignmentController from '../controllers/adminAssignmentController';
import * as venueOwnerController from '../controllers/venueOwnerController';
import * as roleController from '../controllers/roleController';

const router = express.Router();

// ✅ Helper function to cast Request to AuthRequest
function withAuthRequest(
  handler: (req: AuthRequest, res: Response, next: NextFunction) => any
) {
  return (req: Request, res: Response, next: NextFunction) =>
    handler(req as AuthRequest, res, next);
}

// ✅ Helper function for handlers that need both Auth and Region
function withCombinedRequest(
  handler: (req: AuthRequest & RegionRequest, res: Response, next: NextFunction) => any
) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Extract region from headers
    const regionReq = req as AuthRequest & RegionRequest;
    const regionHeader = req.headers['x-region'] as string;
    // Set region with proper type
    regionReq.region = (regionHeader === 'th' || regionHeader === 'in' || regionHeader === 'global')
      ? regionHeader
      : 'ae';
    regionReq.language = (req.headers['accept-language'] as string) || 'en';
    return handler(regionReq, res, next);
  };
}

// ✅ Apply authentication to ALL routes FIRST
router.use(withAuthRequest(authenticate));

// ✅ Apply role authorization to ALL routes (ADMIN and MANAGER allowed)
router.use(withAuthRequest(authorizeRoles('ADMIN', 'MANAGER')));

// ===== User Routes =====
router.get('/users', withAuthRequest(getUsers));
router.get('/users/:id', withAuthRequest(getUserById));
router.put('/users/:id', withAuthRequest(updateUserById));
router.delete('/users/:id', withAuthRequest(deleteUserById));

// ===== Role Routes (ADMIN only) =====
router.get('/roles', withAuthRequest(roleController.getAvailableRoles));

// DELETE venue - Must come BEFORE /venues/:id
router.delete('/venues/:tempVenueId', (req: Request, res: Response, next: NextFunction) =>
  adminAssignmentController.deleteVenue(req as any, res).catch(next)
);
router.delete('/venues/:tempVenueId', (req: Request, res: Response, next: NextFunction) =>
  adminAssignmentController.deleteVenue(req as any, res).catch(next)
);

// ===== Venue Routes =====
// ✅ IMPORTANT: Specific routes MUST come BEFORE parameterized routes

// 🆕 ASSIGNMENT ROUTES - Must come BEFORE /venues/:id
router.get('/venues/map', adminAssignmentController.getVenuesForMap);
router.post('/venues/assign', adminAssignmentController.assignVenuesToAgent);
router.get('/venues/:tempVenueId/assignment', adminAssignmentController.unassignVenue); // Changed to GET for consistency
router.delete('/venues/:tempVenueId/assignment', adminAssignmentController.unassignVenue);

// 🆕 AGENT & STATS ROUTES
router.get('/agents', adminAssignmentController.getAgents);
router.get('/assignments/stats', adminAssignmentController.getAssignmentStats);

// 🆕 VENUE OWNER ROUTES - Must come BEFORE /venues/:id
router.get('/owners', withCombinedRequest(venueOwnerController.getOwners));
router.get('/venues/with-owners', withCombinedRequest(venueOwnerController.getVenuesWithOwners));
router.get('/venues/:venueId/owner', withCombinedRequest(venueOwnerController.getVenueOwner));
router.post('/venues/:venueId/owner', withCombinedRequest(venueOwnerController.assignOwner));
router.post('/venues/:venueId/owner/create', withCombinedRequest(venueOwnerController.createAndAssignOwner));
router.delete('/venues/:venueId/owner', withCombinedRequest(venueOwnerController.removeOwner));

// ✅ General venue routes (parameterized routes AFTER specific ones)
router.post('/venues', withAuthRequest(createVenue));
router.get('/venues', withAuthRequest(getVenues));
router.get('/venues/:id', withAuthRequest(getVenueById)); // This MUST be after /venues/map
router.put('/venues/:id', withAuthRequest(updateVenueById));
router.delete('/venues/:id', withAuthRequest(deleteVenueById));

export default router;

