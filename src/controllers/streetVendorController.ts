// src/controllers/streetVendorController.ts

import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import { getStreetVendorModel } from '../models/Venue';
import { dbManager, Region } from '../config/database';
import { io } from '../app';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

type CombinedRequest = AuthRequest & RegionRequest;

const JWT_SECRET = process.env.JWT_SECRET || 'honestlee-vendor-secret-key';
const JWT_EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60; // 30 days in seconds

// ===== VENDOR AUTHENTICATION =====

// Register new vendor
export const registerVendor = async (req: Request, res: Response) => {
  try {
    const region = (req.body.region || req.headers['x-region'] as string || 'th') as Region;
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const {
      vendorName, email, password, phone, vendorType,
      description, latitude, longitude, Cuisine_Tags
    } = req.body;

    // Validate required fields
    if (!vendorName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'vendorName, email, and password are required'
      });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'latitude and longitude are required for initial location'
      });
    }

    // Check if email already exists
    const existingVendor = await StreetVendor.findOne({ email: email.toLowerCase() });
    if (existingVendor) {
      return res.status(400).json({
        success: false,
        message: 'A vendor with this email already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates'
      });
    }

    // Create vendor
    const newVendor = new StreetVendor({
      vendorName: vendorName.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      phone: phone?.trim(),
      vendorType: vendorType || 'mobile',
      description: description?.trim(),
      Cuisine_Tags,
      region,
      currentLocation: {
        type: 'Point',
        coordinates: [lng, lat],
        timestamp: new Date()
      },
      isActive: true,
      isOperational: false,
      approvalStatus: 'pending',
      menuItems: []
    });

    await newVendor.save();

    // Generate JWT token
    const token = jwt.sign(
      {
        vendorId: newVendor._id,
        email: newVendor.email,
        type: 'vendor'
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN_SECONDS }
    );

    // Remove password from response
    const vendorObj = newVendor.toObject();
    const { password: _, ...vendorResponse } = vendorObj;

    res.status(201).json({
      success: true,
      message: 'Vendor registered successfully. Pending admin approval.',
      data: {
        vendor: vendorResponse,
        token
      }
    });

  } catch (error: any) {
    console.error('Error registering vendor:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

// Vendor login
export const loginVendor = async (req: Request, res: Response) => {
  try {
    const region = req.body.region || req.headers['x-region'] as string || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find vendor with password
    const vendor = await StreetVendor.findOne({
      email: email.toLowerCase()
    }).select('+password');

    if (!vendor) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if vendor is active
    if (!vendor.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Update last login
    vendor.lastLoginAt = new Date();
    await vendor.save();

    // Generate JWT token
    const token = jwt.sign(
      {
        vendorId: vendor._id,
        email: vendor.email,
        type: 'vendor'
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN_SECONDS }
    );

    // Remove password from response
    const vendorObj = vendor.toObject();
    const { password: _, ...vendorResponse } = vendorObj;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        vendor: vendorResponse,
        token
      }
    });

  } catch (error: any) {
    console.error('Error logging in vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// Get vendor profile
export const getVendorProfile = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    const vendor = await StreetVendor.findById(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      data: vendor
    });

  } catch (error: any) {
    console.error('Error fetching vendor profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching vendor profile',
      error: error.message
    });
  }
};

// Update vendor profile
export const updateVendorProfile = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    // Fields that cannot be updated via this endpoint
    const restrictedFields = ['email', 'password', 'approvalStatus', 'approvedAt', 'approvedBy'];
    restrictedFields.forEach(field => delete updates[field]);

    const updatedVendor = await StreetVendor.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedVendor
    });

  } catch (error: any) {
    console.error('Error updating vendor profile:', error);
    res.status(400).json({
      success: false,
      message: 'Update failed',
      error: error.message
    });
  }
};

// ===== MENU ITEMS CRUD =====

// Add menu item
export const addMenuItem = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id } = req.params;
    const { name, description, price, currency, image, category, isAvailable, preparationTime } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    if (!name || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Menu item name and price are required'
      });
    }

    const menuItem = {
      itemId: new mongoose.Types.ObjectId().toString(),
      name: name.trim(),
      description: description?.trim(),
      price: parseFloat(price),
      currency: currency || 'THB',
      image,
      category: category?.trim(),
      isAvailable: isAvailable !== false,
      preparationTime: preparationTime ? parseInt(preparationTime) : undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const updatedVendor = await StreetVendor.findByIdAndUpdate(
      id,
      { $push: { menuItems: menuItem } },
      { new: true, runValidators: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Menu item added successfully',
      data: {
        menuItem,
        totalItems: updatedVendor.menuItems?.length || 0
      }
    });

  } catch (error: any) {
    console.error('Error adding menu item:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to add menu item',
      error: error.message
    });
  }
};

// Update menu item
export const updateMenuItem = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id, itemId } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    // Build update object for the specific menu item
    const updateFields: any = {};
    if (updates.name) updateFields['menuItems.$.name'] = updates.name.trim();
    if (updates.description !== undefined) updateFields['menuItems.$.description'] = updates.description?.trim();
    if (updates.price !== undefined) updateFields['menuItems.$.price'] = parseFloat(updates.price);
    if (updates.currency) updateFields['menuItems.$.currency'] = updates.currency;
    if (updates.image !== undefined) updateFields['menuItems.$.image'] = updates.image;
    if (updates.category !== undefined) updateFields['menuItems.$.category'] = updates.category?.trim();
    if (updates.isAvailable !== undefined) updateFields['menuItems.$.isAvailable'] = updates.isAvailable;
    if (updates.preparationTime !== undefined) updateFields['menuItems.$.preparationTime'] = parseInt(updates.preparationTime);
    updateFields['menuItems.$.updatedAt'] = new Date();

    const updatedVendor = await StreetVendor.findOneAndUpdate(
      { _id: id, 'menuItems.itemId': itemId },
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor or menu item not found'
      });
    }

    const updatedItem = updatedVendor.menuItems?.find(item => item.itemId === itemId);

    res.json({
      success: true,
      message: 'Menu item updated successfully',
      data: updatedItem
    });

  } catch (error: any) {
    console.error('Error updating menu item:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update menu item',
      error: error.message
    });
  }
};

// Delete menu item
export const deleteMenuItem = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id, itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    const updatedVendor = await StreetVendor.findByIdAndUpdate(
      id,
      { $pull: { menuItems: { itemId } } },
      { new: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      message: 'Menu item deleted successfully',
      data: {
        remainingItems: updatedVendor.menuItems?.length || 0
      }
    });

  } catch (error: any) {
    console.error('Error deleting menu item:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to delete menu item',
      error: error.message
    });
  }
};

// Get vendor menu
export const getVendorMenu = async (req: Request, res: Response) => {
  try {
    const region = (req.headers['x-region'] as string || 'th') as Region;
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    const vendor = await StreetVendor.findById(id).select('vendorName menuItems');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      data: {
        vendorId: vendor._id,
        vendorName: vendor.vendorName,
        menuItems: vendor.menuItems || [],
        totalItems: vendor.menuItems?.length || 0
      }
    });

  } catch (error: any) {
    console.error('Error fetching menu:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching menu',
      error: error.message
    });
  }
};

// ===== PUBLIC ENDPOINTS =====

// Get nearby vendors (PUBLIC - for map display)
export const getPublicNearbyVendors = async (req: Request, res: Response) => {
  try {
    const region = (req.headers['x-region'] as string || 'th') as Region;
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { latitude, longitude, radius = 5000 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude.toString());
    const lng = parseFloat(longitude.toString());
    const rad = parseInt(radius.toString());

    const vendors = await StreetVendor.find({
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: rad
        }
      },
      isOperational: true,
      isActive: true,
      approvalStatus: 'approved'
    })
      .select('vendorName vendorType currentLocation description profileImage Cuisine_Tags rating menuItems isOperational')
      .sort({ 'currentLocation.timestamp': -1 })
      .limit(100);

    res.json({
      success: true,
      data: vendors,
      count: vendors.length
    });

  } catch (error: any) {
    console.error('Error fetching nearby vendors:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching nearby vendors',
      error: error.message
    });
  }
};

// Get public vendor details
export const getPublicVendorDetails = async (req: Request, res: Response) => {
  try {
    const region = (req.headers['x-region'] as string || 'th') as Region;
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    const vendor = await StreetVendor.findOne({
      _id: id,
      isActive: true
    }).select('-password -locationHistory');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      data: vendor
    });

  } catch (error: any) {
    console.error('Error fetching vendor details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching vendor details',
      error: error.message
    });
  }
};

// ===== ADMIN ENDPOINTS =====

// Get all vendors for admin
export const adminGetAllVendors = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const {
      page = 1,
      limit = 20,
      approvalStatus,
      isOperational,
      vendorType,
      search
    } = req.query;

    const query: any = { region };

    if (approvalStatus) query.approvalStatus = approvalStatus;
    if (isOperational !== undefined) query.isOperational = isOperational === 'true';
    if (vendorType) query.vendorType = vendorType;
    if (search) {
      query.$or = [
        { vendorName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const [vendors, total] = await Promise.all([
      StreetVendor.find(query)
        .select('-password -locationHistory')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      StreetVendor.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: vendors,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error: any) {
    console.error('Error fetching vendors for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching vendors',
      error: error.message
    });
  }
};

// Approve vendor
export const adminApproveVendor = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id } = req.params;
    const { approvalNote } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    const updatedVendor = await StreetVendor.findByIdAndUpdate(
      id,
      {
        $set: {
          approvalStatus: 'approved',
          approvalNote,
          approvedAt: new Date(),
          approvedBy: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined
        }
      },
      { new: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      message: 'Vendor approved successfully',
      data: updatedVendor
    });

  } catch (error: any) {
    console.error('Error approving vendor:', error);
    res.status(400).json({
      success: false,
      message: 'Approval failed',
      error: error.message
    });
  }
};

// Reject/Suspend vendor
export const adminUpdateVendorStatus = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id } = req.params;
    const { status, approvalNote } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    if (!['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: pending, approved, rejected, or suspended'
      });
    }

    const updateData: any = {
      approvalStatus: status,
      approvalNote
    };

    // If suspending, set isOperational to false
    if (status === 'suspended' || status === 'rejected') {
      updateData.isOperational = false;
    }

    const updatedVendor = await StreetVendor.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Emit status change via Socket.IO
    io.to(`vendor-${id}`).emit('vendor-status-change', {
      vendorId: id,
      approvalStatus: status,
      isOperational: updatedVendor.isOperational,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: `Vendor status updated to ${status}`,
      data: updatedVendor
    });

  } catch (error: any) {
    console.error('Error updating vendor status:', error);
    res.status(400).json({
      success: false,
      message: 'Status update failed',
      error: error.message
    });
  }
};

// Admin delete vendor
export const adminDeleteVendor = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    const deletedVendor = await StreetVendor.findByIdAndDelete(id);

    if (!deletedVendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      message: 'Vendor deleted successfully',
      data: { deletedId: id }
    });

  } catch (error: any) {
    console.error('Error deleting vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Delete failed',
      error: error.message
    });
  }
};

// ===== EXISTING FUNCTIONS (PRESERVED) =====

// Update vendor location (Real-time with Socket.IO)
export const updateVendorLocation = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id } = req.params;
    const { latitude, longitude, accuracy } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Coordinates must be numbers'
      });
    }

    const timestamp = new Date();

    const updateData = {
      currentLocation: {
        type: 'Point',
        coordinates: [lng, lat],
        timestamp,
        accuracy: accuracy ? parseFloat(accuracy) : undefined
      }
    };

    const updatedVendor = await StreetVendor.findByIdAndUpdate(
      id,
      {
        $set: updateData,
        $push: {
          locationHistory: {
            $each: [{
              coordinates: [lng, lat],
              timestamp,
              accuracy: accuracy ? parseFloat(accuracy) : undefined
            }],
            $slice: -9640 // Keep last 9,640 locations (24 hours at 10s intervals)
          }
        }
      },
      { new: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Emit real-time update to all clients tracking this vendor
    const locationUpdate = {
      vendorId: id,
      vendorName: updatedVendor.vendorName,
      coordinates: [lng, lat],
      latitude: lat,
      longitude: lng,
      timestamp,
      accuracy: accuracy ? parseFloat(accuracy) : undefined,
      isOperational: updatedVendor.isOperational
    };

    io.to(`vendor-${id}`).emit('vendor-location-update', locationUpdate);

    // Also emit to a general vendors room for map updates
    io.emit('vendor-location-broadcast', locationUpdate);

    console.log(`📡 Emitted location update for vendor ${id}`);

    res.json({
      success: true,
      message: 'Vendor location updated',
      data: updatedVendor
    });

  } catch (error: any) {
    console.error('Error updating vendor location:', error);
    res.status(400).json({
      success: false,
      message: 'Location update failed',
      error: error.message
    });
  }
};

// Toggle vendor operational status
export const toggleVendorOperational = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id } = req.params;
    const { isOperational } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    if (isOperational === undefined) {
      return res.status(400).json({
        success: false,
        message: 'isOperational field is required'
      });
    }

    // Check if vendor is approved before allowing operational status
    const vendor = await StreetVendor.findById(id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    if (vendor.approvalStatus !== 'approved' && isOperational) {
      return res.status(403).json({
        success: false,
        message: 'Cannot go operational - vendor is not yet approved'
      });
    }

    const updatedVendor = await StreetVendor.findByIdAndUpdate(
      id,
      { isOperational },
      { new: true }
    );

    // Emit status change to tracking clients
    io.to(`vendor-${id}`).emit('vendor-status-change', {
      vendorId: id,
      vendorName: updatedVendor?.vendorName,
      isOperational,
      timestamp: new Date()
    });

    // Broadcast to all clients watching vendors
    io.emit('vendor-status-broadcast', {
      vendorId: id,
      vendorName: updatedVendor?.vendorName,
      isOperational,
      currentLocation: updatedVendor?.currentLocation,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: `Vendor is now ${isOperational ? 'operational' : 'offline'}`,
      data: updatedVendor
    });

  } catch (error: any) {
    console.error('Error updating vendor status:', error);
    res.status(400).json({
      success: false,
      message: 'Status update failed',
      error: error.message
    });
  }
};

// Get mobile vendors (existing)
export const getMobileVendors = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { page = 1, limit = 10, isOperational, vendorType } = req.query;

    const query: any = { isActive: true, region, approvalStatus: 'approved' };

    if (isOperational !== undefined) {
      query.isOperational = isOperational === 'true' || isOperational === '1';
    }

    if (vendorType) {
      query.vendorType = vendorType;
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const vendors = await StreetVendor.find(query)
      .select('-password -locationHistory')
      .sort({ 'currentLocation.timestamp': -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await StreetVendor.countDocuments(query);

    res.json({
      success: true,
      data: vendors,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error: any) {
    console.error('Error fetching street vendors:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching street vendors',
      error: error.message
    });
  }
};

// Get nearby vendors (authenticated)
export const getActiveVendorsNearby = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { latitude, longitude, radius = 5000 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude.toString());
    const lng = parseFloat(longitude.toString());
    const rad = parseInt(radius.toString());

    const vendors = await StreetVendor.find({
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: rad
        }
      },
      isOperational: true,
      isActive: true,
      approvalStatus: 'approved'
    })
      .select('-password -locationHistory')
      .sort({ 'currentLocation.timestamp': -1 });

    res.json({
      success: true,
      data: vendors
    });

  } catch (error: any) {
    console.error('Error fetching nearby vendors:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching nearby vendors',
      error: error.message
    });
  }
};

// Get vendor trajectory
export const getVendorTrajectory = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const { id } = req.params;
    const { hours = 1 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    const hoursBack = parseInt(hours.toString());
    const timeThreshold = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const vendor = await StreetVendor.findById(id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const trajectory = vendor.locationHistory?.filter(
      loc => new Date(loc.timestamp) >= timeThreshold
    ) || [];

    res.json({
      success: true,
      data: {
        vendorId: vendor._id,
        vendorName: vendor.vendorName,
        currentLocation: vendor.currentLocation,
        trajectory: trajectory,
        totalPoints: trajectory.length
      }
    });

  } catch (error: any) {
    console.error('Error getting vendor trajectory:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching trajectory',
      error: error.message
    });
  }
};

// Legacy createStreetVendor (kept for backward compatibility)
export const createStreetVendor = async (req: CombinedRequest, res: Response) => {
  // Redirect to registerVendor for new registrations
  return registerVendor(req, res);
};