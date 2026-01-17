// src/routes/streetVendorRoutes.ts

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { detectRegion, RegionRequest } from '../middlewares/regionMiddleware';
import {
  // Auth
  registerVendor,
  loginVendor,
  getVendorProfile,
  updateVendorProfile,
  // Menu
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getVendorMenu,
  // Location & Status
  updateVendorLocation,
  toggleVendorOperational,
  getVendorTrajectory,
  // Public
  getPublicNearbyVendors,
  getPublicVendorDetails,
  // Authenticated
  getMobileVendors,
  getActiveVendorsNearby,
  // Admin
  adminGetAllVendors,
  adminApproveVendor,
  adminUpdateVendorStatus,
  adminDeleteVendor
} from '../controllers/streetVendorController';

type CombinedRequest = AuthRequest & RegionRequest;

const router = Router();

// Async handler wrapper
const asyncHandler = (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============================================================
// PUBLIC ROUTES (No authentication required)
// ============================================================

// Vendor registration
router.post('/auth/register', asyncHandler(registerVendor));

// Vendor login
router.post('/auth/login', asyncHandler(loginVendor));

// Get nearby vendors for map display (public)
router.get('/public/nearby', detectRegion, asyncHandler(getPublicNearbyVendors));

// Get vendor details (public)
router.get('/public/:id', detectRegion, asyncHandler(getPublicVendorDetails));

// Get vendor menu (public)
router.get('/public/:id/menu', detectRegion, asyncHandler(getVendorMenu));

// ============================================================
// VENDOR AUTHENTICATED ROUTES
// ============================================================

// Get vendor profile
router.get('/:id', authenticate, detectRegion, asyncHandler(getVendorProfile));

// Update vendor profile
router.patch('/:id', authenticate, detectRegion, asyncHandler(updateVendorProfile));

// Update vendor location (real-time)
router.post('/:id/location', authenticate, detectRegion, asyncHandler(updateVendorLocation));

// Toggle operational status
router.patch('/:id/status', authenticate, detectRegion, asyncHandler(toggleVendorOperational));

// Get vendor trajectory
router.get('/:id/trajectory', authenticate, detectRegion, asyncHandler(getVendorTrajectory));

// Menu item operations
router.post('/:id/menu', authenticate, detectRegion, asyncHandler(addMenuItem));
router.put('/:id/menu/:itemId', authenticate, detectRegion, asyncHandler(updateMenuItem));
router.delete('/:id/menu/:itemId', authenticate, detectRegion, asyncHandler(deleteMenuItem));

// ============================================================
// AUTHENTICATED USER ROUTES (for app users)
// ============================================================

// Get all vendors (paginated)
router.get('/', authenticate, detectRegion, asyncHandler(getMobileVendors));

// Get nearby active vendors
router.get('/nearby', authenticate, detectRegion, asyncHandler(getActiveVendorsNearby));

// ============================================================
// ADMIN ROUTES
// ============================================================

// Get all vendors for admin (with filters)
router.get('/admin/all', authenticate, detectRegion, asyncHandler(adminGetAllVendors));

// Approve vendor
router.patch('/admin/:id/approve', authenticate, detectRegion, asyncHandler(adminApproveVendor));

// Update vendor status (approve/reject/suspend)
router.patch('/admin/:id/status', authenticate, detectRegion, asyncHandler(adminUpdateVendorStatus));

// Delete vendor
router.delete('/admin/:id', authenticate, detectRegion, asyncHandler(adminDeleteVendor));

export default router;
