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
import Event from '../models/Event'; // ✅ Add Event model import

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

// ===== EVENT PHOTO UPLOAD (MUST BE BEFORE parameterized routes) =====
// EVENT PHOTO UPLOAD - Add this route to routes/agentOnboarding.ts
router.post('/events/upload-photo', uploadVenueMediaDirect.single('eventPhoto'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo uploaded' });
    }

    const file = req.file as any;

    // ✅ FIX: Remove duplicate https:// prefix
    let cloudFrontUrl = file.location;

    // If it's an S3 URL, transform it to CloudFront
    if (cloudFrontUrl && cloudFrontUrl.includes('.s3.')) {
      const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN || 'dedllwce1iasg.cloudfront.net';
      const s3BucketDomain = process.env.S3_BUCKET_NAME || 'honestlee-user-upload';

      // Extract the S3 key (path after bucket name)
      const s3Key = cloudFrontUrl.split('.com/')[1] || cloudFrontUrl.split(`${s3BucketDomain}/`)[1];

      if (s3Key) {
        cloudFrontUrl = `https://${cloudFrontDomain}/${s3Key}`;
      }
    }

    // ✅ CRITICAL: Ensure no double https://
    cloudFrontUrl = cloudFrontUrl.replace('https://https://', 'https://');

    console.log('✅ Event photo uploaded successfully:', {
      originalUrl: file.location,
      cloudFrontUrl: cloudFrontUrl,
      key: file.key,
      size: (file.size / 1024).toFixed(2) + ' KB'
    });

    return res.json({
      success: true,
      data: {
        url: cloudFrontUrl, // ✅ Clean URL
        s3Key: file.key,
        size: file.size,
        mimetype: file.mimetype
      },
      message: 'Event photo uploaded successfully'
    });
  } catch (error: any) {
    console.error('❌ Error in event photo upload:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload event photo',
      error: error.message
    });
  }
});

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
    res.json = function (data: any) {
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

// GET /api/venues/:venueId/events - Public endpoint for fetching venue events
router.get('/public/venues/:venueId/events', async (req: Request, res: Response) => {
  try {
    const { venueId } = req.params;
    const { upcoming, isActive, sort } = req.query;

    console.log('📡 [PUBLIC] Fetching events for venue:', venueId);

    // Find the venue in AgentVenueTemp to get the actual venue ID
    const tempVenue = await AgentVenueTemp.findOne({
      $or: [
        { tempVenueId: venueId },
        { venueId: new mongoose.Types.ObjectId(venueId) }
      ]
    });

    let actualVenueId = venueId;
    let region: any = 'th'; // Default region

    if (tempVenue) {
      actualVenueId = tempVenue.venueId?.toString() || venueId;
      region = tempVenue.region || 'th';
      console.log('✅ Found temp venue, using actual venueId:', actualVenueId);
    } else {
      // Try to find venue in regional database
      console.log('⚠️ No temp venue found, searching in regional databases');

      // Try each region
      for (const reg of ['th', 'ae', 'in']) {
        try {
          const regionalConnection = dbManager.getConnection(reg as any);
          const RegionalVenue = regionalConnection.models.Venue ||
            regionalConnection.model('Venue', Venue.schema);

          const venue = await RegionalVenue.findById(venueId);
          if (venue) {
            region = reg;
            console.log(`✅ Found venue in ${reg} region`);
            break;
          }
        } catch (err) {
          console.log(`⚠️ Venue not found in ${reg} region`);
        }
      }
    }

    // Get regional connection
    const regionalConnection = dbManager.getConnection(region);
    const Event = regionalConnection.models.Event ||
      regionalConnection.model('Event', mongoose.model('Event').schema);

    // Build query
    const query: any = { venueId: new mongoose.Types.ObjectId(actualVenueId) };

    if (upcoming === 'true') {
      query.eventStartsAt = { $gte: new Date() };
    }

    if (isActive === 'true') {
      query.isActive = true;
    }

    // Fetch events
    const sortField = sort === 'eventStartsAt' ? 'eventStartsAt' : 'createdAt';
    const events = await Event.find(query)
      .sort({ [sortField]: 1 })
      .lean();

    console.log(`✅ [PUBLIC] Found ${events.length} events for venue ${venueId}`);

    res.json({
      success: true,
      data: {
        events: events || [],
        count: events.length
      }
    });
  } catch (error: any) {
    console.error('❌ [PUBLIC] Error fetching venue events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events',
      error: error.message
    });
  }
});

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

    // ✅ FIXED: Get Event model from regional DB with proper schema registration
    const RegionalEvent = regionalConnection.models.Event || regionalConnection.model('Event', Event.schema);

    // Fetch events for this venue
    const events = await RegionalEvent.find({ venueId: venueId })
      .sort({ eventStartsAt: 1 })
      .lean();

    console.log(`✅ Found ${events.length} events for venue ${venueId}`);

    res.json({
      success: true,
      data: {
        events: events || [],
        count: events.length
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching venue events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events',
      error: error.message
    });
  }
});

// POST /api/agent/venues/:tempVenueId/events - Create event
router.post('/venues/:tempVenueId/events', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId } = req.params;
    const eventData = req.body;

    // ✅ VALIDATION: Check required fields
    if (!eventData.eventName || !eventData.eventStartsAt || !eventData.eventEndsAt) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: eventName, eventStartsAt, eventEndsAt'
      });
    }

    const tempVenue = await AgentVenueTemp.findOne({ tempVenueId });
    if (!tempVenue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    let venueId = tempVenue.venueId;
    if (!venueId) {
      // Auto-create venue
      const region = (tempVenue.region || 'th') as any;
      const regionalConnection = dbManager.getConnection(region);
      const RegionalVenue = regionalConnection.models.Venue || regionalConnection.model('Venue', Venue.schema);

      const newVenue = new RegionalVenue({
        globalId: tempVenue.tempVenueId,
        AccountName: tempVenue.name,
        name: tempVenue.name,
        geometry: {
          type: 'Point',
          coordinates: [tempVenue.address?.lng || 0, tempVenue.address?.lat || 0]
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
      console.log(`✅ Auto-created venue ${venueId} for tempVenueId ${tempVenueId}`);
    }

    const region = (tempVenue.region || 'th') as any;
    const regionalConnection = dbManager.getConnection(region);
    const Event = regionalConnection.models.Event || regionalConnection.model('Event', mongoose.model('Event').schema);

    // ✅ Parse arrays/objects with validation
    let daysOfWeek = eventData.daysOfWeek;
    if (typeof daysOfWeek === 'string') {
      daysOfWeek = daysOfWeek.split(',').map((d: string) => parseInt(d.trim())).filter((d: number) => !isNaN(d) && d >= 0 && d <= 6);
    }

    let timeSlots = eventData.timeSlots;
    if (typeof timeSlots === 'string') {
      try {
        timeSlots = JSON.parse(timeSlots);
      } catch (e) {
        console.warn('⚠️ Invalid timeSlots JSON:', e);
        timeSlots = undefined;
      }
    }

    let participationModesSecondary = eventData.participationModesSecondary;
    if (typeof participationModesSecondary === 'string') {
      participationModesSecondary = participationModesSecondary.split(',').map((m: string) => m.trim()).filter(Boolean);
    }

    let tags = eventData.tags;
    if (typeof tags === 'string') {
      tags = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
    }

    // ✅ Create event with ALL fields
    const newEvent = new Event({
      // Core
      venueId: venueId,
      eventName: eventData.eventName,
      eventSubtitle: eventData.eventSubtitle,
      description: eventData.description,
      eventType: eventData.eventType || 'ETC1_entertainment',
      eventTypeSlug: eventData.eventTypeSlug,
      eventCategory: eventData.eventCategory,

      // Source & Origin
      sourceEventId: eventData.sourceEventId,
      sourceName: eventData.sourceName,
      sourceUrl: eventData.sourceUrl,
      venueSourceId: eventData.venueSourceId,
      eventOriginType: eventData.eventOriginType || 'MANUAL',
      eventExclusivity: eventData.eventExclusivity,

      // DateTime
      eventStartsAt: new Date(eventData.eventStartsAt),
      eventEndsAt: new Date(eventData.eventEndsAt),
      eventDuration: eventData.eventDuration,
      eventTimezone: eventData.eventTimezone || 'Asia/Bangkok',
      allDay: eventData.allDay || false,
      doorsOpenAt: eventData.doorsOpenAt ? new Date(eventData.doorsOpenAt) : undefined,

      // Recurrence
      eventRecurrence: eventData.eventRecurrence || 'NONE',
      recurrenceText: eventData.recurrenceText,
      seriesId: eventData.seriesId,
      occurrenceId: eventData.occurrenceId,
      isException: eventData.isException || false,
      daysOfWeek: daysOfWeek,
      timeSlots: timeSlots,

      // Participation
      participationModePrimary: eventData.participationModePrimary || 'DO',
      participationModesSecondary: participationModesSecondary,

      // Audience
      eventGender: eventData.eventGender,
      ageMin: eventData.ageMin ? parseInt(eventData.ageMin) : undefined,
      ageMax: eventData.ageMax ? parseInt(eventData.ageMax) : undefined,
      eventFamilyFriendly: eventData.eventFamilyFriendly || false,
      eventAgeRestriction: eventData.eventAgeRestriction,

      // Skill & Intensity
      eventSkillLevel: eventData.eventSkillLevel,
      eventIntensity: eventData.eventIntensity,

      // Location
      eventIndoorOutdoor: eventData.eventIndoorOutdoor || 'INDOOR',
      accessibilityNotes: eventData.accessibilityNotes,
      locationName: eventData.locationName,
      address: eventData.address,
      neighborhood: eventData.neighborhood,
      city: eventData.city,
      country: eventData.country,
      geoOverride: eventData.geoOverride || false,
      lat: eventData.lat ? parseFloat(eventData.lat) : undefined,
      lng: eventData.lng ? parseFloat(eventData.lng) : undefined,
      eventLocationDirections: eventData.eventLocationDirections,

      // Pricing
      priceType: eventData.priceType || 'FREE',
      eventPriceFrom: eventData.eventPriceFrom ? parseFloat(eventData.eventPriceFrom) : 0,
      eventPriceMax: eventData.eventPriceMax ? parseFloat(eventData.eventPriceMax) : undefined,
      eventCurrency: eventData.eventCurrency || 'THB',
      priceNotes: eventData.priceNotes, // ✅ "Includes 1 drink", "Early bird", etc.

      // Capacity
      capacity: eventData.capacity ? parseInt(eventData.capacity) : undefined,
      ticketsAvailable: eventData.ticketsAvailable ? parseInt(eventData.ticketsAvailable) : 0,
      currentAttendees: 0,

      // RSVP/Booking
      rsvpRequired: eventData.rsvpRequired || false,
      rsvpMethod: eventData.rsvpMethod, // ✅ "Walk-in", "WhatsApp", "LINE", etc.
      rsvpDeadline: eventData.rsvpDeadline ? new Date(eventData.rsvpDeadline) : undefined, // ✅
      bookingUrl: eventData.bookingUrl,
      ticketUrl: eventData.ticketUrl,
      ticketProvider: eventData.ticketProvider,

      // Team/Players
      playersPerSide: eventData.playersPerSide ? parseInt(eventData.playersPerSide) : undefined,
      teamSizeTotal: eventData.teamSizeTotal ? parseInt(eventData.teamSizeTotal) : undefined,
      minPlayers: eventData.minPlayers ? parseInt(eventData.minPlayers) : undefined,
      maxPlayers: eventData.maxPlayers ? parseInt(eventData.maxPlayers) : undefined,
      formatNotes: eventData.formatNotes,

      // Status
      status: eventData.status || 'SCHEDULED',
      visibility: eventData.visibility || 'PUBLIC',
      isActive: eventData.isActive !== undefined ? eventData.isActive : true,
      cancellationReason: eventData.cancellationReason, // ✅ "Weather", "Low signups", etc.
      cancelledAt: eventData.cancelledAt ? new Date(eventData.cancelledAt) : undefined, // ✅

      // Weather
      weatherSensitive: eventData.weatherSensitive || false,
      badWeatherPolicy: eventData.badWeatherPolicy,

      // Organizer
      organizerName: eventData.organizerName,
      organizerType: eventData.organizerType,
      organizerContact: eventData.organizerContact,
      organizerWhatsapp: eventData.organizerWhatsapp,
      organizerLine: eventData.organizerLine,
      organizerInstagram: eventData.organizerInstagram,
      organizerEmail: eventData.organizerEmail,

      // Media
      imageUrl: eventData.imageUrl,
      images: eventData.images || [],
      coverPhotoUrl: eventData.coverPhotoUrl,
      eventPhotoUrl: eventData.eventPhotoUrl,
      eventPhotoS3Key: eventData.eventPhotoS3Key,

      // Gear
      eventsGear: eventData.eventsGear,

      // Check-in
      checkInMethod: eventData.checkInMethod,
      onPremiseRequired: eventData.onPremiseRequired || false,

      // Verification
      lastVerifiedAt: eventData.lastVerifiedAt ? new Date(eventData.lastVerifiedAt) : undefined,
      verifiedBy: eventData.verifiedBy,
      confidenceScore: eventData.confidenceScore ? parseFloat(eventData.confidenceScore) : 0,
      notesInternal: eventData.notesInternal,

      // Meta
      tags: tags || [],
      language: eventData.language || 'en',
      conditions: eventData.conditions,
      region: region,
      createdBy: req.user.userId
    });

    await newEvent.save();
    console.log(`✅ Event created ${newEvent._id} for venue ${venueId}`);

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venueId.toString(),
      action: 'VENUE_EVENT_CREATED',
      meta: { tempVenueId, eventId: newEvent._id.toString(), eventName: eventData.eventName }
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
router.put('/venues/:tempVenueId/events/:eventId', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId, eventId } = req.params;
    const eventData = req.body;

    const tempVenue = await AgentVenueTemp.findOne({ tempVenueId });
    if (!tempVenue || !tempVenue.venueId) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    const region = (tempVenue.region || 'th') as any;
    const regionalConnection = dbManager.getConnection(region);
    const Event = regionalConnection.models.Event || regionalConnection.model('Event', mongoose.model('Event').schema);

    // ✅ Parse arrays/objects with validation
    let daysOfWeek = eventData.daysOfWeek;
    if (typeof daysOfWeek === 'string') {
      daysOfWeek = daysOfWeek.split(',').map((d: string) => parseInt(d.trim())).filter((d: number) => !isNaN(d) && d >= 0 && d <= 6);
    }

    let timeSlots = eventData.timeSlots;
    if (typeof timeSlots === 'string') {
      try {
        timeSlots = JSON.parse(timeSlots);
      } catch (e) {
        console.warn('⚠️ Invalid timeSlots JSON:', e);
        timeSlots = undefined;
      }
    }

    let participationModesSecondary = eventData.participationModesSecondary;
    if (typeof participationModesSecondary === 'string') {
      participationModesSecondary = participationModesSecondary.split(',').map((m: string) => m.trim()).filter(Boolean);
    }

    let tags = eventData.tags;
    if (typeof tags === 'string') {
      tags = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
    }

    // ✅ Build update object with ALL fields
    const updateData: any = {
      // Core
      eventName: eventData.eventName,
      eventSubtitle: eventData.eventSubtitle,
      description: eventData.description,
      eventType: eventData.eventType,
      eventTypeSlug: eventData.eventTypeSlug,
      eventCategory: eventData.eventCategory,

      // Source & Origin
      sourceEventId: eventData.sourceEventId,
      sourceName: eventData.sourceName,
      sourceUrl: eventData.sourceUrl,
      venueSourceId: eventData.venueSourceId,
      eventOriginType: eventData.eventOriginType,
      eventExclusivity: eventData.eventExclusivity,

      // DateTime
      eventStartsAt: new Date(eventData.eventStartsAt),
      eventEndsAt: new Date(eventData.eventEndsAt),
      eventDuration: eventData.eventDuration,
      eventTimezone: eventData.eventTimezone,
      allDay: eventData.allDay,
      doorsOpenAt: eventData.doorsOpenAt ? new Date(eventData.doorsOpenAt) : undefined,

      // Recurrence
      eventRecurrence: eventData.eventRecurrence,
      recurrenceText: eventData.recurrenceText,
      seriesId: eventData.seriesId,
      occurrenceId: eventData.occurrenceId,
      isException: eventData.isException,
      daysOfWeek: daysOfWeek,
      timeSlots: timeSlots,

      // Participation
      participationModePrimary: eventData.participationModePrimary,
      participationModesSecondary: participationModesSecondary,

      // Audience
      eventGender: eventData.eventGender,
      ageMin: eventData.ageMin ? parseInt(eventData.ageMin) : undefined,
      ageMax: eventData.ageMax ? parseInt(eventData.ageMax) : undefined,
      eventFamilyFriendly: eventData.eventFamilyFriendly,
      eventAgeRestriction: eventData.eventAgeRestriction,

      // Skill & Intensity
      eventSkillLevel: eventData.eventSkillLevel,
      eventIntensity: eventData.eventIntensity,

      // Location
      eventIndoorOutdoor: eventData.eventIndoorOutdoor,
      accessibilityNotes: eventData.accessibilityNotes,
      locationName: eventData.locationName,
      address: eventData.address,
      neighborhood: eventData.neighborhood,
      city: eventData.city,
      country: eventData.country,
      geoOverride: eventData.geoOverride,
      lat: eventData.lat ? parseFloat(eventData.lat) : undefined,
      lng: eventData.lng ? parseFloat(eventData.lng) : undefined,
      eventLocationDirections: eventData.eventLocationDirections,

      // Pricing
      priceType: eventData.priceType,
      eventPriceFrom: eventData.eventPriceFrom ? parseFloat(eventData.eventPriceFrom) : 0,
      eventPriceMax: eventData.eventPriceMax ? parseFloat(eventData.eventPriceMax) : undefined,
      eventCurrency: eventData.eventCurrency,
      priceNotes: eventData.priceNotes, // ✅

      // Capacity
      capacity: eventData.capacity ? parseInt(eventData.capacity) : undefined,
      ticketsAvailable: eventData.ticketsAvailable ? parseInt(eventData.ticketsAvailable) : undefined,

      // RSVP/Booking
      rsvpRequired: eventData.rsvpRequired,
      rsvpMethod: eventData.rsvpMethod, // ✅
      rsvpDeadline: eventData.rsvpDeadline ? new Date(eventData.rsvpDeadline) : undefined, // ✅
      bookingUrl: eventData.bookingUrl,
      ticketUrl: eventData.ticketUrl,
      ticketProvider: eventData.ticketProvider,

      // Team/Players
      playersPerSide: eventData.playersPerSide ? parseInt(eventData.playersPerSide) : undefined,
      teamSizeTotal: eventData.teamSizeTotal ? parseInt(eventData.teamSizeTotal) : undefined,
      minPlayers: eventData.minPlayers ? parseInt(eventData.minPlayers) : undefined,
      maxPlayers: eventData.maxPlayers ? parseInt(eventData.maxPlayers) : undefined,
      formatNotes: eventData.formatNotes,

      // Status
      status: eventData.status,
      visibility: eventData.visibility,
      isActive: eventData.isActive,
      cancellationReason: eventData.cancellationReason, // ✅
      cancelledAt: eventData.cancelledAt ? new Date(eventData.cancelledAt) : undefined, // ✅

      // Weather
      weatherSensitive: eventData.weatherSensitive,
      badWeatherPolicy: eventData.badWeatherPolicy,

      // Organizer
      organizerName: eventData.organizerName,
      organizerType: eventData.organizerType,
      organizerContact: eventData.organizerContact,
      organizerWhatsapp: eventData.organizerWhatsapp,
      organizerLine: eventData.organizerLine,
      organizerInstagram: eventData.organizerInstagram,
      organizerEmail: eventData.organizerEmail,

      // Media
      imageUrl: eventData.imageUrl,
      images: eventData.images,
      coverPhotoUrl: eventData.coverPhotoUrl,
      eventPhotoUrl: eventData.eventPhotoUrl,
      eventPhotoS3Key: eventData.eventPhotoS3Key,

      // Gear
      eventsGear: eventData.eventsGear,

      // Check-in
      checkInMethod: eventData.checkInMethod,
      onPremiseRequired: eventData.onPremiseRequired,

      // Verification
      lastVerifiedAt: eventData.lastVerifiedAt ? new Date(eventData.lastVerifiedAt) : undefined,
      verifiedBy: eventData.verifiedBy,
      confidenceScore: eventData.confidenceScore ? parseFloat(eventData.confidenceScore) : undefined,
      notesInternal: eventData.notesInternal,

      // Meta
      tags: tags,
      language: eventData.language,
      conditions: eventData.conditions,

      // Timestamp
      updatedAt: new Date()
    };

    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    console.log(`✅ Event updated: ${eventId}`);

    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: tempVenue.venueId.toString(),
      action: 'VENUE_EVENT_UPDATED',
      meta: { tempVenueId, eventId, eventName: eventData.eventName }
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

    console.log(`✅ Event deleted: ${eventId}`);

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
    console.error('❌ Error deleting event:', error);
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


    res.json = function (data: any) {
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


    res.json = function (data: any) {
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