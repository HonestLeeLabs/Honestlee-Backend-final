// src/controllers/agentOnboardingController.ts
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import mongoose, { Schema, Model } from 'mongoose';
import AgentVenueTemp, { VenueOnboardingStatus } from '../models/AgentVenueTemp';
import QRCodeKit, { QRKitType, QRKitStatus } from '../models/QRCodeKit';
import QRBinding, { QRBindingType, QRBindingState } from '../models/QRBinding';
import Zone from '../models/Zone';
import AgentWiFiRun from '../models/AgentWiFiRun';
import PhotoAsset, { PhotoAssetType } from '../models/PhotoAsset';
import AuditLog from '../models/AuditLog';
import Venue from '../models/Venue';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import { dbManager, Region } from '../config/database';
import { getS3KeyFromUrl, deleteFileFromS3 } from '../config/uploadConfig';

type AgentRequest = AuthRequest & RegionRequest;

// ===== UTILITY FUNCTIONS =====

const createAuditLog = async (
  actorId: string,
  actorRole: string,
  action: string,
  meta: any,
  venueId?: string,
  req?: AgentRequest
): Promise<void> => {
  const auditLog = new AuditLog({
    auditId: uuidv4(),
    actorId,
    actorRole,
    venueId,
    action,
    meta,
    deviceId: req?.headers['user-agent'],
    ip: req?.ip,
    geoLocation: meta.geoLocation
  });
  
  await auditLog.save();
  console.log(`📝 Audit log created: ${action}`);
};

const generateColorToken = (): string => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B500', '#52B788'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// ===== GET ALL VENUES FROM REGIONAL DATABASE =====

export const getAllRegionalVenues = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const region = req.user.region || 'th';

    console.log(`🔍 Fetching all venues from ${region} regional database`);

    const regionalConnection = dbManager.getConnection(region as Region);

    interface IRegionalVenue {
      _id: mongoose.Types.ObjectId;
      name?: string;
      AccountName?: string;
      venueName?: string;
      address?: any;
      category?: string[];
      status?: string;
      isActive?: boolean;
    }

    let VenueModel: Model<IRegionalVenue>;
    
    try {
      // ✅ FIX: Check if model already exists before creating it
      VenueModel = regionalConnection.models.Venue || regionalConnection.model<IRegionalVenue>('Venue');
    } catch (error) {
      // ✅ FIX: Only define the schema if model doesn't exist
      const venueSchema = new Schema<IRegionalVenue>({
        name: { type: String },
        AccountName: { type: String },
        venueName: { type: String },
        address: { type: Schema.Types.Mixed },
        category: [{ type: String }],
        status: { type: String },
        isActive: { type: Boolean }
      }, { strict: false, timestamps: true });

      VenueModel = regionalConnection.model<IRegionalVenue>('Venue', venueSchema);
    }

    const venues = await VenueModel
      .find({ isActive: { $ne: false } })
      .select('_id name AccountName venueName address category status')
      .sort({ name: 1, AccountName: 1 })
      .limit(1000)
      .lean<IRegionalVenue[]>()
      .exec();

    console.log(`✅ Found ${venues.length} venues in ${region} database`);

    return res.json({
      success: true,
      data: venues.map(v => {
        const venueName = v.name || v.AccountName || v.venueName || 'Unnamed Venue';
        
        let addressText = 'No address';
        if (v.address) {
          if (typeof v.address === 'string') {
            addressText = v.address;
          } else if (v.address.raw) {
            addressText = v.address.raw;
          } else if (v.address.formatted) {
            addressText = v.address.formatted;
          } else if (v.address.street || v.address.city) {
            addressText = [v.address.street, v.address.city, v.address.country]
              .filter(Boolean)
              .join(', ');
          }
        }

        return {
          _id: v._id.toString(),
          venueId: v._id.toString(),
          name: venueName,
          address: addressText,
          category: v.category || [],
          status: v.status || 'active'
        };
      }),
      count: venues.length,
      region: region
    });

  } catch (error: any) {
    console.error('❌ Error fetching regional venues:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching venues',
      error: error.message
    });
  }
};

// ===== QUICK ADD VENUE =====

export const quickAddVenue = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const region = (req.region || 'ae') as Region;
    const {
      name,
      category,
      address,
      phone,
      instagram,
      openingHours,
      ownerName,
      managerName,
      gpsLocation
    } = req.body;

    console.log(`➕ Agent ${req.user.userId} quick adding venue: ${name} in region ${region}`);

    const tempVenueId = `TEMP-${uuidv4().substring(0, 8).toUpperCase()}`;
    
    const tempVenue = new AgentVenueTemp({
      tempVenueId,
      createdBy: req.user.userId,
      name,
      category: Array.isArray(category) ? category : [category],
      address: {
        lat: address.lat || gpsLocation?.lat,
        lng: address.lng || gpsLocation?.lng,
        raw: address.raw
      },
      phone,
      socials: {
        instagram
      },
      hours: openingHours,
      status: 'temp',
      onboardingStatus: VenueOnboardingStatus.UNLISTED,
      region,
      flags: {
        qrCodesLeftBehind: false,
        ownerMet: false,
        haveOwnersContact: false,
        managerMet: false,
        haveManagersContact: false
      },
      ownerContact: ownerName ? { name: ownerName } : undefined,
      managerContact: managerName ? { name: managerName } : undefined,
      gpsAccuracy: gpsLocation ? {
        newLocation: {
          lat: gpsLocation.lat,
          lng: gpsLocation.lng,
          timestamp: new Date(),
          accuracy: gpsLocation.accuracy || 0
        }
      } : undefined
    });

    await tempVenue.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.venue_added',
      { tempVenueId, name, region },
      undefined,
      req
    );

    console.log(`✅ Temp venue created: ${tempVenueId}`);

    return res.status(201).json({
      success: true,
      data: tempVenue,
      message: 'Venue quick added successfully'
    });

  } catch (error: any) {
    console.error('❌ Error quick adding venue:', error);
    return res.status(500).json({
      success: false,
      message: 'Error adding venue',
      error: error.message
    });
  }
};

// ===== LINK VENUE TO CRM (WITH AUTO-CREATE) =====

export const linkVenueToCRM = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { tempVenueId } = req.params;
    const { crmId, venueId, autoCreate } = req.body;
    
    const region = (req.region || req.user.region || req.body.region || 'th') as Region;

    console.log(`🔗 Linking temp venue ${tempVenueId} to CRM/Venue in region: ${region}`);

    const tempVenue = await AgentVenueTemp.findOne({ tempVenueId });
    
    if (!tempVenue) {
      return res.status(404).json({ 
        success: false,
        message: 'Temp venue not found' 
      });
    }

    if (!crmId || crmId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'CRM ID is required'
      });
    }

    if (!autoCreate && (!venueId || venueId.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: 'Venue ID is required when not auto-creating'
      });
    }

    let finalVenueId = venueId;

    // ✅ AUTO-CREATE VENUE
    if (autoCreate && !venueId) {
      console.log(`🏗️ Auto-creating venue in ${region} regional database...`);
      
      try {
        const regionalConnection = dbManager.getConnection(region);
        
        if (!regionalConnection) {
          throw new Error(`Failed to connect to regional database: ${region}`);
        }

        let RegionalVenue;
        
        if (regionalConnection.models.Venue) {
          console.log(`✅ Using existing Venue model for ${region}`);
          RegionalVenue = regionalConnection.models.Venue;
        } else {
          console.log(`🔧 Creating new Venue model for ${region}`);
          const venueSchema = new Schema({
            globalId: String,
            name: String,
            AccountName: String, // ✅ Added
            address: Schema.Types.Mixed,
            geometry: { // ✅ Added required geometry field
              type: { type: String, default: 'Point' },
              coordinates: [Number] // [longitude, latitude]
            },
            category: [String],
            phone: String,
            socials: Schema.Types.Mixed,
            hours: String,
            isActive: Boolean,
            status: String,
            region: String,
            createdBy: String,
            googleData: Schema.Types.Mixed,
          }, { strict: false, timestamps: true });
          
          RegionalVenue = regionalConnection.model('Venue', venueSchema);
        }

        // ✅ FIX: Prepare venue data with all required fields
        const venueData: any = {
          globalId: tempVenue.googleData?.placeId || `MANUAL-${uuidv4()}`,
          name: tempVenue.name,
          AccountName: tempVenue.name, // ✅ FIX: Use name as AccountName
          address: tempVenue.address,
          category: tempVenue.category,
          phone: tempVenue.phone,
          socials: tempVenue.socials || {},
          hours: tempVenue.hours,
          isActive: true,
          status: 'active',
          region: region,
          createdBy: req.user.userId,
          googleData: tempVenue.googleData || {},
        };

        // ✅ FIX: Add geometry if coordinates exist
        if (tempVenue.address?.lat && tempVenue.address?.lng) {
          venueData.geometry = {
            type: 'Point',
            coordinates: [
              tempVenue.address.lng, // longitude first (GeoJSON format)
              tempVenue.address.lat  // latitude second
            ]
          };
        } else {
          // ✅ FIX: Provide default coordinates if missing
          console.warn(`⚠️ No coordinates found for ${tempVenue.name}, using default [0, 0]`);
          venueData.geometry = {
            type: 'Point',
            coordinates: [0, 0]
          };
        }

        const newVenue = new RegionalVenue(venueData);

        const savedVenue = await newVenue.save();
        finalVenueId = savedVenue._id.toString();
        
        console.log(`✅ Venue created in ${region} regional DB: ${finalVenueId}`);
      } catch (createError: any) {
        console.error('❌ Error creating venue in regional database:', createError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create venue in regional database',
          error: createError.message,
          details: {
            region,
            tempVenueId,
            venueData: {
              name: tempVenue.name,
              hasGoogleData: !!tempVenue.googleData,
              hasCoordinates: !!(tempVenue.address?.lat && tempVenue.address?.lng)
            }
          }
        });
      }
    }

    // ✅ VALIDATE EXISTING VENUE
    if (!autoCreate && venueId) {
      console.log(`🔍 Validating existing venue ${venueId} in ${region} database...`);
      
      try {
        const regionalConnection = dbManager.getConnection(region);
        
        if (!regionalConnection) {
          throw new Error(`Failed to connect to regional database: ${region}`);
        }

        let RegionalVenue;
        
        if (regionalConnection.models.Venue) {
          RegionalVenue = regionalConnection.models.Venue;
        } else {
          return res.status(500).json({ 
            success: false,
            message: 'Venue model not found in regional database' 
          });
        }
        
        const venue = await RegionalVenue.findById(venueId);
        if (!venue) {
          return res.status(404).json({ 
            success: false,
            message: 'Venue not found in regional database',
            details: { venueId, region }
          });
        }
        
        console.log(`✅ Venue validated: ${venue.name || venue.AccountName || 'Unnamed'}`);
      } catch (validateError: any) {
        console.error('❌ Error validating venue:', validateError);
        return res.status(500).json({
          success: false,
          message: 'Failed to validate venue',
          error: validateError.message
        });
      }
    }

    // ✅ UPDATE TEMP VENUE
    tempVenue.crmId = crmId.trim();
    tempVenue.venueId = finalVenueId;
    tempVenue.status = 'linked';
    tempVenue.onboardingStatus = VenueOnboardingStatus.SOFT_ONBOARDED;

    await tempVenue.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.venue_linked_crm',
      { tempVenueId, crmId, venueId: finalVenueId, autoCreated: autoCreate, region },
      finalVenueId,
      req
    );

    console.log(`✅ Venue linked to CRM: ${tempVenueId} -> ${finalVenueId}`);

    return res.json({
      success: true,
      data: tempVenue,
      message: 'Venue linked to CRM successfully',
      autoCreated: autoCreate && !venueId,
      region
    });

  } catch (error: any) {
    console.error('❌ Error linking venue to CRM:', error);
    console.error('Error stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'Error linking venue',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ===== ATTACH MAIN QR/NFC =====

export const attachMainQR = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const { code, nfcUid, placement, placementNote, placementPhoto } = req.body;

    console.log(`📱 Attaching main QR to venue ${venueId}`);

    const existingBinding = await QRBinding.findOne({ 
      code, 
      state: QRBindingState.ACTIVE 
    });

    if (existingBinding) {
      return res.status(400).json({
        success: false,
        message: 'QR code already linked to another venue',
        conflictVenueId: existingBinding.venueId
      });
    }

    await QRBinding.updateMany(
      {
        venueId,
        type: QRBindingType.MAIN,
        state: QRBindingState.ACTIVE
      },
      {
        state: QRBindingState.REVOKED,
        revokedAt: new Date(),
        revokeReason: 'Replaced by new main QR'
      }
    );

    const nfcUidHash = nfcUid 
      ? crypto.createHash('sha256').update(nfcUid).digest('hex')
      : undefined;

    const binding = new QRBinding({
      bindingId: uuidv4(),
      code,
      venueId,
      type: QRBindingType.MAIN,
      nfcUidHash,
      state: QRBindingState.ACTIVE,
      boundBy: req.user.userId,
      boundAt: new Date(),
      placement: {
        type: placement || 'counter',
        note: placementNote,
        photo: placementPhoto
      }
    });

    await binding.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.qr_main.linked',
      { code, venueId, placement },
      venueId,
      req
    );

    console.log(`✅ Main QR attached: ${code}`);

    return res.status(201).json({
      success: true,
      data: binding,
      message: 'Main QR attached successfully'
    });

  } catch (error: any) {
    console.error('❌ Error attaching main QR:', error);
    return res.status(500).json({
      success: false,
      message: 'Error attaching QR',
      error: error.message
    });
  }
};

// ✅ GET MAIN QR

export const getMainQR = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;

    const mainQR = await QRBinding.findOne({
      venueId,
      type: QRBindingType.MAIN,
      state: QRBindingState.ACTIVE
    });

    return res.json({
      success: true,
      data: mainQR,
      hasMainQR: !!mainQR
    });

  } catch (error: any) {
    console.error('❌ Error fetching main QR:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching main QR',
      error: error.message
    });
  }
};

// ===== GENERATE TEST TOKEN =====

export const generateTestToken = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    const { bindingId } = req.params;

    const binding = await QRBinding.findOne({ bindingId });
    if (!binding) {
      return res.status(404).json({ message: 'Binding not found' });
    }

    const testToken = uuidv4();
    binding.testToken = testToken;
    binding.testTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await binding.save();

    const testUrl = `${process.env.FRONTEND_URL}/test-checkin?token=${testToken}`;

    return res.json({
      success: true,
      data: {
        testToken,
        testUrl,
        expiresAt: binding.testTokenExpiresAt
      }
    });

  } catch (error: any) {
    console.error('❌ Error generating test token:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating test token',
      error: error.message
    });
  }
};

// ===== CREATE ZONE =====

export const createZone = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const { name, capacityMin, capacityMax } = req.body;

    console.log(`🏗️ Creating zone "${name}" for venue ${venueId}`);

    if (name.length > 18) {
      return res.status(400).json({ 
        message: 'Zone name must be 18 characters or less' 
      });
    }

    const zone = new Zone({
      zoneId: uuidv4(),
      venueId,
      name,
      capacityMin,
      capacityMax,
      colorToken: generateColorToken(),
      createdBy: req.user.userId,
      isActive: true
    });

    await zone.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.zone_defined',
      { zoneId: zone.zoneId, name, venueId },
      venueId,
      req
    );

    console.log(`✅ Zone created: ${zone.zoneId}`);

    return res.status(201).json({
      success: true,
      data: zone,
      message: 'Zone created successfully'
    });

  } catch (error: any) {
    console.error('❌ Error creating zone:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating zone',
      error: error.message
    });
  }
};

// ✅ GET VENUE ZONES

export const getVenueZones = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;

    console.log(`🔍 Fetching zones for venue: ${venueId}`);

    const zones = await Zone.find({ 
      venueId: venueId, 
      isActive: true 
    }).sort({ createdAt: 1 });

    console.log(`✅ Found ${zones.length} zones for venue ${venueId}`);

    return res.json({
      success: true,
      data: zones,
      count: zones.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching zones:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching zones',
      error: error.message
    });
  }
};

// ✅ DELETE ZONE

export const deleteZone = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId, zoneId } = req.params;

    console.log(`🗑️ Deleting zone ${zoneId} from venue ${venueId}`);

    const zone = await Zone.findOneAndUpdate(
      { venueId, zoneId },
      { isActive: false },
      { new: true }
    );

    if (!zone) {
      return res.status(404).json({ message: 'Zone not found' });
    }

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.zone_deleted',
      { zoneId, venueId },
      venueId,
      req
    );

    console.log(`✅ Zone deleted: ${zoneId}`);

    return res.json({
      success: true,
      message: 'Zone deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting zone:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting zone',
      error: error.message
    });
  }
};

// ===== LINK TABLE/ZONE QR =====

export const linkTableQR = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const { code, zoneId, instanceNo, nfcUid } = req.body;

    console.log(`🪑 Linking table QR ${code} to zone ${zoneId}, instance ${instanceNo}`);

    const existingBinding = await QRBinding.findOne({ 
      code, 
      state: QRBindingState.ACTIVE 
    });

    if (existingBinding) {
      return res.status(400).json({
        success: false,
        message: 'QR code already linked',
        conflictVenueId: existingBinding.venueId
      });
    }

    const nfcUidHash = nfcUid 
      ? crypto.createHash('sha256').update(nfcUid).digest('hex')
      : undefined;

    const binding = new QRBinding({
      bindingId: uuidv4(),
      code,
      venueId,
      zone: zoneId,
      instanceNo,
      type: QRBindingType.TABLE,
      nfcUidHash,
      state: QRBindingState.ACTIVE,
      boundBy: req.user.userId,
      boundAt: new Date()
    });

    await binding.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.qr_table.linked',
      { code, venueId, zoneId, instanceNo },
      venueId,
      req
    );

    console.log(`✅ Table QR linked: ${code}`);

    return res.status(201).json({
      success: true,
      data: binding,
      message: 'Table QR linked successfully'
    });

  } catch (error: any) {
    console.error('❌ Error linking table QR:', error);
    return res.status(500).json({
      success: false,
      message: 'Error linking QR',
      error: error.message
    });
  }
};

// ✅ GET TABLE QRS

export const getTableQRs = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;

    const tableQRs = await QRBinding.find({
      venueId,
      type: QRBindingType.TABLE,
      state: QRBindingState.ACTIVE
    }).sort({ zone: 1, instanceNo: 1 });

    console.log(`✅ Found ${tableQRs.length} table QRs for venue ${venueId}`);

    return res.json({
      success: true,
      data: tableQRs,
      count: tableQRs.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching table QRs:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching table QRs',
      error: error.message
    });
  }
};

// ✅ DELETE TABLE QR

export const deleteTableQR = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId, bindingId } = req.params;

    const binding = await QRBinding.findOneAndUpdate(
      { venueId, bindingId, type: QRBindingType.TABLE },
      { 
        state: QRBindingState.REVOKED,
        revokedAt: new Date(),
        revokeReason: 'Deleted by agent'
      },
      { new: true }
    );

    if (!binding) {
      return res.status(404).json({ message: 'Table QR not found' });
    }

    console.log(`✅ Table QR deleted: ${bindingId}`);

    return res.json({
      success: true,
      message: 'Table QR deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting table QR:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting table QR',
      error: error.message
    });
  }
};

// ===== UPLOAD PHOTOS =====

export const uploadVenuePhotos = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const { type } = req.body;
    const files = (req as any).files;

    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    console.log(`📸 Uploading ${files.length} photos for venue ${venueId}, type: ${type}`);

    const photoAssets = [];

    for (const file of files) {
      const asset = new PhotoAsset({
        assetId: uuidv4(),
        venueId,
        type: type || PhotoAssetType.OTHER,
        uri: file.location,
        width: file.metadata?.width,
        height: file.metadata?.height,
        uploadedBy: req.user.userId,
        uploadedAt: new Date(),
        isPublic: ['logo', 'cover', 'storefront', 'interior', 'menu', 'food'].includes(type),
        s3Key: getS3KeyFromUrl(file.location) || file.key
      });

      await asset.save();
      photoAssets.push(asset);
    }

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.media.uploaded',
      { venueId, type, count: files.length },
      venueId,
      req
    );

    console.log(`✅ Uploaded ${photoAssets.length} photos`);

    return res.status(201).json({
      success: true,
      data: photoAssets,
      count: photoAssets.length,
      message: 'Photos uploaded successfully'
    });

  } catch (error: any) {
    console.error('❌ Error uploading photos:', error);
    
    const files = (req as any).files;
    if (files && files.length > 0) {
      for (const file of files) {
        const key = getS3KeyFromUrl(file.location);
        if (key) await deleteFileFromS3(key);
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Error uploading photos',
      error: error.message
    });
  }
};

// ✅ GET VENUE PHOTOS

export const getVenuePhotos = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const { type } = req.query;

    const query: any = { venueId };
    if (type) {
      query.type = type;
    }

    const photos = await PhotoAsset.find(query).sort({ uploadedAt: -1 });

    console.log(`✅ Found ${photos.length} photos for venue ${venueId}`);

    return res.json({
      success: true,
      data: photos,
      count: photos.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching photos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching photos',
      error: error.message
    });
  }
};

// ✅ DELETE PHOTO

export const deleteVenuePhoto = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId, assetId } = req.params;

    const photo = await PhotoAsset.findOne({ venueId, assetId });

    if (!photo) {
      return res.status(404).json({ message: 'Photo not found' });
    }

    if (photo.s3Key) {
      await deleteFileFromS3(photo.s3Key);
    }

    await PhotoAsset.deleteOne({ assetId });

    console.log(`✅ Photo deleted: ${assetId}`);

    return res.json({
      success: true,
      message: 'Photo deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting photo:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting photo',
      error: error.message
    });
  }
};

// ===== ONBOARD FROM GOOGLE PLACES =====

export const onboardFromGoogle = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const region = (req.region || 'th') as Region;
    const {
      googlePlaceId,
      name,
      formattedAddress,
      latitude,
      longitude,
      street,
      city,
      district,
      postalCode,
      state,
      country,
      countryCode,
      phoneInternational,
      phoneNational,
      website,
      primaryType,
      primaryTypeLabel,
      allTypes,
      googleMapsUrl,
      utcOffsetMinutes,
      rating,
      userRatingsCount,
      reviews,
      businessStatus,
      regularOpeningHours,
      editorialSummary,
      priceLevel,
      paymentOptions,
      accessibilityOptions,
      parkingOptions,
      atmosphereFlags,
      photoReference,
      allPhotos
    } = req.body;

    console.log(`🗺️ Agent ${req.user.userId} onboarding venue from Google: ${name}`);

    const tempVenueId = `TEMP-${uuidv4().substring(0, 8).toUpperCase()}`;
    
    const tempVenue = new AgentVenueTemp({
      tempVenueId,
      createdBy: req.user.userId,
      name,
      category: allTypes || [primaryType],
      address: {
        lat: latitude,
        lng: longitude,
        raw: formattedAddress,
        street,
        city,
        district,
        postalCode,
        state,
        country,
        countryCode
      },
      phone: phoneInternational,
      socials: {
        website: website
      },
      hours: regularOpeningHours,
      status: 'temp',
      onboardingStatus: VenueOnboardingStatus.UNLISTED,
      region,
      flags: {
        qrCodesLeftBehind: false,
        ownerMet: false,
        haveOwnersContact: false,
        managerMet: false,
        haveManagersContact: false
      },
      googleData: {
        placeId: googlePlaceId,
        primaryType,
        primaryTypeLabel,
        allTypes,
        googleMapsUrl,
        utcOffsetMinutes,
        rating,
        userRatingsCount,
        reviews: JSON.stringify(reviews),
        businessStatus,
        editorialSummary,
        priceLevel,
        paymentOptions: JSON.stringify(paymentOptions),
        accessibilityOptions: JSON.stringify(accessibilityOptions),
        parkingOptions: JSON.stringify(parkingOptions),
        atmosphereFlags: JSON.stringify(atmosphereFlags),
        photoReference,
        allPhotos: JSON.stringify(allPhotos),
        importedAt: new Date(),
        importedBy: req.user.userId
      }
    });

    await tempVenue.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.venue_added_from_google',
      { tempVenueId, name, googlePlaceId, region },
      undefined,
      req
    );

    console.log(`✅ Venue onboarded from Google: ${tempVenueId}`);

    return res.status(201).json({
      success: true,
      data: tempVenue,
      message: 'Venue onboarded from Google successfully'
    });

  } catch (error: any) {
    console.error('❌ Error onboarding from Google:', error);
    return res.status(500).json({
      success: false,
      message: 'Error onboarding venue',
      error: error.message
    });
  }
};

// ===== RUN WIFI TEST =====

export const runWiFiTest = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const {
      zoneId,
      dlMbps,
      ulMbps,
      latencyMs,
      jitterMs,
      lossPct,
      bssid,
      vpnFlag,
      presenceConfidence,
      deviceInfo,
      captivePortal
    } = req.body;

    console.log(`📡 Running WiFi test for venue ${venueId}, zone ${zoneId}`);

    const bssidHash = crypto.createHash('sha256').update(bssid).digest('hex');

    const wifiRun = new AgentWiFiRun({
      runId: uuidv4(),
      venueId,
      zone: zoneId,
      dlMbps,
      ulMbps,
      latencyMs,
      jitterMs,
      lossPct,
      bssidHash,
      vpnFlag: vpnFlag || false,
      presenceConfidence: presenceConfidence || 'medium',
      agentVerified: true,
      agentId: req.user.userId,
      deviceInfo,
      captivePortal: captivePortal || false
    });

    await wifiRun.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.wifi_run',
      { runId: wifiRun.runId, venueId, zoneId, dlMbps, ulMbps },
      venueId,
      req
    );

    console.log(`✅ WiFi test completed: ${wifiRun.runId}`);

    return res.status(201).json({
      success: true,
      data: wifiRun,
      message: 'WiFi test completed successfully'
    });

  } catch (error: any) {
    console.error('❌ Error running WiFi test:', error);
    return res.status(500).json({
      success: false,
      message: 'Error running WiFi test',
      error: error.message
    });
  }
};

// ✅ GET WIFI TESTS

export const getWiFiTests = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;

    const wifiTests = await AgentWiFiRun.find({ venueId })
      .sort({ createdAt: -1 })
      .limit(50);

    console.log(`✅ Found ${wifiTests.length} WiFi tests for venue ${venueId}`);

    return res.json({
      success: true,
      data: wifiTests,
      count: wifiTests.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching WiFi tests:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching WiFi tests',
      error: error.message
    });
  }
};

// ===== UPDATE VENUE STATUS =====

export const updateVenueStatus = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { tempVenueId } = req.params;
    const { onboardingStatus, flags, ownerContact, managerContact } = req.body;

    console.log(`🔄 Updating venue status for ${tempVenueId}`);

    const tempVenue = await AgentVenueTemp.findOne({ tempVenueId });
    
    if (!tempVenue) {
      return res.status(404).json({ message: 'Temp venue not found' });
    }

    if (onboardingStatus) {
      tempVenue.onboardingStatus = onboardingStatus;
    }

    if (flags) {
      tempVenue.flags = { ...tempVenue.flags, ...flags };
    }

    if (ownerContact) {
      tempVenue.ownerContact = { ...tempVenue.ownerContact, ...ownerContact };
    }

    if (managerContact) {
      tempVenue.managerContact = { ...tempVenue.managerContact, ...managerContact };
    }

    await tempVenue.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.venue_status_updated',
      { tempVenueId, onboardingStatus, flags },
      tempVenue.venueId?.toString(),
      req
    );

    console.log(`✅ Venue status updated: ${tempVenueId}`);

    return res.json({
      success: true,
      data: tempVenue,
      message: 'Venue status updated successfully'
    });

  } catch (error: any) {
    console.error('❌ Error updating venue status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating venue status',
      error: error.message
    });
  }
};

// ===== GET AGENT VENUES =====

export const getAgentVenues = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { status, onboardingStatus } = req.query;

    const query: any = { createdBy: req.user.userId };

    if (status) {
      query.status = status;
    }

    if (onboardingStatus) {
      query.onboardingStatus = onboardingStatus;
    }

    const venues = await AgentVenueTemp.find(query)
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${venues.length} venues for agent ${req.user.userId}`);

    return res.json({
      success: true,
      data: venues,
      count: venues.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching agent venues:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching venues',
      error: error.message
    });
  }
};

// ===== FINALIZE ONBOARDING =====

export const finalizeOnboarding = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { tempVenueId } = req.params;

    console.log(`✅ Finalizing onboarding for ${tempVenueId}`);

    const tempVenue = await AgentVenueTemp.findOne({ tempVenueId });
    
    if (!tempVenue) {
      return res.status(404).json({ message: 'Temp venue not found' });
    }

    if (!tempVenue.venueId) {
      return res.status(400).json({ message: 'Venue must be linked to CRM first' });
    }

    tempVenue.status = 'finalized';
    tempVenue.onboardingStatus = VenueOnboardingStatus.FULLY_VERIFIED;

    await tempVenue.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.onboarding.completed',
      { tempVenueId, venueId: tempVenue.venueId },
      tempVenue.venueId.toString(),
      req
    );

    console.log(`✅ Onboarding finalized: ${tempVenueId}`);

    return res.json({
      success: true,
      data: tempVenue,
      message: 'Onboarding finalized successfully'
    });

  } catch (error: any) {
    console.error('❌ Error finalizing onboarding:', error);
    return res.status(500).json({
      success: false,
      message: 'Error finalizing onboarding',
      error: error.message
    });
  }
};
