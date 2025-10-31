// ===== FILE: src/controllers/eventController.ts =====
import { Response, NextFunction } from 'express';
import Event, { IEvent } from '../models/Event';
import User from '../models/User';
import Venue from '../models/Venue';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import { dbManager, Region } from '../config/database';
import mongoose from 'mongoose';

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

    // Execute query with pagination
    const [events, totalCount] = await Promise.all([
      Event.find(query)
        .populate('venueId', 'AccountName BillingStreet BillingCity BillingDistrict geometry venuecategory')
        .populate('createdBy', 'name email')
        .sort({ [sortBy as string]: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Event.countDocuments(query)
    ]);

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
export const getEventsByVenue = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    const region = (req.region || 'ae') as Region;
    const { venueId } = req.params;
    const { activeOnly = 'true', upcoming = 'false' } = req.query;

    console.log(`🎭 Fetching events for venue: ${venueId}, region: ${region}`);

    // ✅ NEW: Get regional venue connection
    const regionalConnection = dbManager.getConnection(region);
    const RegionalVenue = regionalConnection.model('Venue', Venue.schema);

    // Find venue by name in regional database
    const venue = await RegionalVenue.findOne({ 
      AccountName: { $regex: new RegExp(`^${venueId}$`, 'i') }
    });

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

    // Build query using venue's ObjectId
    const query: any = { 
      venueId: venue._id,
      region
    };
    
    if (activeOnly === 'true') {
      query.isActive = true;
    }

    if (upcoming === 'true') {
      query.eventStartsAt = { $gte: new Date() };
    }

    const events = await Event.find(query)
      .populate('createdBy', 'name email')
      .sort({ eventStartsAt: 1 });

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

    const event = await Event.findById(id)
      .populate('venueId')
      .populate('createdBy', 'name email');
      
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
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
    const RegionalVenue = regionalConnection.model('Venue', Venue.schema);

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

    const events = await Event.find(eventQuery)
      .populate('venueId', 'AccountName BillingStreet BillingCity geometry venuecategory')
      .populate('createdBy', 'name')
      .sort({ eventStartsAt: 1 })
      .limit(50);

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
export const createEvent = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const region = (req.region || 'ae') as Region;
    const eventData = req.body;

    console.log(`✏️ Creating event (region: ${region}):`, { venueId: eventData.venueId, eventName: eventData.eventName });

    // ✅ NEW: Verify venue exists in regional database
    const regionalConnection = dbManager.getConnection(region);
    const RegionalVenue = regionalConnection.model('Venue', Venue.schema);

    const venue = await RegionalVenue.findById(eventData.venueId);
    if (!venue) {
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

    // ✅ NEW: Add region to event data
    eventData.region = region;

    const newEvent = new Event({
      ...eventData,
      createdBy: req.user.userId
    });

    await newEvent.save();

    console.log(`✅ Event created: ${newEvent._id}`);

    res.status(201).json({ success: true, data: newEvent });

  } catch (error: any) {
    console.error('❌ Error creating event:', error);
    res.status(400).json({ success: false, message: 'Error creating event', error: error.message });
  }
};

// PUT /api/events/:id - Update event
export const updateEvent = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const region = (req.region || 'ae') as Region;
    const updates = req.body;

    console.log(`🔄 Updating event ${id} in region ${region}`);

    // Recalculate duration if dates changed
    if (updates.eventStartsAt && updates.eventEndsAt) {
      const start = new Date(updates.eventStartsAt);
      const end = new Date(updates.eventEndsAt);
      const durationMs = end.getTime() - start.getTime();
      const hours = Math.floor(durationMs / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      updates.eventDuration = `${hours}h ${minutes}m`;
    }

    const updatedEvent = await Event.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

    if (!updatedEvent) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    console.log(`✅ Event updated: ${updatedEvent._id}`);

    res.json({ success: true, data: updatedEvent, region });

  } catch (error: any) {
    console.error('❌ Error updating event:', error);
    res.status(400).json({ success: false, message: 'Error updating event', error: error.message });
  }
};

// DELETE /api/events/:id - Soft delete event
export const deleteEvent = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const region = (req.region || 'ae') as Region;

    console.log(`🗑️ Deactivating event ${id} in region ${region}`);

    const event = await Event.findByIdAndUpdate(id, { isActive: false }, { new: true });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    console.log(`✅ Event deactivated: ${id}`);

    res.json({ success: true, message: 'Event deactivated successfully', region });

  } catch (error: any) {
    console.error('❌ Error deleting event:', error);
    res.status(500).json({ success: false, message: 'Error deleting event', error: error.message });
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

    const event = await Event.findById(id);
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
