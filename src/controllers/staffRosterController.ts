// ===== FILE: src/controllers/staffRosterController.ts =====
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import VenueRoster from '../models/VenueRoster';
import User from '../models/User';
import StaffSession from '../models/StaffSession';
import { dbManager, Region } from '../config/database';
import Venue from '../models/Venue';
import mongoose from 'mongoose';

// ✅ Combined type with region support
type StaffRequest = AuthRequest & RegionRequest;

// ✅ ULTRA FIXED: GET /api/staff/roster/my-roster - Enriches with regional venue data
export const getMyRosterEntries = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const region = (req.region || 'ae') as Region;
    console.log(`🔍 Fetching roster for userId: ${req.user.userId}, region: ${region}`);

    // ✅ Get roster entries (venues are in different DB, so no populate)
    const rosterEntries = await VenueRoster.find({
      staffUserId: req.user.userId,
      status: 'ACTIVE',
      venueId: { $exists: true, $ne: null, $type: 'objectId' }
    })
      .sort({ activatedAt: -1 })
      .lean();

    console.log(`✅ Found ${rosterEntries.length} roster entries with valid venueIds`);

    // ✅ Manually fetch venue data from regional database
    const enrichedRosters = await Promise.all(
      rosterEntries.map(async (roster) => {
        if (!roster.venueId) {
          return roster;
        }

        try {
          // ✅ Connect to regional database
          await dbManager.connectRegion(region);
          const regionalConnection = dbManager.getConnection(region);
          const RegionalVenue = regionalConnection.model('Venue', Venue.schema);
          
          // ✅ Fetch venue from regional DB
          const venueData = await RegionalVenue.findById(roster.venueId);
          
          if (venueData) {
            roster.venueId = venueData.toObject();
            console.log(`✅ Enriched: ${venueData.AccountName || venueData.vendorName}`);
          } else {
            console.warn(`⚠️ Venue ${roster.venueId} not found in region ${region}`);
          }
        } catch (error) {
          console.error(`⚠️ Error fetching venue ${roster.venueId}:`, (error as any).message);
        }

        return roster;
      })
    );

    res.json({
      success: true,
      data: enrichedRosters,
      count: enrichedRosters.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching my roster:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching roster',
      error: error.message
    });
  }
};

// ✅ FIXED: GET /api/staff/roster/my-invitations - Enriches with regional venue data
export const getMyInvitations = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const region = (req.region || 'ae') as Region;
    console.log(`🔍 Fetching invitations for userId: ${req.user.userId}, region: ${region}`);

    // ✅ Get invitations without populate
    const invitations = await VenueRoster.find({
      staffUserId: req.user.userId,
      status: 'PENDING',
      venueId: { $exists: true, $ne: null, $type: 'objectId' }
    })
      .sort({ invitedAt: -1 })
      .lean();

    console.log(`✅ Found ${invitations.length} pending invitations`);

    // ✅ Manually enrich with regional venue data
    const enrichedInvitations = await Promise.all(
      invitations.map(async (invitation) => {
        if (!invitation.venueId) {
          return invitation;
        }

        try {
          await dbManager.connectRegion(region);
          const regionalConnection = dbManager.getConnection(region);
          const RegionalVenue = regionalConnection.model('Venue', Venue.schema);
          
          const venueData = await RegionalVenue.findById(invitation.venueId);
          if (venueData) {
            invitation.venueId = venueData.toObject();
            console.log(`✅ Enriched invitation: ${venueData.AccountName}`);
          }
        } catch (error) {
          console.warn(`⚠️ Error enriching invitation:`, (error as any).message);
        }

        return invitation;
      })
    );

    res.json({
      success: true,
      data: enrichedInvitations,
      count: enrichedInvitations.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching invitations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching invitations', 
      error: error.message 
    });
  }
};

// ✅ PUT /api/staff/roster/:rosterId/accept - Accept staff invitation
export const acceptStaffInvitation = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { rosterId } = req.params;

    console.log(`📩 Accepting invitation: ${rosterId} for userId: ${req.user.userId}`);

    const roster = await VenueRoster.findById(rosterId);

    if (!roster) {
      return res.status(404).json({ success: false, message: 'Invitation not found' });
    }

    if (roster.staffUserId.toString() !== req.user.userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'This invitation is not for you' 
      });
    }

    if (roster.status === 'ACTIVE') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invitation already accepted' 
      });
    }

    if (roster.status !== 'PENDING') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot accept invitation with status: ${roster.status}` 
      });
    }

    roster.status = 'ACTIVE';
    roster.activatedAt = new Date();
    roster.joinedAt = new Date();

    if (!roster.permissions || roster.permissions.length === 0) {
      switch (roster.role) {
        case 'OWNER':
        case 'MANAGER':
          roster.permissions = [
            'VIEW_DASHBOARD',
            'MANAGE_STAFF',
            'VIEW_REDEMPTIONS',
            'APPROVE_REDEMPTIONS',
            'MANAGE_OFFERS',
            'MANAGE_EVENTS'
          ];
          break;
        case 'STAFF':
          roster.permissions = [
            'VIEW_DASHBOARD',
            'VIEW_REDEMPTIONS',
            'APPROVE_REDEMPTIONS'
          ];
          break;
        default:
          roster.permissions = ['VIEW_DASHBOARD', 'VIEW_REDEMPTIONS'];
      }
    }

    await roster.save();

    console.log(`✅ Invitation accepted: ${roster._id}`);

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      data: roster.toObject()
    });

  } catch (error: any) {
    console.error('❌ Error accepting invitation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error accepting invitation', 
      error: error.message 
    });
  }
};

// ✅ CLEANUP ENDPOINT: Remove all invalid roster entries
export const cleanupInvalidRosters = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    console.log(`🧹 Cleaning up invalid roster entries for userId: ${req.user.userId}`);

    // Remove all entries with null or invalid venueId
    const result = await VenueRoster.deleteMany({
      staffUserId: req.user.userId,
      $or: [
        { venueId: { $exists: false } },
        { venueId: null },
        { venueId: { $type: 'string' } }
      ]
    });

    console.log(`🗑️ Removed ${result.deletedCount} invalid roster entries`);

    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} invalid roster entries`,
      deletedCount: result.deletedCount
    });

  } catch (error: any) {
    console.error('❌ Error cleaning up rosters:', error);
    res.status(500).json({
      success: false,
      message: 'Error cleaning up rosters',
      error: error.message
    });
  }
};

// ✅ NEW: Fix and Add to Roster
export const fixAndAddToRoster = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { venueId } = req.body;
    const region = (req.region || req.body.region || req.headers['x-region'] || 'ae') as Region;

    if (!venueId) {
      return res.status(400).json({ success: false, message: 'venueId is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      return res.status(400).json({ success: false, message: 'Invalid venueId format' });
    }

    console.log(`🔧 Fix and add to roster: venueId=${venueId}, userId=${req.user.userId}, region=${region}`);

    // ✅ Delete all invalid roster entries
    const deleteResult = await VenueRoster.deleteMany({
      staffUserId: req.user.userId,
      $or: [
        { venueId: { $exists: false } },
        { venueId: null },
        { venueId: { $type: 'string' } }
      ]
    });

    console.log(`🗑️ Removed ${deleteResult.deletedCount} invalid roster entries`);

    // ✅ Check if already has valid entry
    const existing = await VenueRoster.findOne({
      staffUserId: req.user.userId,
      venueId: new mongoose.Types.ObjectId(venueId)
    });

    if (existing && existing.status === 'ACTIVE') {
      console.log(`ℹ️ User already in roster with this venue`);
      return res.json({ 
        success: true, 
        message: 'Already in roster', 
        data: existing 
      });
    }

    // ✅ Verify venue exists
    try {
      await dbManager.connectRegion(region);
      const regionalConnection = dbManager.getConnection(region);
      const RegionalVenue = regionalConnection.model('Venue', Venue.schema);
      
      const venue = await RegionalVenue.findById(venueId);
      if (!venue) {
        return res.status(404).json({ 
          success: false, 
          message: `Venue ${venueId} not found in region ${region}` 
        });
      }
      console.log(`✅ Verified venue exists: ${venue.AccountName}`);
    } catch (error: any) {
      console.error(`❌ Error verifying venue:`, error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error verifying venue', 
        error: error.message 
      });
    }

    // ✅ Create new valid roster entry
    const roster = new VenueRoster({
      staffUserId: new mongoose.Types.ObjectId(req.user.userId),
      venueId: new mongoose.Types.ObjectId(venueId),
      role: 'OWNER',
      status: 'ACTIVE',
      permissions: [
        'VIEW_DASHBOARD', 
        'MANAGE_STAFF', 
        'VIEW_REDEMPTIONS', 
        'APPROVE_REDEMPTIONS'
      ],
      joinedAt: new Date(),
      activatedAt: new Date(),
      invitedBy: new mongoose.Types.ObjectId(req.user.userId)
    });

    await roster.save();

    console.log(`✅ Fixed and added to roster: ${roster._id}`);

    res.json({ 
      success: true, 
      message: 'Fixed and added to roster successfully', 
      data: roster 
    });

  } catch (error: any) {
    console.error('❌ Error fixing roster:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fixing roster', 
      error: error.message 
    });
  }
};

// ✅ FIXED: Add user to roster (prevents duplicates)
export const testAddStaffToRoster = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { venueId } = req.body;
    const region = (req.region || req.body.region || req.headers['x-region'] || 'ae') as Region;

    if (!venueId) {
      return res.status(400).json({ success: false, message: 'venueId is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      return res.status(400).json({ success: false, message: 'Invalid venueId format' });
    }

    console.log(`➕ Adding staff to roster: venueId=${venueId}, userId=${req.user.userId}, region=${region}`);

    // ✅ Check for ANY existing entry (including null venueIds)
    const existingAny = await VenueRoster.findOne({
      staffUserId: req.user.userId,
      $or: [
        { venueId: venueId },
        { venueId: null },
        { venueId: { $exists: false } }
      ]
    });

    if (existingAny) {
      // If found a null entry, delete it
      if (!existingAny.venueId) {
        console.log(`🗑️ Removing invalid roster entry: ${existingAny._id}`);
        await VenueRoster.deleteOne({ _id: existingAny._id });
      } else if (existingAny.venueId.toString() === venueId) {
        // Valid entry already exists
        console.log(`ℹ️ User already in roster with this venue`);
        return res.json({ 
          success: true, 
          message: 'Already in roster', 
          data: existingAny 
        });
      }
    }

    // ✅ Verify venue exists in regional database
    try {
      await dbManager.connectRegion(region);
      const regionalConnection = dbManager.getConnection(region);
      const RegionalVenue = regionalConnection.model('Venue', Venue.schema);
      
      const venue = await RegionalVenue.findById(venueId);
      if (!venue) {
        return res.status(404).json({ 
          success: false, 
          message: `Venue ${venueId} not found in region ${region}` 
        });
      }
      console.log(`✅ Verified venue exists: ${venue.AccountName}`);
    } catch (error: any) {
      console.error(`❌ Error verifying venue:`, error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error verifying venue', 
        error: error.message 
      });
    }

    // ✅ Create new valid roster entry
    const roster = new VenueRoster({
      staffUserId: new mongoose.Types.ObjectId(req.user.userId),
      venueId: new mongoose.Types.ObjectId(venueId),
      role: 'OWNER',
      status: 'ACTIVE',
      permissions: [
        'VIEW_DASHBOARD', 
        'MANAGE_STAFF', 
        'VIEW_REDEMPTIONS', 
        'APPROVE_REDEMPTIONS'
      ],
      joinedAt: new Date(),
      activatedAt: new Date(),
      invitedBy: new mongoose.Types.ObjectId(req.user.userId)
    });

    await roster.save();

    console.log(`✅ Staff added to roster: ${roster._id}`);

    res.json({ 
      success: true, 
      message: 'Added to roster successfully', 
      data: roster 
    });

  } catch (error: any) {
    console.error('❌ Error adding to roster:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error adding to roster', 
      error: error.message 
    });
  }
};

// ✅ FIXED: GET /api/staff/roster/:venueId - Get venue roster with enriched staff data
export const getVenueRoster = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const region = (req.region || 'ae') as Region;

    console.log(`📋 Fetching venue roster for venueId: ${venueId}, region: ${region}`);

    const roster = await VenueRoster.find({
      venueId,
      status: { $ne: 'REMOVED' }
    })
      .sort({ activatedAt: -1, invitedAt: -1 })
      .lean();

    // ✅ Get last session info for each member
    const rosterWithActivity = await Promise.all(
      roster.map(async (member) => {
        const lastSession = await StaffSession.findOne({
          staffUserId: member.staffUserId,
          venueId
        }).sort({ lastSeen: -1 });

        return {
          ...member,
          lastSeenAt: lastSession?.lastSeen || member.lastSeenAt
        };
      })
    );

    console.log(`✅ Fetched ${rosterWithActivity.length} roster members`);

    res.json({
      success: true,
      data: rosterWithActivity,
      count: rosterWithActivity.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching roster:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching roster', 
      error: error.message 
    });
  }
};

// ✅ POST /api/staff/roster/invite - Invite staff member
export const inviteStaffMember = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId, email, phone, role = 'MEMBER' } = req.body;
    const region = (req.region || 'ae') as Region;

    console.log(`📧 Inviting staff: email=${email}, phone=${phone}, role=${role}, region=${region}`);

    const user = await User.findOne({ $or: [{ email }, { phone }] });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found. They must create an account first.' 
      });
    }

    const existing = await VenueRoster.findOne({
      staffUserId: user._id,
      venueId
    });

    if (existing && existing.status === 'ACTIVE') {
      return res.status(400).json({ 
        success: false, 
        message: 'User already on venue staff' 
      });
    }

    let roster;
    if (existing) {
      existing.status = 'PENDING';
      existing.role = role;
      existing.invitedBy = req.user.userId as any;
      existing.invitedAt = new Date();
      roster = await existing.save();
    } else {
      roster = new VenueRoster({
        staffUserId: user._id,
        venueId: new mongoose.Types.ObjectId(venueId),
        role,
        status: 'PENDING',
        invitedBy: req.user.userId
      });
      await roster.save();
    }

    console.log(`✅ Invitation sent to ${email || phone}`);

    res.status(201).json({
      success: true,
      message: 'Staff invitation sent',
      data: roster.toObject()
    });

  } catch (error: any) {
    console.error('❌ Error inviting staff:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error inviting staff', 
      error: error.message 
    });
  }
};

// ✅ PUT /api/staff/roster/:rosterId/role - Update staff role
export const updateStaffRole = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only owners can change roles' });
    }

    const { rosterId } = req.params;
    const { role } = req.body;

    console.log(`🔄 Updating staff role: rosterId=${rosterId}, newRole=${role}`);

    const roster = await VenueRoster.findById(rosterId);

    if (!roster) {
      return res.status(404).json({ success: false, message: 'Roster entry not found' });
    }

    const fromRole = roster.role;
    roster.role = role;
    await roster.save();

    console.log(`✅ Role updated from ${fromRole} to ${role}`);

    res.json({
      success: true,
      message: `Role updated from ${fromRole} to ${role}`,
      data: roster.toObject()
    });

  } catch (error: any) {
    console.error('❌ Error updating role:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating role', 
      error: error.message 
    });
  }
};

// ✅ DELETE /api/staff/roster/:rosterId - Remove staff member
export const removeStaffMember = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { rosterId } = req.params;
    const { reason } = req.body;

    console.log(`🗑️ Removing staff member: rosterId=${rosterId}`);

    const roster = await VenueRoster.findById(rosterId);

    if (!roster) {
      return res.status(404).json({ success: false, message: 'Roster entry not found' });
    }

    roster.status = 'REMOVED';
    roster.removedAt = new Date();
    roster.notes = reason || roster.notes;
    await roster.save();

    await StaffSession.updateMany(
      {
        staffUserId: roster.staffUserId,
        venueId: roster.venueId,
        isActive: true
      },
      {
        isActive: false,
        lockedAt: new Date(),
        lockReason: 'STAFF_REMOVED'
      }
    );

    console.log(`✅ Staff member removed`);

    res.json({
      success: true,
      message: 'Staff member removed successfully'
    });

  } catch (error: any) {
    console.error('❌ Error removing staff:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error removing staff', 
      error: error.message 
    });
  }
};

// ✅ PUT /api/staff/roster/:rosterId/suspend - Suspend staff member
export const suspendStaffMember = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { rosterId } = req.params;
    const { reason } = req.body;

    console.log(`⏸️ Suspending staff member: rosterId=${rosterId}`);

    const roster = await VenueRoster.findById(rosterId);

    if (!roster) {
      return res.status(404).json({ success: false, message: 'Roster entry not found' });
    }

    roster.status = 'SUSPENDED';
    roster.suspendedAt = new Date();
    roster.notes = reason || roster.notes;
    await roster.save();

    await StaffSession.updateMany(
      {
        staffUserId: roster.staffUserId,
        venueId: roster.venueId,
        isActive: true
      },
      {
        isActive: false,
        lockedAt: new Date(),
        lockReason: 'STAFF_SUSPENDED'
      }
    );

    console.log(`✅ Staff member suspended`);

    res.json({
      success: true,
      message: 'Staff member suspended'
    });

  } catch (error: any) {
    console.error('❌ Error suspending staff:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error suspending staff', 
      error: error.message 
    });
  }
};
