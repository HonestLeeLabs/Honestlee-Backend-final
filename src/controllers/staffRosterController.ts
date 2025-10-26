// ===== FILE: src/controllers/staffRosterController.ts =====
import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import VenueRoster from '../models/VenueRoster';
import User from '../models/User';
import StaffSession from '../models/StaffSession';

// ✅ NEW: GET /api/staff/roster/my-roster - Get current user's roster entries
export const getMyRosterEntries = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    console.log('🔍 Fetching roster for userId:', req.user.userId);

    const rosterEntries = await VenueRoster.find({
      staffUserId: req.user.userId,
      status: 'ACTIVE'
    })
      .populate('venueId')
      .sort({ activatedAt: -1 });

    console.log('✅ Found roster entries:', rosterEntries.length);

    res.json({
      success: true,
      data: rosterEntries
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

// ✅ TEST ENDPOINT - Add current user to roster
export const testAddStaffToRoster = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { venueId } = req.body;

    if (!venueId) {
      return res.status(400).json({ success: false, message: 'venueId is required' });
    }

    // Check if already exists
    const existing = await VenueRoster.findOne({
      staffUserId: req.user.userId,
      venueId
    });

    if (existing) {
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

    res.json({ success: true, message: 'Added to roster successfully', data: roster });

  } catch (error: any) {
    console.error('Error adding to roster:', error);
    res.status(500).json({ success: false, message: 'Error adding to roster', error: error.message });
  }
};

// GET /api/staff/roster/:venueId - Get venue roster
export const getVenueRoster = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;

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

    res.json({
      success: true,
      data: rosterWithActivity,
      count: rosterWithActivity.length
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching roster', error: error.message });
  }
};

// POST /api/staff/roster/invite - Invite staff member
export const inviteStaffMember = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId, email, phone, role = 'MEMBER' } = req.body;

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

    // TODO: Send invitation email/SMS

    res.status(201).json({
      success: true,
      message: 'Staff invitation sent',
      data: roster
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error inviting staff', error: error.message });
  }
};

// PUT /api/staff/roster/:rosterId/role - Update staff role
export const updateStaffRole = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only owners can change roles' });
    }

    const { rosterId } = req.params;
    const { role } = req.body;

    const roster = await VenueRoster.findById(rosterId);

    if (!roster) {
      return res.status(404).json({ success: false, message: 'Roster entry not found' });
    }

    const fromRole = roster.role;
    roster.role = role;
    await roster.save();

    res.json({
      success: true,
      message: `Role updated from ${fromRole} to ${role}`,
      data: roster
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error updating role', error: error.message });
  }
};

// DELETE /api/staff/roster/:rosterId - Remove staff member
export const removeStaffMember = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { rosterId } = req.params;
    const { reason } = req.body;

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

    res.json({
      success: true,
      message: 'Staff member removed and sessions locked'
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error removing staff', error: error.message });
  }
};

// PUT /api/staff/roster/:rosterId/suspend - Suspend staff member
export const suspendStaffMember = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { rosterId } = req.params;
    const { reason } = req.body;

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

    res.json({
      success: true,
      message: 'Staff member suspended'
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error suspending staff', error: error.message });
  }
};
