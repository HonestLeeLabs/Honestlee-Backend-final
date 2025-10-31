import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import StaffSession, { IStaffSession } from '../models/StaffSession';
import VenueRoster from '../models/VenueRoster';
import Redemption, { RedemptionStatus } from '../models/Redemption';
import Offer from '../models/Offer';
import Venue from '../models/Venue';
import { dbManager, Region } from '../config/database';

// ✅ FIX: Create proper combined request type
type StaffRequest = AuthRequest & RegionRequest;

// GET /api/staff/dashboard/:venueId - Get dashboard overview
export const getDashboardOverview = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { venueId } = req.params;
    const region = (req.region || 'ae') as Region;

    console.log(`📊 Dashboard request for venue: ${venueId}, region: ${region}`);

    // Verify staff access
    const roster = await VenueRoster.findOne({
      staffUserId: req.user.userId,
      venueId,
      status: 'ACTIVE'
    });

    if (!roster) {
      return res.status(403).json({ message: 'Access denied to this venue' });
    }

    // Get or create active session with proper type assertion
    let session = await StaffSession.findOne({
      staffUserId: req.user.userId,
      venueId,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }) as IStaffSession | null;

    if (!session) {
      session = new StaffSession({
        staffUserId: req.user.userId,
        venueId,
        role: roster.role,
        deviceId: req.headers['x-device-id'] || 'unknown',
        deviceInfo: {
          userAgent: req.headers['user-agent'] || '',
          ip: req.ip || '',
          platform: (req.headers['x-platform'] as string) || 'unknown'
        },
        expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
      });
      await session.save();
    } else {
      await session.updateActivity();
    }

    // Get 24h activity snapshot
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // ✅ FIX: Use dbManager to get regional connection
    const regionalConnection = dbManager.getConnection(region);
    const RegionalVenue = regionalConnection.model('Venue', Venue.schema);

    const [
      venue,
      redemptionsCount,
      flaggedRedemptionsCount,
      activeOffers,
      upcomingOffers
    ] = await Promise.all([
      RegionalVenue.findById(venueId), // ✅ Query from regional database
      Redemption.countDocuments({
        venueId: new mongoose.Types.ObjectId(venueId),
        createdAt: { $gte: last24h },
        status: RedemptionStatus.REDEEMED
      }),
      Redemption.countDocuments({
        venueId: new mongoose.Types.ObjectId(venueId),
        createdAt: { $gte: last24h },
        fraudFlags: { $exists: true, $ne: [] }
      }),
      Offer.countDocuments({
        venueId: new mongoose.Types.ObjectId(venueId),
        isActive: true,
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() }
      }),
      Offer.countDocuments({
        venueId: new mongoose.Types.ObjectId(venueId),
        isActive: true,
        validFrom: { $gt: new Date() }
      })
    ]);

    console.log(`✅ Venue found: ${venue?.AccountName || 'N/A'}`);

    const response = {
      success: true,
      session: {
        sessionId: session._id,
        role: session.role,
        expiresAt: session.expiresAt,
        autoLockIn: Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
      },
      venue: {
        id: venue?._id,
        name: venue?.AccountName || venue?.name,
        category: venue?.venuecategorydisplayname || venue?.venuecategory || venue?.category,
        city: venue?.BillingCity,
        region: region
      },
      activity: {
        redemptions: {
          total: redemptionsCount,
          flagged: flaggedRedemptionsCount
        },
        offers: {
          active: activeOffers,
          upcoming: upcomingOffers
        }
      }
    };

    res.json(response);

  } catch (error: any) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ success: false, message: 'Error loading dashboard', error: error.message });
  }
};

// POST /api/staff/session/refresh - Refresh session
export const refreshSession = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { sessionId } = req.body;

    const session = await StaffSession.findOne({
      _id: sessionId,
      staffUserId: req.user.userId,
      isActive: true
    }) as IStaffSession | null;

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found or expired' });
    }

    await session.updateActivity();

    res.json({
      success: true,
      expiresAt: session.expiresAt,
      autoLockIn: Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error refreshing session', error: error.message });
  }
};

// POST /api/staff/session/lock - Lock session
export const lockSession = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { sessionId, reason } = req.body;

    const session = await StaffSession.findOne({
      _id: sessionId,
      staffUserId: req.user.userId
    }) as IStaffSession | null;

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    await session.lock(reason || 'MANUAL_LOCK');

    res.json({ success: true, message: 'Session locked' });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error locking session', error: error.message });
  }
};
