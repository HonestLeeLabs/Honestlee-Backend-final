import { Request, Response } from 'express';
import User, { Role } from '../models/User';
import Venue from '../models/Venue';
import { AuthRequest } from '../middlewares/authMiddleware';

// ===== User CRUD - Admin only ===== //

// Get list of users with pagination and optional role filtering
export const getUsers = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== Role.ADMIN) {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  const { page = 1, limit = 20, role } = req.query;

  const query: any = {};
  if (role && typeof role === 'string' && Object.values(Role).includes(role as Role)) {
    query.role = role;
  }

  const numericPage = parseInt(page.toString(), 10);
  const numericLimit = parseInt(limit.toString(), 10);

  const users = await User.find(query)
    .skip((numericPage - 1) * numericLimit)
    .limit(numericLimit)
    .select('-otpCode -otpExpiresAt');

  const totalUsers = await User.countDocuments(query);

  res.json({
    total: totalUsers,
    page: numericPage,
    limit: numericLimit,
    users
  });
};

// Get user by ID (admin-only)
export const getUserById = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== Role.ADMIN) {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  const user = await User.findById(req.params.id).select('-otpCode -otpExpiresAt');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json(user);
};

// Update user by ID (admin-only)
export const updateUserById = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== Role.ADMIN) {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  const input = req.body;

  // Validate role if provided
  if (input.role && !Object.values(Role).includes(input.role)) {
    return res.status(400).json({ message: 'Invalid role. Allowed roles: ' + Object.values(Role).join(', ') });
  }

  const allowedFields = [
    "name",
    "email",
    "role",
    "address",
    "profileImage",
    "referralCode",
    "referredBy",
    "phone"
  ];

  const updateData: any = {};
  allowedFields.forEach(field => {
    if (input[field] !== undefined) {
      updateData[field] = input[field];
    }
  });

  try {
    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
      .select('-otpCode -otpExpiresAt');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate field value error.' });
    }
    res.status(400).json({ message: 'Update failed', error: error.message });
  }
};

// Delete user by ID (admin-only)
export const deleteUserById = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== Role.ADMIN) {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ message: 'Delete failed', error: error.message });
  }
};

// ===== Venue CRUD - Admin only ===== //

// Create a new venue
export const createVenue = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== Role.ADMIN) {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  const { name, category, address, coordinates, phone, website, hours } = req.body;

  if (!name || !category) {
    return res.status(400).json({ message: 'Name and category are required' });
  }

  const newVenue = new Venue({
    name,
    category,
    address,
    location: {
      type: 'Point',
      coordinates,
    },
    phone,
    website,
    hours
  });

  try {
    await newVenue.save();
    res.status(201).json(newVenue);
  } catch (error: any) {
    res.status(400).json({ message: 'Venue creation failed', error: error.message });
  }
};

// List venues with pagination and optional filters
export const getVenues = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== Role.ADMIN) {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  const { page = 1, limit = 20, category } = req.query;

  const query: any = {};
  if (category && typeof category === 'string') {
    query.category = category;
  }

  const numericPage = parseInt(page.toString(), 10);
  const numericLimit = parseInt(limit.toString(), 10);

  const venues = await Venue.find(query)
    .skip((numericPage - 1) * numericLimit)
    .limit(numericLimit);

  const totalVenues = await Venue.countDocuments(query);

  res.json({
    total: totalVenues,
    page: numericPage,
    limit: numericLimit,
    venues
  });
};

// Get venue by ID
export const getVenueById = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== Role.ADMIN) {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  const venue = await Venue.findById(req.params.id);
  if (!venue) {
    return res.status(404).json({ message: 'Venue not found' });
  }

  res.json(venue);
};

// Update venue by ID
export const updateVenueById = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== Role.ADMIN) {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  const input = req.body;

  const allowedFields = [
    "name",
    "category",
    "address",
    "coordinates",
    "phone",
    "website",
    "hours"
  ];

  const updateData: any = {};
  allowedFields.forEach(field => {
    if (input[field] !== undefined) {
      if (field === "coordinates") {
        updateData.location = { type: 'Point', coordinates: input.coordinates };
      } else {
        updateData[field] = input[field];
      }
    }
  });

  try {
    const updatedVenue = await Venue.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

    if (!updatedVenue) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    res.json({
      message: 'Venue updated successfully',
      venue: updatedVenue
    });
  } catch (error: any) {
    res.status(400).json({ message: 'Update failed', error: error.message });
  }
};

// Delete venue by ID
export const deleteVenueById = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== Role.ADMIN) {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  try {
    const venue = await Venue.findByIdAndDelete(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Venue not found' });

    res.json({ message: 'Venue deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ message: 'Delete failed', error: error.message });
  }
};
