// src/routes/agentOnboarding.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { detectRegion } from '../middlewares/regionMiddleware';
import { uploadEventImages } from '../config/uploadConfig';
import * as agentController from '../controllers/agentOnboardingController';

const router = Router();

// Apply authentication and region middleware to all routes
router.use(authenticateToken);
router.use(detectRegion);

// ===== VENUE OPERATIONS =====
router.post('/venues/quick-add', (req: Request, res: Response, next: NextFunction) => {
  agentController.quickAddVenue(req as any, res).catch(next);
});

router.get('/venues', (req: Request, res: Response, next: NextFunction) => {
  agentController.getAgentVenues(req as any, res).catch(next);
});

router.get('/venues/regional', (req: Request, res: Response, next: NextFunction) => {
  agentController.getAllRegionalVenues(req as any, res).catch(next);
});

router.post('/venues/onboard-from-google', (req: Request, res: Response, next: NextFunction) => {
  agentController.onboardFromGoogle(req as any, res).catch(next);
});

router.put('/venues/:tempVenueId/link-crm', (req: Request, res: Response, next: NextFunction) => {
  agentController.linkVenueToCRM(req as any, res).catch(next);
});

router.put('/venues/:tempVenueId/status', (req: Request, res: Response, next: NextFunction) => {
  agentController.updateVenueStatus(req as any, res).catch(next);
});

router.post('/venues/:tempVenueId/finalize', (req: Request, res: Response, next: NextFunction) => {
  agentController.finalizeOnboarding(req as any, res).catch(next);
});

// ===== QR CODE OPERATIONS =====
router.post('/venues/:venueId/qr/main', (req: Request, res: Response, next: NextFunction) => {
  agentController.attachMainQR(req as any, res).catch(next);
});

// ✅ NEW: Get main QR
router.get('/venues/:venueId/qr/main', (req: Request, res: Response, next: NextFunction) => {
  agentController.getMainQR(req as any, res).catch(next);
});

router.post('/venues/:venueId/qr/table', (req: Request, res: Response, next: NextFunction) => {
  agentController.linkTableQR(req as any, res).catch(next);
});

// ✅ NEW: Get table QRs
router.get('/venues/:venueId/qr/table', (req: Request, res: Response, next: NextFunction) => {
  agentController.getTableQRs(req as any, res).catch(next);
});

// ✅ NEW: Delete table QR
router.delete('/venues/:venueId/qr/table/:bindingId', (req: Request, res: Response, next: NextFunction) => {
  agentController.deleteTableQR(req as any, res).catch(next);
});

router.post('/qr/:bindingId/test-token', (req: Request, res: Response, next: NextFunction) => {
  agentController.generateTestToken(req as any, res).catch(next);
});

// ===== ZONE OPERATIONS =====
router.post('/venues/:venueId/zones', (req: Request, res: Response, next: NextFunction) => {
  agentController.createZone(req as any, res).catch(next);
});

// ✅ NEW: Get zones
router.get('/venues/:venueId/zones', (req: Request, res: Response, next: NextFunction) => {
  agentController.getVenueZones(req as any, res).catch(next);
});

// ✅ NEW: Delete zone
router.delete('/venues/:venueId/zones/:zoneId', (req: Request, res: Response, next: NextFunction) => {
  agentController.deleteZone(req as any, res).catch(next);
});

// ===== PHOTO OPERATIONS =====
router.post(
  '/venues/:venueId/photos',
  uploadEventImages.array('photos', 20),
  (req: Request, res: Response, next: NextFunction) => {
    agentController.uploadVenuePhotos(req as any, res).catch(next);
  }
);

// ✅ NEW: Get photos
router.get('/venues/:venueId/photos', (req: Request, res: Response, next: NextFunction) => {
  agentController.getVenuePhotos(req as any, res).catch(next);
});

// ✅ NEW: Delete photo
router.delete('/venues/:venueId/photos/:assetId', (req: Request, res: Response, next: NextFunction) => {
  agentController.deleteVenuePhoto(req as any, res).catch(next);
});

// ===== WIFI OPERATIONS =====
router.post('/venues/:venueId/wifi-test', (req: Request, res: Response, next: NextFunction) => {
  agentController.runWiFiTest(req as any, res).catch(next);
});

// ✅ NEW: Get WiFi tests
router.get('/venues/:venueId/wifi-tests', (req: Request, res: Response, next: NextFunction) => {
  agentController.getWiFiTests(req as any, res).catch(next);
});

export default router;