import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import mongoose, { Schema, Model } from 'mongoose';
import AgentVenueTemp, { VenueOnboardingStatus, VerificationLevel } from '../models/AgentVenueTemp';
import QRCodeKit, { QRKitType, QRKitStatus } from '../models/QRCodeKit';
import QRBinding, { QRBindingType, QRBindingState } from '../models/QRBinding';
import Zone from '../models/Zone';
import AgentWiFiRun from '../models/AgentWiFiRun';
import PhotoAsset, { PhotoAssetType } from '../models/PhotoAsset';
import AuditLog from '../models/AuditLog';
import Venue from '../models/Venue';
import { getVenueModel } from '../models/Venue'; 
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import { dbManager, Region } from '../config/database';
import { getS3KeyFromUrl, deleteFileFromS3 } from '../config/uploadConfig';
import CardMachineModel from '../models/PaymentMethod';
import UpiQrModel from '../models/PaymentMethod';

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
      gpsLocation,
      paymentTypes  // NEW: Accept payment types
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
      verificationLevel: VerificationLevel.PROSPECT_REMOTE,
      flags: {
        qrCodesLeftBehind: false,
        ownerMet: false,
        haveOwnersContact: false,
        managerMet: false,
        haveManagersContact: false
      },
      ownerContact: ownerName ? { name: ownerName } : undefined,
      managerContact: managerName ? { name: managerName } : undefined,
      paymentTypes: paymentTypes || {},  // NEW: Set payment types
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
      { tempVenueId, name, region, hasPaymentTypes: !!paymentTypes },
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

/**
 * PUT /api/agent/venues/:tempVenueId/payment-types
 * Update payment types accepted by venue
 */
export const updatePaymentTypes = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId } = req.params;
    const { paymentTypes } = req.body;

    if (!paymentTypes || typeof paymentTypes !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'paymentTypes object is required'
      });
    }

    console.log(`💳 Updating payment types for venue ${tempVenueId}`);

    // Find venue
    const venue = await AgentVenueTemp.findOne({ tempVenueId });

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    // Check if agent has permission (only assigned agent or admin)
    if (req.user.role === 'AGENT' && venue.assignedTo?.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update venues assigned to you'
      });
    }

    // Update payment types
    const updateData: any = {
      paymentTypes: {
        cash: paymentTypes.cash || false,
        creditCard: paymentTypes.creditCard || false,
        debitCard: paymentTypes.debitCard || false,
        upi: paymentTypes.upi || false,
        nfc: paymentTypes.nfc || false,
        applePay: paymentTypes.applePay || false,
        googlePay: paymentTypes.googlePay || false,
        alipay: paymentTypes.alipay || false,
        wechatPay: paymentTypes.wechatPay || false,
        promptpay: paymentTypes.promptpay || false,
        paynow: paymentTypes.paynow || false,
        venmo: paymentTypes.venmo || false,
        paypal: paymentTypes.paypal || false,
        other: paymentTypes.other || []
      },
      paymentTypesConfirmed: true,
      paymentTypesConfirmedAt: new Date()
    };

    const updatedVenue = await AgentVenueTemp.findOneAndUpdate(
      { tempVenueId },
      { $set: updateData },
      { new: true }
    );

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'PAYMENT_TYPES_UPDATED',
      meta: {
        tempVenueId,
        venueName: venue.name,
        paymentTypes: updateData.paymentTypes
      }
    });

    console.log(`✅ Payment types updated for venue ${tempVenueId}`);

    return res.json({
      success: true,
      message: 'Payment types updated successfully',
      data: updatedVenue
    });

  } catch (error: any) {
    console.error('❌ Error updating payment types:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update payment types',
      error: error.message
    });
  }
};

/**
 * GET /api/agent/venues/:tempVenueId/payment-types
 * Get payment types for a venue
 */
export const getPaymentTypes = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId } = req.params;

    const venue = await AgentVenueTemp.findOne({ tempVenueId })
      .select('tempVenueId name paymentTypes paymentTypesConfirmed paymentTypesConfirmedAt');

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    return res.json({
      success: true,
      data: {
        tempVenueId: venue.tempVenueId,
        name: venue.name,
        paymentTypes: venue.paymentTypes || {},
        confirmed: venue.paymentTypesConfirmed || false,
        confirmedAt: venue.paymentTypesConfirmedAt
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching payment types:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment types',
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
        const RegionalVenue = getVenueModel(region);  // get Venue model for regional connection

        const globalId = tempVenue.googleData?.placeId || `MANUAL-${uuidv4()}`;

        // Check if a venue with the same globalId already exists
        const existingVenue = await RegionalVenue.findOne({ globalId });

        if (existingVenue) {
          console.log(`🏗️ Venue already exists with globalId ${globalId}, reusing existing venue`);
          finalVenueId = existingVenue._id.toString();
        } else {
          // Prepare venueData with all required fields according to your Venue schema
          const venueData: any = {
            globalId,
            name: tempVenue.name,
            AccountName: tempVenue.name,
            address: tempVenue.address,
            category: tempVenue.category,
            phone: tempVenue.phone,
            socials: tempVenue.socials || {},
            hours: tempVenue.hours,
            isActive: true,
            status: 'active',
            region,
            createdBy: req.user.userId,
            googleData: tempVenue.googleData || {},
          };

          if (tempVenue.address?.lat && tempVenue.address?.lng) {
            venueData.geometry = {
              type: 'Point',
              coordinates: [tempVenue.address.lng, tempVenue.address.lat], // GeoJSON longitude-latitude order
            };
          } else {
            console.warn(`⚠️ No coordinates found for ${tempVenue.name}, using default [0, 0]`);
            venueData.geometry = {
              type: 'Point',
              coordinates: [0, 0],
            };
          }

          // Create new venue document and save
          const newVenue = new RegionalVenue(venueData);
          const savedVenue = await newVenue.save();
          finalVenueId = savedVenue._id.toString();

          console.log(`✅ Venue created in ${region} regional DB: ${finalVenueId}`);
        }
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
              hasCoordinates: !!(tempVenue.address?.lat && tempVenue.address?.lng),
            },
          },
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

/**
 * POST /api/agent/venues/:tempVenueId/notes
 * Add a note to venue
 */
export const addVenueNote = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId } = req.params;
    const { noteType, content } = req.body;

    if (!noteType || !content) {
      return res.status(400).json({
        success: false,
        message: 'noteType and content are required'
      });
    }

    const validNoteTypes = ['vitals', 'gps', 'zones', 'photos', 'wifi', 'atmosphere', 'general'];
    if (!validNoteTypes.includes(noteType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid noteType. Must be one of: ${validNoteTypes.join(', ')}`
      });
    }

    const venue = await AgentVenueTemp.findOne({ tempVenueId });

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    // ✅ REMOVED: Permission check - agents can now add notes to ANY venue
    // No longer checking if venue.assignedTo === req.user.userId

    const newNote: any = {
      noteId: uuidv4(),
      noteType,
      content: content.trim(),
      createdBy: new mongoose.Types.ObjectId(req.user.userId),
      createdAt: new Date()
    };

    if (!venue.notes) {
      venue.notes = [];
    }

    venue.notes.push(newNote);

    await venue.save();

    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'NOTE_ADDED',
      meta: {
        tempVenueId,
        noteType,
        noteId: newNote.noteId
      }
    });

    console.log(`✅ Note added to venue ${tempVenueId}: ${noteType}`);

    return res.status(201).json({
      success: true,
      message: 'Note added successfully',
      data: newNote
    });

  } catch (error: any) {
    console.error('❌ Error adding note:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add note',
      error: error.message
    });
  }
};

/**
 * GET /api/agent/venues/:tempVenueId/notes
 * Get all notes for a venue (optionally filter by type)
 */
export const getVenueNotes = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId } = req.params;
    const { noteType } = req.query;

    const venue = await AgentVenueTemp.findOne({ tempVenueId })
      .select('tempVenueId name notes')
      .populate('notes.createdBy', 'name email');

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    let notes = venue.notes || [];

    // Filter by noteType if provided
    if (noteType) {
      notes = notes.filter(note => note.noteType === noteType);
    }

    // Sort by createdAt descending (newest first)
    notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({
      success: true,
      data: {
        tempVenueId: venue.tempVenueId,
        venueName: venue.name,
        notes,
        count: notes.length
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching notes:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch notes',
      error: error.message
    });
  }
};

/**
 * PUT /api/agent/venues/:tempVenueId/notes/:noteId
 * Update a note
 */
export const updateVenueNote = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId, noteId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'content is required'
      });
    }

    const venue = await AgentVenueTemp.findOne({ tempVenueId });

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    const note = venue.notes?.find(n => n.noteId === noteId);

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    // Check permission (only creator or admin can edit)
    if (req.user.role === 'AGENT' && note.createdBy.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own notes'
      });
    }

    note.content = content.trim();
    note.updatedAt = new Date();

    await venue.save();

    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'NOTE_UPDATED',
      meta: {
        tempVenueId,
        noteId,
        noteType: note.noteType
      }
    });

    console.log(`✅ Note updated: ${noteId}`);

    return res.json({
      success: true,
      message: 'Note updated successfully',
      data: note
    });

  } catch (error: any) {
    console.error('❌ Error updating note:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update note',
      error: error.message
    });
  }
};

/**
 * DELETE /api/agent/venues/:tempVenueId/notes/:noteId
 * Delete a note
 */
export const deleteVenueNote = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId, noteId } = req.params;

    const venue = await AgentVenueTemp.findOne({ tempVenueId });

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    const noteIndex = venue.notes?.findIndex(n => n.noteId === noteId);

    if (noteIndex === undefined || noteIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    const note = venue.notes![noteIndex];

    // Check permission (only creator or admin can delete)
    if (req.user.role === 'AGENT' && note.createdBy.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own notes'
      });
    }

    venue.notes!.splice(noteIndex, 1);

    await venue.save();

    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'NOTE_DELETED',
      meta: {
        tempVenueId,
        noteId,
        noteType: note.noteType
      }
    });

    console.log(`✅ Note deleted: ${noteId}`);

    return res.json({
      success: true,
      message: 'Note deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting note:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete note',
      error: error.message
    });
  }
};


/**
 * PUT /api/agent/venues/:tempVenueId/info - Update venue information
 */
export const updateVenueInfo = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId } = req.params;
    const {
      name,
      phone,
      website,
      parkingoptions,
      venuegroup,
      category,
      type,
      hours,
      openinghours,
      address,
      agentNotes  // NEW: Accept agent notes
    } = req.body;

    console.log(`🔄 Updating venue info for ${tempVenueId}`);

    // Find venue
    const venue = await AgentVenueTemp.findOne({ tempVenueId });
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    // Check if agent has permission (only assigned agent or admin)
    if (req.user.role === 'AGENT' && venue.assignedTo?.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update venues assigned to you'
      });
    }

    // Prepare update data
    const updateData: any = {};

    // Basic info
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (website !== undefined) updateData.socials = { 
      ...venue.socials, 
      website: website.trim() 
    };

    // Category and Type - handle both string and array formats
    if (category !== undefined) {
      updateData.category = typeof category === 'string' 
        ? category.split(',').map((c: string) => c.trim()).filter(Boolean)
        : category;
    }

    if (type !== undefined) {
      // Store type as string in the document
      updateData.type = typeof type === 'string'
        ? type.trim()
        : Array.isArray(type) ? type.join(', ') : type;
    }

    // Hours - support both 'hours' and 'openinghours'
    const finalHours = hours || openinghours;
    if (finalHours !== undefined) {
      updateData.hours = finalHours.trim();
    }

    // Parking options (stored as custom field)
    if (parkingoptions !== undefined) {
      updateData.parkingOptions = parkingoptions.trim();
    }

    // Venue group (stored as custom field)
    if (venuegroup !== undefined) {
      updateData.venueGroup = venuegroup.trim();
    }

    // NEW: Agent Notes (unlimited text)
    if (agentNotes !== undefined) {
      updateData.agentNotes = agentNotes.trim();
    }

    // Address update
    if (address) {
      updateData.address = {
        lat: address.lat !== undefined ? address.lat : venue.address.lat,
        lng: address.lng !== undefined ? address.lng : venue.address.lng,
        raw: address.raw?.trim() || venue.address.raw,
        street: address.street?.trim() || venue.address.street,
        city: address.city?.trim() || venue.address.city,
        district: address.district?.trim() || venue.address.district,
        postalCode: address.postalCode?.trim() || venue.address.postalCode,
        state: address.state?.trim() || venue.address.state,
        country: address.country?.trim() || venue.address.country,
        countryCode: address.countryCode || venue.address.countryCode
      };
    }

    // Update venue
    const updatedVenue = await AgentVenueTemp.findOneAndUpdate(
      { tempVenueId },
      { $set: updateData },
      { new: true }
    );

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_INFO_UPDATED',
      meta: {
        tempVenueId,
        venueName: updateData.name || venue.name,
        updatedFields: Object.keys(updateData),
        hasAgentNotes: !!agentNotes
      }
    });

    console.log(`✅ Venue info updated: ${tempVenueId}`);

    return res.json({
      success: true,
      message: 'Venue information updated successfully',
      data: updatedVenue
    });

  } catch (error: any) {
    console.error('Error updating venue info:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update venue information',
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

// ===== UPDATE PAYMENT METHODS =====
export const updatePaymentMethods = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId } = req.params;
    const { 
      paymentMethods,
      contactlessCardAccepted,
      cashOnly,
      primaryMdrLocalCardsPercent 
    } = req.body;

    if (!paymentMethods || !Array.isArray(paymentMethods)) {
      return res.status(400).json({
        success: false,
        message: 'paymentMethods array is required'
      });
    }

    console.log(`💳 Updating payment methods for venue ${tempVenueId}`);
    console.log('📦 Request body:', { paymentMethods, contactlessCardAccepted, cashOnly, primaryMdrLocalCardsPercent });

    const venue = await AgentVenueTemp.findOne({ tempVenueId });

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    // Check permission
    if (req.user.role === 'AGENT' && venue.assignedTo?.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update venues assigned to you'
      });
    }

    // Build payment types object from array
    const paymentTypesObj: any = {
      cash: paymentMethods.includes('Cash'),
      creditCard: paymentMethods.includes('Card'),
      debitCard: paymentMethods.includes('Card'),
      nfc: contactlessCardAccepted || false,
      applePay: paymentMethods.includes('Apple Pay'),
      googlePay: paymentMethods.includes('Google Pay'),
      upi: paymentMethods.includes('QR_UPI'),
      promptpay: paymentMethods.includes('QR_PromptPay'),
      alipay: paymentMethods.includes('Alipay'),
      wechatPay: paymentMethods.includes('WeChatPay'),
      paynow: paymentMethods.includes('PayNow'),
      paypal: paymentMethods.includes('PayPal'),
      venmo: paymentMethods.includes('Venmo'),
      other: [] // Initialize empty array
    };

    // ✅ FIX: Build paymentData as a complete object, not using dot notation
    const paymentDataObj = {
      cashOnly: cashOnly || false,
      contactlessCardAccepted: contactlessCardAccepted || false,
      primaryMdrLocalCardsPercent: primaryMdrLocalCardsPercent ? parseFloat(primaryMdrLocalCardsPercent) : null,
    };

    // ✅ FIX: Use direct object assignment instead of dot notation
    const updateData: any = {
      paymentTypes: paymentTypesObj,
      paymentTypesConfirmed: true,
      paymentTypesConfirmedAt: new Date(),
      paymentData: paymentDataObj, // ✅ Complete object, not dot notation
      paymentMethodsConfirmed: true, // ✅ NEW: Set this flag as well
      paymentMethodsConfirmedAt: new Date(), // ✅ NEW: Add timestamp
    };

    console.log('📝 Update data being saved:', JSON.stringify(updateData, null, 2));

    // ✅ FIX: Update the venue and explicitly save
    const updatedVenue = await AgentVenueTemp.findOneAndUpdate(
      { tempVenueId },
      { $set: updateData },
      { 
        new: true,
        runValidators: true // ✅ Run schema validators
      }
    );

    if (!updatedVenue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found after update'
      });
    }

    console.log('✅ Venue updated successfully');
    console.log('📊 Updated payment data:', updatedVenue.paymentData);
    console.log('📊 Updated payment types:', updatedVenue.paymentTypes);

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'PAYMENT_METHODS_UPDATED',
      { 
        tempVenueId, 
        paymentMethods, 
        contactlessCardAccepted, 
        cashOnly,
        primaryMdrLocalCardsPercent 
      },
      venue.venueId?.toString(),
      req
    );

    console.log(`✅ Payment methods updated for venue ${tempVenueId}`);

    return res.json({
      success: true,
      message: 'Payment methods updated successfully',
      data: updatedVenue
    });

  } catch (error: any) {
    console.error('❌ Error updating payment methods:', error);
    console.error('Stack trace:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to update payment methods',
      error: error.message
    });
  }
};

// ===== GET PAYMENT METHODS =====
export const getPaymentMethods = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId } = req.params;

    console.log(`🔍 Fetching payment methods for venue ${tempVenueId}`);

    const venue = await AgentVenueTemp.findOne({ tempVenueId })
      .select('tempVenueId name paymentTypes paymentTypesConfirmed paymentTypesConfirmedAt paymentData paymentMethodsConfirmed paymentMethodsConfirmedAt');

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    console.log('📊 Retrieved payment data from DB:', {
      paymentTypes: venue.paymentTypes,
      paymentData: venue.paymentData,
      paymentTypesConfirmed: venue.paymentTypesConfirmed,
      paymentMethodsConfirmed: venue.paymentMethodsConfirmed
    });

    return res.json({
      success: true,
      data: {
        tempVenueId: venue.tempVenueId,
        name: venue.name,
        paymentTypes: venue.paymentTypes || {},
        confirmed: venue.paymentTypesConfirmed || false,
        confirmedAt: venue.paymentTypesConfirmedAt,
        paymentData: venue.paymentData || {},
        paymentMethodsConfirmed: venue.paymentMethodsConfirmed || false, // ✅ NEW
        paymentMethodsConfirmedAt: venue.paymentMethodsConfirmedAt // ✅ NEW
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching payment methods:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods',
      error: error.message
    });
  }
};

// ===== ADD CARD MACHINE =====
export const addCardMachineModel = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const {
      brandProvider,
      contactlessEnabled,
      supportedNetworks,
      mdrLocalCardsPercent,
      mdrDebitPercent,
      mdrCreditPercent,
      mdrInternationalPercent,
      notes,
      monthlyRental,
      machinePhotoUrl
    } = req.body;

    console.log(`💳 Adding card machine for venue: ${venueId}`);

    if (!brandProvider) {
      return res.status(400).json({
        success: false,
        message: 'brandProvider is required'
      });
    }

    const isTempVenue = venueId.startsWith('TEMP-');

    const machineData: any = {
      machineId: uuidv4(),
      brandProvider,
      contactlessEnabled: contactlessEnabled || false,
      supportedNetworks: supportedNetworks || [],
      mdrLocalCardsPercent,
      mdrDebitPercent,
      mdrCreditPercent,
      mdrInternationalPercent,
      notes,
      monthlyRental,
      machinePhotoUrl,
      createdBy: req.user.userId,
      isActive: true,
    };

    if (isTempVenue) {
      machineData.tempVenueId = venueId;
    } else {
      machineData.venueId = venueId;
    }

    // ✅ FIX: Rename variable to avoid conflict with imported model
    const newCardMachine = new CardMachineModel(machineData);
    await newCardMachine.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.card_machine.added',
      { machineId: newCardMachine.machineId, brandProvider, venueId, isTempVenue },
      isTempVenue ? undefined : venueId,
      req
    );

    console.log(`✅ Card machine added: ${newCardMachine.machineId}`);

    return res.status(201).json({
      success: true,
      data: newCardMachine,
      message: 'Card machine added successfully',
    });
  } catch (error: any) {
    console.error('❌ Error adding card machine:', error);
    return res.status(500).json({
      success: false,
      message: 'Error adding card machine',
      error: error.message,
    });
  }
};

// ===== GET CARD MACHINES =====
export const getCardMachineModels = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;

    console.log(`🔍 Fetching card machines for venue: ${venueId}`);

    const isTempVenue = venueId.startsWith('TEMP-');

    const query: any = { isActive: true };
    if (isTempVenue) {
      query.tempVenueId = venueId;
    } else {
      query.venueId = venueId;
    }

    // ✅ FIX: Use imported model directly
    const cardMachines = await CardMachineModel.find(query).sort({ createdAt: -1 });

    console.log(`✅ Found ${cardMachines.length} card machines for venue ${venueId}`);

    return res.json({
      success: true,
      data: cardMachines,
      count: cardMachines.length,
    });
  } catch (error: any) {
    console.error('❌ Error fetching card machines:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching card machines',
      error: error.message,
    });
  }
};

// ===== DELETE CARD MACHINE =====
export const deleteCardMachineModel = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId, machineId } = req.params;

    console.log(`🗑️ Deleting card machine ${machineId} from venue ${venueId}`);

    const isTempVenue = venueId.startsWith('TEMP-');

    const query: any = { machineId, isActive: true };
    if (isTempVenue) {
      query.tempVenueId = venueId;
    } else {
      query.venueId = venueId;
    }

    // ✅ FIX: Rename variable to avoid conflict
    const cardMachine = await CardMachineModel.findOneAndUpdate(
      query,
      { isActive: false },
      { new: true }
    );

    if (!cardMachine) {
      return res.status(404).json({ message: 'Card machine not found' });
    }

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.card_machine.deleted',
      { machineId, venueId, isTempVenue },
      isTempVenue ? undefined : venueId,
      req
    );

    console.log(`✅ Card machine deleted: ${machineId}`);

    return res.json({
      success: true,
      message: 'Card machine deleted successfully',
    });
  } catch (error: any) {
    console.error('❌ Error deleting card machine:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting card machine',
      error: error.message,
    });
  }
};

// ===== ADD UPI/QR PAYMENT =====
export const addUpiQrModel = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const {
      paymentScheme,
      qrRawPayload,
      upiVpa,
      upiPayeeName,
      upiMerchantCode,
      accountType,
      ownerClaimName,
      zoneId,
      isPrimary,
      qrPhotoUrl,
      qrImageHash
    } = req.body;

    console.log(`💳 Adding UPI/QR payment for venue: ${venueId}`);

    if (!qrRawPayload || !qrPhotoUrl || !accountType) {
      return res.status(400).json({
        success: false,
        message: 'qrRawPayload, qrPhotoUrl, and accountType are required'
      });
    }

    const isTempVenue = venueId.startsWith('TEMP-');

    const qrData: any = {
      qrId: uuidv4(),
      paymentScheme: paymentScheme || 'UPI',
      qrRawPayload,
      upiVpa,
      upiPayeeName,
      upiMerchantCode,
      accountType,
      ownerClaimName,
      zoneId,
      isPrimary: isPrimary || false,
      qrPhotoUrl,
      qrImageHash,
      createdBy: req.user.userId,
      isActive: true,
    };

    if (isTempVenue) {
      qrData.tempVenueId = venueId;
    } else {
      qrData.venueId = venueId;
    }

    // ✅ FIX: Rename variable to avoid conflict with imported model
    const newUpiQr = new UpiQrModel(qrData);
    await newUpiQr.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.upi_qr.added',
      { qrId: newUpiQr.qrId, paymentScheme, venueId, isTempVenue, accountType },
      isTempVenue ? undefined : venueId,
      req
    );

    console.log(`✅ UPI/QR payment added: ${newUpiQr.qrId}`);

    return res.status(201).json({
      success: true,
      data: newUpiQr,
      message: 'UPI/QR payment added successfully',
    });
  } catch (error: any) {
    console.error('❌ Error adding UPI/QR payment:', error);
    return res.status(500).json({
      success: false,
      message: 'Error adding UPI/QR payment',
      error: error.message,
    });
  }
};

// ===== GET UPI/QR PAYMENTS =====
export const getUpiQrModels = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;

    console.log(`🔍 Fetching UPI/QR payments for venue: ${venueId}`);

    const isTempVenue = venueId.startsWith('TEMP-');

    const query: any = { isActive: true };
    if (isTempVenue) {
      query.tempVenueId = venueId;
    } else {
      query.venueId = venueId;
    }

    // ✅ FIX: Use imported model directly
    const upiQrs = await UpiQrModel.find(query).sort({ isPrimary: -1, createdAt: -1 });

    console.log(`✅ Found ${upiQrs.length} UPI/QR payments for venue ${venueId}`);

    return res.json({
      success: true,
      data: upiQrs,
      count: upiQrs.length,
    });
  } catch (error: any) {
    console.error('❌ Error fetching UPI/QR payments:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching UPI/QR payments',
      error: error.message,
    });
  }
};

// ===== DELETE UPI/QR PAYMENT =====
export const deleteUpiQrModel = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId, qrId } = req.params;

    console.log(`🗑️ Deleting UPI/QR payment ${qrId} from venue ${venueId}`);

    const isTempVenue = venueId.startsWith('TEMP-');

    const query: any = { qrId, isActive: true };
    if (isTempVenue) {
      query.tempVenueId = venueId;
    } else {
      query.venueId = venueId;
    }

    // ✅ FIX: Rename variable to avoid conflict
    const upiQr = await UpiQrModel.findOneAndUpdate(
      query,
      { isActive: false },
      { new: true }
    );

    if (!upiQr) {
      return res.status(404).json({ message: 'UPI/QR payment not found' });
    }

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.upi_qr.deleted',
      { qrId, venueId, isTempVenue },
      isTempVenue ? undefined : venueId,
      req
    );

    console.log(`✅ UPI/QR payment deleted: ${qrId}`);

    return res.json({
      success: true,
      message: 'UPI/QR payment deleted successfully',
    });
  } catch (error: any) {
    console.error('❌ Error deleting UPI/QR payment:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting UPI/QR payment',
      error: error.message,
    });
  }
};

// ===== PARSE QR CODE =====
export const parseQrCode = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { qrRawPayload } = req.body;

    if (!qrRawPayload) {
      return res.status(400).json({
        success: false,
        message: 'qrRawPayload is required'
      });
    }

    console.log(`🔍 Parsing QR code payload`);

    let parsedData: any = {
      scheme: 'UNKNOWN',
      raw: qrRawPayload
    };

    // Check if UPI
    if (qrRawPayload.startsWith('upi://pay')) {
      try {
        const url = new URL(qrRawPayload);
        const params = url.searchParams;

        parsedData = {
          scheme: 'UPI',
          vpa: params.get('pa'),
          payeeName: params.get('pn'),
          amount: params.get('am'),
          currency: params.get('cu') || 'INR',
          note: params.get('tn'),
          txnId: params.get('tid'),
          merchantCode: params.get('mc'),
          raw: qrRawPayload
        };
      } catch (error) {
        console.error('Error parsing UPI QR:', error);
      }
    }
    // Check if EMVCo (PromptPay, etc.)
    else if (/^[0-9]+$/.test(qrRawPayload)) {
      // Simple EMVCo parser
      parsedData = {
        scheme: 'EMVCO',
        raw: qrRawPayload,
        note: 'Use dedicated EMVCo parser for full details'
      };
    }

    console.log(`✅ QR code parsed:`, parsedData);

    return res.json({
      success: true,
      data: parsedData
    });

  } catch (error: any) {
    console.error('❌ Error parsing QR code:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to parse QR code',
      error: error.message
    });
  }
};

// ✅ CREATE ZONE - WITH PHOTO REQUIREMENT
export const createZone = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const {
      name,
      capacityMin,
      capacityMax,
      numTables,
      numSeats,
      numChargingPorts,
      isIndoor,
      isOutdoor,
      climateControl,
      noiseLevel,
      view,
      description,
      zonePhotoUrl,
      zonePhotoS3Key,
      // ✅ NEW: Seating and lighting fields
      seatingType,
      seatingComfort,
      lightingType,
      lightingBrightness,
    } = req.body;

    console.log(`🏗️ Creating zone "${name}" for venue ${venueId}`);

    // VALIDATE PHOTO IS PROVIDED
    if (!zonePhotoUrl || !zonePhotoS3Key) {
      return res.status(400).json({
        success: false,
        message: 'Zone photo is required. Please capture a photo of the zone.',
      });
    }

    // Validate zone name length
    if (name.length > 18) {
      return res
        .status(400)
        .json({ message: 'Zone name must be 18 characters or less' });
    }

    const isTempVenue = venueId.startsWith('TEMP-');

    const zoneData: any = {
      zoneId: uuidv4(),
      name,
      capacityMin,
      capacityMax,
      numTables,
      numSeats,
      numChargingPorts,
      isIndoor: isIndoor || false,
      isOutdoor: isOutdoor || false,
      climateControl: climateControl || 'none',
      noiseLevel,
      view,
      description: description?.trim(),
      // ✅ NEW: Include seating and lighting data
      seatingType,
      seatingComfort,
      lightingType,
      lightingBrightness,
      zonePhotoUrl,
      zonePhotoS3Key,
      zonePhotoUploadedAt: new Date(),
      colorToken: generateColorToken(),
      createdBy: req.user.userId,
      isActive: true,
    };

    if (isTempVenue) {
      zoneData.tempVenueId = venueId;
    } else {
      zoneData.venueId = venueId;
    }

    const zone = new Zone(zoneData);
    await zone.save();

    if (isTempVenue) {
      await AgentVenueTemp.findOneAndUpdate(
        { tempVenueId: venueId },
        { $set: { zonesCreated: true } }
      );
      console.log(`✅ Updated venue ${venueId} - zonesCreated: true`);
    }

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.zone.defined',
      { 
        zoneId: zone.zoneId, 
        name, 
        venueId, 
        isTempVenue, 
        hasPhoto: true,
        seatingType,
        lightingType,
      },
      isTempVenue ? undefined : venueId,
      req
    );

    console.log(`✅ Zone created: ${zone.zoneId} with photo`);

    return res.status(201).json({
      success: true,
      data: zone,
      message: 'Zone created successfully with photo',
    });
  } catch (error: any) {
    console.error('❌ Error creating zone:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating zone',
      error: error.message,
    });
  }
};

export const updateZone = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId, zoneId } = req.params;
    const {
      name,
      capacityMin,
      capacityMax,
      numTables,
      numSeats,
      numChargingPorts,
      isIndoor,
      isOutdoor,
      climateControl,
      noiseLevel,
      view,
      description,
      zonePhotoUrl,
      zonePhotoS3Key,
      // ✅ NEW: Seating and lighting fields
      seatingType,
      seatingComfort,
      lightingType,
      lightingBrightness,
    } = req.body;

    console.log(`✏️ Updating zone ${zoneId} for venue ${venueId}`);

    // Validate zone name length if provided
    if (name && name.length > 18) {
      return res
        .status(400)
        .json({ message: 'Zone name must be 18 characters or less' });
    }

    const isTempVenue = venueId.startsWith('TEMP-');

    // Build query
    const query: any = { zoneId, isActive: true };
    if (isTempVenue) {
      query.tempVenueId = venueId;
    } else {
      query.venueId = venueId;
    }

    // Find existing zone
    const existingZone = await Zone.findOne(query);
    if (!existingZone) {
      return res.status(404).json({ message: 'Zone not found' });
    }

    // Build update data
    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (capacityMin !== undefined) updateData.capacityMin = capacityMin;
    if (capacityMax !== undefined) updateData.capacityMax = capacityMax;
    if (numTables !== undefined) updateData.numTables = numTables;
    if (numSeats !== undefined) updateData.numSeats = numSeats;
    if (numChargingPorts !== undefined) updateData.numChargingPorts = numChargingPorts;
    if (isIndoor !== undefined) updateData.isIndoor = isIndoor;
    if (isOutdoor !== undefined) updateData.isOutdoor = isOutdoor;
    if (climateControl !== undefined) updateData.climateControl = climateControl;
    if (noiseLevel !== undefined) updateData.noiseLevel = noiseLevel;
    if (view !== undefined) updateData.view = view;
    if (description !== undefined) updateData.description = description?.trim();
    
    // ✅ NEW: Update seating and lighting fields
    if (seatingType !== undefined) updateData.seatingType = seatingType;
    if (seatingComfort !== undefined) updateData.seatingComfort = seatingComfort;
    if (lightingType !== undefined) updateData.lightingType = lightingType;
    if (lightingBrightness !== undefined) updateData.lightingBrightness = lightingBrightness;

    // Update photo if provided
    if (zonePhotoUrl && zonePhotoS3Key) {
      // Delete old photo from S3 if exists
      if (existingZone.zonePhotoS3Key) {
        await deleteFileFromS3(existingZone.zonePhotoS3Key);
        console.log(`🗑️ Deleted old zone photo: ${existingZone.zonePhotoS3Key}`);
      }
      updateData.zonePhotoUrl = zonePhotoUrl;
      updateData.zonePhotoS3Key = zonePhotoS3Key;
      updateData.zonePhotoUploadedAt = new Date();
    }

    // Update zone
    const updatedZone = await Zone.findOneAndUpdate(
      query,
      { $set: updateData },
      { new: true }
    );

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.zone.updated',
      {
        zoneId,
        venueId,
        isTempVenue,
        updatedFields: Object.keys(updateData),
        name: updatedZone?.name,
        photoUpdated: !!(zonePhotoUrl && zonePhotoS3Key),
      },
      isTempVenue ? undefined : venueId,
      req
    );

    console.log(`✅ Zone updated: ${zoneId}`);

    return res.json({
      success: true,
      data: updatedZone,
      message: 'Zone updated successfully',
    });
  } catch (error: any) {
    console.error('❌ Error updating zone:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating zone',
      error: error.message,
    });
  }
};

// ✅ DELETE ZONE - CLEANUP PHOTO FROM S3
export const deleteZone = async (req: AgentRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !["AGENT", "ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const { venueId, zoneId } = req.params;

    console.log(`🗑️ Deleting zone ${zoneId} from venue ${venueId}`);

    const isTempVenue = venueId.startsWith("TEMP-");

    const query: any = { zoneId, isActive: true };
    if (isTempVenue) {
      query.tempVenueId = venueId;
    } else {
      query.venueId = venueId;
    }

    // Find zone first to get photo S3 key
    const zone = await Zone.findOne(query);
    if (!zone) {
      return res.status(404).json({ message: "Zone not found" });
    }

    // ✅ Delete photo from S3 if exists
    if (zone.zonePhotoS3Key) {
      await deleteFileFromS3(zone.zonePhotoS3Key);
      console.log(`🗑️ Deleted zone photo from S3: ${zone.zonePhotoS3Key}`);
    }

    // Soft delete zone
    await Zone.findOneAndUpdate(
      query,
      { $set: { isActive: false } },
      { new: true }
    );

    // Check if there are any remaining active zones
    if (isTempVenue) {
      const remainingZonesCount = await Zone.countDocuments({
        tempVenueId: venueId,
        isActive: true,
      });

      if (remainingZonesCount === 0) {
        await AgentVenueTemp.findOneAndUpdate(
          { tempVenueId: venueId },
          { $set: { zonesCreated: false } }
        );
        console.log(`✅ Updated venue ${venueId} - zonesCreated: false (no zones remaining)`);
      }
    }

    await createAuditLog(
      req.user.userId,
      req.user.role,
      "agent.zone.deleted",
      {
        zoneId,
        venueId,
        isTempVenue,
        photoDeleted: !!zone.zonePhotoS3Key,
      },
      isTempVenue ? undefined : venueId,
      req
    );

    console.log(`✅ Zone deleted: ${zoneId}`);

    return res.json({
      success: true,
      message: "Zone deleted successfully",
    });
  } catch (error: any) {
    console.error("❌ Error deleting zone:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting zone",
      error: error.message,
    });
  }
};


// GET VENUE ZONES
export const getVenueZones = async (
  req: AgentRequest,
  res: Response
): Promise<Response> => {
  try {
    if (!req.user || !["AGENT", "ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const { venueId } = req.params;

    console.log(`🔍 Fetching zones for venue: ${venueId}`);

    // ✅ Determine if it's a temp venue or real venue
    const isTempVenue = venueId.startsWith("TEMP-");

    const query: any = { isActive: true };
    if (isTempVenue) {
      query.tempVenueId = venueId;
    } else {
      query.venueId = venueId;
    }

    const zones = await Zone.find(query).sort({ createdAt: 1 });

    console.log(`✅ Found ${zones.length} zones for venue ${venueId}`);

    return res.json({
      success: true,
      data: zones,
      count: zones.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching zones:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching zones",
      error: error.message,
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

/**
 * POST /api/agent/venues/onboard-from-google
 * Onboard venue from Google Places API data
 */
// ONBOARD VENUE FROM GOOGLE - AUTO-LINK TO CRM
export const onboardFromGoogle = async (
  req: AgentRequest,
  res: Response
): Promise<Response> => {
  try {
    if (!req.user || !["AGENT", "ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const region = (req.region || "ae") as Region;
    
    // ✅ FIX: Handle both object and string body
    let googlePlaceDetails = req.body;
    
    console.log('🔍 Backend received body:', {
      bodyType: typeof req.body,
      isString: typeof req.body === 'string',
      hasGooglePlaceDetails: 'googlePlaceDetails' in req.body,
      bodyKeys: typeof req.body === 'object' ? Object.keys(req.body) : 'N/A'
    });
    
    // ✅ If body is wrapped in { googlePlaceDetails: {...} }, unwrap it
    if (req.body && typeof req.body === 'object' && 'googlePlaceDetails' in req.body) {
      googlePlaceDetails = req.body.googlePlaceDetails;
      console.log('✅ Unwrapped googlePlaceDetails from req.body');
    }
    
    // ✅ If body is a string, parse it
    if (typeof googlePlaceDetails === 'string') {
      try {
        googlePlaceDetails = JSON.parse(googlePlaceDetails);
        console.log('✅ Parsed string body to object');
      } catch (parseError) {
        console.error('❌ Failed to parse body:', parseError);
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid JSON format in request body' 
        });
      }
    }

    // ✅ Validate googlePlaceDetails exists and is an object
    if (!googlePlaceDetails || typeof googlePlaceDetails !== 'object') {
      console.error('❌ googlePlaceDetails validation failed:', {
        exists: !!googlePlaceDetails,
        type: typeof googlePlaceDetails
      });
      return res.status(400).json({
        success: false,
        message: "Google Place details are required",
      });
    }

    // Extract all necessary fields from Google Place
    const {
      googlePlaceId,
      name,
      latitude,
      longitude,
      formattedAddress,
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
      priceRange,
      displayPrice,
      paymentOptions,
      accessibilityOptions,
      parkingOptions,
      atmosphereFlags,
      photoReference,
      allPhotos,
    } = googlePlaceDetails;

    // ✅ Validate required fields
    if (!googlePlaceId || !name) {
      console.error('❌ Missing required fields:', { 
        googlePlaceId, 
        name,
        allFieldsReceived: Object.keys(googlePlaceDetails)
      });
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: googlePlaceId and name are required' 
      });
    }

    console.log('✅ Validation passed:', { 
      googlePlaceId, 
      name,
      latitude,
      longitude 
    });

    // Generate temp venue ID
    const tempVenueId = `TEMP-${uuidv4().substring(0, 8).toUpperCase()}`;

    // Price level normalization
    const convertPriceLevel = (priceLevel: any): number | undefined => {
      if (priceLevel === undefined || priceLevel === null) return undefined;
      if (typeof priceLevel === "number") {
        return priceLevel >= 0 && priceLevel <= 4 ? priceLevel : undefined;
      }
      if (typeof priceLevel === "string") {
        const parsed = parseInt(priceLevel, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 4) {
          return parsed;
        }
        const priceMap: { [key: string]: number } = {
          FREE: 0,
          INEXPENSIVE: 1,
          MODERATE: 2,
          EXPENSIVE: 3,
          VERY_EXPENSIVE: 4,
          CHEAP: 1,
          MEDIUM: 2,
          COSTLY: 3,
          LUXURY: 4,
        };
        const upperLevel = priceLevel.toUpperCase();
        return priceMap[upperLevel];
      }
      return undefined;
    };

    const normalizedPriceLevel = convertPriceLevel(priceLevel);
    const getPriceLevelDisplay = (level: number | undefined): string => {
      if (level === undefined || level === null) return "";
      const symbols = ["", "$", "$$", "$$$", "$$$$"];
      return symbols[level];
    };
    const priceLevelDisplay = getPriceLevelDisplay(normalizedPriceLevel);

    // ✅ STEP 1: Create temp venue
    const tempVenue = new AgentVenueTemp({
      tempVenueId,
      createdBy: req.user.userId,
      name,
      category: allTypes || [primaryType || ""],
      address: {
        lat: latitude || 0,
        lng: longitude || 0,
        raw: formattedAddress || "",
        street: street || undefined,
        city: city || undefined,
        district: district || undefined,
        postalCode: postalCode || undefined,
        state: state || undefined,
        country: country || undefined,
        countryCode: countryCode || undefined,
      },
      phone: phoneInternational || undefined,
      socials: {
        website: website || undefined,
      },
      hours: regularOpeningHours || undefined,
      status: "temp",
      onboardingStatus: VenueOnboardingStatus.UNLISTED,
      verificationLevel: VerificationLevel.PROSPECT_REMOTE,
      region,
      flags: {
        qrCodesLeftBehind: false,
        ownerMet: false,
        haveOwnersContact: false,
        managerMet: false,
        haveManagersContact: false,
      },
      googleData: {
        placeId: googlePlaceId,
        primaryType: primaryType ?? undefined,
        primaryTypeLabel: primaryTypeLabel ?? undefined,
        allTypes: allTypes ?? undefined,
        googleMapsUrl: googleMapsUrl ?? undefined,
        utcOffsetMinutes: utcOffsetMinutes ?? undefined,
        rating: rating ?? undefined,
        userRatingsCount: userRatingsCount ?? undefined,        
        // ✅ Store as array
        reviews: reviews ?? [],        
        businessStatus: businessStatus ?? undefined,
        editorialSummary: editorialSummary ?? undefined,
        priceLevel: normalizedPriceLevel,
        priceLevelDisplay: priceLevelDisplay ?? undefined,
        priceRange: priceRange ?? undefined,        
        // ✅ Store as object (not string)
        displayPrice: displayPrice ?? undefined,        
        // ✅ Store as objects (not strings)
        paymentOptions: paymentOptions ?? {},
        accessibilityOptions: accessibilityOptions ?? {},
        parkingOptions: parkingOptions ?? {},
        atmosphereFlags: atmosphereFlags ?? {},        
        photoReference: photoReference ?? undefined,        
        // ✅ Store as array (not string)
        allPhotos: allPhotos ?? [],        
        importedAt: new Date(),
        importedBy: req.user.userId,
      },
    });

    await tempVenue.save();

    console.log(`✅ Temp venue created: ${tempVenueId}`);

    // ✅ STEP 2: Auto-link to CRM with auto-create
    console.log(`🔗 Auto-linking ${tempVenueId} to CRM...`);

    const fixedCrmId = "1008473000000765011"; // Fixed Zoho CRM Account ID

    try {
      // Connect to regional database
      await dbManager.connectRegion(region);
      const Venue = getVenueModel(region);

      // Auto-create venue in regional database
      const newVenue = new Venue({
        globalId: tempVenueId,
        AccountName: name,
        name: name,
        geometry: {
          type: "Point",
          coordinates: [longitude || 0, latitude || 0],
        },
        address: {
          lat: latitude || 0,
          lng: longitude || 0,
          raw: formattedAddress || "",
          street: street || undefined,
          city: city || undefined,
          district: district || undefined,
          postalCode: postalCode || undefined,
          state: state || undefined,
          country: country || undefined,
          countryCode: countryCode || undefined,
        },
        Phone: phoneInternational || phoneNational,
        Website: website,
        category: allTypes || [primaryType || ""],
        venuetype: primaryType,
        Hours: regularOpeningHours,
        region: region,
        isActive: true,
        isVerified: false,
        ownerId: req.user.userId
          ? new mongoose.Types.ObjectId(req.user.userId)
          : undefined,
      });

      await newVenue.save();

      console.log(
        `✅ Auto-created venue in regional DB: ${newVenue._id.toString()}`
      );

      // Update temp venue with CRM ID and venue ID
      tempVenue.crmId = fixedCrmId;
      tempVenue.venueId = newVenue._id as mongoose.Types.ObjectId;
      tempVenue.status = "linked";
      tempVenue.onboardingStatus = VenueOnboardingStatus.SOFT_ONBOARDED;

      await tempVenue.save();

      console.log(
        `✅ Auto-linked to CRM: ${tempVenueId} -> ${newVenue._id.toString()}`
      );

      // Create audit log for both actions
      await createAuditLog(
        req.user.userId,
        req.user.role,
        "agent.venue.onboarded.from.google.auto.linked",
        {
          tempVenueId,
          name,
          googlePlaceId,
          region,
          autoCreated: true,
          crmId: fixedCrmId,
          venueId: newVenue._id.toString(),
        },
        newVenue._id.toString(),
        req
      );

      return res.status(201).json({
        success: true,
        data: tempVenue,
        autoLinked: true,
        autoCreated: true,
        message:
          "Venue onboarded from Google and automatically linked to CRM successfully",
      });
    } catch (linkError: any) {
      console.error("❌ Auto-link to CRM failed:", linkError);

      // Even if linking fails, venue is still created
      return res.status(201).json({
        success: true,
        data: tempVenue,
        autoLinked: false,
        autoCreated: false,
        warning: "Venue created but auto-link to CRM failed",
        linkError: linkError.message,
        message:
          "Venue onboarded from Google successfully (manual CRM link required)",
      });
    }
  } catch (error: any) {
    console.error("❌ Error onboarding from Google:", error);
    return res.status(500).json({
      success: false,
      message: "Error onboarding venue",
      error: error.message,
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

/**
 * GET /api/agent/my-assignments
 * Get venues assigned to current agent
 */
export const getMyAssignments = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'AGENT' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { date, status, agentId } = req.query;

    // Allow ADMIN to view another agent's assignments, otherwise use own ID
    const targetAgentId = (req.user.role === 'ADMIN' && typeof agentId === 'string' && agentId)
      ? agentId
      : req.user.userId;

    const filter: any = {
      assignedTo: targetAgentId,
      status: { $ne: 'finalized' }
    };

    if (date && typeof date === 'string') {
      const targetDate = new Date(date);
      if (!isNaN(targetDate.getTime())) {
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);
        filter.expectedVisitDate = { $gte: targetDate, $lt: nextDay };
      }
    }

    if (status && typeof status === 'string' && status !== 'all') {
      filter.visitStatus = status;
    }

    const venues = await AgentVenueTemp.find(filter)
      .select('tempVenueId name category address verificationLevel expectedVisitDate visitStatus vitalsCompleted vitalsData flags googleData visitedAt')
      .sort({ expectedVisitDate: 1 })
      .lean();

    res.json({
      success: true,
      count: venues.length,
      data: venues
    });
  } catch (error: any) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assignments',
      error: error.message
    });
  }
};
/**
 * PUT /api/agent/venues/:tempVenueId/visit
 * Mark venue as visited
 */
export const markVenueVisited = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }
    const { tempVenueId } = req.params;
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Location coordinates required' });
    }
    const venue = await AgentVenueTemp.findOneAndUpdate(
      {
        tempVenueId,
        assignedTo: req.user.userId
      },
      {
        $set: {
          visitStatus: 'visited',
          visitedAt: new Date(),
          verificationLevel: VerificationLevel.VISITED_SIGNIN,
          'gpsAccuracy.newLocation': {
            lat: latitude,
            lng: longitude,
            timestamp: new Date(),
            accuracy: 0
          }
        }
      },
      { new: true }
    );
    if (!venue) {
      return res.status(404).json({ message: 'Venue not found or not assigned to you' });
    }
    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_VISITED',
      meta: { tempVenueId, venueName: venue.name },
      geoLocation: { lat: latitude, lng: longitude }
    });
    res.json({
      success: true,
      message: 'Venue marked as visited',
      data: venue
    });
  } catch (error: any) {
    console.error('Error marking venue visited:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark venue as visited',
      error: error.message
    });
  }
};
/**
 * PUT /api/agent/venues/:tempVenueId/vitals
 * Update venue vitals
 */
export const updateVenueVitals = async (req: AuthRequest, res: Response) => {
  try {
    const { tempVenueId } = req.params;
    const { vitalsData } = req.body;

    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Agent access required' });
    }

    if (!vitalsData) {
      return res.status(400).json({ success: false, message: 'vitalsData is required' });
    }

    const venue = await AgentVenueTemp.findOne({
      tempVenueId,
      assignedTo: req.user.userId
    });

    if (!venue) {
      return res.status(404).json({ 
        success: false, 
        message: 'Venue not found or not assigned to you' 
      });
    }

    if (venue.visitStatus !== 'visited') {
      return res.status(400).json({
        success: false,
        message: 'Venue must be marked as visited before adding vitals'
      });
    }

    // UPDATE: Complete vitals check with ALL fields INCLUDING payment types
    const vitalsCompleted =
      vitalsData.nameConfirmed &&
      vitalsData.categoryConfirmed &&
      vitalsData.locationConfirmed &&
      vitalsData.addressConfirmed &&
      vitalsData.hoursConfirmed &&
      vitalsData.accountNameConfirmed &&
      vitalsData.billingCityConfirmed &&
      vitalsData.billingDistrictConfirmed &&
      vitalsData.billingStreetConfirmed &&
      vitalsData.billingStateConfirmed &&
      vitalsData.phoneConfirmed &&
      vitalsData.websiteConfirmed &&
      vitalsData.parkingOptionsConfirmed &&
      vitalsData.venueGroupConfirmed &&
      vitalsData.venueCategoryConfirmed &&
      vitalsData.venueTypeConfirmed &&
      vitalsData.openingHoursConfirmed &&
      vitalsData.paymentTypesConfirmed;  // NEW: Include payment types in completion check

    const updateData: any = {
      vitalsData,
      vitalsCompleted
    };

    if (vitalsCompleted) {
      updateData.vitalsCompletedAt = new Date();
      updateData.verificationLevel = VerificationLevel.VITALS_DONE;
    }

    const updatedVenue = await AgentVenueTemp.findOneAndUpdate(
      { tempVenueId },
      { $set: updateData },
      { new: true }
    );

    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_VITALS_UPDATED',
      meta: {
        tempVenueId,
        vitalsCompleted,
        verificationLevel: vitalsCompleted ? VerificationLevel.VITALS_DONE : VerificationLevel.VISITED_SIGNIN
      }
    });

    return res.json({
      success: true,
      message: vitalsCompleted ? 'Venue vitals completed' : 'Venue vitals updated',
      data: updatedVenue
    });
  } catch (error: any) {
    console.error('Error updating venue vitals:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update venue vitals',
      error: error.message
    });
  }
};

/**
 * POST /api/agent/venues/:tempVenueId/soft-onboard
 * Soft onboard venue (vitals + contacts but no QR)
 */
export const softOnboardVenue = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }
    const { tempVenueId } = req.params;
    const { managerContact, ownerContact, flags } = req.body;
    const venue = await AgentVenueTemp.findOne({
      tempVenueId,
      assignedTo: req.user.userId
    });
    if (!venue) {
      return res.status(404).json({ message: 'Venue not found or not assigned to you' });
    }
    if (!venue.vitalsCompleted) {
      return res.status(400).json({
        message: 'Vitals must be completed before soft onboarding'
      });
    }
    const updateData: any = {
      verificationLevel: VerificationLevel.SOFT_ONBOARD
    };
    if (managerContact) {
      updateData.managerContact = managerContact;
      updateData['flags.managerMet'] = true;
      updateData['flags.haveManagersContact'] = true;
    }
    if (ownerContact) {
      updateData.ownerContact = ownerContact;
      updateData['flags.ownerMet'] = true;
      updateData['flags.haveOwnersContact'] = true;
    }
    if (flags) {
      Object.keys(flags).forEach(key => {
        updateData[`flags.${key}`] = flags[key];
      });
    }
    const updatedVenue = await AgentVenueTemp.findOneAndUpdate(
      { tempVenueId },
      { $set: updateData },
      { new: true }
    );
    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_SOFT_ONBOARDED',
      meta: { tempVenueId, venueName: venue.name }
    });
    res.json({
      success: true,
      message: 'Venue soft onboarded successfully',
      data: updatedVenue
    });
  } catch (error: any) {
    console.error('Error soft onboarding venue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to soft onboard venue',
      error: error.message
    });
  }
};
/**
 * POST /api/agent/venues/:tempVenueId/decline
 * Mark venue as declined/not interested
 */
export const declineVenue = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }
    const { tempVenueId } = req.params;
    const { reason } = req.body;
    const venue = await AgentVenueTemp.findOneAndUpdate(
      { 
        tempVenueId,
        assignedTo: req.user.userId
      },
      {
        $set: {
          verificationLevel: VerificationLevel.VISITED_DECLINED,
          visitStatus: 'visited',
          visitedAt: new Date(),
          declineReason: reason
        }
      },
      { new: true }
    );
    if (!venue) {
      return res.status(404).json({ message: 'Venue not found or not assigned to you' });
    }
    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_DECLINED',
      meta: { tempVenueId, venueName: venue.name, reason }
    });
    res.json({
      success: true,
      message: 'Venue marked as declined',
      data: venue
    });
  } catch (error: any) {
    console.error('Error declining venue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to decline venue',
      error: error.message
    });
  }
};
/**
 * POST /api/agent/venues/:tempVenueId/capture-lead
 * Capture lead for interested later
 */
export const captureLeadVenue = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }
    const { tempVenueId } = req.params;
    const { contactName, contactPhone, contactWhatsapp, contactLine, notes } = req.body;
    const venue = await AgentVenueTemp.findOneAndUpdate(
      { 
        tempVenueId,
        assignedTo: req.user.userId
      },
      {
        $set: {
          verificationLevel: VerificationLevel.LEAD_CAPTURED,
          leadContact: {
            name: contactName,
            phone: contactPhone,
            whatsapp: contactWhatsapp,
            line: contactLine,
            notes
          },
          leadCapturedAt: new Date(),
          leadCapturedBy: req.user.userId
        }
      },
      { new: true }
    );
    if (!venue) {
      return res.status(404).json({ message: 'Venue not found or not assigned to you' });
    }
    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_LEAD_CAPTURED',
      meta: { tempVenueId, venueName: venue.name, contactName }
    });
    res.json({
      success: true,
      message: 'Lead captured successfully',
      data: venue
    });
  } catch (error: any) {
    console.error('Error capturing lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to capture lead',
      error: error.message
    });
  }
};
/**
 * GET /api/agent/my-stats
 * Get agent's personal statistics
 */
export const getMyStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today);
    thisMonth.setMonth(thisMonth.getMonth() - 1);
    const [
      totalAssigned,
      visited,
      vitalsComplete,
      softOnboarded,
      fullyVerified,
      visitedToday,
      visitedThisWeek,
      visitedThisMonth,
      pendingToday,
      pendingTomorrow
    ] = await Promise.all([
      AgentVenueTemp.countDocuments({ assignedTo: req.user.userId }),
      AgentVenueTemp.countDocuments({ assignedTo: req.user.userId, visitStatus: 'visited' }),
      AgentVenueTemp.countDocuments({ assignedTo: req.user.userId, vitalsCompleted: true }),
      AgentVenueTemp.countDocuments({
        assignedTo: req.user.userId,
        verificationLevel: VerificationLevel.SOFT_ONBOARD
      }),
      AgentVenueTemp.countDocuments({
        assignedTo: req.user.userId,
        verificationLevel: { $in: [VerificationLevel.VERIFIED_FULL, VerificationLevel.VERIFIED_QR_LIVE] }
      }),
      AgentVenueTemp.countDocuments({
        assignedTo: req.user.userId,
        visitedAt: { $gte: today }
      }),
      AgentVenueTemp.countDocuments({
        assignedTo: req.user.userId,
        visitedAt: { $gte: thisWeek }
      }),
      AgentVenueTemp.countDocuments({
        assignedTo: req.user.userId,
        visitedAt: { $gte: thisMonth }
      }),
      AgentVenueTemp.countDocuments({
        assignedTo: req.user.userId,
        expectedVisitDate: { $gte: today, $lt: new Date(today.getTime() + 86400000) },
        visitStatus: 'not_visited'
      }),
      AgentVenueTemp.countDocuments({
        assignedTo: req.user.userId,
        expectedVisitDate: {
          $gte: new Date(today.getTime() + 86400000),
          $lt: new Date(today.getTime() + 172800000)
        },
        visitStatus: 'not_visited'
      })
    ]);
    res.json({
      success: true,
      data: {
        totalAssigned,
        visited,
        vitalsComplete,
        softOnboarded,
        fullyVerified,
        visitedToday,
        visitedThisWeek,
        visitedThisMonth,
        pendingToday,
        pendingTomorrow,
        completionRate: totalAssigned > 0 ? Math.round((vitalsComplete / totalAssigned) * 100) : 0
      }
    });
  } catch (error: any) {
    console.error('Error fetching agent stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: error.message
    });
  }
};

// PUT /api/agent/venues/:tempVenueId/gps - Update GPS location data
export const updateVenueGPS = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId } = req.params;
    const {
      hl_confirmed_lat,
      hl_confirmed_lng,
      hl_gps_accuracy_m,
      hl_gps_distance_m,
      hl_gps_status,
      src_lat,
      src_lng,
      src_provider,
    } = req.body;

    // Validate required fields
    if (!hl_confirmed_lat || !hl_confirmed_lng) {
      return res.status(400).json({ message: 'Confirmed GPS coordinates required' });
    }

    // Find venue
    const venue = await AgentVenueTemp.findOne({
      tempVenueId,
      assignedTo: req.user.userId,
    });

    if (!venue) {
      return res.status(404).json({ message: 'Venue not found or not assigned to you' });
    }

    // Prepare GPS history entry
    const historyEntry = {
      lat: hl_confirmed_lat,
      lng: hl_confirmed_lng,
      source: 'honestlee_agent',
      taken_at: new Date(),
      by_agent: req.user.userId,
      accuracy_m: hl_gps_accuracy_m,
    };

    // Update venue with GPS data
    const updateData: any = {
      'gpsData.hl_confirmed_lat': hl_confirmed_lat,
      'gpsData.hl_confirmed_lng': hl_confirmed_lng,
      'gpsData.hl_gps_accuracy_m': hl_gps_accuracy_m,
      'gpsData.hl_gps_distance_m': hl_gps_distance_m,
      'gpsData.hl_gps_status': hl_gps_status,
      'gpsData.hl_gps_updated_at': new Date(),
      $push: { 'gpsData.hl_gps_history': historyEntry },
    };

    // If this is first GPS reading for new venue, also set source
    if (!venue.gpsData?.src_lat && !venue.gpsData?.src_lng) {
      updateData['gpsData.src_lat'] = hl_confirmed_lat;
      updateData['gpsData.src_lng'] = hl_confirmed_lng;
      updateData['gpsData.src_provider'] = 'honestlee_first';
    } else if (src_lat && src_lng) {
      // Keep existing source data
      updateData['gpsData.src_lat'] = src_lat;
      updateData['gpsData.src_lng'] = src_lng;
      updateData['gpsData.src_provider'] = src_provider;
    }

    // Also update main address coordinates
    updateData['address.lat'] = hl_confirmed_lat;
    updateData['address.lng'] = hl_confirmed_lng;

    const updatedVenue = await AgentVenueTemp.findOneAndUpdate(
      { tempVenueId },
      { $set: updateData },
      { new: true }
    );

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_GPS_UPDATED',
      meta: {
        tempVenueId,
        hl_gps_status,
        accuracy_m: hl_gps_accuracy_m,
        distance_m: hl_gps_distance_m,
      },
    });

    res.json({
      success: true,
      message: 'GPS location updated successfully',
      data: updatedVenue,
    });
  } catch (error: any) {
    console.error('Error updating GPS:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update GPS',
      error: error.message,
    });
  }
};
/**
 * POST /api/agent/venues/:tempVenueId/finalize
 * Finalize venue onboarding
 */
export const finalizeOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }
    const { tempVenueId } = req.params;
    const venue = await AgentVenueTemp.findOne({
      tempVenueId,
      assignedTo: req.user.userId
    });
    if (!venue) {
      return res.status(404).json({ message: 'Venue not found or not assigned to you' });
    }
    if (!venue.vitalsCompleted) {
      return res.status(400).json({
        message: 'Vitals must be completed before finalizing'
      });
    }
    // Check for main QR
    const hasMainQR = await QRBinding.exists({
      venueId: venue.venueId,
      type: QRBindingType.MAIN,
      state: QRBindingState.ACTIVE
    });
    if (!hasMainQR) {
      return res.status(400).json({
        message: 'Main QR must be attached before finalizing'
      });
    }
    venue.verificationLevel = VerificationLevel.VERIFIED_QR_LIVE;
    venue.onboardingStatus = VenueOnboardingStatus.FULLY_VERIFIED;
    venue.status = 'finalized';
    await venue.save();
    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_FINALIZED',
      meta: { tempVenueId, venueName: venue.name }
    });
    res.json({
      success: true,
      message: 'Onboarding finalized successfully',
      data: venue
    });
  } catch (error: any) {
    console.error('Error finalizing onboarding:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to finalize onboarding',
      error: error.message
    });
  }
};

/**
 * PUT /api/agent/venues/:tempVenueId/category-type
 * Update venue category and types (supports multiple categories)
 */
export const updateVenueCategoryType = async (req: AuthRequest, res: Response) => {
  try {
    const { tempVenueId } = req.params;
    const { groupIds, categoryIds, venueTypes } = req.body;
    
    // Validation
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one groupId is required' 
      });
    }
    
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one categoryId is required' 
      });
    }
    
    if (!Array.isArray(venueTypes) || venueTypes.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one venue type is required' 
      });
    }
    
    // Build update payload
    const categoryTypeData = {
      groupIds,
      categoryIds,
      venueTypes
    };
    
    const venue = await AgentVenueTemp.findOneAndUpdate(
      { tempVenueId },
      { 
        $set: { 
          categoryTypeData,
          categoryTypeConfirmed: true,
          categoryTypeConfirmedAt: new Date()
        }
      },
      { new: true }
    );
    
    if (!venue) {
      return res.status(404).json({ 
        success: false, 
        message: 'Venue not found' 
      });
    }
    
    // ✅ FIX: Return the COMPLETE venue object
    res.json({ 
      success: true, 
      message: 'Category/type data updated successfully',
      data: venue  // ✅ Return full venue with all IDs preserved
    });
    
  } catch (error: any) {
    console.error('Error updating category/type:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update category/type', 
      error: error.message 
    });
  }
};

/**
 * GET /api/agent/venues/:tempVenueId/category-type
 * Get category/type data for a venue
 */
export const getVenueCategoryType = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId } = req.params;

    const venue = await AgentVenueTemp.findOne({ tempVenueId })
      .select('tempVenueId name categoryTypeData categoryTypeConfirmed categoryTypeConfirmedAt');

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    return res.json({
      success: true,
      data: {
        tempVenueId: venue.tempVenueId,
        name: venue.name,
        categoryTypeData: venue.categoryTypeData || {},
        confirmed: venue.categoryTypeConfirmed || false,
        confirmedAt: venue.categoryTypeConfirmedAt
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching category/type:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch category/type',
      error: error.message
    });
  }
};

/**
 * PUT /api/agent/venues/:tempVenueId/geofence
 * Save property boundary geofence
 */
export const updateVenueGeofence = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId } = req.params;
    const { 
      geofenceCoordinates, 
      geofenceType = 'property_boundary',
      notes 
    } = req.body;

    if (!geofenceCoordinates || !Array.isArray(geofenceCoordinates)) {
      return res.status(400).json({
        success: false,
        message: 'geofenceCoordinates array is required'
      });
    }

    // Validate coordinates format
    if (geofenceCoordinates.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'At least 3 points required to create a geofence'
      });
    }

    // Validate each coordinate
    for (const coord of geofenceCoordinates) {
      if (!coord.lat || !coord.lng) {
        return res.status(400).json({
          success: false,
          message: 'Each coordinate must have lat and lng'
        });
      }
    }

    console.log(`📍 Updating geofence for venue ${tempVenueId}`);

    const venue = await AgentVenueTemp.findOne({ tempVenueId });

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    // Check permission
    if (req.user.role === 'AGENT' && venue.assignedTo?.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update venues assigned to you'
      });
    }

    // Calculate geofence area (approximate)
    const area = calculatePolygonArea(geofenceCoordinates);

    // Create GeoJSON polygon
    const geofenceGeoJSON = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            ...geofenceCoordinates.map(coord => [coord.lng, coord.lat]),
            [geofenceCoordinates[0].lng, geofenceCoordinates[0].lat] // Close polygon
          ]
        ]
      },
      properties: {
        type: geofenceType,
        area: area,
        createdAt: new Date(),
        createdBy: req.user.userId,
        notes: notes || ''
      }
    };

    // Update venue with geofence data
    const updateData: any = {
      'gpsData.geofence': geofenceGeoJSON,
      'gpsData.geofenceCoordinates': geofenceCoordinates,
      'gpsData.geofenceArea': area,
      'gpsData.geofenceType': geofenceType,
      'gpsData.geofenceCreatedAt': new Date(),
      'gpsData.geofenceCreatedBy': req.user.userId,
      geofenceVerified: true,
      geofenceVerifiedAt: new Date()
    };

    const updatedVenue = await AgentVenueTemp.findOneAndUpdate(
      { tempVenueId },
      { $set: updateData },
      { new: true }
    );

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_GEOFENCE_UPDATED',
      meta: {
        tempVenueId,
        geofenceType,
        area: area.toFixed(2),
        pointCount: geofenceCoordinates.length
      }
    });

    console.log(`✅ Geofence updated for venue ${tempVenueId}, area: ${area.toFixed(2)} sq meters`);

    return res.json({
      success: true,
      message: 'Geofence saved successfully',
      data: updatedVenue
    });

  } catch (error: any) {
    console.error('❌ Error updating geofence:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update geofence',
      error: error.message
    });
  }
};

/**
 * GET /api/agent/venues/:tempVenueId/geofence
 * Get property boundary geofence
 */
// GET /api/agent/venues/:tempVenueId/geofence - Get property boundary geofence
export const getVenueGeofence = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !["AGENT", "ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Agent or Admin access required" });
    }

    const { tempVenueId } = req.params;

    const venue = await AgentVenueTemp.findOne({ tempVenueId })
      .select("tempVenueId name gpsData geofenceVerified geofenceVerifiedAt");

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: "Venue not found",
      });
    }

    // Cast venue to any to access geofence properties
    const venueData = venue as any;
    const gpsData = venueData.gpsData as any;

    return res.json({
      success: true,
      data: {
        tempVenueId: venueData.tempVenueId,
        name: venueData.name,
        geofence: gpsData?.geofence,
        geofenceCoordinates: gpsData?.geofenceCoordinates,
        geofenceArea: gpsData?.geofenceArea,
        geofenceType: gpsData?.geofenceType,
        verified: venueData.geofenceVerified || false,
        verifiedAt: venueData.geofenceVerifiedAt,
      },
    });
  } catch (error: any) {
    console.error("Error fetching geofence:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch geofence",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/agent/venues/:tempVenueId/geofence
 * Delete property boundary geofence
 */
export const deleteVenueGeofence = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['AGENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Agent or Admin access required' });
    }

    const { tempVenueId } = req.params;

    const venue = await AgentVenueTemp.findOne({ tempVenueId });

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    // Check permission
    if (req.user.role === 'AGENT' && venue.assignedTo?.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update venues assigned to you'
      });
    }

    // Remove geofence data
    const updateData: any = {
      'gpsData.geofence': null,
      'gpsData.geofenceCoordinates': [],
      'gpsData.geofenceArea': null,
      'gpsData.geofenceType': null,
      'gpsData.geofenceCreatedAt': null,
      'gpsData.geofenceCreatedBy': null,
      geofenceVerified: false,
      geofenceVerifiedAt: null
    };

    await AgentVenueTemp.findOneAndUpdate(
      { tempVenueId },
      { $set: updateData }
    );

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_GEOFENCE_DELETED',
      meta: { tempVenueId }
    });

    console.log(`✅ Geofence deleted for venue ${tempVenueId}`);

    return res.json({
      success: true,
      message: 'Geofence deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting geofence:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete geofence',
      error: error.message
    });
  }
};

// Helper function to calculate polygon area using Shoelace formula
function calculatePolygonArea(coordinates: Array<{ lat: number; lng: number }>): number {
  if (coordinates.length < 3) return 0;

  // Convert to meters using Haversine approximation
  const R = 6371000; // Earth's radius in meters
  
  let area = 0;
  for (let i = 0; i < coordinates.length; i++) {
    const j = (i + 1) % coordinates.length;
    const lat1 = coordinates[i].lat * Math.PI / 180;
    const lat2 = coordinates[j].lat * Math.PI / 180;
    const lng1 = coordinates[i].lng * Math.PI / 180;
    const lng2 = coordinates[j].lng * Math.PI / 180;
    
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  
  area = Math.abs(area * R * R / 2);
  return area;
}