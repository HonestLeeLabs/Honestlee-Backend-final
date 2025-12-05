// controllers/adminVenueController.ts
import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import AgentVenueTemp from '../models/AgentVenueTemp';
import User from '../models/User';
import AuditLog from '../models/AuditLog';
import mongoose from 'mongoose';
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
 * ✅ COMPLETE FIXED: GET /api/admin/venues/map
 * Get all venues for map view with aggregated media, WiFi, and notes counts
 */
// ✅ FIXED: GET /api/admin/venues/map
// controllers/adminVenueController.ts
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

    console.log('🔍 Fetching venues with filter:', filter);

    // ✅ FIXED: Enhanced aggregation with proper venueId/tempVenueId matching
    const venues = await AgentVenueTemp.aggregate([
      // Match filter criteria
      { $match: filter },
      
      // ✅ FIXED: Lookup media from venuemedia - check BOTH tempVenueId AND venueId
    // ✅ SAFER: Lookup media from venuemedia collection
{
  $lookup: {
    from: 'venuemedia',
    let: { 
      tempId: '$tempVenueId',
      venueObjId: '$venueId'
    },
    pipeline: [
      {
        $match: {
          $expr: {
            $or: [
              { $eq: ['$tempVenueId', '$$tempId'] },
              { $eq: ['$venueId', '$$venueObjId'] },
              { $eq: ['$tempVenueId', { $convert: { input: '$$venueObjId', to: 'string', onError: null, onNull: null } }] }
            ]
          }
        }
      }
    ],
    as: 'mediaFiles'
  }
},

// ✅ SAFER: Lookup WiFi tests
{
  $lookup: {
    from: 'wifi_speed_tests',
    let: { 
      tempId: '$tempVenueId',
      venueObjId: '$venueId'
    },
    pipeline: [
      {
        $match: {
          $expr: {
            $or: [
              { $eq: ['$tempVenueId', '$$tempId'] },
              { $eq: ['$venueId', '$$venueObjId'] },
              { $eq: ['$tempVenueId', { $convert: { input: '$$venueObjId', to: 'string', onError: null, onNull: null } }] }
            ]
          }
        }
      }
    ],
    as: 'wifiTests'
  }
},
      
      // ✅ Add computed fields with safe null handling
      {
        $addFields: {
          // Photo count
          photosCount: { 
            $cond: {
              if: { $isArray: '$mediaFiles' },
              then: { $size: '$mediaFiles' },
              else: 0
            }
          },
          
          // WiFi tests count
          wifiTestsCount: { 
            $cond: {
              if: { $isArray: '$wifiTests' },
              then: { $size: '$wifiTests' },
              else: 0
            }
          },
          
          // Notes count
          notesCount: { 
            $cond: {
              if: { $isArray: '$notes' },
              then: { $size: '$notes' },
              else: 0
            }
          },
          
          // Boolean flags
          hasPhotos: { 
            $gt: [
              { 
                $cond: {
                  if: { $isArray: '$mediaFiles' },
                  then: { $size: '$mediaFiles' },
                  else: 0
                }
              }, 
              0
            ] 
          },
          
          hasWifiTests: { 
            $gt: [
              { 
                $cond: {
                  if: { $isArray: '$wifiTests' },
                  then: { $size: '$wifiTests' },
                  else: 0
                }
              }, 
              0
            ] 
          },
          
          hasNotes: { 
            $gt: [
              { 
                $cond: {
                  if: { $isArray: '$notes' },
                  then: { $size: '$notes' },
                  else: 0
                }
              }, 
              0
            ] 
          },
          
          // Check for reviews with safe null handling
          hasReviews: {
            $cond: {
              if: {
                $or: [
                  { $gt: [{ $ifNull: ['$googleData.rating', 0] }, 0] },
                  { $gt: [{ $ifNull: ['$googleData.userRatingsTotal', 0] }, 0] },
                  { 
                    $gt: [
                      { 
                        $size: { 
                          $cond: {
                            if: { $isArray: '$googleData.reviews' },
                            then: '$googleData.reviews',
                            else: []
                          }
                        } 
                      }, 
                      0
                    ] 
                  }
                ]
              },
              then: true,
              else: false
            }
          }
        }
      },
      
      // ✅ Lookup assignedTo user
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'assignedToUser'
        }
      },
      
      // ✅ Lookup assignedBy user
      {
        $lookup: {
          from: 'users',
          localField: 'assignedBy',
          foreignField: '_id',
          as: 'assignedByUser'
        }
      },
      
      // ✅ Format user data
      {
        $addFields: {
          assignedTo: { 
            $cond: {
              if: { $gt: [{ $size: '$assignedToUser' }, 0] },
              then: { 
                _id: { $arrayElemAt: ['$assignedToUser._id', 0] },
                name: { $arrayElemAt: ['$assignedToUser.name', 0] },
                email: { $arrayElemAt: ['$assignedToUser.email', 0] },
                phone: { $arrayElemAt: ['$assignedToUser.phone', 0] }
              },
              else: null
            }
          },
          assignedBy: { 
            $cond: {
              if: { $gt: [{ $size: '$assignedByUser' }, 0] },
              then: { 
                _id: { $arrayElemAt: ['$assignedByUser._id', 0] },
                name: { $arrayElemAt: ['$assignedByUser.name', 0] },
                email: { $arrayElemAt: ['$assignedByUser.email', 0] }
              },
              else: null
            }
          }
        }
      },
      
// ✅ FIXED: Final projection - ONLY use inclusion (no exclusions)
{
  $project: {
    tempVenueId: 1,
    venueId: 1,
    name: 1,
    category: 1,
    address: 1,
    onboardingStatus: 1,
    verificationLevel: 1,
    assignedTo: 1,
    assignedBy: 1,
    assignmentDate: 1,
    expectedVisitDate: 1,
    visitStatus: 1,
    vitalsCompleted: 1,
    flags: 1,
    googleData: 1,
    wifiData: 1,
    notes: 1,
    venuetype: 1,
    venuecategory: 1,
    venuecategorydisplay: 1,
    groupid: 1,
    groupiddisplayname: 1,
    venuetypedisplay: 1,
    createdAt: 1,
    updatedAt: 1,
    created_at: 1,  
    photosCount: 1,
    wifiTestsCount: 1,
    notesCount: 1,
    hasPhotos: 1,
    hasWifiTests: 1,
    hasNotes: 1,
    hasReviews: 1
    // ✅ REMOVED: Don't explicitly exclude fields, just don't include them
    // mediaFiles: 0,  ❌ REMOVE THIS
    // wifiTests: 0,   ❌ REMOVE THIS
    // assignedToUser: 0,  ❌ REMOVE THIS
    // assignedByUser: 0   ❌ REMOVE THIS
  }
}
    ]);

    console.log(`✅ Fetched ${venues.length} venues`);
    
    // ✅ Enhanced logging with counts
    if (venues.length > 0) {
      const withPhotos = venues.filter(v => v.hasPhotos).length;
      const withWifi = venues.filter(v => v.hasWifiTests).length;
      const withNotes = venues.filter(v => v.hasNotes).length;
      const withReviews = venues.filter(v => v.hasReviews).length;
      
      console.log('📊 Venue Statistics:', {
        total: venues.length,
        withPhotos,
        withWifi,
        withNotes,
        withReviews
      });
      
      // Show examples of venues with data
      const exampleWithPhotos = venues.find(v => v.hasPhotos);
      if (exampleWithPhotos) {
        console.log('✅ Example venue WITH photos:', {
          name: exampleWithPhotos.name,
          tempVenueId: exampleWithPhotos.tempVenueId,
          venueId: exampleWithPhotos.venueId,
          photosCount: exampleWithPhotos.photosCount
        });
      }
      
      const exampleWithWifi = venues.find(v => v.hasWifiTests);
      if (exampleWithWifi) {
        console.log('✅ Example venue WITH WiFi:', {
          name: exampleWithWifi.name,
          tempVenueId: exampleWithWifi.tempVenueId,
          venueId: exampleWithWifi.venueId,
          wifiTestsCount: exampleWithWifi.wifiTestsCount
        });
      }
      
      const exampleWithNotes = venues.find(v => v.hasNotes);
      if (exampleWithNotes) {
        console.log('✅ Example venue WITH notes:', {
          name: exampleWithNotes.name,
          tempVenueId: exampleWithNotes.tempVenueId,
          venueId: exampleWithNotes.venueId,
          notesCount: exampleWithNotes.notesCount
        });
      }
    }

    res.json({
      success: true,
      count: venues.length,
      data: venues
    });
  } catch (error: any) {
    console.error('❌ Error fetching venues for map:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch venues',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/venues/assign
 * Assign multiple venues to an agent (creates missing venues)
 */
export const assignVenuesToAgent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const currentUser = req.user;

    const { venueIds, agentId, expectedVisitDate, venuesData } = req.body;

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

    const agent = await User.findById(agentId);
    if (!agent || agent.role !== 'AGENT') {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid agent ID or user is not an agent' 
      });
    }

    console.log('✅ Agent found:', agent.name);

    const visitDate = expectedVisitDate ? new Date(expectedVisitDate) : new Date();

    const existingVenues = await AgentVenueTemp.find({
      tempVenueId: { $in: venueIds }
    });

    console.log('📊 Existing venues in AgentVenueTemp:', {
      requested: venueIds.length,
      found: existingVenues.length
    });

    let assignedCount = 0;
    let createdCount = 0;

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

    const venue = await AgentVenueTemp.findOne({ tempVenueId });

    if (!venue) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    const venueName = venue.name;
    const venueRegion = venue.region;

    await AgentVenueTemp.deleteOne({ tempVenueId });

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
