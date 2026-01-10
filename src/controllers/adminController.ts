// ✅ FIXED: Removed manual role checks - let middleware handle it
import { Request, Response } from 'express';
import User, { Role } from '../models/User';
import Venue from '../models/Venue';
import { AuthRequest } from '../middlewares/authMiddleware';

// ===== User CRUD ===== //

export const getUsers = async (req: AuthRequest, res: Response) => {
  // ✅ Role check now handled by middleware
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

export const getUserById = async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.params.id).select('-otpCode -otpExpiresAt');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json(user);
};

export const updateUserById = async (req: AuthRequest, res: Response) => {
  const input = req.body;
  const targetUserId = req.params.id;
  const currentAdminId = req.user?.userId;

  // Validate role if provided
  if (input.role && !Object.values(Role).includes(input.role)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid role. Allowed roles: ' + Object.values(Role).join(', ')
    });
  }

  try {
    // Fetch the target user first to get current role
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const oldRole = targetUser.role;
    const newRole = input.role;
    const isRoleChange = newRole && newRole !== oldRole;

    // ===== SECURITY: Prevent self-demotion from ADMIN =====
    if (isRoleChange && targetUserId === currentAdminId) {
      if (oldRole === Role.ADMIN && newRole !== Role.ADMIN) {
        console.warn(`⚠️ BLOCKED: Admin ${currentAdminId} attempted to demote themselves from ADMIN to ${newRole}`);
        return res.status(403).json({
          success: false,
          message: 'Cannot demote yourself from ADMIN role. Ask another admin to change your role.'
        });
      }
    }

    // ===== SECURITY: Only ADMIN can change roles to ADMIN =====
    if (isRoleChange && newRole === Role.ADMIN) {
      if (req.user?.role !== Role.ADMIN) {
        console.warn(`⚠️ BLOCKED: Non-admin ${currentAdminId} attempted to create an ADMIN`);
        return res.status(403).json({
          success: false,
          message: 'Only ADMIN can promote users to ADMIN role.'
        });
      }
    }

    const allowedFields = ["name", "email", "role", "address", "profileImage", "referralCode", "referredBy", "phone", "isActive"];
    const updateData: any = {};
    allowedFields.forEach(field => {
      if (input[field] !== undefined) {
        updateData[field] = input[field];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(targetUserId, updateData, { new: true, runValidators: true })
      .select('-otpCode -otpExpiresAt');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // ===== AUDIT LOGGING for role changes =====
    if (isRoleChange) {
      console.log(`🔐 ROLE CHANGE: User ${targetUser.email || targetUser.phone || targetUserId}`);
      console.log(`   └── Changed from ${oldRole} → ${newRole}`);
      console.log(`   └── Changed by: Admin ID ${currentAdminId}`);
      console.log(`   └── Timestamp: ${new Date().toISOString()}`);
    }

    res.json({
      success: true,
      message: isRoleChange
        ? `User role changed from ${oldRole} to ${newRole} successfully`
        : 'User updated successfully',
      user: updatedUser,
      roleChange: isRoleChange ? { oldRole, newRole } : null
    });
  } catch (error: any) {
    console.error('❌ Error updating user:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Duplicate field value error.' });
    }
    res.status(400).json({ success: false, message: 'Update failed', error: error.message });
  }
};

export const deleteUserById = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ message: 'Delete failed', error: error.message });
  }
};

// ===== Venue CRUD ===== //

export const createVenue = async (req: AuthRequest, res: Response) => {
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

export const getVenues = async (req: AuthRequest, res: Response) => {
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

export const getVenueById = async (req: AuthRequest, res: Response) => {
  const venue = await Venue.findById(req.params.id);
  if (!venue) {
    return res.status(404).json({ message: 'Venue not found' });
  }
  res.json(venue);
};

export const updateVenueById = async (req: AuthRequest, res: Response) => {
  const input = req.body;

  const allowedFields = ["name", "category", "address", "coordinates", "phone", "website", "hours"];
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

export const deleteVenueById = async (req: AuthRequest, res: Response) => {
  try {
    const venue = await Venue.findByIdAndDelete(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Venue not found' });
    res.json({ message: 'Venue deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ message: 'Delete failed', error: error.message });
  }
};
