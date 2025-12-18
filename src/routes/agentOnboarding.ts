// routes/agentOnboarding.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { detectRegion } from '../middlewares/regionMiddleware';
import { uploadEventImages, uploadVenueMediaDirect, uploadVenueMediaMemory } from '../config/uploadConfig';
import * as agentController from '../controllers/agentOnboardingController';
import * as mediaController from '../controllers/mediaController';
import * as paymentController from '../controllers/paymentMethodController';
import AgentVenueTemp from '../models/AgentVenueTemp';
import AuditLog from '../models/AuditLog';
import { dbManager } from '../config/database';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../middlewares/authMiddleware';
import Venue from '../models/Venue';

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


// POST /api/agent/venues/:tempVenueId/events - Create event for a venue
router.post('/venues/:tempVenueId/events', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId } = req.params;
    const eventData = req.body;

    // Find the temp venue
    const tempVenue = await AgentVenueTemp.findOne({ tempVenueId });
    if (!tempVenue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    // Get the actual venue ID
    let venueId = tempVenue.venueId;

    // If venue doesn't exist in main DB yet, create it
    if (!venueId) {
      const region = (tempVenue.region || 'th') as any;
      const regionalConnection = dbManager.getConnection(region);
      
      // ✅ FIXED: Use the schema from the imported Venue model
      const RegionalVenue = regionalConnection.models.Venue || 
                            regionalConnection.model('Venue', Venue.schema);

      // Create venue in regional DB
      const newVenue = new RegionalVenue({
        globalId: tempVenue.tempVenueId,
        AccountName: tempVenue.name,
        name: tempVenue.name,
        geometry: {
          type: 'Point',
          coordinates: [
            tempVenue.address?.lng || 0,
            tempVenue.address?.lat || 0
          ]
        },
        address: tempVenue.address,
        Phone: tempVenue.phone,
        Website: tempVenue.socials?.website,
        category: tempVenue.category,
        venuetype: tempVenue.category?.[0],
        region: region,
        isActive: true,
        isVerified: false,
        ownerId: req.user.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined
      });

      await newVenue.save();
      venueId = newVenue._id as mongoose.Types.ObjectId;

      // Update temp venue with venueId
      tempVenue.venueId = venueId;
      await tempVenue.save();

      console.log(`Auto-created venue ${venueId} for tempVenueId ${tempVenueId}`);
    }

    const region = (tempVenue.region || 'th') as any;

    // Connect to regional DB and create event
    const regionalConnection = dbManager.getConnection(region);
    
    // ✅ FIXED: Use existing Event model or register with schema
    const Event = regionalConnection.models.Event || 
                  regionalConnection.model('Event', mongoose.model('Event').schema);

    // Create the event
    const newEvent = new Event({
      venueId: venueId,
      eventName: eventData.eventName,
      description: eventData.description,
      eventType: eventData.eventType || 'ENTERTAINMENT',
      eventCategory: eventData.eventCategory,
      eventStartsAt: new Date(eventData.eventStartsAt),
      eventEndsAt: new Date(eventData.eventEndsAt),
      eventDuration: eventData.eventDuration,
      eventTimezone: eventData.eventTimezone || 'Asia/Dubai',
      eventRecurrence: eventData.eventRecurrence || 'NONE',
      eventPriceFrom: parseFloat(eventData.eventPriceFrom) || 0,
      eventPriceMax: parseFloat(eventData.eventPriceMax) || 0,
      eventCurrency: eventData.eventCurrency || 'AED',
      eventAgeRestriction: eventData.eventAgeRestriction,
      capacity: parseInt(eventData.capacity) || 0,
      isActive: eventData.isActive !== undefined ? eventData.isActive : true,
      region: region,
      createdBy: req.user.userId
    });

    await newEvent.save();

    console.log(`Event created: ${newEvent._id} for venue ${venueId}`);

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venueId.toString(),
      action: 'VENUE_EVENT_CREATED',
      meta: {
        tempVenueId,
        eventId: newEvent._id.toString(),
        eventName: eventData.eventName
      }
    });

    res.status(201).json({
      success: true,
      data: newEvent,
      message: 'Event created successfully'
    });
  } catch (error: any) {
    console.error('Error creating event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create event',
      error: error.message
    });
  }
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

// ====== Events Operations ======
// ===== NEW: EVENTS OPERATIONS =====

// GET /api/agent/venues/:tempVenueId/events - Get all events for a venue
router.get('/venues/:tempVenueId/events', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId } = req.params;

    // Find the temp venue
    const tempVenue = await AgentVenueTemp.findOne({ tempVenueId });
    if (!tempVenue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    // Get the actual venue ID
    const venueId = tempVenue.venueId;
    if (!venueId) {
      // No events if venue not yet created in main DB
      return res.json({ success: true, data: { events: [] } });
    }

    // Get region from tempVenue or default
    const region = (tempVenue.region || 'th') as any;

    // Connect to regional DB
    const regionalConnection = dbManager.getConnection(region);

    // Get Event model from regional DB (assuming you have EventSchema exported)
    const Event = regionalConnection.model('Event');

    // Fetch events for this venue
    const events = await Event.find({ venueId: venueId })
      .sort({ eventStartsAt: 1 })
      .lean();

    console.log(`Found ${events.length} events for venue ${venueId}`);

    res.json({
      success: true,
      data: {
        events: events || []
      }
    });
  } catch (error: any) {
    console.error('Error fetching venue events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events',
      error: error.message
    });
  }
});

// POST /api/agent/venues/:tempVenueId/events - Create event for a venue
// POST /api/agent/venues/:tempVenueId/events - Create event for a venue
router.post('/venues/:tempVenueId/events', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId } = req.params;
    const eventData = req.body;

    console.log('📥 Received event data:', eventData); // ✅ Debug log

    // Find the temp venue
    const tempVenue = await AgentVenueTemp.findOne({ tempVenueId });
    if (!tempVenue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    // Get the actual venue ID
    let venueId = tempVenue.venueId;

    // If venue doesn't exist in main DB yet, create it
    if (!venueId) {
      const region = (tempVenue.region || 'th') as any;
      const regionalConnection = dbManager.getConnection(region);
      
      const RegionalVenue = regionalConnection.models.Venue || 
                            regionalConnection.model('Venue', Venue.schema);

      const newVenue = new RegionalVenue({
        globalId: tempVenue.tempVenueId,
        AccountName: tempVenue.name,
        name: tempVenue.name,
        geometry: {
          type: 'Point',
          coordinates: [
            tempVenue.address?.lng || 0,
            tempVenue.address?.lat || 0
          ]
        },
        address: tempVenue.address,
        Phone: tempVenue.phone,
        Website: tempVenue.socials?.website,
        category: tempVenue.category,
        venuetype: tempVenue.category?.[0],
        region: region,
        isActive: true,
        isVerified: false,
        ownerId: req.user.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined
      });

      await newVenue.save();
      venueId = newVenue._id as mongoose.Types.ObjectId;

      tempVenue.venueId = venueId;
      await tempVenue.save();

      console.log(`Auto-created venue ${venueId} for tempVenueId ${tempVenueId}`);
    }

    const region = (tempVenue.region || 'th') as any;

    // Connect to regional DB and create event
    const regionalConnection = dbManager.getConnection(region);
    const Event = regionalConnection.models.Event || 
                  regionalConnection.model('Event', mongoose.model('Event').schema);

    // ✅ FIXED: Use values from eventData, not hardcoded defaults
    const newEvent = new Event({
      venueId: venueId,
      eventName: eventData.eventName,
      description: eventData.description,
      eventType: eventData.eventType || 'ENTERTAINMENT',
      eventCategory: eventData.eventCategory,
      eventStartsAt: new Date(eventData.eventStartsAt),
      eventEndsAt: new Date(eventData.eventEndsAt),
      eventDuration: eventData.eventDuration,
      
      // ✅ FIXED: Use timezone from frontend, not hardcoded 'Asia/Dubai'
      eventTimezone: eventData.eventTimezone || 'Asia/Kolkata',
      
      eventRecurrence: eventData.eventRecurrence || 'NONE',
      
      // ✅ FIXED: Parse prices correctly
      eventPriceFrom: eventData.eventPriceFrom ? parseFloat(eventData.eventPriceFrom) : 0,
      eventPriceMax: eventData.eventPriceMax ? parseFloat(eventData.eventPriceMax) : 0,
      
      // ✅ FIXED: Use currency from frontend, not hardcoded 'AED'
      eventCurrency: eventData.eventCurrency || 'INR',
      
      eventAgeRestriction: eventData.eventAgeRestriction,
      capacity: eventData.capacity ? parseInt(eventData.capacity) : 0,
      
      // ✅ FIXED: Respect isActive from frontend
      isActive: eventData.isActive !== undefined ? eventData.isActive : true,
      
      region: region,
      createdBy: req.user.userId,
      
      // ✅ Add these optional fields if present
      daysOfWeek: eventData.daysOfWeek || [],
      timeSlots: eventData.timeSlots || [],
      conditions: eventData.conditions || [],
      imageUrl: eventData.imageUrl,
      images: eventData.images || []
    });

    await newEvent.save();

    console.log(`✅ Event created: ${newEvent._id} for venue ${venueId}`);
    console.log('💾 Saved event data:', {
      eventName: newEvent.eventName,
      currency: newEvent.eventCurrency,
      timezone: newEvent.eventTimezone,
      priceFrom: newEvent.eventPriceFrom,
      priceMax: newEvent.eventPriceMax,
      startDate: newEvent.eventStartsAt,
      endDate: newEvent.eventEndsAt
    });

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venueId.toString(),
      action: 'VENUE_EVENT_CREATED',
      meta: {
        tempVenueId,
        eventId: newEvent._id.toString(),
        eventName: eventData.eventName
      }
    });

    res.status(201).json({
      success: true,
      data: newEvent,
      message: 'Event created successfully'
    });
  } catch (error: any) {
    console.error('❌ Error creating event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create event',
      error: error.message
    });
  }
});

// PUT /api/agent/venues/:tempVenueId/events/:eventId - Update event
// PUT /api/agent/venues/:tempVenueId/events/:eventId - Update event
router.put('/venues/:tempVenueId/events/:eventId', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId, eventId } = req.params;
    const eventData = req.body;

    // Find the temp venue
    const tempVenue = await AgentVenueTemp.findOne({ tempVenueId });
    if (!tempVenue || !tempVenue.venueId) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    const region = (tempVenue.region || 'th') as any;

    // Connect to regional DB
    const regionalConnection = dbManager.getConnection(region);
    const Event = regionalConnection.models.Event || 
                  regionalConnection.model('Event', mongoose.model('Event').schema);

    // ✅ FIXED: Build update data with proper values
    const updateData: any = {
      eventName: eventData.eventName,
      description: eventData.description,
      eventType: eventData.eventType,
      eventCategory: eventData.eventCategory,
      eventStartsAt: new Date(eventData.eventStartsAt),
      eventEndsAt: new Date(eventData.eventEndsAt),
      eventDuration: eventData.eventDuration,
      
      // ✅ FIXED: Use timezone from frontend
      eventTimezone: eventData.eventTimezone,
      
      eventRecurrence: eventData.eventRecurrence,
      
      // ✅ FIXED: Parse prices correctly
      eventPriceFrom: eventData.eventPriceFrom ? parseFloat(eventData.eventPriceFrom) : 0,
      eventPriceMax: eventData.eventPriceMax ? parseFloat(eventData.eventPriceMax) : 0,
      
      // ✅ FIXED: Use currency from frontend
      eventCurrency: eventData.eventCurrency,
      
      eventAgeRestriction: eventData.eventAgeRestriction,
      capacity: eventData.capacity ? parseInt(eventData.capacity) : 0,
      isActive: eventData.isActive,
      
      // ✅ Add optional fields
      daysOfWeek: eventData.daysOfWeek || [],
      timeSlots: eventData.timeSlots || [],
      conditions: eventData.conditions || [],
      
      updatedAt: new Date()
    };

    // ✅ Only update image fields if provided
    if (eventData.imageUrl) {
      updateData.imageUrl = eventData.imageUrl;
    }
    if (eventData.images) {
      updateData.images = eventData.images;
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    console.log(`✅ Event updated: ${eventId}`);

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: tempVenue.venueId.toString(),
      action: 'VENUE_EVENT_UPDATED',
      meta: {
        tempVenueId,
        eventId,
        eventName: eventData.eventName
      }
    });

    res.json({
      success: true,
      data: updatedEvent,
      message: 'Event updated successfully'
    });
  } catch (error: any) {
    console.error('❌ Error updating event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update event',
      error: error.message
    });
  }
});

// DELETE /api/agent/venues/:tempVenueId/events/:eventId - Delete event
router.delete('/venues/:tempVenueId/events/:eventId', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId, eventId } = req.params;

    // Find the temp venue
    const tempVenue = await AgentVenueTemp.findOne({ tempVenueId });
    if (!tempVenue || !tempVenue.venueId) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    const region = (tempVenue.region || 'th') as any;

    // Connect to regional DB
    const regionalConnection = dbManager.getConnection(region);
    const Event = regionalConnection.model('Event');

    // Delete the event
    const deletedEvent = await Event.findByIdAndDelete(eventId);

    if (!deletedEvent) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    console.log(`Event deleted: ${eventId}`);

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: tempVenue.venueId.toString(),
      action: 'VENUE_EVENT_DELETED',
      meta: {
        tempVenueId,
        eventId,
        eventName: (deletedEvent as any).eventName
      }
    });

    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete event',
      error: error.message
    });
  }
});

// ===== MEDIA UPLOAD ROUTES =====


// ✅ Route for media upload WITH SIZE generation
const uploadVenueMediaWithSizes = async (req: any, res: Response) => {
  try {
    // Call the media controller's uploadVenueMedia function (which uses memory storage)
    await mediaController.uploadVenueMedia(req, res);
  } catch (error: any) {
    console.error("❌ Error in media upload with sizes:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload media",
      error: error.message,
    });
  }
};


// ✅ Route for QUICK media upload WITHOUT size generation
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


// ✅ Route for media upload WITH SIZE generation (uses memory storage)
router.post(
  '/venues/:tempVenueId/media',
  uploadVenueMediaMemory.single('file'), // Use memory storage for size generation
  (req: Request, res: Response, next: NextFunction) => {
    uploadVenueMediaWithSizes(req as any, res).catch(next);
  }
);


// ✅ Route for QUICK media upload WITHOUT size generation (uses direct S3 upload)
router.post(
  '/venues/:tempVenueId/media/quick',
  uploadVenueMediaDirect.single('file'), // Use direct S3 upload for speed
  (req: Request, res: Response, next: NextFunction) => {
    uploadVenueMediaQuick(req as any, res).catch(next);
  }
);


// ✅ Route for REGENERATING sizes for existing media
router.post(
  '/venues/:tempVenueId/media/:mediaId/regenerate-sizes',
  (req: Request, res: Response, next: NextFunction) => {
    mediaController.regenerateMediaSizes(req as any, res).catch(next);
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
            // Note: The mediaController now returns only thumbnailUrl and mediumUrl, not fileUrl
            const thumbnailUrl = media.thumbnailUrl ? getCloudFrontUrl(media.thumbnailUrl) : null;
            const mediumUrl = media.mediumUrl ? getCloudFrontUrl(media.mediumUrl) : null;
            
            return {
              ...media,
              thumbnailUrl,
              mediumUrl,
              // fileUrl is not included in response anymore
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
  uploadVenueMediaMemory.single('file'), // Use memory storage for size generation
  (req: Request, res: Response, next: NextFunction) => {
    mediaController.uploadProfileImageWithSizes(req as any, res).catch(next);
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