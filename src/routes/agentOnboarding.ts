// routes/agentOnboarding.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { detectRegion } from '../middlewares/regionMiddleware';
import { uploadEventImages, uploadVenueMedia } from '../config/uploadConfig';
import * as agentController from '../controllers/agentOnboardingController';
import * as mediaController from '../controllers/mediaController';

const router = Router();

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

// ===== CATEGORY & TYPE OPERATIONS =====
router.put('/venues/:tempVenueId/category-type', (req: Request, res: Response, next: NextFunction) => {
  agentController.updateVenueCategoryType(req as any, res).catch(next);
});

router.get('/venues/:tempVenueId/category-type', (req: Request, res: Response, next: NextFunction) => {
  agentController.getVenueCategoryType(req as any, res).catch(next);
});

// ===== PAYMENT OPERATIONS ===== ✅ NEW
router.put('/venues/:tempVenueId/payment-methods', (req: Request, res: Response, next: NextFunction) => {
  agentController.updatePaymentMethods(req as any, res).catch(next);
});

router.get('/venues/:tempVenueId/payment-methods', (req: Request, res: Response, next: NextFunction) => {
  agentController.getPaymentMethods(req as any, res).catch(next);
});

// Card machines
router.post('/venues/:venueId/card-machines', (req: Request, res: Response, next: NextFunction) => {
  agentController.addCardMachine(req as any, res).catch(next);
});

router.get('/venues/:venueId/card-machines', (req: Request, res: Response, next: NextFunction) => {
  agentController.getCardMachines(req as any, res).catch(next);
});

router.delete('/venues/:venueId/card-machines/:machineId', (req: Request, res: Response, next: NextFunction) => {
  agentController.deleteCardMachine(req as any, res).catch(next);
});

// UPI/QR payments
router.post('/venues/:venueId/upi-qr-payments', (req: Request, res: Response, next: NextFunction) => {
  agentController.addUpiQrPayment(req as any, res).catch(next);
});

router.get('/venues/:venueId/upi-qr-payments', (req: Request, res: Response, next: NextFunction) => {
  agentController.getUpiQrPayments(req as any, res).catch(next);
});

router.delete('/venues/:venueId/upi-qr-payments/:qrId', (req: Request, res: Response, next: NextFunction) => {
  agentController.deleteUpiQrPayment(req as any, res).catch(next);
});

// QR code parser
router.post('/parse-qr-code', (req: Request, res: Response, next: NextFunction) => {
  agentController.parseQrCode(req as any, res).catch(next);
});

// Legacy payment types (for backward compatibility)
router.put('/venues/:tempVenueId/payment-types', (req: Request, res: Response, next: NextFunction) => {
  agentController.updatePaymentTypes(req as any, res).catch(next);
});

router.get('/venues/:tempVenueId/payment-types', (req: Request, res: Response, next: NextFunction) => {
  agentController.getPaymentTypes(req as any, res).catch(next);
});

// ===== QR CODE OPERATIONS =====
router.post('/venues/:venueId/qr/main', (req: Request, res: Response, next: NextFunction) => {
  agentController.attachMainQR(req as any, res).catch(next);
});

router.get('/venues/:venueId/qr/main', (req: Request, res: Response, next: NextFunction) => {
  agentController.getMainQR(req as any, res).catch(next);
});

router.post('/venues/:venueId/qr/table', (req: Request, res: Response, next: NextFunction) => {
  agentController.linkTableQR(req as any, res).catch(next);
});

router.get('/venues/:venueId/qr/table', (req: Request, res: Response, next: NextFunction) => {
  agentController.getTableQRs(req as any, res).catch(next);
});

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

router.get('/venues/:venueId/zones', (req: Request, res: Response, next: NextFunction) => {
  agentController.getVenueZones(req as any, res).catch(next);
});

router.delete('/venues/:venueId/zones/:zoneId', (req: Request, res: Response, next: NextFunction) => {
  agentController.deleteZone(req as any, res).catch(next);
});

// ===== ASSIGNMENT & VISIT ROUTES =====
router.get('/my-assignments', (req: Request, res: Response, next: NextFunction) => {
  agentController.getMyAssignments(req as any, res).catch(next);
});

router.put('/venues/:tempVenueId/visit', (req: Request, res: Response, next: NextFunction) => {
  agentController.markVenueVisited(req as any, res).catch(next);
});

router.put('/venues/:tempVenueId/vitals', (req: Request, res: Response, next: NextFunction) => {
  agentController.updateVenueVitals(req as any, res).catch(next);
});

router.post('/venues/:tempVenueId/soft-onboard', (req: Request, res: Response, next: NextFunction) => {
  agentController.softOnboardVenue(req as any, res).catch(next);
});

router.post('/venues/:tempVenueId/decline', (req: Request, res: Response, next: NextFunction) => {
  agentController.declineVenue(req as any, res).catch(next);
});

router.post('/venues/:tempVenueId/capture-lead', (req: Request, res: Response, next: NextFunction) => {
  agentController.captureLeadVenue(req as any, res).catch(next);
});

router.get('/my-stats', (req: Request, res: Response, next: NextFunction) => {
  agentController.getMyStats(req as any, res).catch(next);
});

router.put('/venues/:tempVenueId/gps', (req: Request, res: Response, next: NextFunction) => {
  agentController.updateVenueGPS(req as any, res).catch(next);
});

// ===== MEDIA UPLOAD ROUTES (S3) =====
router.post(
  '/venues/:tempVenueId/media',
  (req: Request, res: Response, next: NextFunction) => {
    uploadVenueMedia.single('file')(req, res, (err) => {
      if (err) {
        console.error('❌ Multer error during media upload:', err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File too large. Max 500MB allowed'
          });
        }
        if (err.code === 'FILE_TYPE_NOT_ALLOWED') {
          return res.status(400).json({
            success: false,
            message: 'Invalid file type. Please upload an image or video file.',
            details: 'Accepted formats: JPG, PNG, GIF, WEBP, HEIC, MP4, MOV, AVI, WEBM'
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || 'Upload failed',
          error: err.code || 'UPLOAD_ERROR'
        });
      }
      if ((req as any).fileValidationError) {
        return res.status(400).json({
          success: false,
          message: (req as any).fileValidationError
        });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded. Please select a valid image or video file.'
        });
      }
      next();
    });
  },
  (req: Request, res: Response, next: NextFunction) =>
    mediaController.uploadVenueMedia(req as any, res).catch(next)
);

router.get('/venues/:tempVenueId/media', (req: Request, res: Response, next: NextFunction) =>
  mediaController.getVenueMedia(req as any, res).catch(next)
);

router.get('/venues/:tempVenueId/media/stats', (req: Request, res: Response, next: NextFunction) =>
  mediaController.getMediaStats(req as any, res).catch(next)
);

router.delete('/venues/:tempVenueId/media/:mediaId', (req: Request, res: Response, next: NextFunction) =>
  mediaController.deleteVenueMedia(req as any, res).catch(next)
);

router.put(
  '/venues/:tempVenueId/info',
  (req: Request, res: Response, next: NextFunction) =>
    agentController.updateVenueInfo(req as any, res).catch(next)
);

// ===== PHOTO OPERATIONS (Legacy) =====
router.post(
  '/venues/:venueId/photos',
  uploadEventImages.array('photos', 20),
  (req: Request, res: Response, next: NextFunction) => {
    agentController.uploadVenuePhotos(req as any, res).catch(next);
  }
);

router.get('/venues/:venueId/photos', (req: Request, res: Response, next: NextFunction) => {
  agentController.getVenuePhotos(req as any, res).catch(next);
});

router.delete('/venues/:venueId/photos/:assetId', (req: Request, res: Response, next: NextFunction) => {
  agentController.deleteVenuePhoto(req as any, res).catch(next);
});

// ===== WIFI OPERATIONS =====
router.post('/venues/:venueId/wifi-test', (req: Request, res: Response, next: NextFunction) => {
  agentController.runWiFiTest(req as any, res).catch(next);
});

router.get('/venues/:venueId/wifi-tests', (req: Request, res: Response, next: NextFunction) => {
  agentController.getWiFiTests(req as any, res).catch(next);
});

// ===== NOTES OPERATIONS =====
router.post('/venues/:tempVenueId/notes', (req: Request, res: Response, next: NextFunction) => {
  agentController.addVenueNote(req as any, res).catch(next);
});

router.get('/venues/:tempVenueId/notes', (req: Request, res: Response, next: NextFunction) => {
  agentController.getVenueNotes(req as any, res).catch(next);
});

router.put('/venues/:tempVenueId/notes/:noteId', (req: Request, res: Response, next: NextFunction) => {
  agentController.updateVenueNote(req as any, res).catch(next);
});

router.delete('/venues/:tempVenueId/notes/:noteId', (req: Request, res: Response, next: NextFunction) => {
  agentController.deleteVenueNote(req as any, res).catch(next);
});

export default router;
