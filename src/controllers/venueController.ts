// src/controllers/venueController.ts

import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import { getVenueModel } from '../models/Venue';
import { dbManager } from '../config/database';
import mongoose from 'mongoose';
import { Role } from '../models/User';

type CombinedRequest = AuthRequest & RegionRequest;

// Helper to check user roles
function hasRole(userRole: string | undefined, allowedRoles: string[]): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}

// CREATE VENUE - FIXED VERSION
export const createVenue = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!hasRole(req.user.role, [Role.ADMIN, Role.STAFF, Role.AGENT])) {
      return res.status(403).json({ message: 'Forbidden: insufficient role to create venue' });
    }

    const venueData = { ...req.body };
    
    // ========== CRITICAL: REMOVE VENDOR-ONLY FIELDS ==========
    delete venueData.currentLocation;
    delete venueData.serviceRadius;
    delete venueData.isOperational;
    delete venueData.locationHistory;
    delete venueData.vendorType;
    delete venueData.vendorName;
    delete venueData.vendorPhoneNumber;
    delete venueData.serviceArea;
    delete venueData.hotspot;
    // ========================================================

    // Add region
    venueData.region = region;

    // VALIDATION
    if (!venueData.globalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'globalId is required' 
      });
    }
    
    if (!venueData.AccountName) {
      return res.status(400).json({ 
        success: false, 
        message: 'AccountName is required' 
      });
    }
    
    // ========== GEOMETRY VALIDATION ==========
    if (!venueData.geometry) {
      return res.status(400).json({ 
        success: false, 
        message: 'geometry with coordinates is required' 
      });
    }

    if (venueData.geometry.type !== 'Point') {
      return res.status(400).json({ 
        success: false, 
        message: 'Geometry type must be Point' 
      });
    }

    if (!Array.isArray(venueData.geometry.coordinates) || 
        venueData.geometry.coordinates.length !== 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Coordinates must be [longitude, latitude]',
        received: venueData.geometry.coordinates 
      });
    }

    // Parse and validate coordinates
    const [lng, lat] = venueData.geometry.coordinates;
    const parsedLng = parseFloat(lng);
    const parsedLat = parseFloat(lat);

    if (isNaN(parsedLng) || isNaN(parsedLat)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Coordinates must be numbers',
        received: [lng, lat]
      });
    }

    if (parsedLng < -180 || parsedLng > 180) {
      return res.status(400).json({ 
        success: false, 
        message: 'Longitude must be between -180 and 180',
        received: parsedLng 
      });
    }

    if (parsedLat < -90 || parsedLat > 90) {
      return res.status(400).json({ 
        success: false, 
        message: 'Latitude must be between -90 and 90',
        received: parsedLat 
      });
    }

    // Ensure geometry is properly formatted
    venueData.geometry = {
      type: 'Point',
      coordinates: [parsedLng, parsedLat]
    };

    // Set system fields
    venueData.ownerId = req.user.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined;
    venueData.isVerified = req.user.role === Role.ADMIN ? true : false;
    venueData.isActive = true;

    // Create and save
    const newVenue = new Venue(venueData);
    await newVenue.save();

    res.status(201).json({ 
      success: true, 
      message: 'Venue created successfully', 
      data: newVenue 
    });

  } catch (error: any) {
    console.error('Error creating venue:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        errors: messages 
      });
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        message: `A venue with this ${field} already exists`, 
        field 
      });
    }
    
    res.status(400).json({ 
      success: false, 
      message: 'Venue creation failed', 
      error: error.message 
    });
  }
};

// UPDATE VENUE - FIXED VERSION
export const updateVenue = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!hasRole(req.user.role, [Role.ADMIN, Role.STAFF, Role.MANAGER, Role.OWNER])) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid venue ID format' 
      });
    }

    const updateData = { ...req.body };

    // ========== CRITICAL: REMOVE VENDOR-ONLY FIELDS ==========
    delete updateData.currentLocation;
    delete updateData.serviceRadius;
    delete updateData.isOperational;
    delete updateData.locationHistory;
    delete updateData.vendorType;
    delete updateData.vendorName;
    delete updateData.vendorPhoneNumber;
    delete updateData.serviceArea;
    delete updateData.hotspot;
    // ========================================================

    // Remove system fields that shouldn't be updated
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // Validate and parse geometry if present
    if (updateData.geometry) {
      if (updateData.geometry.type !== 'Point') {
        return res.status(400).json({ 
          success: false, 
          message: 'Geometry type must be Point' 
        });
      }

      if (!Array.isArray(updateData.geometry.coordinates) || 
          updateData.geometry.coordinates.length !== 2) {
        return res.status(400).json({ 
          success: false, 
          message: 'Coordinates must be [longitude, latitude]' 
        });
      }

      const [lng, lat] = updateData.geometry.coordinates;
      updateData.geometry.coordinates = [
        parseFloat(lng),
        parseFloat(lat)
      ];
    }

    // Non-admin users can't modify these
    if (req.user.role !== Role.ADMIN) {
      delete updateData.isVerified;
      delete updateData.isActive;
    }

    const updatedVenue = await Venue.findByIdAndUpdate(
      id, 
      { $set: updateData }, 
      { new: true, runValidators: true }
    );

    if (!updatedVenue) {
      return res.status(404).json({ 
        success: false, 
        message: 'Venue not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Venue updated successfully', 
      data: updatedVenue 
    });

  } catch (error: any) {
    console.error('Error updating venue:', error);
    res.status(400).json({ 
      success: false, 
      message: 'Venue update failed', 
      error: error.message 
    });
  }
};

// GET VENUES (keep existing)
export const getVenues = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const {
      page = 1,
      limit = 10,
      venuetype,
      venuecategory,
      groupid,
      BillingCity,
      BillingCountry,
      BudgetFriendly,
      PubWifi,
      minRating,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      latitude,
      longitude,
      radius = 5000
    } = req.query;

    const query: any = { isActive: true, region };

    if (venuetype) query.venuetype = venuetype;
    if (venuecategory) query.venuecategory = venuecategory;
    if (groupid) query.groupid = groupid;
    if (BillingCity) query.BillingCity = BillingCity;
    if (BillingCountry) query.BillingCountry = BillingCountry;
    if (BudgetFriendly) query.BudgetFriendly = BudgetFriendly;
    if (PubWifi) query.PubWifi = PubWifi === '1' || PubWifi === 'true' ? 1 : 0;
    if (minRating && !isNaN(Number(minRating))) {
      query.Rating = { $gte: Number(minRating) };
    }

    if (search && typeof search === 'string') {
      query.$or = [
        { AccountName: { $regex: search, $options: 'i' } },
        { BillingCity: { $regex: search, $options: 'i' } }
      ];
    }

    if (latitude && longitude) {
      const lat = parseFloat(latitude.toString());
      const lng = parseFloat(longitude.toString());
      const rad = parseInt(radius.toString());
      query.geometry = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: rad
        }
      };
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const sortObj: any = {};
    sortObj[sortBy.toString()] = sortOrder === 'asc' ? 1 : -1;

    const venues = await Venue.find(query)
      .sort(sortObj)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Venue.countDocuments(query);

    res.json({
      success: true,
      region,
      data: venues,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error: any) {
    console.error('Error fetching venues:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching venues', 
      error: error.message 
    });
  }
};

// GET VENUE BY ID (keep existing)
export const getVenueById = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid venue ID format' 
      });
    }

    const venue = await Venue.findById(id).populate('ownerId', 'name email phone');

    if (!venue) {
      return res.status(404).json({ 
        success: false, 
        message: 'Venue not found' 
      });
    }

    res.json({ success: true, data: venue });

  } catch (error: any) {
    console.error('Error fetching venue:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching venue', 
      error: error.message 
    });
  }
};

// DELETE VENUE (keep existing)
export const deleteVenue = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!hasRole(req.user.role, [Role.ADMIN])) {
      return res.status(403).json({ message: 'Forbidden: only admin can delete' });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid venue ID format' 
      });
    }

    const deletedVenue = await Venue.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!deletedVenue) {
      return res.status(404).json({ 
        success: false, 
        message: 'Venue not found' 
      });
    }

    res.json({ success: true, message: 'Venue deleted successfully' });

  } catch (error: any) {
    console.error('Error deleting venue:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Venue deletion failed', 
      error: error.message 
    });
  }
};

// GET VENUES BY CATEGORY
export const getVenuesByCategory = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { category } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const venues = await Venue.find({ 
      venuecategory: category, 
      isActive: true, 
      region 
    })
      .sort({ Rating: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Venue.countDocuments({ 
      venuecategory: category, 
      isActive: true, 
      region 
    });

    res.json({
      success: true,
      data: venues,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error: any) {
    console.error('Error fetching venues by category:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching venues', 
      error: error.message 
    });
  }
};

// GET VENUE VITALS
export const getVenueVitals = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID format' });
    }
    const venue = await Venue.findById(id);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }
    const vitals = {
      address: venue.BillingStreet
        ? `${venue.BillingStreet}${venue.BillingCity ? ', ' + venue.BillingCity : ''}${venue.BillingState ? ', ' + venue.BillingState : ''}${venue.BillingPostalCode ? ' ' + venue.BillingPostalCode : ''}`
        : null,
      phone: venue.Phone || venue.Intphonegooglemapsly,
      website: venue.Website,
      hours: venue.operatingHours || (venue.HLOpeningHoursText ? { text: venue.HLOpeningHoursText } : null),
      social: {
        instagram: venue.socialLinks?.instagram,
        facebook: venue.socialLinks?.facebook,
        twitter: venue.socialLinks?.twitter
      }
    };
    res.json({ success: true, data: vitals });
  } catch (error: any) {
    console.error('Error fetching venue vitals:', error);
    res.status(500).json({ success: false, message: 'Error fetching venue vitals', error: error.message });
  }
};

// UPDATE VENUE VITALS
export const updateVenueVitals = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    const { id } = req.params;
    const { address, phone, website, hours, social } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID format' });
    }
    const venue = await Venue.findById(id);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }
    if (phone) {
      venue.Phone = phone;
      venue.Intphonegooglemapsly = phone;
    }
    if (website) venue.Website = website;
    if (hours) venue.operatingHours = hours;
    if (social) {
      if (!venue.socialLinks) venue.socialLinks = {};
      if (social.instagram !== undefined) venue.socialLinks.instagram = social.instagram;
      if (social.facebook !== undefined) venue.socialLinks.facebook = social.facebook;
      if (social.twitter !== undefined) venue.socialLinks.twitter = social.twitter;
    }
    if (address) {
      const addressParts = address.split(',').map((part: string) => part.trim());
      if (addressParts.length > 0) venue.BillingStreet = addressParts[0];
      if (addressParts.length > 1) venue.BillingCity = addressParts[1];
      if (addressParts.length > 2) venue.BillingState = addressParts[2];
    }
    await venue.save();
    res.json({ success: true, message: 'Venue vitals updated successfully', data: venue });
  } catch (error: any) {
    console.error('Error updating venue vitals:', error);
    res.status(400).json({ success: false, message: 'Error updating venue vitals', error: error.message });
  }
};

