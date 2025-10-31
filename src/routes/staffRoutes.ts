// ===== FILE: src/routes/staffRoutes.ts =====
import { Router, Request, Response, NextFunction } from 'express';
import { detectRegion, RegionRequest } from '../middlewares/regionMiddleware';
import {
  getDashboardOverview,
  refreshSession,
  lockSession
} from '../controllers/staffDashboardController';
import {
  generateStaffRotatingQR,
  rotateStaffQR,
  verifyStaffQR,
  generateOnboardQR,
  activateOnboardQR
} from '../controllers/staffQRController';
import {
  getVenueRoster,
  inviteStaffMember,
  updateStaffRole,
  removeStaffMember,
  suspendStaffMember,
  testAddStaffToRoster,
  getMyRosterEntries,
  getMyInvitations,
  acceptStaffInvitation
} from '../controllers/staffRosterController';
import { authenticateToken, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();

// ✅ ADD REGION DETECTION MIDDLEWARE TO ALL ROUTES
router.use(detectRegion);

// ✅ FIX: Updated type-safe wrapper that accepts StaffRequest (AuthRequest + RegionRequest)
type StaffRequest = AuthRequest & RegionRequest;

const authRoute = (
  handler: (req: StaffRequest, res: Response, next?: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as StaffRequest, res, next);
  };
};

// Dashboard routes
router.get('/dashboard/:venueId', authenticateToken, authRoute(getDashboardOverview));
router.post('/session/refresh', authenticateToken, authRoute(refreshSession));
router.post('/session/lock', authenticateToken, authRoute(lockSession));

// QR routes
router.post('/qr/generate', authenticateToken, authRoute(generateStaffRotatingQR));
router.post('/qr/rotate', authenticateToken, authRoute(rotateStaffQR));
router.post('/qr/verify', authenticateToken, authRoute(verifyStaffQR));
router.post('/qr/onboard/generate', authenticateToken, authRoute(generateOnboardQR));
router.post('/qr/onboard/activate', authenticateToken, authRoute(activateOnboardQR));

// Roster routes - ORDER MATTERS! Specific routes BEFORE parameterized routes
router.get('/roster/my-roster', authenticateToken, authRoute(getMyRosterEntries)); 
router.get('/roster/my-invitations', authenticateToken, authRoute(getMyInvitations));
router.put('/roster/:rosterId/accept', authenticateToken, authRoute(acceptStaffInvitation));
router.get('/roster/:venueId', authenticateToken, authRoute(getVenueRoster));
router.post('/roster/invite', authenticateToken, authRoute(inviteStaffMember));
router.put('/roster/:rosterId/role', authenticateToken, authRoute(updateStaffRole));
router.delete('/roster/:rosterId', authRoute(removeStaffMember));
router.put('/roster/:rosterId/suspend', authenticateToken, authRoute(suspendStaffMember));
router.post('/roster/test-add', authenticateToken, authRoute(testAddStaffToRoster));

export default router;
