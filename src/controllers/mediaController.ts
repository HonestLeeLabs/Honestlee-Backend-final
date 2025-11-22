import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import VenueMedia from '../models/VenueMedia';
import AgentVenueTemp from '../models/AgentVenueTemp';
import AuditLog from '../models/AuditLog';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { deleteFileFromS3, getS3KeyFromUrl } from '../config/uploadConfig';

/**
 * COMPLETE FRONTEND GROUP MAPPING
 * Maps each media type to its appropriate frontend display group
 */
const frontendGroupMap: { [key: string]: string } = {
  // Original mappings
  'OUTSIDE_VIEW': 'Vibe',
  'MENU_BOARD': 'Menu',
  'FOOD_DISH': 'Food & Drink',
  'CHARGING_PORTS': 'Charging & Power',
  'SEATING_AREA_WORK': 'Vibe',
  'FAMILY_KIDS_AREA': 'Family-friendly',
  'KIDS_MENU': 'Family-friendly',
  'ROOM_HOTEL': 'Hotel Features',
  'SELFIE_OWNER_AGENT': 'Owner photos',
  'DOC_LICENSE': 'Operational',
  'PANO_360': '360 view',
  'USER_GENERAL': 'User photos',

  // New HLMT_* mappings
  'DRINKS_BAR': 'Food & Drink',
  'WORKSTATIONS_LAPTOPS': 'Amenities',
  'BATHROOM_HOTEL': 'Hotel Features',
  'LOBBY_RECEPTION': 'Hotel Features',
  'POOL_AREA': 'Hotel Features',
  'GYM_AREA': 'Amenities',
  'CONFERENCE_ROOM': 'Amenities',
  'SUPERMARKET_AISLE': 'Amenities',
  'PARKING_AREA': 'Amenities',
  'ACCESSIBILITY': 'Accessibility',
  'HIGH_CHAIRS': 'Family-friendly',
  'PET_AREA': 'Amenities',
  'COFFEE_MACHINE': 'Food & Drink',
  'SCREENSHOT_GPS_CHANGE': 'Operational',
  'EVENTS_PHOTOS': 'Events',
  'VIBE_INTERIOR': 'Vibe',
  'SIGNBOARD': 'Latest',
  'AMENITIES': 'Amenities',
  'EVENT_POSTER': 'Events',
  'VIEW_PANORAMA': 'Vibe',
  'TOILET_FACILITIES': 'Amenities',
  'WIFI_SIGN_EXISTING': 'Amenities',
  'WIFI_BOASTING_SPEED': 'Amenities',
  'LOGO': 'Latest',
  'QR_INSTALL_SPOT': 'Operational',
  'VIDEO_SHORT': 'Videos',
  'COUNTER': 'Vibe',
  'PAYMENT_METHODS': 'Amenities',
  'MENU_PRICES': 'Menu',
};

/**
 * POST /api/agent/venues/:tempVenueId/media - Upload media to S3
 */
export const uploadVenueMedia = async (req: AuthRequest, res: Response) => {
  try {
    // Validate user
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Agent access required' });
    }

    const currentUser = req.user;
    const { tempVenueId } = req.params;
    const { mediaType, captureContext, submittedByRole } = req.body;
    const file = (req as any).file;

    // Check for file validation errors
    if ((req as any).fileValidationError) {
      console.error('File validation error:', (req as any).fileValidationError);
      return res.status(400).json({
        success: false,
        message: (req as any).fileValidationError,
      });
    }

    if (!file) {
      console.error('No file received in upload');
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please select a valid image or video file.',
      });
    }

    console.log('File uploaded to S3:', {
      key: file.key,
      location: file.location,
      size: file.size,
      contentType: file.contentType,
      originalName: file.originalname,
      metadata: file.metadata,
    });

    // Verify venue assignment
    const venue = await AgentVenueTemp.findOne({
      tempVenueId,
      assignedTo: currentUser.userId,
    });

    if (!venue) {
      console.error('Venue not found or not assigned:', { tempVenueId, agentId: currentUser.userId });
      return res.status(404).json({
        success: false,
        message: 'Venue not found or not assigned to you',
      });
    }

    // Determine file properties
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const isVideo =
      file.contentType?.startsWith('video') ||
      ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.3gp', '.3gpp'].includes(fileExtension);

    const is360 =
      file.originalname.toLowerCase().includes('360') ||
      file.originalname.toLowerCase().includes('insp') ||
      fileExtension === '.insp';

    // Convert to lowercase and remove the dot
    const fileFormat = fileExtension.slice(1).toLowerCase(); // 'jpg' instead of '.JPG'

    // Map media type to frontend group using the complete mapping
    const frontendGroup = frontendGroupMap[mediaType] || 'Latest';

    // Determine public visibility
    let publicVisibility = 'Public (frontend)';
    if (['DOC_LICENSE', 'SELFIE_OWNER_AGENT', 'SCREENSHOT_GPS_CHANGE', 'QR_INSTALL_SPOT'].includes(mediaType)) {
      publicVisibility = 'Internal only';
    }

    console.log('Creating media record with:', {
      tempVenueId,
      mediaType,
      fileFormat, // Should now be lowercase: 'jpg', 'png', etc.
      fileSize: file.size,
      isVideo,
      is360,
      frontendGroup,
    });

    // Create media record
    const media = await VenueMedia.create({
      mediaId: `M-${uuidv4().slice(0, 8)}`,
      tempVenueId,
      venueId: venue.venueId,
      mediaType,
      captureContext: captureContext || 'Agent onboarding',
      submittedByRole: submittedByRole || 'Agent',
      submittedBy: currentUser.userId,
      fileUrl: file.location,
      s3Key: file.key,
      fileFormat, // Now lowercase
      fileSize: file.size,
      isVideo,
      is360,
      publicVisibility,
      frontendGroup,
      capturedAt: new Date(),
    });

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: currentUser.userId,
      actorRole: currentUser.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_MEDIA_UPLOADED',
      meta: {
        tempVenueId,
        mediaId: media.mediaId,
        mediaType,
        fileSize: file.size,
        isVideo,
        is360,
        originalName: file.originalname,
        contentType: file.contentType,
      },
    });

    console.log('Media record created:', media.mediaId);

    res.status(201).json({
      success: true,
      message: 'Media uploaded successfully to S3',
      data: media,
    });
  } catch (error: any) {
    console.error('Error uploading media:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload media',
      error: error.message,
    });
  }
};

/**
 * GET /api/agent/venues/:tempVenueId/media - Get all media for venue
 */
export const getVenueMedia = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Agent access required' });
    }

    const { tempVenueId } = req.params;
    const { mediaType, frontendGroup } = req.query;

    const filter: any = { tempVenueId };
    if (mediaType) filter.mediaType = mediaType;
    if (frontendGroup) filter.frontendGroup = frontendGroup;

    const media = await VenueMedia.find(filter)
      .populate('submittedBy', 'name email')
      .sort({ createdAt: -1 });

    console.log(`Found ${media.length} media items for venue ${tempVenueId}`);

    res.json({
      success: true,
      count: media.length,
      data: media,
    });
  } catch (error: any) {
    console.error('Error fetching media:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch media',
      error: error.message,
    });
  }
};

/**
 * DELETE /api/agent/venues/:tempVenueId/media/:mediaId - Delete media from S3
 */
export const deleteVenueMedia = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Agent access required' });
    }

    const currentUser = req.user;
    const { tempVenueId, mediaId } = req.params;

    const media = await VenueMedia.findOne({ _id: mediaId, tempVenueId });

    if (!media) {
      return res.status(404).json({ success: false, message: 'Media not found' });
    }

    // Delete from S3
    const s3Key = media.s3Key || getS3KeyFromUrl(media.fileUrl);
    if (s3Key) {
      const deleted = await deleteFileFromS3(s3Key);
      if (!deleted) {
        console.warn(`Failed to delete S3 file: ${s3Key}`);
      } else {
        console.log(`S3 file deleted: ${s3Key}`);
      }
    }

    // Delete from database
    await media.deleteOne();

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: currentUser.userId,
      actorRole: currentUser.role,
      action: 'VENUE_MEDIA_DELETED',
      meta: {
        tempVenueId,
        mediaId: media.mediaId,
        s3Key,
      },
    });

    console.log(`Media deleted: ${media.mediaId}`);

    res.json({
      success: true,
      message: 'Media deleted successfully from S3',
    });
  } catch (error: any) {
    console.error('Error deleting media:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete media',
      error: error.message,
    });
  }
};

/**
 * GET /api/agent/venues/:tempVenueId/media/stats - Get upload progress stats
 */
export const getMediaStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Agent access required' });
    }

    const { tempVenueId } = req.params;

    const mediaByType = await VenueMedia.aggregate([
      { $match: { tempVenueId } },
      {
        $group: {
          _id: '$mediaType',
          count: { $sum: 1 },
          totalSize: { $sum: '$fileSize' },
        },
      },
    ]);

    const stats = {
      totalMedia: await VenueMedia.countDocuments({ tempVenueId }),
      totalSize: mediaByType.reduce((sum, item) => sum + item.totalSize, 0),
      byType: mediaByType.reduce((acc: any, item) => {
        acc[item._id] = {
          count: item.count,
          totalSize: item.totalSize,
        };
        return acc;
      }, {}),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Error fetching media stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch media stats',
      error: error.message,
    });
  }
};