// src/controllers/streetVendorController.ts

import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import { getStreetVendorModel } from '../models/Venue';
import { dbManager } from '../config/database';
import { io } from '../app'; // ✅ Import Socket.IO instance
import mongoose from 'mongoose';

type CombinedRequest = AuthRequest & RegionRequest;

// ===== UPDATE VENDOR LOCATION (Real-time with Socket.IO) =====
export const updateVendorLocation = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
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
        $slice: -9640 // ✅ Keep last 9,640 locations (24 hours at 10s intervals)
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

    // ✅ EMIT REAL-TIME UPDATE TO ALL CLIENTS TRACKING THIS VENDOR
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
    console.log(`📡 Emitted location update for vendor ${id} to room vendor-${id}`);

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

// ===== CREATE STREET VENDOR (PUBLIC ENDPOINT) =====
export const createStreetVendor = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || req.body?.region || req.headers['x-region'] as string || 'ae';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    const vendorData = { ...req.body };
    vendorData.region = region;

    if (!vendorData.vendorName) {
      return res.status(400).json({ 
        success: false, 
        message: 'vendorName is required' 
      });
    }

    if (vendorData.latitude !== undefined && vendorData.longitude !== undefined) {
      const lat = parseFloat(vendorData.latitude);
      const lng = parseFloat(vendorData.longitude);

      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ 
          success: false, 
          message: 'latitude and longitude must be valid numbers' 
        });
      }

      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid coordinates: lng[-180,180], lat[-90,90]' 
        });
      }

      vendorData.currentLocation = {
        type: 'Point',
        coordinates: [lng, lat],
        timestamp: new Date(),
        accuracy: vendorData.accuracy ? parseFloat(vendorData.accuracy) : undefined
      };
      
      delete vendorData.latitude;
      delete vendorData.longitude;
      delete vendorData.accuracy;
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'latitude and longitude are required' 
      });
    }

    vendorData.vendorType = vendorData.vendorType || 'mobile';
    vendorData.isActive = vendorData.isActive !== undefined ? vendorData.isActive : true;
    vendorData.isOperational = vendorData.isOperational !== undefined ? vendorData.isOperational : false;
    vendorData.serviceRadius = vendorData.serviceRadius ? parseInt(vendorData.serviceRadius) : 500;
    vendorData.ownerId = req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined;

    const newVendor = new StreetVendor(vendorData);
    await newVendor.save();

    res.status(201).json({
      success: true,
      message: 'Street vendor created successfully',
      data: newVendor
    });

  } catch (error: any) {
    console.error('Error creating street vendor:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        errors: messages 
      });
    }

    res.status(400).json({ 
      success: false, 
      message: 'Street vendor creation failed', 
      error: error.message 
    });
  }
};

// ===== GET ALL STREET VENDORS =====
export const getMobileVendors = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }

    const { page = 1, limit = 10, isOperational, vendorType } = req.query;

    const query: any = { isActive: true, region };
    
    if (isOperational !== undefined) {
      query.isOperational = isOperational === 'true' || isOperational === '1';
    }
    
    if (vendorType) {
      query.vendorType = vendorType;
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const vendors = await StreetVendor.find(query)
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

// ===== GET ACTIVE VENDORS NEARBY =====
export const getActiveVendorsNearby = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region);

    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }

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
      isActive: true
    }).sort({ 'currentLocation.timestamp': -1 });

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

// ===== GET VENDOR TRAJECTORY =====
export const getVendorTrajectory = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
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

// ===== TOGGLE VENDOR STATUS =====
export const toggleVendorOperational = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'ae';
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

    const updatedVendor = await StreetVendor.findByIdAndUpdate(
      id,
      { isOperational },
      { new: true }
    );

    if (!updatedVendor) {
      return res.status(404).json({ 
        success: false, 
        message: 'Vendor not found' 
      });
    }

    // ✅ EMIT STATUS CHANGE TO TRACKING CLIENTS
    io.to(`vendor-${id}`).emit('vendor-status-change', {
      vendorId: id,
      vendorName: updatedVendor.vendorName,
      isOperational,
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