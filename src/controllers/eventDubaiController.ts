import { Request, Response } from 'express';
import EventDubai, { IEventDubai } from '../models/EventDubai';
import VenueDubai from '../models/VenueDubai';
import { AuthRequest } from '../middlewares/authMiddleware';

// GET /api/events-dubai - Get all events with filtering
export const getAllEvents = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      event_type,
      event_category,
      venue_id,
      account_name,
      startDate,
      endDate,
      upcoming = 'true',
      active = 'false',
      sort = 'date'
    } = req.query;

    const query: any = {};

    // Universal text search across multiple fields
    if (search) {
      query.$or = [
        { Event_Name: { $regex: search, $options: 'i' } },
        { Account_Name: { $regex: search, $options: 'i' } },
        { Even_description: { $regex: search, $options: 'i' } },
        { Event_Category: { $regex: search, $options: 'i' } },
        { Event_typs_displayname: { $regex: search, $options: 'i' } },
        { Event_type: { $regex: search, $options: 'i' } }
      ];
    }

    // Specific field filters
    if (event_type) query.Event_type = event_type;
    if (event_category) query.Event_Category = event_category;
    if (venue_id) query.Dubai_id = venue_id;
    if (account_name) query.Account_Name = account_name;

    // Date range filters
    if (startDate || endDate) {
      query.EventStarts_At = {};
      
      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        query.EventStarts_At.$gte = start;
      }
      
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        query.EventStarts_At.$lte = end;
      }
    } 
    // Upcoming/Active filters (only if no date range specified)
    else {
      const now = new Date();
      if (upcoming === 'true') {
        query.EventStarts_At = { $gte: now };
      }
      if (active === 'true') {
        query.EventStarts_At = { $lte: now };
        query.EventEnds_At = { $gte: now };
      }
    }

    // Sort options
    const sortOptions: any = {};
    switch (sort) {
      case 'name':
        sortOptions.Event_Name = 1;
        break;
      case 'date':
        sortOptions.EventStarts_At = 1;
        break;
      case 'venue':
        sortOptions.Account_Name = 1;
        break;
      default:
        sortOptions.EventStarts_At = 1;
    }

    // Pagination
    const pageNumber = parseInt(page as string);
    const pageSize = parseInt(limit as string);
    const skip = (pageNumber - 1) * pageSize;

    const [events, totalCount] = await Promise.all([
      EventDubai.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      EventDubai.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: events,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / pageSize),
        totalCount,
        hasNextPage: pageNumber < Math.ceil(totalCount / pageSize),
        hasPrevPage: pageNumber > 1
      },
      filters: {
        search,
        event_type,
        event_category,
        venue_id,
        account_name,
        startDate,
        endDate,
        upcoming: upcoming === 'true',
        active: active === 'true'
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching events',
      error: error.message
    });
  }
};

// GET /api/events-dubai/:id - Get single event
export const getEventById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    let event;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      event = await EventDubai.findById(id);
    } else {
      event = await EventDubai.findOne({ Dubai_event_id: id });
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Get venue details
    const venue = await VenueDubai.findOne({ AccountName: event.Account_Name });

    res.json({
      success: true,
      data: {
        ...event.toObject(),
        venue: venue ? venue.toObject() : null
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching event',
      error: error.message
    });
  }
};

// GET /api/events-dubai/venue/:account_name - Get all events for a venue
export const getEventsByVenue = async (req: Request, res: Response) => {
  try {
    const { account_name } = req.params;
    const { upcoming = 'true' } = req.query;

    // Verify venue exists - FIXED: Use AccountName instead of Account_Name
    const venue = await VenueDubai.findOne({ AccountName: account_name });
    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    const query: any = { Account_Name: account_name };
    
    if (upcoming === 'true') {
      query.EventStarts_At = { $gte: new Date() };
    }

    const events = await EventDubai.find(query)
      .sort({ EventStarts_At: 1 })
      .lean();

    res.json({
      success: true,
      data: {
        venue: venue.toObject(),
        events,
        eventCount: events.length
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching venue events',
      error: error.message
    });
  }
};

// POST /api/events-dubai - Create new event (Admin/Staff only)
export const createEvent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['ADMIN', 'STAFF'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    const eventData = req.body;

    // Validate required fields
    if (!eventData.Dubai_event_id || !eventData.Account_Name) {
      return res.status(400).json({
        success: false,
        message: 'Dubai_event_id and Account_Name are required'
      });
    }

    // Verify venue exists - FIXED: Use AccountName instead of Account_Name
    const venue = await VenueDubai.findOne({ AccountName: eventData.Account_Name });
    if (!venue) {
      return res.status(400).json({
        success: false,
        message: `Venue with Account_Name "${eventData.Account_Name}" not found`
      });
    }

    // Set Dubai_id from venue if not provided - FIXED: Use Dubaiid
    if (!eventData.Dubai_id) {
      eventData.Dubai_id = venue.Dubaiid;
    }

    // Check for duplicate event ID
    const existingEvent = await EventDubai.findOne({ Dubai_event_id: eventData.Dubai_event_id });
    if (existingEvent) {
      return res.status(400).json({
        success: false,
        message: 'Event with this Dubai_event_id already exists'
      });
    }

    const event = new EventDubai(eventData);
    await event.save();

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: event
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: 'Error creating event',
      error: error.message
    });
  }
};

// PUT /api/events-dubai/:id - Update event (Admin/Staff only)
export const updateEvent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['ADMIN', 'STAFF'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // If Account_Name is being changed, verify new venue exists - FIXED: Use AccountName
    if (updateData.Account_Name) {
      const venue = await VenueDubai.findOne({ AccountName: updateData.Account_Name });
      if (!venue) {
        return res.status(400).json({
          success: false,
          message: `Venue with Account_Name "${updateData.Account_Name}" not found`
        });
      }
      // FIXED: Use Dubaiid instead of Dubai_id
      updateData.Dubai_id = venue.Dubaiid;
    }

    let event;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      event = await EventDubai.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    } else {
      event = await EventDubai.findOneAndUpdate({ Dubai_event_id: id }, updateData, { new: true, runValidators: true });
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.json({
      success: true,
      message: 'Event updated successfully',
      data: event
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: 'Error updating event',
      error: error.message
    });
  }
};

// DELETE /api/events-dubai/:id - Delete event (Admin only)
export const deleteEvent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Admin role required'
      });
    }

    const { id } = req.params;

    let event;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      event = await EventDubai.findByIdAndDelete(id);
    } else {
      event = await EventDubai.findOneAndDelete({ Dubai_event_id: id });
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.json({
      success: true,
      message: 'Event deleted successfully',
      data: event
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting event',
      error: error.message
    });
  }
};

// POST /api/events-dubai/bulk-import - Bulk import events (Admin only)
export const bulkImportEvents = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Admin role required'
      });
    }

    const { events, overwrite = false } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid events array'
      });
    }

    const results = {
      created: 0,
      updated: 0,
      errors: 0,
      details: [] as any[]
    };

    for (const eventData of events) {
      try {
        if (!eventData.Dubai_event_id || !eventData.Account_Name) {
          results.errors++;
          results.details.push({
            Dubai_event_id: eventData.Dubai_event_id || 'unknown',
            error: 'Missing required fields'
          });
          continue;
        }

        // Verify venue exists - FIXED: Use AccountName instead of Account_Name
        const venue = await VenueDubai.findOne({ AccountName: eventData.Account_Name });
        if (!venue) {
          results.errors++;
          results.details.push({
            Dubai_event_id: eventData.Dubai_event_id,
            error: `Venue "${eventData.Account_Name}" not found`
          });
          continue;
        }

        // Set Dubai_id from venue - FIXED: Use Dubaiid
        eventData.Dubai_id = venue.Dubaiid;

        const existingEvent = await EventDubai.findOne({ Dubai_event_id: eventData.Dubai_event_id });

        if (existingEvent && overwrite) {
          await EventDubai.findOneAndUpdate(
            { Dubai_event_id: eventData.Dubai_event_id },
            eventData,
            { runValidators: true }
          );
          results.updated++;
          results.details.push({
            Dubai_event_id: eventData.Dubai_event_id,
            action: 'updated'
          });
        } else if (!existingEvent) {
          const event = new EventDubai(eventData);
          await event.save();
          results.created++;
          results.details.push({
            Dubai_event_id: eventData.Dubai_event_id,
            action: 'created'
          });
        } else {
          results.errors++;
          results.details.push({
            Dubai_event_id: eventData.Dubai_event_id,
            error: 'Already exists (use overwrite=true)'
          });
        }
      } catch (error: any) {
        results.errors++;
        results.details.push({
          Dubai_event_id: eventData.Dubai_event_id || 'unknown',
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: 'Bulk import completed',
      results
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error during bulk import',
      error: error.message
    });
  }
};

// GET /api/events-dubai/upcoming - Get upcoming events
export const getUpcomingEvents = async (req: Request, res: Response) => {
  try {
    const { limit = 20 } = req.query;
    
    const events = await EventDubai.findUpcoming(parseInt(limit as string));

    res.json({
      success: true,
      data: events,
      count: events.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming events',
      error: error.message
    });
  }
};