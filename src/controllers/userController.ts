import { Request, Response } from 'express';
import User, { Role } from '../models/User';
import { AuthRequest } from '../middlewares/authMiddleware';

// GET /api/users/me
export const getMyUserDetails = async (req: AuthRequest, res: Response) => {
  if (!req.user || !req.user.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = await User.findById(req.user.userId).select('-otpCode -otpExpiresAt');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Convert to plain object to spread all fields
  const userObj = user.toObject();

  // Exclude sensitive/undesired fields explicitly
  delete userObj.otpCode;
  delete userObj.otpExpiresAt;
  delete userObj.__v;

  res.json({
    id: userObj._id,
    region: req.user.region || undefined,
    ...userObj
  });
};

// PUT /api/users/me - Update current user's profile with extended fields
export const updateMyProfile = async (req: AuthRequest, res: Response) => {
  if (!req.user || !req.user.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const input = req.body;

  // Validate role if provided
  if (input.role && !Object.values(Role).includes(input.role)) {
    return res.status(400).json({
      message: 'Invalid role. Allowed roles: ' + Object.values(Role).join(', ')
    });
  }

  // Allowed fields to update
  const allowedFields = [
    "name",
    "email",
    "role",
    "address",
    "profileImage",
    "referralCode",
    "referredBy"
  ];

  // Pick only allowed fields from input
  const updateData: any = {};
  allowedFields.forEach(field => {
    if (input[field] !== undefined) {
      updateData[field] = input[field];
    }
  });

  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-otpCode -otpExpiresAt');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updatedUserObj = updatedUser.toObject();
    delete updatedUserObj.otpCode;
    delete updatedUserObj.otpExpiresAt;
    delete updatedUserObj.__v;

    res.json({
      message: 'Profile updated successfully',
      user: updatedUserObj
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate field value error.' });
    }
    res.status(400).json({ message: 'Update failed', error: error.message });
  }
};

// GET /api/users/:id (admin-only endpoint)
export const getUserById = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  const user = await User.findById(req.params.id).select('-otpCode -otpExpiresAt');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const userObj = user.toObject();
  delete userObj.otpCode;
  delete userObj.otpExpiresAt;
  delete userObj.__v;

  res.json(userObj);
};

// PUT /api/users/:id/role (admin-only endpoint)
export const updateUserRole = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Forbidden: admin only' });
  }

  const { role } = req.body;
  const { id } = req.params;

  if (!role || !Object.values(Role).includes(role)) {
    return res.status(400).json({
      message: 'Invalid role. Allowed roles: ' + Object.values(Role).join(', ')
    });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true, runValidators: true }
    ).select('-otpCode -otpExpiresAt');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updatedUserObj = updatedUser.toObject();
    delete updatedUserObj.otpCode;
    delete updatedUserObj.otpExpiresAt;
    delete updatedUserObj.__v;

    res.json({
      message: 'User role updated successfully',
      user: updatedUserObj
    });
  } catch (error: any) {
    res.status(400).json({ message: 'Update failed', error: error.message });
  }
};
