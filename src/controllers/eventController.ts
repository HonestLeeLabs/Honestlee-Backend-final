// ===== FILE: src/controllers/eventController.ts =====
import { Response, NextFunction } from 'express';
import Event, { IEvent } from '../models/Event';
import User from '../models/User';
import Venue from '../models/Venue';
import AgentVenueTemp from '../models/AgentVenueTemp'; // ✅ Import AgentVenueTemp
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import { dbManager, Region } from '../config/database';
import mongoose from 'mongoose';
import { getS3KeyFromUrl, deleteFileFromS3 } from '../config/uploadConfig';

// ✅ Combined type with region support
type StaffRequest = AuthRequest & RegionRequest;

// GET /api/events - Get all events with filters (PUBLIC or AUTHENTICATED)
export const getAllEvents = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    const region = (req.region || 'ae') as Region;
    const {
      page = 1,
      limit = 50,
      upcoming = 'true',
      startDate,
      endDate,
      category,
      Event_Category,
      event_type,
      search,
      minPrice,
      maxPrice,
      Event_Age_Restriction,
      isFree,
      isPaid,
      sortBy = 'eventStartsAt'
    } = req.query;

    console.log(`🎭 Fetching all events (region: ${region}):`, {
      page,
      limit,
      upcoming,
      category: category || Event_Category,
      event_type,
      search
    });

    // Build query
    const query: any = { isActive: true, region };

    // Date filters
    if (upcoming === 'true') {
      query.eventStartsAt = { $gte: new Date() };
    } else if (startDate || endDate) {
      query.eventStartsAt = {};
      if (startDate) {
        query.eventStartsAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        const endDateTime = new Date(endDate as string);
        endDateTime.setHours(23, 59, 59, 999);
        query.eventStartsAt.$lte = endDateTime;
      }
    }

    // Category filter
    if (category || Event_Category) {
      query.eventCategory = category || Event_Category;
    }

    // Event type filter
    if (event_type) {
      query.eventType = event_type;
    }

    // Price filters
    if (isFree === 'true') {
      query.eventPriceFrom = 0;
      query.eventPriceMax = 0;
    } else if (isPaid === 'true') {
      query.$or = [
        { eventPriceFrom: { $gt: 0 } },
        { eventPriceMax: { $gt: 0 } }
      ];
    } else {
      if (minPrice !== undefined) {
        query.eventPriceFrom = { $gte: parseFloat(minPrice as string) };
      }
      if (maxPrice !== undefined) {
        query.eventPriceMax = { $lte: parseFloat(maxPrice as string) };
      }
    }

    // Age restriction filter
    if (Event_Age_Restriction) {
      query.eventAgeRestriction = Event_Age_Restriction;
    }

    // Search filter
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      query.$or = [
        { eventName: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } },
        { eventCategory: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // ✅ NEW: Get regional event model
    const regionalConnection = dbManager.getConnection(region);

    // Register User model on regional connection if not exists (for population)
    if (!regionalConnection.models.User) {
      regionalConnection.model('User', User.schema);
    }

    const RegionalEvent = regionalConnection.models.Event || regionalConnection.model('Event', Event.schema);
    const RegionalVenue = regionalConnection.models.Venue || regionalConnection.model('Venue', Venue.schema);

    // Execute query with pagination
    const [eventsRaw, totalCount] = await Promise.all([
      RegionalEvent.find(query)
        .populate('createdBy', 'name email')
        .sort({ [sortBy as string]: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      RegionalEvent.countDocuments(query)
    ]);

    // Extract venue IDs
    const venueIds = eventsRaw
      .map((e: any) => e.venueId)
      .filter((id: any) => id && mongoose.Types.ObjectId.isValid(id.toString()));

    // Fetch venues
    const venues = await RegionalVenue.find({ _id: { $in: venueIds } })
      .select('AccountName BillingStreet BillingCity BillingDistrict geometry venuecategory')
      .lean();

    // Create map for O(1) lookup
    const venueMap = new Map(venues.map((v: any) => [v._id.toString(), v]));

    // Attach venue details to events
    const events = eventsRaw.map((event: any) => {
      if (event.venueId && venueMap.has(event.venueId.toString())) {
        event.venueId = venueMap.get(event.venueId.toString());
      }
      return event;
    });

    console.log(`✅ Found ${events.length} events (total: ${totalCount}) in region ${region}`);

    res.json({
      success: true,
      data: events,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
        limit: limitNum
      },
      region
    });

  } catch (error: any) {
    console.error('❌ Error fetching all events:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching events',
      error: error.message
    });
  }
};

// GET /api/events/venue/:venueId - Get all events for a venue BY NAME
// GET /api/events/venue/:venueId - Get all events for a venue BY ID OR NAME
export const getEventsByVenue = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    const region = (req.region || 'ae') as Region;
    const { venueId } = req.params;
    const { activeOnly = 'true', upcoming = 'false' } = req.query;

    console.log(`🎭 Fetching events for venue: ${venueId}, region: ${region}`);

    // ✅ NEW: Get regional venue connection
    const regionalConnection = dbManager.getConnection(region);

    // Register User model on regional connection if not exists (for population)
    if (!regionalConnection.models.User) {
      regionalConnection.model('User', User.schema);
    }

    const RegionalVenue = regionalConnection.models.Venue || regionalConnection.model('Venue', Venue.schema);

    // ✅ FIXED: Try to find venue by ID first, then by name
    let venue;

    // Check if venueId is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(venueId)) {
      venue = await RegionalVenue.findById(venueId);
      console.log(`🔍 Searching by ObjectId: ${venueId}`);
    }

    // If not found by ID, try searching by name
    if (!venue) {
      console.log(`🔍 Searching by name: ${venueId}`);
      venue = await RegionalVenue.findOne({
        AccountName: { $regex: new RegExp(`^${venueId}$`, 'i') }
      });
    }

    if (!venue) {
      console.log('❌ Venue not found:', venueId);
      return res.json({
        success: true,
        data: {
          events: [],
          eventCount: 0
        },
        message: 'Venue not found',
        region
      });
    }

    console.log(`✅ Venue found: ${venue._id} (${venue.AccountName})`);

    // Build query using venue's ObjectId and string ID
    const query: any = {
      region,
      $or: [
        { venueId: venue._id },
        { venueId: venue._id.toString() }
      ]
    };

    // If venue has tempVenueId, match against venueSourceId (for agent venues)
    // If venue has tempVenueId, match against venueSourceId (for agent venues)
    if (venue.tempVenueId) {
      query.$or.push({ venueSourceId: venue.tempVenueId });
    } else {
      // ✅ Fallback: Try to find tempVenueId from AgentVenueTemp if missing in RegionalVenue
      try {
        const agentVenue = await AgentVenueTemp.findOne({
          $or: [{ venueId: venue._id }, { venueId: venue._id.toString() }]
        }).select('tempVenueId');

        if (agentVenue && agentVenue.tempVenueId) {
          console.log(`🔗 Found linked tempVenueId: ${agentVenue.tempVenueId}`);
          query.$or.push({ venueSourceId: agentVenue.tempVenueId });
        }
      } catch (err) {
        // Ignore lookup error
      }
    }

    // Also match venueSourceId against the venue ID itself (fallback)
    query.$or.push({ venueSourceId: venue._id.toString() });

    // ✅ Include events created by owner but missing venueId (fallback)
    if (venue.ownerId) {
      query.$or.push({ venueId: null, createdBy: venue.ownerId });
    }

    if (activeOnly === 'true') {
      query.isActive = true;
    }

    if (upcoming === 'true') {
      // ✅ FIXED: Include ongoing events (Starts >= Now OR Ends >= Now)
      // We use $and because $or is already being used for venue matching
      // We want: (Venue matches) AND (Time matches)
      const now = new Date();
      if (!query.$and) query.$and = [];
      query.$and.push({
        $or: [
          { eventStartsAt: { $gte: now } },
          { eventEndsAt: { $gte: now } }
        ]
      });
    }

    console.log('📋 Event query:', JSON.stringify(query, null, 2));

    const RegionalEvent = regionalConnection.models.Event || regionalConnection.model('Event', Event.schema);

    const events = await RegionalEvent.find(query)
      .populate('createdBy', 'name email')
      .sort({ eventStartsAt: 1 })
      .lean();

    console.log(`✅ Found ${events.length} events for venue ${venue.AccountName}`);

    res.json({
      success: true,
      data: {
        events,
        eventCount: events.length,
        venue: {
          id: venue._id,
          name: venue.AccountName
        }
      },
      region
    });

  } catch (error: any) {
    console.error('❌ Error fetching venue events:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching venue events',
      error: error.message
    });
  }
};

// GET /api/events/:id - Get event details
export const getEventById = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    const { id } = req.params;
    const region = (req.region || 'ae') as Region;

    console.log(`📋 Fetching event ${id} from region ${region}`);

    const regionalConnection = dbManager.getConnection(region);

    // Register User model on regional connection if not exists (for population)
    if (!regionalConnection.models.User) {
      regionalConnection.model('User', User.schema);
    }

    const RegionalEvent = regionalConnection.models.Event || regionalConnection.model('Event', Event.schema);

    const eventRaw = await RegionalEvent.findById(id)
      .populate('createdBy', 'name email')
      .lean();

    if (!eventRaw) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // ✅ NEW: Manually populate venue
    const event = eventRaw as any;
    if (event.venueId) {
      const regionalConnection = dbManager.getConnection(region);
      const RegionalVenue = regionalConnection.models.Venue || regionalConnection.model('Venue', Venue.schema);

      const venue = await RegionalVenue.findById(event.venueId)
        .select('AccountName BillingStreet BillingCity BillingDistrict geometry venuecategory')
        .lean();

      if (venue) {
        event.venueId = venue;
      }
    }

    res.json({ success: true, data: event, region });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching event', error: error.message });
  }
};

// GET /api/events/upcoming - Get upcoming events for user (with filters)
export const getUpcomingEvents = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    const region = (req.region || 'ae') as Region;
    const { lat, lng, radius = 5000, eventType, category, startDate, endDate } = req.query;

    console.log(`🎭 Fetching upcoming events (region: ${region})`);

    // ✅ NEW: Get regional venue connection
    const regionalConnection = dbManager.getConnection(region);

    // Register User model on regional connection if not exists (for population)
    if (!regionalConnection.models.User) {
      regionalConnection.model('User', User.schema);
    }

    const RegionalVenue = regionalConnection.models.Venue || regionalConnection.model('Venue', Venue.schema);

    let venueQuery: any = { isActive: true };

    // Find venues within radius if location provided
    if (lat && lng) {
      venueQuery.geometry = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng as string), parseFloat(lat as string)]
          },
          $maxDistance: parseInt(radius as string)
        }
      };
    }

    const venues = await RegionalVenue.find(venueQuery).select('_id');
    const venueIds = venues.map(v => v._id);

    console.log(`✅ Found ${venueIds.length} venues in region ${region}`);

    if (venueIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No venues found in the specified area',
        region
      });
    }

    // Build event query
    const eventQuery: any = {
      venueId: { $in: venueIds },
      isActive: true,
      eventStartsAt: { $gte: new Date() },
      region
    };

    if (eventType) eventQuery.eventType = eventType;
    if (category) eventQuery.eventCategory = category;
    if (startDate) eventQuery.eventStartsAt = { $gte: new Date(startDate as string) };
    if (endDate) eventQuery.eventEndsAt = { $lte: new Date(endDate as string) };

    const RegionalEvent = regionalConnection.models.Event || regionalConnection.model('Event', Event.schema);

    const eventsRaw = await RegionalEvent.find(eventQuery)
      .populate('createdBy', 'name')
      .sort({ eventStartsAt: 1 })
      .limit(50)
      .lean();

    // ✅ NEW: Manually populate venues for upcoming events
    // We already have venueIds from the initial location search, but let's fetch only the ones actually used
    const usedVenueIds = eventsRaw
      .map(e => e.venueId)
      .filter(id => id && mongoose.Types.ObjectId.isValid(id.toString()));

    const usedVenues = await RegionalVenue.find({ _id: { $in: usedVenueIds } })
      .select('AccountName BillingStreet BillingCity geometry venuecategory')
      .lean();

    const venueMap = new Map(usedVenues.map((v: any) => [v._id.toString(), v]));

    const events = eventsRaw.map((event: any) => {
      if (event.venueId && venueMap.has(event.venueId.toString())) {
        event.venueId = venueMap.get(event.venueId.toString());
      }
      return event;
    });

    console.log(`✅ Found ${events.length} upcoming events`);

    res.json({
      success: true,
      data: events,
      count: events.length,
      region
    });

  } catch (error: any) {
    console.error('❌ Error fetching upcoming events:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching events',
      error: error.message
    });
  }
};

// POST /api/events - Create event (Manager/Owner/Admin only)
// CREATE EVENT with images
export const createEvent = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const region = (req.region || 'ae') as Region;
    const eventData = req.body;

    console.log(`✏️ Creating event (region: ${region}):`, {
      venueId: eventData.venueId,
      eventName: eventData.eventName
    });

    // ✅ Handle images from multer S3 upload
    const images = (req as any).files?.map((file: any) => file.location) || [];
    console.log(`📷 Uploaded ${images.length} images for event`);

    // Verify venue exists in regional database
    const regionalConnection = dbManager.getConnection(region);
    const RegionalVenue = regionalConnection.models.Venue || regionalConnection.model('Venue', Venue.schema);

    const venue = await RegionalVenue.findById(eventData.venueId);
    if (!venue) {
      // ✅ Delete uploaded images if venue not found
      if (images.length > 0) {
        for (const imageUrl of images) {
          const key = getS3KeyFromUrl(imageUrl);
          if (key) await deleteFileFromS3(key);
        }
      }
      return res.status(404).json({
        success: false,
        message: `Venue not found in region ${region}`
      });
    }

    // Calculate duration if not provided
    if (!eventData.eventDuration && eventData.eventStartsAt && eventData.eventEndsAt) {
      const start = new Date(eventData.eventStartsAt);
      const end = new Date(eventData.eventEndsAt);
      const durationMs = end.getTime() - start.getTime();
      const hours = Math.floor(durationMs / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      eventData.eventDuration = `${hours}h ${minutes}m`;
    }

    eventData.region = region;
    eventData.images = images.length > 0 ? images : []; // ✅ Add images array

    // Keep first image as imageUrl for backward compatibility
    if (images.length > 0 && !eventData.imageUrl) {
      eventData.imageUrl = images[0];
    }

    // const regionalConnection = dbManager.getConnection(region); // Reuse existing connection
    const RegionalEvent = regionalConnection.models.Event || regionalConnection.model('Event', Event.schema);

    const newEvent = new RegionalEvent({
      ...eventData,
      createdBy: req.user.userId
    });

    await newEvent.save();
    console.log(`✅ Event created with ${images.length} images: ${newEvent._id} (Region: ${region})`);

    res.status(201).json({ success: true, data: newEvent });

  } catch (error: any) {
    console.error('❌ Error creating event:', error);

    // ✅ Clean up uploaded images on error
    const files = (req as any).files;
    if (files && files.length > 0) {
      for (const file of files) {
        const key = getS3KeyFromUrl(file.location);
        if (key) await deleteFileFromS3(key);
      }
    }

    res.status(400).json({
      success: false,
      message: 'Error creating event',
      error: error.message
    });
  }
};

// UPDATE EVENT with images
export const updateEvent = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const region = (req.region || 'ae') as Region;
    const updates = req.body;

    console.log(`🔄 Updating event ${id} in region ${region}`);

    // ✅ Handle new images from multer
    const newImages = (req as any).files?.map((file: any) => file.location) || [];

    // Recalculate duration if dates changed
    if (updates.eventStartsAt && updates.eventEndsAt) {
      const start = new Date(updates.eventStartsAt);
      const end = new Date(updates.eventEndsAt);
      const durationMs = end.getTime() - start.getTime();
      const hours = Math.floor(durationMs / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      updates.eventDuration = `${hours}h ${minutes}m`;
    }

    const regionalConnection = dbManager.getConnection(region);
    const RegionalEvent = regionalConnection.models.Event || regionalConnection.model('Event', Event.schema);

    // ✅ Get existing event to append new images
    const existingEvent = await RegionalEvent.findById(id);
    if (!existingEvent) {
      // Clean up uploaded images
      if (newImages.length > 0) {
        for (const imageUrl of newImages) {
          const key = getS3KeyFromUrl(imageUrl);
          if (key) await deleteFileFromS3(key);
        }
      }
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // ✅ Append new images to existing images
    if (newImages.length > 0) {
      updates.images = [...(existingEvent.images || []), ...newImages];
      // Update imageUrl if not set
      if (!existingEvent.imageUrl && updates.images.length > 0) {
        updates.imageUrl = updates.images[0];
      }
    }

    const updatedEvent = await RegionalEvent.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    console.log(`✅ Event updated with ${newImages.length} new images: ${updatedEvent?._id}`);

    res.json({ success: true, data: updatedEvent, region });

  } catch (error: any) {
    console.error('❌ Error updating event:', error);
    res.status(400).json({
      success: false,
      message: 'Error updating event',
      error: error.message
    });
  }
};

// DELETE EVENT (with image cleanup)
export const deleteEvent = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const region = (req.region || 'ae') as Region;

    console.log(`🗑️ Deactivating event ${id} in region ${region}`);

    const regionalConnection = dbManager.getConnection(region);
    const RegionalEvent = regionalConnection.models.Event || regionalConnection.model('Event', Event.schema);

    const event = await RegionalEvent.findById(id);

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // ✅ Optional: Delete images from S3 when event is deleted
    // Uncomment if you want to permanently remove images
    /*
    if (event.images && event.images.length > 0) {
      for (const imageUrl of event.images) {
        const key = getS3KeyFromUrl(imageUrl);
        if (key) {
          await deleteFileFromS3(key);
        }
      }
    }
    */

    // Soft delete
    event.isActive = false;
    await event.save();

    console.log(`✅ Event deactivated: ${id}`);

    res.json({ success: true, message: 'Event deactivated successfully', region });

  } catch (error: any) {
    console.error('❌ Error deleting event:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting event',
      error: error.message
    });
  }
};

// POST /api/events/:id/register - Register user for event
export const registerForEvent = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const region = (req.region || 'ae') as Region;

    console.log(`📝 Registering user for event ${id}`);

    const regionalConnection = dbManager.getConnection(region);
    const RegionalEvent = regionalConnection.models.Event || regionalConnection.model('Event', Event.schema);

    const event = (await RegionalEvent.findById(id)) as any;
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    if (!event.isActive) {
      return res.status(400).json({ success: false, message: 'Event is not active' });
    }

    if (!event.hasCapacity()) {
      return res.status(400).json({ success: false, message: 'Event is at full capacity' });
    }

    // Increment attendees
    event.currentAttendees += 1;
    await event.save();

    console.log(`✅ User registered for event: ${id}`);

    res.json({
      success: true,
      message: 'Successfully registered for event',
      data: event,
      region
    });

  } catch (error: any) {
    console.error('❌ Error registering for event:', error);
    res.status(500).json({ success: false, message: 'Error registering for event', error: error.message });
  }
};
