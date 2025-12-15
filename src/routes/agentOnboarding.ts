// routes/agentOnboarding.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { detectRegion } from '../middlewares/regionMiddleware';
import { 
  uploadEventImages, 
  uploadVenueMediaDirect, 
  uploadVenueMediaMemory 
} from '../config/uploadConfig';
import * as agentController from '../controllers/agentOnboardingController';
import * as mediaController from '../controllers/mediaController';
import * as paymentController from '../controllers/paymentMethodController';

const router = Router();

router.use(authenticateToken);
router.use(detectRegion);

// ✅ Add CloudFront URL transformation helper function
const getCloudFrontUrl = (s3Url: string): string => {
  if (!s3Url) return '';
  
  const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN || 'd2j8mu1uew5u3d.cloudfront.net';
  const s3BucketDomain = process.env.S3_BUCKET_NAME || 'honestlee-user-upload';
  
  // Replace S3 URL with CloudFront URL
  if (s3Url.includes('.s3.') || s3Url.includes('.amazonaws.com')) {
    // Extract the S3 key (path after bucket name)
    const s3Key = s3Url.split('.com/')[1] || s3Url.split(`${s3BucketDomain}/`)[1];
    
    if (s3Key) {
      const cloudFrontUrl = `https://${cloudFrontDomain}/${s3Key}`;
      console.log(`🔄 Transformed S3 URL to CloudFront:`, {
        original: s3Url,
        cloudFront: cloudFrontUrl
      });
      return cloudFrontUrl;
    }
  }
  
  // Already a CloudFront URL or unknown format
  return s3Url;
};

// ===== ZONE PHOTO UPLOAD (MUST BE FIRST - before parameterized routes) =====
router.post(
  "/zones/upload-photo",
  uploadVenueMediaDirect.single("zonePhoto"),
  (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No photo uploaded",
        });
      }

      const file = req.file as any;
      
      // ✅ Transform S3 URL to CloudFront URL
      const cloudFrontUrl = getCloudFrontUrl(file.location);

      console.log("✅ Zone photo uploaded successfully:", {
        url: file.location,
        cloudFrontUrl: cloudFrontUrl,
        key: file.key,
        size: `${(file.size / 1024).toFixed(2)} KB`,
        mimetype: file.mimetype,
      });
      
      return res.json({
        success: true,
        data: {
          url: cloudFrontUrl,  // ✅ Return CloudFront URL instead of S3 URL
          s3Key: file.key,
          size: file.size,
          mimetype: file.mimetype,
        },
        message: "Zone photo uploaded successfully",
      });
    } catch (error: any) {
      console.error("❌ Error in zone photo upload:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to upload zone photo",
        error: error.message,
      });
    }
  }
);

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

// ===== GEOFENCING OPERATIONS =====
router.put('/venues/:tempVenueId/geofence', (req: Request, res: Response, next: NextFunction) => {
  agentController.updateVenueGeofence(req as any, res).catch(next);
});

router.get('/venues/:tempVenueId/geofence', (req: Request, res: Response, next: NextFunction) => {
  agentController.getVenueGeofence(req as any, res).catch(next);
});

router.delete('/venues/:tempVenueId/geofence', (req: Request, res: Response, next: NextFunction) => {
  agentController.deleteVenueGeofence(req as any, res).catch(next);
});

// ===== CATEGORY & TYPE OPERATIONS =====
router.put('/venues/:tempVenueId/category-type', (req: Request, res: Response, next: NextFunction) => {
  agentController.updateVenueCategoryType(req as any, res).catch(next);
});

router.get('/venues/:tempVenueId/category-type', (req: Request, res: Response, next: NextFunction) => {
  agentController.getVenueCategoryType(req as any, res).catch(next);
});

// ===== PAYMENT OPERATIONS ===== ✅ FIXED
router.put('/venues/:tempVenueId/payment-methods', (req: Request, res: Response, next: NextFunction) => {
  agentController.updatePaymentMethods(req as any, res).catch(next);
});

router.get('/venues/:tempVenueId/payment-methods', (req: Request, res: Response, next: NextFunction) => {
  agentController.getPaymentMethods(req as any, res).catch(next);
});

// Card machines - FIXED: Using paymentController
router.post('/venues/:venueId/card-machines', (req: Request, res: Response, next: NextFunction) => {
  paymentController.addCardMachine(req as any, res).catch(next);
});

router.get('/venues/:venueId/card-machines', (req: Request, res: Response, next: NextFunction) => {
  paymentController.getCardMachines(req as any, res).catch(next);
});

router.delete('/venues/:venueId/card-machines/:machineId', (req: Request, res: Response, next: NextFunction) => {
  paymentController.deleteCardMachine(req as any, res).catch(next);
});

// UPI/QR payments - FIXED: Using paymentController
router.post('/venues/:venueId/upi-qr-payments', (req: Request, res: Response, next: NextFunction) => {
  paymentController.addUpiQrPayment(req as any, res).catch(next);
});

router.get('/venues/:venueId/upi-qr-payments', (req: Request, res: Response, next: NextFunction) => {
  paymentController.getUpiQrPayments(req as any, res).catch(next);
});

router.delete('/venues/:venueId/upi-qr-payments/:qrId', (req: Request, res: Response, next: NextFunction) => {
  paymentController.deleteUpiQrPayment(req as any, res).catch(next);
});

// QR code parser - FIXED: Using paymentController
router.post('/parse-qr-code', (req: Request, res: Response, next: NextFunction) => {
  paymentController.parseQrCode(req as any, res).catch(next);
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
// ✅ CREATE ZONE
router.post(
  "/venues/:venueId/zones",
  (req: Request, res: Response, next: NextFunction) =>
    agentController.createZone(req as any, res).catch(next)
);

// ✅ GET ZONES - Need to update the controller to use CloudFront URLs
// Since we're calling the controller, we need to update the controller itself
// For now, let's create a wrapper that transforms the response
const getVenueZonesWithCloudFront = async (req: any, res: Response) => {
  try {
    // Call the original controller
    const originalSend = res.json;
    let responseData: any;

    // Override res.json to intercept the response
    res.json = function(data: any) {
      responseData = data;
      
      if (responseData.success && responseData.data) {
        // ✅ Transform all zone photo URLs to CloudFront
        if (Array.isArray(responseData.data)) {
          const zonesWithCloudFront = responseData.data.map((zone: any) => {
            if (zone.zonePhotoUrl) {
              return {
                ...zone,
                zonePhotoUrl: getCloudFrontUrl(zone.zonePhotoUrl),
              };
            }
            return zone;
          });
          
          responseData.data = zonesWithCloudFront;
          responseData.count = zonesWithCloudFront.length;
        }
      }
      
      return originalSend.call(this, responseData);
    };
    
    await agentController.getVenueZones(req, res);
  } catch (error: any) {
    console.error("Error fetching zones with CloudFront transformation:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch zones",
      error: error.message,
    });
  }
};

// ✅ GET ZONES - Updated to use CloudFront transformation
router.get(
  "/venues/:venueId/zones",
  (req: Request, res: Response, next: NextFunction) =>
    getVenueZonesWithCloudFront(req as any, res).catch(next)
);

// ✅ UPDATE ZONE
router.put(
  "/venues/:venueId/zones/:zoneId",
  (req: Request, res: Response, next: NextFunction) =>
    agentController.updateZone(req as any, res).catch(next)
);

// ✅ DELETE ZONE
router.delete(
  "/venues/:venueId/zones/:zoneId",
  (req: Request, res: Response, next: NextFunction) =>
    agentController.deleteZone(req as any, res).catch(next)
);

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

// ===== MEDIA UPLOAD ROUTES =====

// ✅ Route for media upload WITH THUMBNAIL generation
const uploadVenueMediaWithThumbnail = async (req: any, res: Response) => {
  try {
    // Call the media controller's uploadVenueMedia function (which uses memory storage)
    await mediaController.uploadVenueMedia(req, res);
  } catch (error: any) {
    console.error("❌ Error in media upload with thumbnail:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload media",
      error: error.message,
    });
  }
};

// ✅ Route for QUICK media upload WITHOUT thumbnail generation
const uploadVenueMediaQuick = async (req: any, res: Response) => {
  try {
    // Call the media controller's quick upload function
    await mediaController.uploadVenueMediaQuick(req, res);
  } catch (error: any) {
    console.error("❌ Error in quick media upload:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload media",
      error: error.message,
    });
  }
};

// ✅ Route for media upload WITH THUMBNAIL (uses memory storage)
router.post(
  '/venues/:tempVenueId/media',
  uploadVenueMediaMemory.single('file'), // Use memory storage for thumbnail generation
  (req: Request, res: Response, next: NextFunction) => {
    uploadVenueMediaWithThumbnail(req as any, res).catch(next);
  }
);

// ✅ Route for QUICK media upload WITHOUT thumbnail (uses direct S3 upload)
router.post(
  '/venues/:tempVenueId/media/quick',
  uploadVenueMediaDirect.single('file'), // Use direct S3 upload for speed
  (req: Request, res: Response, next: NextFunction) => {
    uploadVenueMediaQuick(req as any, res).catch(next);
  }
);

// ✅ Route for REGENERATING thumbnail for existing media
router.post(
  '/venues/:tempVenueId/media/:mediaId/regenerate-thumbnail',
  (req: Request, res: Response, next: NextFunction) => {
    mediaController.regenerateThumbnail(req as any, res).catch(next);
  }
);

// ✅ Wrapper for get media to use CloudFront URLs
const getVenueMediaWithCloudFront = async (req: any, res: Response) => {
  try {
    const originalSend = res.json;
    let responseData: any;

    res.json = function(data: any) {
      responseData = data;
      
      if (responseData.success && responseData.data) {
        // ✅ Transform media URLs to CloudFront
        if (Array.isArray(responseData.data)) {
          const mediaWithCloudFront = responseData.data.map((media: any) => {
            const fileUrl = media.fileUrl ? getCloudFrontUrl(media.fileUrl) : media.fileUrl;
            const thumbnailUrl = media.thumbnailUrl ? getCloudFrontUrl(media.thumbnailUrl) : fileUrl;
            
            return {
              ...media,
              fileUrl,
              thumbnailUrl,
            };
          });
          
          responseData.data = mediaWithCloudFront;
        }
      }
      
      return originalSend.call(this, responseData);
    };
    
    await mediaController.getVenueMedia(req, res);
  } catch (error: any) {
    console.error("Error fetching media with CloudFront transformation:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch media",
      error: error.message,
    });
  }
};

router.get('/venues/:tempVenueId/media', (req: Request, res: Response, next: NextFunction) =>
  getVenueMediaWithCloudFront(req as any, res).catch(next)
);

router.get('/venues/:tempVenueId/media/stats', (req: Request, res: Response, next: NextFunction) =>
  mediaController.getMediaStats(req as any, res).catch(next)
);

router.delete('/venues/:tempVenueId/media/:mediaId', (req: Request, res: Response, next: NextFunction) =>
  mediaController.deleteVenueMedia(req as any, res).catch(next)
);

// ===== PROFILE IMAGE UPLOAD =====
router.post(
  '/upload/profile',
  uploadVenueMediaMemory.single('file'), // Use memory storage for thumbnail generation
  (req: Request, res: Response, next: NextFunction) => {
    mediaController.uploadProfileImageWithThumbnail(req as any, res).catch(next);
  }
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

// ✅ Wrapper for get photos to use CloudFront URLs
const getVenuePhotosWithCloudFront = async (req: any, res: Response) => {
  try {
    const originalSend = res.json;
    let responseData: any;

    res.json = function(data: any) {
      responseData = data;
      
      if (responseData.success && responseData.data) {
        // ✅ Transform photo URLs to CloudFront
        if (Array.isArray(responseData.data)) {
          const photosWithCloudFront = responseData.data.map((photo: any) => {
            if (photo.url) {
              return {
                ...photo,
                url: getCloudFrontUrl(photo.url),
              };
            }
            return photo;
          });
          
          responseData.data = photosWithCloudFront;
        }
      }
      
      return originalSend.call(this, responseData);
    };
    
    await agentController.getVenuePhotos(req, res);
  } catch (error: any) {
    console.error("Error fetching photos with CloudFront transformation:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch photos",
      error: error.message,
    });
  }
};

router.get('/venues/:venueId/photos', (req: Request, res: Response, next: NextFunction) =>
  getVenuePhotosWithCloudFront(req as any, res).catch(next)
);

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

// ===== PUBLIC MEDIA ROUTE =====
router.get('/venues/:id/media/public', (req: Request, res: Response, next: NextFunction) => {
  mediaController.getPublicVenueMedia(req as any, res).catch(next);
});

export default router;