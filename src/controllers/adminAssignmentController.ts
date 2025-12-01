// controllers/adminVenueController.ts
import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import AgentVenueTemp from '../models/AgentVenueTemp';
import User from '../models/User';
import AuditLog from '../models/AuditLog';
import { v4 as uuidv4 } from 'uuid';

// Verification Level Constants
export enum VerificationLevel {
  PROSPECT_REMOTE = 'PROSPECT_REMOTE',
  LISTED_UNCLAIMED = 'LISTED_UNCLAIMED',
  IMPORTED_QUALIFIED = 'IMPORTED_QUALIFIED',
  IMPORTED_DEQUALIFIED = 'IMPORTED_DEQUALIFIED',
  PROSPECT_QUALIFIED = 'PROSPECT_QUALIFIED',
  PROSPECT_DEQUALIFIED = 'PROSPECT_DEQUALIFIED',
  ASSIGNED_TO_AGENT = 'ASSIGNED_TO_AGENT',
  VISITED_SIGNIN = 'VISITED_SIGNIN',
  VITALS_DONE = 'VITALS_DONE',
  ACTIVITY = 'ACTIVITY',
  SELF_LISTED_UNQUALIFIED = 'SELF_LISTED_UNQUALIFIED',
  SELF_LISTED_QUALIFIED = 'SELF_LISTED_QUALIFIED',
  QR_REQUESTED = 'QR_REQUESTED',
  SOFT_ONBOARD = 'SOFT_ONBOARD',
  VERIFIED_FULL = 'VERIFIED_FULL',
  VISITED_DECLINED = 'VISITED_DECLINED',
  LEAD_CAPTURED = 'LEAD_CAPTURED',
  VERIFIED_QR_LIVE = 'VERIFIED_QR_LIVE',
  SUSPENDED = 'SUSPENDED',
  CLOSED_PERM = 'CLOSED_PERM'
}

/**
 * GET /api/admin/venues/map
 * Get all venues for map view (unassigned + assigned)
 */
export const getVenuesForMap = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { region, status, assignmentStatus, verificationLevel } = req.query;
    const filter: any = {};

    if (region) filter.region = region;
    if (status) filter.status = status;
   
    if (assignmentStatus === 'assigned') {
      filter.assignedTo = { $exists: true, $ne: null };
    } else if (assignmentStatus === 'unassigned') {
      filter.assignedTo = { $exists: false };
    }

    if (verificationLevel && verificationLevel !== 'all') {
      filter.verificationLevel = verificationLevel;
    }

    const venues = await AgentVenueTemp.find(filter)
      .populate('assignedTo', 'name email phone')
      .populate('assignedBy', 'name email')
      .select('tempVenueId name category address onboardingStatus verificationLevel assignedTo assignedBy assignmentDate expectedVisitDate visitStatus vitalsCompleted flags')
      .lean();

    res.json({
      success: true,
      count: venues.length,
      data: venues
    });
  } catch (error: any) {
    console.error('Error fetching venues for map:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch venues',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/venues/assign
 * ✅ COMPLETE FIX: Assign multiple venues to an agent (creates missing venues)
 */
export const assignVenuesToAgent = async (req: AuthRequest, res: Response) => {
  try {
    // ✅ Store user in constant to fix TypeScript error
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const currentUser = req.user;

    const { venueIds, agentId, expectedVisitDate, venuesData } = req.body;

    // ✅ Validation
    if (!Array.isArray(venueIds) || venueIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'venueIds array is required and must not be empty' 
      });
    }

    if (!agentId) {
      return res.status(400).json({ 
        success: false,
        message: 'agentId is required' 
      });
    }

    console.log('📍 Assignment request:', {
      venueIds,
      venueCount: venueIds.length,
      agentId,
      hasVenuesData: !!venuesData && Array.isArray(venuesData)
    });

    // ✅ Verify agent exists and has AGENT role
    const agent = await User.findById(agentId);
    if (!agent || agent.role !== 'AGENT') {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid agent ID or user is not an agent' 
      });
    }

    console.log('✅ Agent found:', agent.name);

    // ✅ Parse expected visit date
    const visitDate = expectedVisitDate ? new Date(expectedVisitDate) : new Date();

    // ✅ Find existing venues in AgentVenueTemp
    const existingVenues = await AgentVenueTemp.find({
      tempVenueId: { $in: venueIds }
    });

    console.log('📊 Existing venues in AgentVenueTemp:', {
      requested: venueIds.length,
      found: existingVenues.length
    });

    let assignedCount = 0;
    let createdCount = 0;

    // ✅ UPDATE existing venues
    if (existingVenues.length > 0) {
      const existingIds = existingVenues.map(v => v.tempVenueId);
      const updateResult = await AgentVenueTemp.updateMany(
        {
          tempVenueId: { $in: existingIds },
          status: { $ne: 'finalized' }
        },
        {
          $set: {
            assignedTo: agentId,
            assignedBy: currentUser.userId,
            assignmentDate: new Date(),
            expectedVisitDate: visitDate,
            visitStatus: 'not_visited',
            verificationLevel: VerificationLevel.ASSIGNED_TO_AGENT
          }
        }
      );

      assignedCount += updateResult.modifiedCount;
      console.log('✅ Updated existing venues:', updateResult.modifiedCount);
    }

    // ✅ CREATE missing venues
    const existingIds = existingVenues.map(v => v.tempVenueId);
    const missingIds = venueIds.filter((id: string) => !existingIds.includes(id));

    if (missingIds.length > 0) {
      console.log(`📝 Creating ${missingIds.length} missing venues...`);

      if (venuesData && Array.isArray(venuesData) && venuesData.length > 0) {
        const newVenues = venuesData
          .filter((v: any) => {
            const venueId = v.tempVenueId || v.id || v.Dubaiid || v._id;
            return missingIds.includes(venueId);
          })
          .map((venue: any) => {
            const venueId = venue.tempVenueId || venue.id || venue.Dubaiid || venue._id;
            
            return {
              tempVenueId: venueId,
              name: venue.name || venue.AccountName || 'Unnamed Venue',
              category: venue.category || ['restaurant'],
              address: {
                lat: venue.address?.lat || venue.geometry?.coordinates?.[1] || 0,
                lng: venue.address?.lng || venue.geometry?.coordinates?.[0] || 0,
                raw: venue.address?.raw || venue.address?.street || 'Unknown Address',
                city: venue.address?.city,
                district: venue.address?.district,
                state: venue.address?.state,
                country: venue.address?.country || 'Thailand',
                countryCode: venue.address?.countryCode || 'TH'
              },
              phone: venue.phone,
              assignedTo: agentId,
              assignedBy: currentUser.userId,
              assignmentDate: new Date(),
              expectedVisitDate: visitDate,
              visitStatus: 'not_visited',
              verificationLevel: VerificationLevel.ASSIGNED_TO_AGENT,
              status: 'temp',
              onboardingStatus: 'UNLISTED',
              region: currentUser.region || 'th',
              createdBy: currentUser.userId,
              flags: {
                qrCodesLeftBehind: false,
                ownerMet: false,
                haveOwnersContact: false,
                managerMet: false,
                haveManagersContact: false
              }
            };
          });

        if (newVenues.length > 0) {
          await AgentVenueTemp.insertMany(newVenues);
          createdCount = newVenues.length;
          assignedCount += createdCount;
          console.log(`✅ Created and assigned ${createdCount} new venues`);
        }
      } else {
        console.warn('⚠️ No venuesData provided, cannot create missing venues');
      }
    }

    // ✅ Create audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: currentUser.userId,
      actorRole: currentUser.role,
      action: 'VENUES_ASSIGNED',
      meta: {
        venueIds,
        agentId,
        agentName: agent.name,
        expectedVisitDate: visitDate,
        assignedCount,
        createdCount
      }
    });

    res.json({
      success: true,
      message: `${assignedCount} venues assigned to ${agent.name}`,
      data: {
        assignedCount,
        createdCount,
        agentName: agent.name,
        expectedVisitDate: visitDate
      }
    });
  } catch (error: any) {
    console.error('❌ Error assigning venues:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign venues',
      error: error.message
    });
  }
};
/**
 * DELETE /api/admin/venues/:tempVenueId
 * Delete a venue permanently
 */
export const deleteVenue = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const currentUser = req.user;
    const { tempVenueId } = req.params;

    // ✅ FIX: Find the venue first to get its data
    const venue = await AgentVenueTemp.findOne({ tempVenueId });

    if (!venue) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    // Store venue data before deletion
    const venueName = venue.name;
    const venueRegion = venue.region;

    // Now delete the venue
    await AgentVenueTemp.deleteOne({ tempVenueId });

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: currentUser.userId,
      actorRole: currentUser.role,
      action: 'VENUE_DELETED',
      meta: {
        tempVenueId,
        venueName: venueName,
        deletedFromRegion: venueRegion
      }
    });

    console.log(`Venue deleted: ${tempVenueId}`);

    res.json({
      success: true,
      message: 'Venue deleted successfully',
      data: { tempVenueId, name: venueName }
    });
  } catch (error: any) {
    console.error('Error deleting venue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete venue',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/agents
 * Get all agents for assignment dropdown
 */
export const getAgents = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const agents = await User.find({ role: 'AGENT' })
      .select('_id name email phone')
      .lean();

    res.json({
      success: true,
      count: agents.length,
      data: agents
    });
  } catch (error: any) {
    console.error('Error fetching agents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agents',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/assignments/stats
 * Get assignment statistics
 */
export const getAssignmentStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalVenues,
      assignedVenues,
      unassignedVenues,
      todayAssignments,
      tomorrowAssignments,
      visitedToday,
      pendingVitals
    ] = await Promise.all([
      AgentVenueTemp.countDocuments({ status: { $ne: 'finalized' } }),
      AgentVenueTemp.countDocuments({ assignedTo: { $exists: true, $ne: null }, status: { $ne: 'finalized' } }),
      AgentVenueTemp.countDocuments({ assignedTo: { $exists: false }, status: { $ne: 'finalized' } }),
      AgentVenueTemp.countDocuments({ expectedVisitDate: { $gte: today, $lt: tomorrow } }),
      AgentVenueTemp.countDocuments({ expectedVisitDate: { $gte: tomorrow, $lt: new Date(tomorrow.getTime() + 86400000) } }),
      AgentVenueTemp.countDocuments({ visitStatus: 'visited', visitedAt: { $gte: today } }),
      AgentVenueTemp.countDocuments({ visitStatus: 'visited', vitalsCompleted: false })
    ]);

    res.json({
      success: true,
      data: {
        totalVenues,
        assignedVenues,
        unassignedVenues,
        todayAssignments,
        tomorrowAssignments,
        visitedToday,
        pendingVitals
      }
    });
  } catch (error: any) {
    console.error('Error fetching assignment stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: error.message
    });
  }
};

/**
 * DELETE /api/admin/venues/:tempVenueId/assignment
 * Unassign venue from agent
 */
export const unassignVenue = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const currentUser = req.user;
    const { tempVenueId } = req.params;

    const venue = await AgentVenueTemp.findOneAndUpdate(
      { tempVenueId },
      {
        $unset: {
          assignedTo: '',
          assignedBy: '',
          assignmentDate: '',
          expectedVisitDate: ''
        },
        $set: {
          visitStatus: 'not_visited',
          verificationLevel: VerificationLevel.LISTED_UNCLAIMED
        }
      },
      { new: true }
    );

    if (!venue) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: currentUser.userId,
      actorRole: currentUser.role,
      action: 'VENUE_UNASSIGNED',
      meta: { tempVenueId, venueName: venue.name }
    });

    res.json({
      success: true,
      message: 'Venue unassigned successfully',
      data: venue
    });
  } catch (error: any) {
    console.error('Error unassigning venue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unassign venue',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/agent/:agentId/assignments
 * Get assignments for specific agent (for admin viewing)
 */
export const getAgentAssignments = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { agentId } = req.params;
    const { date, status } = req.query;

    const filter: any = {
      assignedTo: agentId,
      status: { $ne: 'finalized' }
    };

    if (date) {
      const targetDate = new Date(date as string);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      filter.expectedVisitDate = { $gte: targetDate, $lt: nextDay };
    }

    if (status) {
      filter.visitStatus = status;
    }

    const venues = await AgentVenueTemp.find(filter)
      .select('tempVenueId name category address verificationLevel expectedVisitDate visitStatus vitalsCompleted vitalsData flags googleData')
      .sort({ expectedVisitDate: 1 })
      .lean();

    res.json({
      success: true,
      count: venues.length,
      data: venues
    });
  } catch (error: any) {
    console.error('Error fetching agent assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assignments',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/verification-levels
 * Get all verification levels and their stats
 */
export const getVerificationLevels = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const levels = Object.values(VerificationLevel);
    const stats = await Promise.all(
      levels.map(async (level) => {
        const count = await AgentVenueTemp.countDocuments({
          verificationLevel: level,
          status: { $ne: 'finalized' }
        });
        return { level, count };
      })
    );

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('Error fetching verification levels:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verification levels',
      error: error.message
    });
  }
};

/**
 * PUT /api/admin/venues/:tempVenueId/verification-level
 * Update verification level for a venue
 */
export const updateVerificationLevel = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const currentUser = req.user;
    const { tempVenueId } = req.params;
    const { verificationLevel } = req.body;

    if (!Object.values(VerificationLevel).includes(verificationLevel)) {
      return res.status(400).json({ message: 'Invalid verification level' });
    }

    const venue = await AgentVenueTemp.findOneAndUpdate(
      { tempVenueId },
      { verificationLevel },
      { new: true }
    );

    if (!venue) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: currentUser.userId,
      actorRole: currentUser.role,
      action: 'VERIFICATION_LEVEL_UPDATED',
      meta: { tempVenueId, newLevel: verificationLevel, oldLevel: venue.verificationLevel }
    });

    res.json({
      success: true,
      message: 'Verification level updated',
      data: venue
    });
  } catch (error: any) {
    console.error('Error updating verification level:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update verification level',
      error: error.message
    });
  }
};
