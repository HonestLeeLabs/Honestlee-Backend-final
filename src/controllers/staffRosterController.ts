// ===== FILE: src/controllers/staffRosterController.ts =====
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import VenueRoster from '../models/VenueRoster';
import User from '../models/User';
import StaffSession from '../models/StaffSession';
import { dbManager, Region } from '../config/database';
import Venue from '../models/Venue';

// ✅ Combined type with region support
type StaffRequest = AuthRequest & RegionRequest;

// ✅ GET /api/staff/roster/my-roster - Get current user's active roster entries
export const getMyRosterEntries = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const region = (req.region || 'ae') as Region;
    console.log(`🔍 Fetching roster for userId: ${req.user.userId}, region: ${region}`);

    const rosterEntries = await VenueRoster.find({
      staffUserId: req.user.userId,
      status: 'ACTIVE',
      venueId: { $exists: true, $ne: null } // ✅ FIXED: Only get rosters with valid venueId
    })
      .populate('venueId')
      .sort({ activatedAt: -1 });

    console.log(`✅ Found roster entries: ${rosterEntries.length}`);

    // ✅ FIXED: Properly handle null venueId and enrich with regional data
    const enrichedRosters = await Promise.all(
      rosterEntries.map(async (roster) => {
        const rosterObj = roster.toObject();
        
        // Check if venueId exists and get its ID
        if (!rosterObj.venueId) {
          console.warn(`⚠️ Roster ${roster._id} has null venueId`);
          return rosterObj; // Return as-is if no venue
        }

        const venueId = rosterObj.venueId._id || rosterObj.venueId;
        
        // ✅ NEW: Fetch from regional database
        try {
          const regionalConnection = dbManager.getConnection(region);
          const RegionalVenue = regionalConnection.model('Venue', Venue.schema);
          
          const venueData = await RegionalVenue.findById(venueId);
          if (venueData) {
            rosterObj.venueId = venueData.toObject();
            console.log(`✅ Enriched venue data for ${venueId}`);
          } else {
            console.warn(`⚠️ Venue ${venueId} not found in region ${region}`);
          }
        } catch (error) {
          console.warn(`⚠️ Could not fetch venue ${venueId} from region ${region}:`, (error as any).message);
          // Keep the original populated data if regional fetch fails
        }
        
        return rosterObj;
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

// ✅ GET /api/staff/roster/my-invitations - Get pending invitations for current user
export const getMyInvitations = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const region = (req.region || 'ae') as Region;
    console.log(`🔍 Fetching invitations for userId: ${req.user.userId}, region: ${region}`);

    const invitations = await VenueRoster.find({
      staffUserId: req.user.userId,
      status: 'PENDING'
    })
      .populate('venueId', 'AccountName BillingCity venuecategory venuecategorydisplayname')
      .populate('invitedBy', 'name email')
      .sort({ invitedAt: -1 });

    console.log(`✅ Found invitations: ${invitations.length}`);

    // ✅ FIXED: Properly handle null venueId
    const enrichedInvitations = await Promise.all(
      invitations.map(async (invitation) => {
        const invObj = invitation.toObject();
        
        // Check if venueId exists
        if (!invObj.venueId) {
          console.warn(`⚠️ Invitation ${invitation._id} has null venueId`);
          return invObj;
        }

        const venueId = invObj.venueId._id || invObj.venueId;
        
        try {
          const regionalConnection = dbManager.getConnection(region);
          const RegionalVenue = regionalConnection.model('Venue', Venue.schema);
          
          const venueData = await RegionalVenue.findById(venueId);
          if (venueData) {
            invObj.venueId = venueData.toObject();
            console.log(`✅ Enriched venue data for ${venueId}`);
          }
        } catch (error) {
          console.warn(`⚠️ Could not fetch venue ${venueId} from region ${region}:`, (error as any).message);
        }
        
        return invObj;
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

// ✅ NEW: PUT /api/staff/roster/:rosterId/accept - Accept staff invitation
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

    // Verify this invitation is for the current user
    if (roster.staffUserId.toString() !== req.user.userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'This invitation is not for you' 
      });
    }

    // Check if already active
    if (roster.status === 'ACTIVE') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invitation already accepted' 
      });
    }

    // Check if not pending
    if (roster.status !== 'PENDING') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot accept invitation with status: ${roster.status}` 
      });
    }

    // Accept the invitation
    roster.status = 'ACTIVE';
    roster.activatedAt = new Date();
    roster.joinedAt = new Date();

    // Set default permissions based on role
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
      data: roster
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

// ✅ FIX ENDPOINT: Clean up invalid roster entries and add user to a venue
export const fixAndAddToRoster = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { venueId } = req.body;
    const region = (req.region || 'ae') as Region;

    if (!venueId) {
      return res.status(400).json({ success: false, message: 'venueId is required' });
    }

    console.log(`🔧 Fixing roster: userId=${req.user.userId}, venueId=${venueId}, region=${region}`);

    // Remove all roster entries with null venueId for this user
    const removedInvalid = await VenueRoster.deleteMany({
      staffUserId: req.user.userId,
      $or: [
        { venueId: { $exists: false } },
        { venueId: null }
      ]
    });

    console.log(`🗑️ Removed ${removedInvalid.deletedCount} invalid roster entries`);

    // Check if valid entry already exists
    const existing = await VenueRoster.findOne({
      staffUserId: req.user.userId,
      venueId,
      status: 'ACTIVE'
    });

    if (existing) {
      console.log(`ℹ️ User already has valid roster entry for venue ${venueId}`);
      return res.json({ 
        success: true, 
        message: 'Already in roster', 
        data: existing,
        cleaned: removedInvalid.deletedCount 
      });
    }

    // Create new valid roster entry
    const roster = new VenueRoster({
      staffUserId: req.user.userId,
      venueId,
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
      invitedBy: req.user.userId
    });

    await roster.save();

    console.log(`✅ Created valid roster entry: ${roster._id}`);

    res.json({ 
      success: true, 
      message: 'Roster fixed and user added successfully',
      data: roster,
      cleaned: removedInvalid.deletedCount
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

// ✅ TEST ENDPOINT - Add current user to roster
export const testAddStaffToRoster = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { venueId } = req.body;
    const region = (req.region || 'ae') as Region;

    if (!venueId) {
      return res.status(400).json({ success: false, message: 'venueId is required' });
    }

    console.log(`➕ Test adding staff to roster: ${venueId}, region: ${region}`);

    // Check if valid entry already exists
    const existing = await VenueRoster.findOne({
      staffUserId: req.user.userId,
      venueId,
      status: 'ACTIVE'
    });

    if (existing) {
      console.log(`ℹ️ User already in roster`);
      return res.json({ success: true, message: 'Already in roster', data: existing });
    }

    // Create new roster entry
    const roster = new VenueRoster({
      staffUserId: req.user.userId,
      venueId,
      role: 'OWNER',
      status: 'ACTIVE',
      permissions: ['VIEW_DASHBOARD', 'MANAGE_STAFF', 'VIEW_REDEMPTIONS', 'APPROVE_REDEMPTIONS'],
      joinedAt: new Date(),
      activatedAt: new Date(),
      invitedBy: req.user.userId
    });

    await roster.save();

    console.log(`✅ Staff added to roster: ${roster._id}`);

    res.json({ success: true, message: 'Added to roster successfully', data: roster });

  } catch (error: any) {
    console.error('❌ Error adding to roster:', error);
    res.status(500).json({ success: false, message: 'Error adding to roster', error: error.message });
  }
};

// ✅ GET /api/staff/roster/:venueId - Get venue roster
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
      .populate('staffUserId', 'name email phone')
      .populate('invitedBy', 'name')
      .sort({ activatedAt: -1, invitedAt: -1 });

    // Get last seen info
    const rosterWithActivity = await Promise.all(
      roster.map(async (member) => {
        const lastSession = await StaffSession.findOne({
          staffUserId: member.staffUserId,
          venueId
        }).sort({ lastSeen: -1 });

        return {
          ...member.toObject(),
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
    res.status(500).json({ success: false, message: 'Error fetching roster', error: error.message });
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

    console.log(`📧 Inviting staff member: email=${email}, phone=${phone}, role=${role}, region=${region}`);

    // Find user by email or phone
    const user = await User.findOne({ $or: [{ email }, { phone }] });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found. They must create an account first.' });
    }

    // Check if already on roster
    const existing = await VenueRoster.findOne({
      staffUserId: user._id,
      venueId
    });

    if (existing && existing.status === 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'User already on venue staff' });
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
        venueId,
        role,
        status: 'PENDING',
        invitedBy: req.user.userId
      });
      await roster.save();
    }

    console.log(`✅ Invitation sent to ${email || phone}`);

    // TODO: Send invitation email/SMS

    res.status(201).json({
      success: true,
      message: 'Staff invitation sent',
      data: roster
    });

  } catch (error: any) {
    console.error('❌ Error inviting staff:', error);
    res.status(500).json({ success: false, message: 'Error inviting staff', error: error.message });
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
      data: roster
    });

  } catch (error: any) {
    console.error('❌ Error updating role:', error);
    res.status(500).json({ success: false, message: 'Error updating role', error: error.message });
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

    console.log(`🗑️ Removing staff member: rosterId=${rosterId}, reason=${reason}`);

    const roster = await VenueRoster.findById(rosterId);

    if (!roster) {
      return res.status(404).json({ success: false, message: 'Roster entry not found' });
    }

    roster.status = 'REMOVED';
    roster.removedAt = new Date();
    roster.notes = reason || roster.notes;
    await roster.save();

    // Lock all active sessions for this user at this venue
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

    console.log(`✅ Staff member removed and sessions locked`);

    res.json({
      success: true,
      message: 'Staff member removed and sessions locked'
    });

  } catch (error: any) {
    console.error('❌ Error removing staff:', error);
    res.status(500).json({ success: false, message: 'Error removing staff', error: error.message });
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

    console.log(`⏸️ Suspending staff member: rosterId=${rosterId}, reason=${reason}`);

    const roster = await VenueRoster.findById(rosterId);

    if (!roster) {
      return res.status(404).json({ success: false, message: 'Roster entry not found' });
    }

    roster.status = 'SUSPENDED';
    roster.suspendedAt = new Date();
    roster.notes = reason || roster.notes;
    await roster.save();

    // Lock active sessions
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
    res.status(500).json({ success: false, message: 'Error suspending staff', error: error.message });
  }
};
