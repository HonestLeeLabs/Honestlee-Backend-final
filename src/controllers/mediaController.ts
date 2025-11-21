import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import VenueMedia from '../models/VenueMedia';
import AgentVenueTemp from '../models/AgentVenueTemp';
import AuditLog from '../models/AuditLog';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { deleteFileFromS3, getS3KeyFromUrl } from '../config/uploadConfig';

// POST /api/agent/venues/:tempVenueId/media - Upload media to S3
export const uploadVenueMedia = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId } = req.params;
    const { mediaType, captureContext, submittedByRole } = req.body;
    const file = req.file as any; // multer-s3 file object

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('📤 File uploaded to S3:', {
      key: file.key,
      location: file.location,
      size: file.size,
      contentType: file.contentType
    });

    // Verify venue assignment
    const venue = await AgentVenueTemp.findOne({
      tempVenueId,
      assignedTo: req.user.userId,
    });

    if (!venue) {
      return res.status(404).json({ message: 'Venue not found or not assigned to you' });
    }

    // Determine file properties
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const isVideo = file.contentType?.startsWith('video/') || 
                    ['.mp4', '.mov', '.avi', '.webm', '.mkv'].includes(fileExtension);
    const is360 = file.originalname.toLowerCase().includes('360') || 
                  file.originalname.toLowerCase().includes('insp') ||
                  fileExtension === '.insp';
    
    const fileFormat = fileExtension.slice(1).toUpperCase() || 'UNKNOWN';

    // Map media type to frontend group
    const frontendGroupMap: { [key: string]: string } = {
      OUTSIDE_VIEW: 'Vibe',
      MENU_BOARD: 'Menu',
      FOOD_DISH: 'Food & Drink',
      CHARGING_PORTS: 'Charging ports',
      SEATING_AREA_WORK: 'Vibe',
      FAMILY_KIDS_AREA: 'Family-friendly',
      KIDS_MENU: 'Family-friendly',
      ROOM_HOTEL: 'Latest',
      SELFIE_OWNER_AGENT: 'Owner photos',
      DOC_LICENSE: 'Latest',
      PANO_360: '360 view',
      USER_GENERAL: 'User photos',
    };

    // Determine public visibility
    let publicVisibility = 'Public (frontend)';
    if (mediaType === 'DOC_LICENSE' || mediaType === 'SELFIE_OWNER_AGENT') {
      publicVisibility = 'Internal only';
    }

    // Create media record
    const media = await VenueMedia.create({
      mediaId: `M-${uuidv4().slice(0, 8)}`,
      tempVenueId,
      venueId: venue.venueId,
      mediaType,
      captureContext: captureContext || 'Agent onboarding',
      submittedByRole: submittedByRole || 'Agent',
      submittedBy: req.user.userId,
      fileUrl: file.location, // S3 URL
      s3Key: file.key, // S3 key for deletion
      fileFormat,
      fileSize: file.size,
      isVideo,
      is360,
      publicVisibility,
      frontendGroup: frontendGroupMap[mediaType] || 'Latest',
      capturedAt: new Date(),
    });

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_MEDIA_UPLOADED',
      meta: {
        tempVenueId,
        mediaId: media.mediaId,
        mediaType,
        fileSize: file.size,
        isVideo,
        is360,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Media uploaded successfully to S3',
      data: media,
    });
  } catch (error: any) {
    console.error('❌ Error uploading media:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload media',
      error: error.message,
    });
  }
};

// GET /api/agent/venues/:tempVenueId/media - Get all media for venue
export const getVenueMedia = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId } = req.params;
    const { mediaType, frontendGroup } = req.query;

    // Build filter
    const filter: any = { tempVenueId };
    if (mediaType) filter.mediaType = mediaType;
    if (frontendGroup) filter.frontendGroup = frontendGroup;

    const media = await VenueMedia.find(filter)
      .populate('submittedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: media.length,
      data: media,
    });
  } catch (error: any) {
    console.error('❌ Error fetching media:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch media',
      error: error.message,
    });
  }
};

// DELETE /api/agent/venues/:tempVenueId/media/:mediaId - Delete media from S3
export const deleteVenueMedia = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId, mediaId } = req.params;

    const media = await VenueMedia.findOne({ _id: mediaId, tempVenueId });

    if (!media) {
      return res.status(404).json({ message: 'Media not found' });
    }

    // Delete from S3
    const s3Key = media.s3Key || getS3KeyFromUrl(media.fileUrl);
    if (s3Key) {
      const deleted = await deleteFileFromS3(s3Key);
      if (!deleted) {
        console.warn(`⚠️ Failed to delete S3 file: ${s3Key}`);
      }
    }

    // Delete from database
    await media.deleteOne();

    // Audit log
    await AuditLog.create({
      auditId: uuidv4(),
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'VENUE_MEDIA_DELETED',
      meta: {
        tempVenueId,
        mediaId: media.mediaId,
        s3Key,
      },
    });

    res.json({
      success: true,
      message: 'Media deleted successfully from S3',
    });
  } catch (error: any) {
    console.error('❌ Error deleting media:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete media',
      error: error.message,
    });
  }
};

// GET /api/agent/venues/:tempVenueId/media/stats - Get upload progress stats
export const getMediaStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ message: 'Agent access required' });
    }

    const { tempVenueId } = req.params;

    const mediaByType = await VenueMedia.aggregate([
      { $match: { tempVenueId } },
      { 
        $group: {
          _id: '$mediaType',
          count: { $sum: 1 },
          totalSize: { $sum: '$fileSize' }
        }
      }
    ]);

    const stats = {
      totalMedia: await VenueMedia.countDocuments({ tempVenueId }),
      totalSize: mediaByType.reduce((sum, item) => sum + item.totalSize, 0),
      byType: mediaByType.reduce((acc: any, item) => {
        acc[item._id] = { count: item.count, totalSize: item.totalSize };
        return acc;
      }, {}),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('❌ Error fetching media stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch media stats',
      error: error.message,
    });
  }
};