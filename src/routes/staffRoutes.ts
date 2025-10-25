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
  testAddStaffToRoster // ✅ ADDED
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

// Roster routes
router.get('/roster/:venueId', authenticateToken, authRoute(getVenueRoster));
router.post('/roster/invite', authenticateToken, authRoute(inviteStaffMember));
router.put('/roster/:rosterId/role', authenticateToken, authRoute(updateStaffRole));
router.delete('/roster/:rosterId', authenticateToken, authRoute(removeStaffMember));
router.put('/roster/:rosterId/suspend', authenticateToken, authRoute(suspendStaffMember));

// ✅ TEST ROUTE - Add yourself to roster
router.post('/roster/test-add', authenticateToken, authRoute(testAddStaffToRoster));

export default router;
