// ===== FILE: src/routes/staffRoutes.ts =====
import { Router, Request, Response, NextFunction } from 'express';
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
  getMyInvitations, // ✅ NEW
  acceptStaffInvitation // ✅ NEW
} from '../controllers/staffRosterController';
import { authenticateToken, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();

// Type-safe wrapper for authenticated routes
const authRoute = (handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
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
router.get('/roster/my-invitations', authenticateToken, authRoute(getMyInvitations)); // ✅ NEW
router.put('/roster/:rosterId/accept', authenticateToken, authRoute(acceptStaffInvitation)); // ✅ NEW
router.get('/roster/:venueId', authenticateToken, authRoute(getVenueRoster));
router.post('/roster/invite', authenticateToken, authRoute(inviteStaffMember));
router.put('/roster/:rosterId/role', authenticateToken, authRoute(updateStaffRole));
router.delete('/roster/:rosterId', authenticateToken, authRoute(removeStaffMember));
router.put('/roster/:rosterId/suspend', authenticateToken, authRoute(suspendStaffMember));
router.post('/roster/test-add', authenticateToken, authRoute(testAddStaffToRoster)); // ✅ TEST

export default router;
