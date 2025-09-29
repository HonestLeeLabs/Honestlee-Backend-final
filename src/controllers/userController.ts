import { Request, Response } from 'express';
import User, { Role, LoginMethod } from '../models/User';
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

// PUT /api/users/me - Update current user's profile with extended fields and auth protection
export const updateMyProfile = async (req: AuthRequest, res: Response) => {
  if (!req.user || !req.user.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const input = req.body;

  // Get current user to check loginMethod
  const currentUser = await User.findById(req.user.userId);
  if (!currentUser) {
    return res.status(404).json({ message: 'User not found' });
  }

  // CRITICAL: Prevent changing phone if logged in via phone
  if (currentUser.loginMethod === LoginMethod.PHONE) {
    if (input.phone && input.phone !== currentUser.phone) {
      return res.status(403).json({ 
        message: 'Cannot change phone number used for authentication' 
      });
    }
    // Remove phone from input to be safe
    delete input.phone;
  }

  // CRITICAL: Prevent changing email if logged in via email or Google
  if (currentUser.loginMethod === LoginMethod.EMAIL || currentUser.loginMethod === LoginMethod.GOOGLE) {
    if (input.email && input.email !== currentUser.email) {
      return res.status(403).json({ 
        message: 'Cannot change email address used for authentication' 
      });
    }
    // Remove email from input to be safe
    delete input.email;
  }

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
    "phone",
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

  // Prevent changing sensitive fields
  delete updateData.otpCode;
  delete updateData.otpExpiresAt;
  delete updateData.loginMethod;
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.updatedAt;

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