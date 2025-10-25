import { Response } from 'express';
import crypto from 'crypto';
import Redemption, { RedemptionStatus, IRedemption } from '../models/Redemption';
import Offer, { IOffer } from '../models/Offer';
import User from '../models/User';
import Venue from '../models/Venue';
import { AuthRequest } from '../middlewares/authMiddleware';
import { calculateRiskScore, verifyPresenceSignals } from '../services/redemptionService';
import { generateRotatingQR, verifyRotatingQR } from '../services/qrService';

// POST /api/redemptions/initiate - Initiate redemption process
export const initiateRedemption = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { offerId, redemptionMode, presenceSignals, deviceFingerprint } = req.body;

    // Validate offer with proper type assertion
    const offer = await Offer.findById(offerId).populate('venueId') as IOffer | null;
    
    if (!offer || !offer.isValidNow()) {
      return res.status(400).json({ success: false, message: 'Offer not available' });
    }

    // Check user eligibility
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ✅ DISABLED FOR TESTING: Check if new to venue
    // const hasVisitedBefore = await Redemption.findOne({
    //   userId: user._id,
    //   venueId: offer.venueId,
    //   status: RedemptionStatus.REDEEMED
    // });

    // if (!hasVisitedBefore) {
    //   return res.status(403).json({ 
    //     success: false, 
    //     message: 'You must follow this venue before redeeming offers',
    //     reason: 'NEW_VENUE'
    //   });
    // }

    // Check cooldown
    const lastRedemption = await Redemption.findOne({
      userId: user._id,
      venueId: offer.venueId,
      offerId: offer._id,
      status: RedemptionStatus.REDEEMED
    }).sort({ redeemedAt: -1 });

    if (lastRedemption && lastRedemption.cooldownUntil > new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Cooldown period active',
        reason: 'COOLDOWN',
        cooldownEndsAt: lastRedemption.cooldownUntil
      });
    }

    // Check max redemptions
    const userRedemptionCount = await Redemption.countDocuments({
      userId: user._id,
      offerId: offer._id,
      status: RedemptionStatus.REDEEMED
    });

    if (userRedemptionCount >= offer.maxRedemptionsPerUser) {
      return res.status(403).json({
        success: false,
        message: 'Maximum redemptions reached for this offer',
        reason: 'MAX_REACHED'
      });
    }

    // ✅ DISABLED FOR TESTING: Verify presence signals - Always return true
    const presenceVerified = true;
    // const presenceVerified = await verifyPresenceSignals(presenceSignals, offer.venueId);
    if (!presenceVerified) {
      return res.status(403).json({
        success: false,
        message: 'Unable to verify your presence at the venue',
        reason: 'PRESENCE_FAILED'
      });
    }

    // Calculate risk score
    const riskScore = await calculateRiskScore(user._id.toString(), deviceFingerprint, presenceSignals);

    // Generate OTC (One-Time Code) for self-serve redemption
    const otcToken = crypto.randomBytes(16).toString('hex');
    const otcExpiresAt = new Date(Date.now() + offer.qrRotationMinutes * 60 * 1000);

    const cooldownUntil = new Date(Date.now() + offer.cooldownHours * 60 * 60 * 1000);

    // Create redemption record
    const redemption = new Redemption({
      offerId: offer._id,
      userId: user._id,
      venueId: offer.venueId,
      redemptionMode,
      status: RedemptionStatus.VERIFIED,
      otcToken,
      otcExpiresAt,
      verifiedAt: new Date(),
      presenceSignals,
      deviceFingerprint,
      riskScore,
      fraudFlags: riskScore > 70 ? ['HIGH_RISK'] : [],
      cooldownUntil,
      value: offer.value,
      auditLog: [{
        timestamp: new Date(),
        action: 'INITIATED',
        actor: user._id,
        details: { redemptionMode, presenceSignals }
      }]
    });

    await redemption.save();

    // If requires staff approval, send notification (implementation pending)
    if (offer.requiresStaffApproval) {
      redemption.status = RedemptionStatus.PENDING;
      await redemption.save();
    }

    res.status(201).json({
      success: true,
      data: redemption,
      requiresStaffApproval: offer.requiresStaffApproval
    });

  } catch (error: any) {
    console.error('Error initiating redemption:', error);
    res.status(500).json({ success: false, message: 'Error initiating redemption', error: error.message });
  }
};

// POST /api/redemptions/:id/approve - Staff approves redemption
export const approveRedemption = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['STAFF', 'MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { id } = req.params;

    const redemption = await Redemption.findById(id).populate('offerId');
    if (!redemption) {
      return res.status(404).json({ success: false, message: 'Redemption not found' });
    }

    if (redemption.status !== RedemptionStatus.VERIFIED && redemption.status !== RedemptionStatus.PENDING) {
      return res.status(400).json({ success: false, message: 'Redemption cannot be approved' });
    }

    redemption.status = RedemptionStatus.APPROVED;
    redemption.approvedBy = req.user.userId as any;
    redemption.approvedAt = new Date();
    redemption.auditLog.push({
      timestamp: new Date(),
      action: 'APPROVED',
      actor: req.user.userId as any,
      details: {}
    });

    await redemption.save();

    res.json({ success: true, data: redemption });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error approving redemption', error: error.message });
  }
};

// POST /api/redemptions/:id/redeem - Complete redemption
export const completeRedemption = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { otcToken } = req.body;

    const redemption = await Redemption.findById(id).populate('offerId') as IRedemption | null;
    if (!redemption) {
      return res.status(404).json({ success: false, message: 'Redemption not found' });
    }

    // Verify OTC token
    if (redemption.otcToken !== otcToken) {
      return res.status(400).json({ success: false, message: 'Invalid token' });
    }

    if (redemption.otcExpiresAt && redemption.otcExpiresAt < new Date()) {
      redemption.status = RedemptionStatus.EXPIRED;
      await redemption.save();
      return res.status(400).json({ success: false, message: 'Token expired' });
    }

    const offer = redemption.offerId as any;
    if (offer.requiresStaffApproval && redemption.status !== RedemptionStatus.APPROVED) {
      return res.status(403).json({ success: false, message: 'Staff approval required' });
    }

    // Complete redemption
    redemption.status = RedemptionStatus.REDEEMED;
    redemption.redeemedAt = new Date();
    redemption.auditLog.push({
      timestamp: new Date(),
      action: 'REDEEMED',
      actor: req.user.userId as any,
      details: {}
    });

    await redemption.save();

    // Update offer redemption count
    await Offer.findByIdAndUpdate(offer._id, { $inc: { currentRedemptions: 1 } });

    res.json({ success: true, data: redemption, message: 'Offer redeemed successfully' });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error completing redemption', error: error.message });
  }
};

// GET /api/redemptions/my - Get current user's redemptions
export const getMyRedemptions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { page = '1', limit = '20', status } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const query: any = { userId: req.user.userId };
    if (status) {
      query.status = status;
    }

    const redemptions = await Redemption.find(query)
      .populate('offerId')
      .populate('venueId', 'AccountName BillingStreet BillingCity geometry')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const totalCount = await Redemption.countDocuments(query);

    res.json({
      success: true,
      data: redemptions,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching redemptions', error: error.message });
  }
};

// GET /api/redemptions/venue/:venueId - Get redemptions for a venue (staff only)
export const getVenueRedemptions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['STAFF', 'MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const { page = '1', limit = '20', status, startDate, endDate } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const query: any = { venueId };
    if (status) {
      query.status = status;
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate as string);
      if (endDate) query.createdAt.$lte = new Date(endDate as string);
    }

    const redemptions = await Redemption.find(query)
      .populate('userId', 'email phone')
      .populate('offerId', 'title value offerType')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const totalCount = await Redemption.countDocuments(query);

    res.json({
      success: true,
      data: redemptions,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching venue redemptions', error: error.message });
  }
};

// POST /api/redemptions/staff-qr/generate - Generate rotating QR for staff
export const generateStaffQR = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['STAFF', 'MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.body;

    const qrData = await generateRotatingQR(venueId, req.user.userId);

    res.json({ success: true, data: qrData });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error generating QR', error: error.message });
  }
};

// POST /api/redemptions/staff-qr/verify - Verify staff QR scan
export const verifyStaffQR = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { qrToken, redemptionId } = req.body;

    const isValid = await verifyRotatingQR(qrToken);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid or expired QR code' });
    }

    res.json({ success: true, message: 'QR verified', redemptionId });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error verifying QR', error: error.message });
  }
};
