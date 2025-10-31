// src/routes/streetVendorRoutes.ts

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { detectRegion, RegionRequest } from '../middlewares/regionMiddleware';
import {
  createStreetVendor,
  getMobileVendors,
  getActiveVendorsNearby,
  updateVendorLocation,
  getVendorTrajectory,
  toggleVendorOperational
} from '../controllers/streetVendorController';

type CombinedRequest = AuthRequest & RegionRequest;

const router = Router();

// Wrapper with proper types
const asyncHandler = (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ===== PUBLIC: Register endpoint (NO middleware, completely public) =====
router.post('/register', asyncHandler(createStreetVendor));

// ===== AUTHENTICATED: All other routes =====
router.get('/', authenticate, detectRegion, asyncHandler(getMobileVendors));
router.get('/nearby', authenticate, detectRegion, asyncHandler(getActiveVendorsNearby));
router.post('/:id/location', authenticate, detectRegion, asyncHandler(updateVendorLocation));
router.get('/:id/trajectory', authenticate, detectRegion, asyncHandler(getVendorTrajectory));
router.patch('/:id/status', authenticate, detectRegion, asyncHandler(toggleVendorOperational));

export default router;
