// ===== FILE: src/controllers/offerController.ts =====
import { Request, Response, NextFunction } from 'express';
import Offer, { IOffer } from '../models/Offer';
import Redemption, { RedemptionStatus } from '../models/Redemption';
import User from '../models/User';
import Venue from '../models/Venue';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import { dbManager, Region } from '../config/database';
import { calculateOTL, calculateOfferRanking } from '../services/offerService';

// ✅ Combined type with region support
type StaffRequest = AuthRequest & RegionRequest;

// GET /api/offers/eligible - Get eligible offers for current user
export const getEligibleOffers = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const region = (req.region || 'ae') as Region;
    const { lat, lng, radius = 5000, category } = req.query;

    console.log(`🎯 Fetching eligible offers for user: ${req.user.userId}, region: ${region}`);

    // ✅ FIX: Check if user exists, if not create a minimal user record
    let user = await User.findById(req.user.userId);
    
    if (!user) {
      console.log(`⚠️ User ${req.user.userId} not found in database, creating minimal record`);
      
      user = new User({
        _id: req.user.userId,
        email: `user_${req.user.userId}@honestlee.${region}`,
        role: req.user.role || 'CONSUMER',
        loginMethod: 'OTP',
        region: region
      });
      
      await user.save();
      console.log('✅ Created minimal user record');
    }

    // Calculate user's OTL (Offer Trust Level)
    const userOTL = await calculateOTL(user._id.toString());

    // ✅ NEW: Get regional venue collection
    const regionalConnection = dbManager.getConnection(region);
    const RegionalVenue = regionalConnection.model('Venue', Venue.schema);

    // Find venues within radius
    let venueQuery: any = { isActive: true };
    
    if (lat && lng) {
      venueQuery.geometry = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng as string), parseFloat(lat as string)]
          },
          $maxDistance: parseInt(radius as string)
        }
      };
    }

    if (category) {
      venueQuery.venuecategory = category;
    }

    console.log(`🔍 Finding venues in region ${region} with query:`, venueQuery);

    const venues = await RegionalVenue.find(venueQuery).select('_id');
    const venueIds = venues.map(v => v._id);

    console.log(`✅ Found ${venueIds.length} venues in region ${region}`);

    if (venueIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        userOTL,
        message: 'No venues found in the specified area',
        region
      });
    }

    // Find active offers for these venues
    const now = new Date();
    const offerQuery: any = {
      venueId: { $in: venueIds },
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      minOTL: { $lte: userOTL }
    };

    const offers = await Offer.find(offerQuery)
      .populate('venueId', 'AccountName BillingStreet BillingCity geometry venuecategory')
      .lean();

    console.log(`✅ Found ${offers.length} active offers`);

    if (offers.length === 0) {
      return res.json({
        success: true,
        data: [],
        userOTL,
        message: 'No active offers found for these venues',
        region
      });
    }

    // Check eligibility for each offer
    const eligibilityChecks = await Promise.all(
      offers.map(async (offer) => {
        // Check if user is new to this venue
        const userVenueHistory = await Redemption.findOne({
          userId: user!._id,
          venueId: offer.venueId,
          status: { $in: [RedemptionStatus.REDEEMED] }
        });

        const isNewToVenue = !userVenueHistory;

        // Check cooldown
        const lastRedemption = await Redemption.findOne({
          userId: user!._id,
          venueId: offer.venueId,
          offerId: offer._id,
          status: RedemptionStatus.REDEEMED
        }).sort({ redeemedAt: -1 });

        let cooldownActive = false;
        let cooldownEndsAt: Date | null = null;

        if (lastRedemption && lastRedemption.cooldownUntil) {
          cooldownActive = lastRedemption.cooldownUntil > now;
          cooldownEndsAt = lastRedemption.cooldownUntil;
        }

        // Check user's redemption count for this offer
        const userRedemptionCount = await Redemption.countDocuments({
          userId: user!._id,
          offerId: offer._id,
          status: RedemptionStatus.REDEEMED
        });

        const maxReached = userRedemptionCount >= offer.maxRedemptionsPerUser;

        // Check if offer is valid now
        const offerDoc = await Offer.findById(offer._id);
        const isValidNow = offerDoc ? offerDoc.isValidNow() : false;

        return {
          ...offer,
          eligibility: {
            isNewToVenue,
            cooldownActive,
            cooldownEndsAt,
            maxReached,
            isEligible: !cooldownActive && !maxReached && isValidNow,
            userOTL,
            requiredOTL: offer.minOTL
          }
        };
      })
    );

    // Rank offers
    const rankedOffers = calculateOfferRanking(
      eligibilityChecks, 
      user, 
      { lat: lat as string, lng: lng as string }
    );

    console.log(`📊 Returning ${rankedOffers.length} ranked offers`);

    res.json({
      success: true,
      data: rankedOffers,
      userOTL,
      count: rankedOffers.length,
      region
    });

  } catch (error: any) {
    console.error('❌ Error fetching eligible offers:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching offers', 
      error: error.message 
    });
  }
};

// GET /api/offers/:id - Get offer details
export const getOfferById = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    const { id } = req.params;
    const region = (req.region || 'ae') as Region;

    console.log(`📋 Fetching offer ${id} from region ${region}`);

    const offer = await Offer.findById(id).populate('venueId');
    
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    res.json({ success: true, data: offer });

  } catch (error: any) {
    console.error('❌ Error fetching offer:', error);
    res.status(500).json({ success: false, message: 'Error fetching offer', error: error.message });
  }
};

// POST /api/offers - Create offer (Staff/Manager/Owner/Admin only)
export const createOffer = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['STAFF', 'MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const region = (req.region || 'ae') as Region;
    const offerData = req.body;

    console.log(`✏️ Creating offer for region ${region}:`, { venueId: offerData.venueId, title: offerData.title });

    // ✅ NEW: Verify venue exists in regional database
    const regionalConnection = dbManager.getConnection(region);
    const RegionalVenue = regionalConnection.model('Venue', Venue.schema);

    const venue = await RegionalVenue.findById(offerData.venueId);
    if (!venue) {
      return res.status(404).json({ 
        success: false,
        message: `Venue not found in region ${region}` 
      });
    }

    // ✅ NEW: Add region to offer data
    offerData.region = region;

    const newOffer = new Offer(offerData);
    await newOffer.save();

    console.log(`✅ Offer created: ${newOffer._id}`);

    res.status(201).json({ success: true, data: newOffer });

  } catch (error: any) {
    console.error('❌ Error creating offer:', error);
    res.status(400).json({ success: false, message: 'Error creating offer', error: error.message });
  }
};

// PUT /api/offers/:id - Update offer
export const updateOffer = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['STAFF', 'MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const region = (req.region || 'ae') as Region;
    const updates = req.body;

    console.log(`🔄 Updating offer ${id} in region ${region}`);

    const updatedOffer = await Offer.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

    if (!updatedOffer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    console.log(`✅ Offer updated: ${updatedOffer._id}`);

    res.json({ success: true, data: updatedOffer });

  } catch (error: any) {
    console.error('❌ Error updating offer:', error);
    res.status(400).json({ success: false, message: 'Error updating offer', error: error.message });
  }
};

// DELETE /api/offers/:id - Soft delete offer
export const deleteOffer = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const region = (req.region || 'ae') as Region;

    console.log(`🗑️ Deactivating offer ${id} in region ${region}`);

    const offer = await Offer.findByIdAndUpdate(id, { isActive: false }, { new: true });

    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    console.log(`✅ Offer deactivated: ${id}`);

    res.json({ success: true, message: 'Offer deactivated successfully', data: offer });

  } catch (error: any) {
    console.error('❌ Error deleting offer:', error);
    res.status(500).json({ success: false, message: 'Error deleting offer', error: error.message });
  }
};

// GET /api/offers/venue/:venueId - Get all offers for a venue
export const getOffersByVenue = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    const { venueId } = req.params;
    const region = (req.region || 'ae') as Region;
    const { activeOnly = 'true' } = req.query;

    console.log(`📊 Fetching offers for venue ${venueId} in region ${region}`);

    // ✅ NEW: Verify venue exists in regional database
    const regionalConnection = dbManager.getConnection(region);
    const RegionalVenue = regionalConnection.model('Venue', Venue.schema);

    const venue = await RegionalVenue.findById(venueId);
    if (!venue) {
      return res.status(404).json({ 
        success: false, 
        message: `Venue not found in region ${region}` 
      });
    }

    const query: any = { venueId };
    if (activeOnly === 'true') {
      query.isActive = true;
    }

    const offers = await Offer.find(query).sort({ createdAt: -1 });

    console.log(`✅ Found ${offers.length} offers for venue ${venueId}`);

    res.json({ 
      success: true, 
      data: offers, 
      count: offers.length,
      region
    });

  } catch (error: any) {
    console.error('❌ Error fetching venue offers:', error);
    res.status(500).json({ success: false, message: 'Error fetching venue offers', error: error.message });
  }
};
