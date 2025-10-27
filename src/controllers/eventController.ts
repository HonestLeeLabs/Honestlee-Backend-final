import { Response } from 'express';
import Event, { IEvent } from '../models/Event';
import User from '../models/User';
import Venue from '../models/Venue';
import { AuthRequest } from '../middlewares/authMiddleware';
import mongoose from 'mongoose';

// GET /api/events/venue/:venueId - Get all events for a venue
export const getEventsByVenue = async (req: AuthRequest, res: Response) => {
  try {
    const { venueId } = req.params;
    const { activeOnly = 'true', upcoming = 'false' } = req.query;

    const query: any = { venueId };
    
    if (activeOnly === 'true') {
      query.isActive = true;
    }

    if (upcoming === 'true') {
      query.eventStartsAt = { $gte: new Date() };
    }

    const events = await Event.find(query)
      .populate('createdBy', 'name email')
      .sort({ eventStartsAt: 1 });

    res.json({ success: true, data: events, count: events.length });

  } catch (error: any) {
    console.error('Error fetching venue events:', error);
    res.status(500).json({ success: false, message: 'Error fetching venue events', error: error.message });
  }
};

// GET /api/events/:id - Get event details
export const getEventById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id)
      .populate('venueId')
      .populate('createdBy', 'name email');
      
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, data: event });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching event', error: error.message });
  }
};

// GET /api/events/eligible - Get upcoming events for user (with filters)
export const getUpcomingEvents = async (req: AuthRequest, res: Response) => {
  try {
    const { lat, lng, radius = 5000, eventType, category, startDate, endDate } = req.query;

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

    const venues = await Venue.find(venueQuery).select('_id');
    const venueIds = venues.map(v => v._id);

    if (venueIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No venues found in the specified area'
      });
    }

    // Build event query
    const eventQuery: any = {
      venueId: { $in: venueIds },
      isActive: true,
      eventStartsAt: { $gte: new Date() }
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

    res.json({
      success: true,
      data: events,
      count: events.length
    });

  } catch (error: any) {
    console.error('Error fetching upcoming events:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching events', 
      error: error.message 
    });
  }
};

// POST /api/events - Create event (Manager/Owner/Admin only)
export const createEvent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const eventData = req.body;

    // Validate venue access
    const venue = await Venue.findById(eventData.venueId);
    if (!venue) {
      return res.status(404).json({ message: 'Venue not found' });
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

    const newEvent = new Event({
      ...eventData,
      createdBy: req.user.userId
    });

    await newEvent.save();

    res.status(201).json({ success: true, data: newEvent });

  } catch (error: any) {
    console.error('Error creating event:', error);
    res.status(400).json({ success: false, message: 'Error creating event', error: error.message });
  }
};

// PUT /api/events/:id - Update event
export const updateEvent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const updates = req.body;

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

    res.json({ success: true, data: updatedEvent });

  } catch (error: any) {
    res.status(400).json({ success: false, message: 'Error updating event', error: error.message });
  }
};

// DELETE /api/events/:id - Soft delete event
export const deleteEvent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { id } = req.params;

    const event = await Event.findByIdAndUpdate(id, { isActive: false }, { new: true });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, message: 'Event deactivated successfully' });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deleting event', error: error.message });
  }
};

// POST /api/events/:id/register - Register user for event
export const registerForEvent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;

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

    res.json({ 
      success: true, 
      message: 'Successfully registered for event',
      data: event
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error registering for event', error: error.message });
  }
};