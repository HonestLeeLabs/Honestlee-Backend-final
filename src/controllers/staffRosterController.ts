// ===== FILE: src/controllers/staffRosterController.ts =====
// ✅ CRITICAL FIX: Import the actual street vendor model getter
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import VenueRoster from '../models/VenueRoster';
import User from '../models/User';
import StaffSession from '../models/StaffSession';
import { dbManager, Region } from '../config/database';
import Venue, { getStreetVendorModel } from '../models/Venue'; // ✅ ADDED getStreetVendorModel
import mongoose from 'mongoose';

type StaffRequest = AuthRequest & RegionRequest;

interface EnrichedRosterEntry {
  _id: mongoose.Types.ObjectId;
  staffUserId: mongoose.Types.ObjectId;
  venueId: any;
  role: string;
  status: string;
  permissions: string[];
  invitedBy: mongoose.Types.ObjectId;
  invitedAt: Date;
  joinedAt?: Date;
  activatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: any;
}

// ✅ ULTRA FIXED: GET /api/staff/roster/my-roster
export const getMyRosterEntries = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const region = (req.region || 'ae') as Region;
    console.log(`🔍 Fetching roster for userId: ${req.user.userId}, region: ${region}`);

    const allRosterEntries = await VenueRoster.find({
      staffUserId: req.user.userId
    }).lean();

    console.log(`📊 Total roster entries: ${allRosterEntries.length}`);

    const validRosterEntries = allRosterEntries.filter(entry => 
      entry.status === 'ACTIVE' && 
      entry.venueId && 
      mongoose.Types.ObjectId.isValid(entry.venueId.toString())
    );

    console.log(`✅ Valid roster entries: ${validRosterEntries.length}`);

    if (validRosterEntries.length === 0) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: 'No active venues or vendors assigned'
      });
    }

    // ✅ CRITICAL FIX: Use proper street vendor model
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region); // ✅ Proper model
    const regionalConnection = dbManager.getConnection(region);
    const RegionalVenue = regionalConnection.model('Venue', Venue.schema);

    const enrichedRosters: EnrichedRosterEntry[] = await Promise.all(
      validRosterEntries.map(async (roster): Promise<EnrichedRosterEntry> => {
        const venueIdStr = roster.venueId.toString();
        
        try {
          // ✅ Try regular venue first
          let venueData = await RegionalVenue.findById(venueIdStr).lean();
          
          // ✅ If not found, try street vendor with PROPER MODEL
          if (!venueData) {
            console.log(`🔍 Not found in venues, checking street_vendors for ${venueIdStr}`);
            venueData = await StreetVendor.findById(venueIdStr).lean();
            if (venueData) {
              console.log(`✅ Found street vendor: ${venueData.vendorName}`);
            }
          }

          if (venueData) {
            return {
              ...roster,
              venueId: venueData
            } as EnrichedRosterEntry;
          } else {
            console.warn(`⚠️ Venue/Vendor ${venueIdStr} not found in ${region}`);
            return {
              ...roster,
              venueId: null
            } as EnrichedRosterEntry;
          }
        } catch (error) {
          console.error(`❌ Error fetching venue ${venueIdStr}:`, (error as any).message);
          return {
            ...roster,
            venueId: null
          } as EnrichedRosterEntry;
        }
      })
    );

    const successfullyEnriched = enrichedRosters.filter(r => r.venueId !== null);

    console.log(`✅ Successfully enriched ${successfullyEnriched.length} entries`);

    res.json({
      success: true,
      data: successfullyEnriched,
      count: successfullyEnriched.length
    });

  } catch (error: any) {
    console.error('❌ Error in getMyRosterEntries:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching roster',
      error: error.message
    });
  }
};

// ✅ POST /api/staff/roster/test-add - FIXED STREET VENDOR CHECK
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

    console.log(`➕ Adding to roster: venueId=${venueId}, userId=${req.user.userId}, region=${region}`);

    // Check if already exists
    const existing = await VenueRoster.findOne({
      staffUserId: req.user.userId,
      venueId: new mongoose.Types.ObjectId(venueId)
    });

    if (existing) {
      if (existing.status === 'ACTIVE') {
        console.log(`ℹ️ Already in roster`);
        return res.json({ 
          success: true, 
          message: 'Already in roster', 
          data: existing 
        });
      } else {
        existing.status = 'ACTIVE';
        existing.activatedAt = new Date();
        await existing.save();
        console.log(`✅ Reactivated roster entry`);
        return res.json({
          success: true,
          message: 'Roster entry reactivated',
          data: existing
        });
      }
    }

    // ✅ CRITICAL FIX: Check BOTH collections properly
    await dbManager.connectRegion(region);
    const StreetVendor = getStreetVendorModel(region); // ✅ Use proper model
    const regionalConnection = dbManager.getConnection(region);
    const RegionalVenue = regionalConnection.model('Venue', Venue.schema);
    
    console.log(`🔍 Checking if ${venueId} exists in region ${region}...`);
    
    // Try venue first
    let venue = await RegionalVenue.findById(venueId).lean();
    let entityType = 'venue';
    
    // If not found, try street vendor
    if (!venue) {
      console.log(`🔍 Not found in venues, checking street_vendors...`);
      venue = await StreetVendor.findById(venueId).lean();
      entityType = 'street_vendor';
    }
    
    if (!venue) {
      console.error(`❌ ${venueId} not found in EITHER venues or street_vendors in ${region}`);
      return res.status(404).json({ 
        success: false, 
        message: `Venue/Vendor ${venueId} not found in region ${region}. Checked both venues and street_vendors collections.`
      });
    }
    
    const name = venue.AccountName || venue.vendorName || 'Unknown';
    console.log(`✅ Found ${entityType}: ${name}`);

    // Create roster entry
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

    console.log(`✅ Added ${entityType} to roster: ${roster._id}`);

    res.json({ 
      success: true, 
      message: `Added ${entityType} to roster successfully`, 
      data: roster,
      entityType,
      entityName: name
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

// ✅ POST /api/staff/roster/cleanup
export const cleanupInvalidRosters = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await VenueRoster.deleteMany({
      staffUserId: req.user.userId,
      $or: [
        { venueId: { $exists: false } },
        { venueId: null }
      ]
    });

    console.log(`🗑️ Removed ${result.deletedCount} invalid entries`);

    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} invalid entries`,
      deletedCount: result.deletedCount
    });

  } catch (error: any) {
    console.error('❌ Error cleaning rosters:', error);
    res.status(500).json({
      success: false,
      message: 'Error cleaning rosters',
      error: error.message
    });
  }
};

// ✅ GET /api/staff/roster/my-invitations
export const getMyInvitations = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const region = (req.region || 'ae') as Region;

    const invitations = await VenueRoster.find({
      staffUserId: req.user.userId,
      status: 'PENDING',
      venueId: { $exists: true, $ne: null, $type: 'objectId' }
    })
      .populate('invitedBy', 'name email')
      .sort({ invitedAt: -1 })
      .lean();

    if (invitations.length === 0) {
      return res.json({ success: true, data: [], count: 0 });
    }

    await dbManager.connectRegion(region);
    const regionalConnection = dbManager.getConnection(region);
    const RegionalVenue = regionalConnection.model('Venue', Venue.schema);

    const enrichedInvitations: EnrichedRosterEntry[] = await Promise.all(
      invitations.map(async (invitation): Promise<EnrichedRosterEntry> => {
        if (!invitation.venueId) {
          return invitation as EnrichedRosterEntry;
        }

        try {
          const venueData = await RegionalVenue.findById(invitation.venueId).lean();
          if (venueData) {
            return {
              ...invitation,
              venueId: venueData
            } as EnrichedRosterEntry;
          }
        } catch (error) {
          console.warn(`⚠️ Error enriching invitation:`, (error as any).message);
        }

        return invitation as EnrichedRosterEntry;
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

// ✅ PUT /api/staff/roster/:rosterId/accept
export const acceptStaffInvitation = async (req: StaffRequest, res: Response, next?: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { rosterId } = req.params;
    const roster = await VenueRoster.findById(rosterId);

    if (!roster) {
      return res.status(404).json({ success: false, message: 'Invitation not found' });
    }

    if (roster.staffUserId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Not your invitation' });
    }

    if (roster.status === 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Already accepted' });
    }

    if (roster.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Cannot accept ${roster.status}` });
    }

    roster.status = 'ACTIVE';
    roster.activatedAt = new Date();
    roster.joinedAt = new Date();

    if (!roster.permissions || roster.permissions.length === 0) {
      roster.permissions = ['VIEW_DASHBOARD', 'VIEW_REDEMPTIONS'];
    }

    await roster.save();

    res.json({
      success: true,
      message: 'Invitation accepted',
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
