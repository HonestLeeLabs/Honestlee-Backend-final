// ===== FILE: src/controllers/venueController.ts =====

import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import { getVenueModel } from '../models/Venue';
import { dbManager } from '../config/database';
import mongoose from 'mongoose';
import { Role } from '../models/User';

type CombinedRequest = AuthRequest & RegionRequest;

// Helper to check if user's role is allowed
function hasRole(userRole: string | undefined, allowedRoles: string[]): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}

// ───── CREATE VENUE ─────
export const createVenue = async (req: CombinedRequest, res: Response) => {
  try {
    // Connect to regional database and get model
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!hasRole(req.user.role, [Role.ADMIN, Role.STAFF, Role.AGENT])) {
      return res.status(403).json({ message: 'Forbidden: insufficient role to create venue' });
    }

    const venueData = { ...req.body, region };

    // Validate required fields for NEW schema
    if (!venueData.globalId) {
      return res.status(400).json({ success: false, message: 'globalId is required' });
    }
    if (!venueData.AccountName) {
      return res.status(400).json({ success: false, message: 'AccountName is required' });
    }
    if (!venueData.geometry || !venueData.geometry.coordinates) {
      return res.status(400).json({ success: false, message: 'geometry with coordinates is required' });
    }
    if (!Array.isArray(venueData.geometry.coordinates) || venueData.geometry.coordinates.length !== 2) {
      return res.status(400).json({ success: false, message: 'Coordinates must be an array of length 2 [lng, lat]', received: venueData.geometry.coordinates });
    }
    const [lng, lat] = venueData.geometry.coordinates;
    if (lng < -180 || lng > 180) {
      return res.status(400).json({ success: false, message: 'Longitude must be between -180 and 180', received: lng });
    }
    if (lat < -90 || lat > 90) {
      return res.status(400).json({ success: false, message: 'Latitude must be between -90 and 90', received: lat });
    }

    const newVenue = new Venue({
      ...venueData,
      geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
      ownerId: req.user.userId,
      isVerified: req.user.role === Role.ADMIN,
      isActive: true
    });

    await newVenue.save();

    res.status(201).json({ success: true, message: 'Venue created successfully', data: newVenue });
  } catch (error: any) {
    console.error('Error creating venue:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      return res.status(400).json({ success: false, message: 'Validation error', errors: messages });
    }
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A venue with this globalId already exists', field: Object.keys(error.keyPattern)[0] });
    }
    res.status(400).json({ success: false, message: 'Venue creation failed', error: error.message });
  }
};

// ───── UPDATE VENUE ─────
export const updateVenue = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!hasRole(req.user.role, [Role.ADMIN, Role.STAFF, Role.MANAGER, Role.OWNER])) {
      return res.status(403).json({ message: 'Forbidden: insufficient role to update venue' });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID format' });
    }
    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    if (updateData.geometry?.coordinates) {
      if (!Array.isArray(updateData.geometry.coordinates) || updateData.geometry.coordinates.length !== 2) {
        return res.status(400).json({ success: false, message: 'Coordinates must be an array of length 2 [lng, lat]' });
      }
      updateData.geometry = {
        type: 'Point',
        coordinates: [
          parseFloat(updateData.geometry.coordinates[0]),
          parseFloat(updateData.geometry.coordinates[1])
        ]
      };
    }
    // Only ADMIN can update verification and active status
    if (req.user.role !== Role.ADMIN) {
      delete updateData.isVerified;
      delete updateData.isActive;
    }

    const updatedVenue = await Venue.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true });
    if (!updatedVenue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }
    res.json({ success: true, message: 'Venue updated successfully', data: updatedVenue });
  } catch (error: any) {
    console.error('Error updating venue:', error);
    res.status(400).json({ success: false, message: 'Venue update failed', error: error.message });
  }
};

// ───── GET VENUE VITALS ─────
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

// ───── UPDATE VENUE VITALS ─────
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

// ───── DELETE VENUE ─────
export const deleteVenue = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!hasRole(req.user.role, [Role.ADMIN])) {
      return res.status(403).json({ message: 'Forbidden: only admin can delete venue' });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID format' });
    }
    // Soft delete by setting isActive to false
    const deletedVenue = await Venue.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );
    if (!deletedVenue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }
    res.json({ success: true, message: 'Venue deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting venue:', error);
    res.status(400).json({ success: false, message: 'Venue deletion failed', error: error.message });
  }
};

// ───── GET VENUES ─────
export const getVenues = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!hasRole(req.user.role, [Role.ADMIN, Role.STAFF, Role.CONSUMER, Role.AGENT])) {
      return res.status(403).json({ message: 'Forbidden: insufficient role to view venues' });
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
    if (PubWifi !== undefined) query.PubWifi = PubWifi === '1' || PubWifi === 'true' ? 1 : 0;
    if (minRating && !isNaN(Number(minRating))) query.Rating = { $gte: Number(minRating) };
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
    res.status(400).json({ success: false, message: 'Error fetching venues', error: error.message });
  }
};

// ───── GET VENUE BY ID ─────
export const getVenueById = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!hasRole(req.user.role, [Role.ADMIN, Role.STAFF, Role.CONSUMER, Role.AGENT, Role.MANAGER, Role.OWNER])) {
      return res.status(403).json({ message: 'Forbidden: insufficient role to view venue' });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid venue ID format' });
    }
    const venue = await Venue.findById(id).populate('ownerId', 'name email phone');
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }
    res.json({ success: true, data: venue });
  } catch (error: any) {
    console.error('Error fetching venue:', error);
    res.status(400).json({ success: false, message: 'Error fetching venue', error: error.message });
  }
};

// ───── GET VENUES BY CATEGORY ─────
export const getVenuesByCategory = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!hasRole(req.user.role, [Role.ADMIN, Role.STAFF, Role.CONSUMER, Role.AGENT])) {
      return res.status(403).json({ message: 'Forbidden: insufficient role to view venues' });
    }
    const { category } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    const venues = await Venue.find({ venuecategory: category, isActive: true, region })
      .sort({ Rating: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Venue.countDocuments({ venuecategory: category, isActive: true, region });

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
    res.status(400).json({ success: false, message: 'Error fetching venues by category', error: error.message });
  }
};
