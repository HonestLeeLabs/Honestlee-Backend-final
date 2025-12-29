// src/controllers/venueController.ts
import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import { getVenueModel } from '../models/Venue';
import { dbManager } from '../config/database';
import mongoose from 'mongoose';
import User, { Role } from '../models/User';

type CombinedRequest = AuthRequest & RegionRequest;

// ✅ Interface for WiFi data from agent_venue_temps
interface AgentVenueWifiData {
  _id: mongoose.Types.ObjectId;
  venueId: mongoose.Types.ObjectId;
  wifiData?: {
    hasSpeedTest?: boolean;
    latestSpeedTest?: {
      downloadMbps?: number;
      uploadMbps?: number;
      latencyMs?: number;
      testCount?: number;
      lastTestedAt?: Date;
    };
    ssids?: string[];
  };
}

// Helper to check user roles
function hasRole(userRole: string | undefined, allowedRoles: string[]): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}

// GET VENUES WITH WIFI DATA FROM BOTH agent_venue_temps AND wifi_speed_tests
export const getVenues = async (req: CombinedRequest, res: Response) => {
  try {
    const region = req.region || 'th';
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);

    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const {
      page = '1',
      limit,
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
      radius = '5000',
      fetchAll = 'false',
      includeWifiData = 'true',
      hasWifiTests, // ✅ Filter parameter for WiFi tests
    } = req.query;

    const query: any = { isActive: true, region };

    // Existing filters
    if (venuetype) query.venuetype = venuetype;
    if (venuecategory) query.venuecategory = venuecategory;
    if (groupid) query.groupid = groupid;
    if (BillingCity) query.BillingCity = BillingCity;
    if (BillingCountry) query.BillingCountry = BillingCountry;
    if (BudgetFriendly) query.BudgetFriendly = BudgetFriendly;
    if (PubWifi) query.PubWifi = PubWifi === '1' || PubWifi === 'true' ? 1 : 0;
    if (minRating && !isNaN(Number(minRating))) query.Rating = { $gte: Number(minRating) };

    if (search && typeof search === 'string') {
      query.$or = [
        { AccountName: { $regex: search, $options: 'i' } },
        { BillingCity: { $regex: search, $options: 'i' } },
      ];
    }

    if (latitude && longitude) {
      const lat = parseFloat(latitude.toString());
      const lng = parseFloat(longitude.toString());
      const rad = parseInt(radius.toString());
      query.geometry = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: rad,
        },
      };
    }

    const sortObj: any = {};
    sortObj[sortBy.toString()] = sortOrder === 'asc' ? 1 : -1;

    const pageNum = Number(page);
    const shouldFetchAll = fetchAll === 'true' || fetchAll === '1';
    const shouldIncludeWifiData = includeWifiData === 'true' || includeWifiData === '1';

    let queryresult: any[];

    if (shouldFetchAll) {
      queryresult = await Venue.find(query).sort(sortObj).lean();
    } else {
      const limitNum = limit ? Number(limit) : 10;
      queryresult = await Venue.find(query)
        .sort(sortObj)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean();
    }

    const total = await Venue.countDocuments(query);

    // ✅ WiFi Data Aggregation from BOTH sources
    if (shouldIncludeWifiData && queryresult.length > 0) {
      const venueIds = queryresult.map((v) => v._id);

      console.log(`🔍 Fetching WiFi data for ${venueIds.length} venues from both collections`);

      try {
        // Access the shared database
        const sharedDb = mongoose.connection.useDb('honestlee_shared');
        const AgentVenueTemp = sharedDb.collection('agent_venue_temps');
        const WifiSpeedTests = sharedDb.collection('wifi_speed_tests');

        // ✅ STEP 1: Fetch from agent_venue_temps (aggregated data)
        const agentVenueWifiData = await AgentVenueTemp.aggregate([
          {
            $match: {
              venueId: { $in: venueIds },
              'wifiData.hasSpeedTest': true
            }
          },
          {
            $project: {
              _id: 1,
              venueId: 1,
              'wifiData.hasSpeedTest': 1,
              'wifiData.latestSpeedTest': 1,
              'wifiData.ssids': 1
            }
          }
        ]).toArray();

        console.log(`✅ Agent Venue Temps: Found ${agentVenueWifiData.length} venues with WiFi data`);

        // ✅ STEP 2: Fetch from wifi_speed_tests (raw test data)
        // Get latest test for each venue
        const wifiSpeedTestData = await WifiSpeedTests.aggregate([
          {
            $match: {
              venueId: { $in: venueIds },
              isReliable: true,
              region: region
            }
          },
          {
            $sort: { timestamp: -1 }
          },
          {
            $group: {
              _id: '$venueId',
              latestTest: { $first: '$$ROOT' },
              testCount: { $sum: 1 },
              avgDownload: { $avg: '$downloadMbps' },
              avgUpload: { $avg: '$uploadMbps' },
              avgLatency: { $avg: '$latencyMs' }
            }
          }
        ]).toArray();

        console.log(`✅ WiFi Speed Tests: Found ${wifiSpeedTestData.length} venues with speed tests`);

        // ✅ STEP 3: Merge data from both sources (agent_venue_temps takes priority)
        const wifiDataMap = new Map<string, any>();

        // First, add data from agent_venue_temps
        agentVenueWifiData.forEach((agentVenue: any) => {
          if (agentVenue.venueId) {
            const venueIdStr = agentVenue.venueId.toString();
            const speedTest = agentVenue.wifiData?.latestSpeedTest;

            wifiDataMap.set(venueIdStr, {
              hasWifiSpeedData: true,
              hasWifiTests: true,
              wifiTestsCount: speedTest?.testCount || 1,
              DLSPeedMBPS: speedTest?.downloadMbps || null,
              ULSPeedMBPS: speedTest?.uploadMbps || null,
              DLSpeedMBPS: speedTest?.downloadMbps || null,
              ULSpeedMBPS: speedTest?.uploadMbps || null,
              latencyMs: speedTest?.latencyMs || null,
              lastTestedAt: speedTest?.lastTestedAt,
              wifiSSIDs: agentVenue.wifiData?.ssids || [],
              dataSource: 'agent_venue_temps'
            });
          }
        });

        // Then, fill in missing venues from wifi_speed_tests
        wifiSpeedTestData.forEach((wifiTest: any) => {
          if (wifiTest._id) {
            const venueIdStr = wifiTest._id.toString();
            
            // Only add if NOT already present from agent_venue_temps
            if (!wifiDataMap.has(venueIdStr)) {
              const latestTest = wifiTest.latestTest;

              wifiDataMap.set(venueIdStr, {
                hasWifiSpeedData: true,
                hasWifiTests: true,
                wifiTestsCount: wifiTest.testCount || 1,
                DLSPeedMBPS: latestTest.downloadMbps || null,
                ULSPeedMBPS: latestTest.uploadMbps || null,
                DLSpeedMBPS: latestTest.downloadMbps || null,
                ULSpeedMBPS: latestTest.uploadMbps || null,
                latencyMs: latestTest.latencyMs || null,
                lastTestedAt: latestTest.timestamp,
                wifiQualityScore: latestTest.qualityScore || null,
                wifiCategory: latestTest.category || null,
                avgDownloadMbps: wifiTest.avgDownload || null,
                avgUploadMbps: wifiTest.avgUpload || null,
                dataSource: 'wifi_speed_tests'
              });
            }
          }
        });

        console.log(`✅ Total WiFi Data Coverage: ${wifiDataMap.size} venues`);

        // Merge WiFi data into venue results
        queryresult = queryresult.map((venue) => {
          const venueId = venue._id.toString();
          const wifiData = wifiDataMap.get(venueId);

          if (wifiData) {
            return { ...venue, ...wifiData };
          }

          return {
            ...venue,
            hasWifiSpeedData: false,
            hasWifiTests: false,
            wifiTestsCount: 0,
            DLSPeedMBPS: null,
            ULSPeedMBPS: null,
            DLSpeedMBPS: null,
            ULSpeedMBPS: null,
          };
        });

      } catch (wifiError: any) {
        console.error('❌ Error fetching WiFi data:', wifiError);
        // Continue without WiFi data
      }
    }

    // ✅ Filter by WiFi test availability (AFTER merging WiFi data)
    if (hasWifiTests !== undefined) {
      const filterHasWifi = hasWifiTests === 'true' || hasWifiTests === '1';
      const beforeFilterCount = queryresult.length;
      
      queryresult = queryresult.filter((venue) => {
        if (filterHasWifi) {
          return venue.hasWifiTests === true && venue.wifiTestsCount > 0;
        } else {
          return !venue.hasWifiTests || venue.wifiTestsCount === 0;
        }
      });
      
      console.log(`🔍 Filtered from ${beforeFilterCount} to ${queryresult.length} venues with hasWifiTests=${filterHasWifi}`);
    }

    res.json({
      success: true,
      region,
      data: queryresult,
      pagination: shouldFetchAll
        ? { total, fetchAll: true, returned: queryresult.length }
        : {
            total,
            page: pageNum,
            limit: limit ? Number(limit) : 10,
            totalPages: Math.ceil(total / (limit ? Number(limit) : 10)),
          },
    });
  } catch (error: any) {
    console.error('❌ Error fetching venues:', error);
    res.status(500).json({ success: false, message: 'Error fetching venues', error: error.message });
  }
};

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

// ✅ FIXED: GET VENUE BY ID - Removed .populate() to avoid User model error
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

    // ✅ FIXED: Use .lean() and remove .populate() to avoid User schema error
    const venue = await Venue.findById(id).lean().exec();

    if (!venue) {
      return res.status(404).json({ 
        success: false, 
        message: 'Venue not found' 
      });
    }

    // ✅ If you need owner info, fetch it separately
    if (venue.ownerId) {
      try {
        const owner = await User.findById(venue.ownerId)
          .select('name email phone')
          .lean()
          .exec();
        
        if (owner) {
          (venue as any).owner = owner;
        }
      } catch (ownerError) {
        console.warn('Could not fetch owner info:', ownerError);
        // Continue without owner info
      }
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

// DELETE VENUE
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
      .limit(limitNum)
      .lean();

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
