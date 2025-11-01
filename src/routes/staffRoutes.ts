// ===== FILE: src/routes/staffRoutes.ts =====
import { Router, Request, Response, NextFunction } from 'express';
import { detectRegion, RegionRequest } from '../middlewares/regionMiddleware';
import {
  getDashboardOverview,
  refreshSession,
  lockSession
} from '../controllers/staffDashboardController';
import {
  getVenueRoster,
  inviteStaffMember,
  updateStaffRole,
  removeStaffMember,
  suspendStaffMember,
  testAddStaffToRoster,
  getMyRosterEntries,
  getMyInvitations,
  acceptStaffInvitation,
  fixAndAddToRoster // ✅ NEW
} from '../controllers/staffRosterController';
import { authenticateToken, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();

// ✅ ADD REGION DETECTION MIDDLEWARE TO ALL ROUTES
router.use(detectRegion);

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

// Roster routes - ORDER MATTERS! Specific routes BEFORE parameterized routes
router.get('/roster/my-roster', authenticateToken, authRoute(getMyRosterEntries)); 
router.get('/roster/my-invitations', authenticateToken, authRoute(getMyInvitations));
router.post('/roster/fix-and-add', authenticateToken, authRoute(fixAndAddToRoster)); // ✅ NEW FIX ENDPOINT
router.put('/roster/:rosterId/accept', authenticateToken, authRoute(acceptStaffInvitation));
router.post('/roster/test-add', authenticateToken, authRoute(testAddStaffToRoster));
router.get('/roster/:venueId', authenticateToken, authRoute(getVenueRoster));
router.post('/roster/invite', authenticateToken, authRoute(inviteStaffMember));
router.put('/roster/:rosterId/role', authenticateToken, authRoute(updateStaffRole));
router.delete('/roster/:rosterId', authenticateToken, authRoute(removeStaffMember));
router.put('/roster/:rosterId/suspend', authenticateToken, authRoute(suspendStaffMember));

export default router;
