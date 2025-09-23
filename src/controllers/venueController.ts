import { Request, Response } from 'express';
import Venue from '../models/Venue';
import { AuthRequest } from '../middlewares/authMiddleware';
import { Role } from '../models/User';

// Helper to check if user's role is allowed
function hasRole(userRole: string | undefined, allowedRoles: string[]): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}

// Create venue - allowed roles: ADMIN, STAFF, AGENT
export const createVenue = async (req: AuthRequest, res: Response) => {
  if (!hasRole(req.user?.role, [Role.ADMIN, Role.STAFF, Role.AGENT])) {
    return res.status(403).json({ message: 'Forbidden: insufficient role to create venue' });
  }

  const {
    name,
    category,
    subcategory,
    description,
    address,
    coordinates,
    phone,
    website,
    email,
    hours,
    images,
    priceRange,
    amenities,
    cuisineType,
    paymentMethods,
    capacity,
    hasWifi,
    wifiQuality,
    accessibility,
    socialMedia,
    tags,
  } = req.body;

  if (!name || !category) {
    return res.status(400).json({ message: 'Name and category are required' });
  }
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
    return res.status(400).json({ message: 'Coordinates must be an array of length 2 [lng, lat]' });
  }

  try {
    const newVenue = new Venue({
      name,
      category,
      subcategory,
      description,
      address,
      location: {
        type: 'Point',
        coordinates,
      },
      phone,
      website,
      email,
      hours,
      images: images || [],
      priceRange,
      amenities: amenities || [],
      cuisineType: cuisineType || [],
      paymentMethods: paymentMethods || [],
      capacity,
      hasWifi: hasWifi || false,
      wifiQuality,
      accessibility: accessibility || {},
      socialMedia: socialMedia || {},
      tags: tags || [],
      ownerId: req.user?.userId,
      isVerified: req.user?.role === Role.ADMIN,
      isActive: true
    });

    await newVenue.save();
    res.status(201).json(newVenue);
  } catch (error: any) {
    res.status(400).json({ message: 'Venue creation failed', error: error.message });
  }
};

// Update venue - allowed roles: ADMIN, STAFF
export const updateVenue = async (req: AuthRequest, res: Response) => {
  if (!hasRole(req.user?.role, [Role.ADMIN, Role.STAFF])) {
    return res.status(403).json({ message: 'Forbidden: insufficient role to update venue' });
  }

  const { id } = req.params;
  const {
    name,
    category,
    subcategory,
    description,
    address,
    coordinates,
    phone,
    website,
    email,
    hours,
    images,
    priceRange,
    amenities,
    cuisineType,
    paymentMethods,
    capacity,
    hasWifi,
    wifiQuality,
    accessibility,
    socialMedia,
    tags,
    isVerified,
    isActive
  } = req.body;

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (category !== undefined) updateData.category = category;
  if (subcategory !== undefined) updateData.subcategory = subcategory;
  if (description !== undefined) updateData.description = description;
  if (address !== undefined) updateData.address = address;
  if (coordinates !== undefined) {
    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      return res.status(400).json({ message: 'Coordinates must be an array of length 2 [lng, lat]' });
    }
    updateData.location = { type: 'Point', coordinates };
  }
  if (phone !== undefined) updateData.phone = phone;
  if (website !== undefined) updateData.website = website;
  if (email !== undefined) updateData.email = email;
  if (hours !== undefined) updateData.hours = hours;
  if (images !== undefined) updateData.images = images;
  if (priceRange !== undefined) updateData.priceRange = priceRange;
  if (amenities !== undefined) updateData.amenities = amenities;
  if (cuisineType !== undefined) updateData.cuisineType = cuisineType;
  if (paymentMethods !== undefined) updateData.paymentMethods = paymentMethods;
  if (capacity !== undefined) updateData.capacity = capacity;
  if (hasWifi !== undefined) updateData.hasWifi = hasWifi;
  if (wifiQuality !== undefined) updateData.wifiQuality = wifiQuality;
  if (accessibility !== undefined) updateData.accessibility = accessibility;
  if (socialMedia !== undefined) updateData.socialMedia = socialMedia;
  if (tags !== undefined) updateData.tags = tags;
  // Only ADMIN can update verification and active status
  if (req.user?.role === Role.ADMIN) {
    if (isVerified !== undefined) updateData.isVerified = isVerified;
    if (isActive !== undefined) updateData.isActive = isActive;
  }

  try {
    const updatedVenue = await Venue.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!updatedVenue) {
      return res.status(404).json({ message: 'Venue not found' });
    }
    res.json({ message: 'Venue updated successfully', venue: updatedVenue });
  } catch (error: any) {
    res.status(400).json({ message: 'Venue update failed', error: error.message });
  }
};

// Delete venue - ADMIN only
export const deleteVenue = async (req: AuthRequest, res: Response) => {
  if (!hasRole(req.user?.role, [Role.ADMIN])) {
    return res.status(403).json({ message: 'Forbidden: only admin can delete venue' });
  }

  const { id } = req.params;
  try {
    const deletedVenue = await Venue.findByIdAndDelete(id);
    if (!deletedVenue) {
      return res.status(404).json({ message: 'Venue not found' });
    }
    res.json({ message: 'Venue deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ message: 'Venue deletion failed', error: error.message });
  }
};

// Get venues - all allowed roles
export const getVenues = async (req: AuthRequest, res: Response) => {
  if (!hasRole(req.user?.role, [Role.ADMIN, Role.STAFF, Role.CONSUMER, Role.AGENT])) {
    return res.status(403).json({ message: 'Forbidden: insufficient role to view venues' });
  }

  const {
    page = 1,
    limit = 10,
    category,
    subcategory,
    priceRange,
    hasWifi,
    minRating,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    latitude,
    longitude,
    radius = 5000
  } = req.query;

  const query: any = { isActive: true };
  if (category && typeof category === 'string') query.category = category;
  if (subcategory && typeof subcategory === 'string') query.subcategory = subcategory;
  if (priceRange && typeof priceRange === 'string') query.priceRange = priceRange;
  if (hasWifi !== undefined) query.hasWifi = hasWifi === 'true';
  if (minRating && !isNaN(Number(minRating))) query.averageRating = { $gte: Number(minRating) };
  if (search && typeof search === 'string') query.$text = { $search: search };
  if (latitude && longitude) {
    const lat = parseFloat(latitude.toString());
    const lng = parseFloat(longitude.toString());
    const rad = parseInt(radius.toString());
    query.location = {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: rad
      }
    };
  }

  try {
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
      venues,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    res.status(400).json({ message: 'Error fetching venues', error: error.message });
  }
};

// Get venue by ID with owner populated
export const getVenueById = async (req: AuthRequest, res: Response) => {
  if (!hasRole(req.user?.role, [Role.ADMIN, Role.STAFF, Role.CONSUMER, Role.AGENT])) {
    return res.status(403).json({ message: 'Forbidden: insufficient role to view venue' });
  }

  const { id } = req.params;
  try {
    const venue = await Venue.findById(id).populate('ownerId', 'name email phone');
    if (!venue) return res.status(404).json({ message: 'Venue not found' });
    res.json(venue);
  } catch (error: any) {
    res.status(400).json({ message: 'Error fetching venue', error: error.message });
  }
};

// Get venues by category (with pagination and sorting)
export const getVenuesByCategory = async (req: AuthRequest, res: Response) => {
  if (!hasRole(req.user?.role, [Role.ADMIN, Role.STAFF, Role.CONSUMER, Role.AGENT])) {
    return res.status(403).json({ message: 'Forbidden: insufficient role to view venues' });
  }

  const { category } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const pageNum = Number(page);
    const limitNum = Number(limit);

    const venues = await Venue.find({ category, isActive: true })
      .sort({ averageRating: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json(venues);
  } catch (error: any) {
    res.status(400).json({ message: 'Error fetching venues by category', error: error.message });
  }
};
