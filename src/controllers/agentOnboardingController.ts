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

    // Check permission
    if (req.user.role === 'AGENT' && venue.assignedTo?.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only add notes to venues assigned to you'
      });
    }

    // ✅ FIX: Convert string to ObjectId
    const newNote = {
      noteId: uuidv4(),
      noteType,
      content: content.trim(),
      createdBy: new mongoose.Types.ObjectId(req.user.userId), // ← Changed this line
      createdAt: new Date()
    };

    venue.notes = venue.notes || [];
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

/**
 * POST /api/agent/venues/onboard-from-google
 * Onboard venue from Google Places API data
 */
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
      priceRange,
      displayPrice,
      paymentOptions,
      accessibilityOptions,
      parkingOptions,
      atmosphereFlags,
      photoReference,
      allPhotos
    } = req.body;

    // ✅ VALIDATION
    if (!googlePlaceId || !name) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields: googlePlaceId and name are required' 
      });
    }

    console.log(`🏪 Agent ${req.user.userId} onboarding venue from Google: ${name}`);
    console.log(`📍 Location: lat=${latitude}, lng=${longitude}`);
    console.log(`💰 Price data received - Level: ${priceLevel} (type: ${typeof priceLevel}), Range: ${priceRange}`);

    const tempVenueId = `TEMP-${uuidv4().substring(0, 8).toUpperCase()}`;

    // ✅ CONVERT PRICE LEVEL TO NUMBER
    const convertPriceLevel = (level: any): number | undefined => {
      if (level === null || level === undefined || level === '') {
        return undefined;
      }

      // If already a number, validate it's in range
      if (typeof level === 'number') {
        return (level >= 0 && level <= 4) ? level : undefined;
      }

      // If string, convert to number
      if (typeof level === 'string') {
        // Handle string representations of numbers
        const parsed = parseInt(level, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 4) {
          return parsed;
        }

        // Handle text values (Google sometimes returns these)
        const priceMap: { [key: string]: number } = {
          'FREE': 0,
          'INEXPENSIVE': 1,
          'MODERATE': 2,
          'EXPENSIVE': 3,
          'VERY_EXPENSIVE': 4,
          // Additional variations
          'CHEAP': 1,
          'MEDIUM': 2,
          'COSTLY': 3,
          'LUXURY': 4
        };

        const upperLevel = level.toUpperCase();
        return priceMap[upperLevel];
      }

      return undefined;
    };

    const normalizedPriceLevel = convertPriceLevel(priceLevel);

    const getPriceLevelDisplay = (level: number | undefined): string => {
      if (level === undefined || level === null) return '';
      const symbols = ['', '$', '$$', '$$$', '$$$$'];
      return symbols[level] || '';
    };

    const priceLevelDisplay = getPriceLevelDisplay(normalizedPriceLevel);

    console.log(`💰 Normalized price level: ${normalizedPriceLevel} → Display: ${priceLevelDisplay}`);

    // ✅ SAFE JSON STRINGIFY HELPER
    const safeStringify = (data: any): string | undefined => {
      if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
        return undefined;
      }
      try {
        return JSON.stringify(data);
      } catch (error) {
        console.error('❌ JSON.stringify error:', error);
        return undefined;
      }
    };

    const tempVenue = new AgentVenueTemp({
      tempVenueId,
      createdBy: req.user.userId,
      name,
      category: allTypes || (primaryType ? [primaryType] : []),
      address: {
        lat: latitude || 0,
        lng: longitude || 0,
        raw: formattedAddress || '',
        street: street || undefined,
        city: city || undefined,
        district: district || undefined,
        postalCode: postalCode || undefined,
        state: state || undefined,
        country: country || undefined,
        countryCode: countryCode || undefined,
      },
      phone: phoneInternational || undefined,
      socials: website ? { website } : undefined,
      hours: regularOpeningHours || undefined,
      status: 'temp',
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
        primaryType: primaryType || undefined,
        primaryTypeLabel: primaryTypeLabel || undefined,
        allTypes: allTypes || undefined,
        googleMapsUrl: googleMapsUrl || undefined,
        utcOffsetMinutes: utcOffsetMinutes || undefined,
        rating: rating || undefined,
        userRatingsCount: userRatingsCount || undefined,
        reviews: safeStringify(reviews),
        businessStatus: businessStatus || undefined,
        editorialSummary: editorialSummary || undefined,
        
        // ✅ USE NORMALIZED PRICE LEVEL
        priceLevel: normalizedPriceLevel,
        priceLevelDisplay: priceLevelDisplay || undefined,
        priceRange: priceRange || undefined,
        displayPrice: safeStringify(displayPrice),
        
        paymentOptions: safeStringify(paymentOptions),
        accessibilityOptions: safeStringify(accessibilityOptions),
        parkingOptions: safeStringify(parkingOptions),
        atmosphereFlags: safeStringify(atmosphereFlags),
        photoReference: photoReference || undefined,
        allPhotos: safeStringify(allPhotos),
        importedAt: new Date(),
        importedBy: req.user.userId,
      },
    });

    await tempVenue.save();

    await createAuditLog(
      req.user.userId,
      req.user.role,
      'agent.venue.added.from.google',
      {
        tempVenueId,
        name,
        googlePlaceId,
        region,
        priceLevel: normalizedPriceLevel,
        priceRange,
      },
      undefined,
      req
    );

    console.log(`✅ Venue onboarded from Google: ${tempVenueId}`);

    return res.status(201).json({
      success: true,
      data: tempVenue,
      message: 'Venue onboarded from Google successfully',
    });
  } catch (error: any) {
    console.error('❌ Error onboarding from Google:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);
    
    if (error.name === 'ValidationError') {
      console.error('❌ Validation errors:', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message,
        details: error.errors,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error onboarding venue',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
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