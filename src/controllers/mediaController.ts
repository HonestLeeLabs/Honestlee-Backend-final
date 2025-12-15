// controllers/mediaController.ts
import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import VenueMedia from '../models/VenueMedia';
import AgentVenueTemp from '../models/AgentVenueTemp';
import AuditLog from '../models/AuditLog';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { 
  deleteFileFromS3, 
  getS3KeyFromUrl, 
  processVenueMediaUpload,
  processUploadWithSizes,
  deleteAllSizesFromS3
} from '../config/uploadConfig';
import crypto from 'crypto';
import mongoose from 'mongoose';

// ✅ CloudFront domain
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || 'https://d2j8mu1uew5u3d.cloudfront.net';

// ✅ Convert S3 → CloudFront
function convertToCloudFrontUrl(s3Url: string): string {
  if (!s3Url) return s3Url;
  
  try {
    // If already CloudFront URL, return as-is
    if (s3Url.includes('cloudfront.net')) {
      return s3Url;
    }
    
    // If it's an S3 URL, convert to CloudFront
    if (s3Url.includes('s3.ap-south-1.amazonaws.com')) {
      const url = new URL(s3Url);
      const s3Path = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
      return `${CLOUDFRONT_DOMAIN}/${s3Path}`;
    }
    
    // If it's a relative or other URL, assume it's already correct
    return s3Url;
  } catch (error) {
    console.error('❌ S3→CloudFront conversion failed:', error, s3Url);
    return s3Url; // Return original on error
  }
}

// COMPLETE FRONTEND GROUP MAPPING
const frontendGroupMap: { [key: string]: string } = {
  OUTSIDE_VIEW: 'Vibe',
  MENU_BOARD: 'Menu',
  FOOD_DISH: 'Food & Drink',
  FOOD_DISPLAY_COUNTER: 'Food & Drink',
  CHARGING_PORTS: 'Charging & Power',
  SEATING_AREA_WORK: 'Vibe',
  FAMILY_KIDS_AREA: 'Family-friendly',
  KIDS_MENU: 'Family-friendly',
  ROOM_HOTEL: 'Hotel Features',
  SELFIE_OWNER_AGENT: 'Owner photos',
  DOC_LICENSE: 'Operational',
  PANO_360: '360 view',
  USER_GENERAL: 'User photos',
  DRINKS_BAR: 'Food & Drink',
  WORKSTATIONS_LAPTOPS: 'Amenities',
  BATHROOM_HOTEL: 'Hotel Features',
  LOBBY_RECEPTION: 'Hotel Features',
  POOL_AREA: 'Hotel Features',
  GYM_AREA: 'Amenities',
  CONFERENCE_ROOM: 'Amenities',
  SUPERMARKET_AISLE: 'Amenities',
  PARKING_AREA: 'Amenities',
  ACCESSIBILITY: 'Accessibility',
  HIGH_CHAIRS: 'Family-friendly',
  PET_AREA: 'Amenities',
  COFFEE_MACHINE: 'Food & Drink',
  SCREENSHOT_GPS_CHANGE: 'Operational',
  EVENTS_PHOTOS: 'Events',
  VIBE_INTERIOR: 'Vibe',
  SIGNBOARD: 'Latest',
  AMENITIES: 'Amenities',
  EVENT_POSTER: 'Events',
  VIEW_PANORAMA: 'Vibe',
  TOILET_FACILITIES: 'Amenities',
  WIFI_SIGN_EXISTING: 'Amenities',
  WIFI_BOASTING_SPEED: 'Amenities',
  WIFI_PASSWORD: 'Amenities',
  LOGO: 'Latest',
  QR_INSTALL_SPOT: 'Operational',
  VIDEO_SHORT: 'Videos',
  COUNTER: 'Vibe',
  PAYMENT_METHODS: 'Amenities',
  MENU_PRICES: 'Menu',
  COUNTER_AREA: 'Vibe',
  STAFF_CONTACTS: 'Operational',
  MANAGER_CONTACTS: 'Operational',
  RECEIPTS: 'Operational',
  SOCIAL_MEDIA: 'Latest',
  SPORTS_AMENITIES: 'Amenities',
  TV_DISPLAY: 'Amenities',
  'POLICY_PAYMENT': 'Policies',
  'POLICY_SMOKING': 'Policies',
  'POLICY_OUTSIDE_FOOD': 'Policies',
  'POLICY_DRESS_CODE': 'Policies',
  'POLICY_AGE_RESTRICTION': 'Policies',
  'POLICY_RESERVATION': 'Policies',
  'POLICY_CANCELLATION': 'Policies',
  'POLICY_REFUND': 'Policies',
  'POLICY_PET': 'Policies',
  'POLICY_ALCOHOL': 'Policies',
  'POLICY_NOISE': 'Policies',
  'POLICY_PHOTOGRAPHY': 'Policies',
  'POLICY_TERMS_CONDITIONS': 'Policies',
  'POLICY_PRIVACY': 'Policies',
  'POLICY_LIABILITY': 'Policies',
  'COFFEE_ACCESSORIES': 'Food & Drink',
  'COFFEE_BEANS_DISPLAY': 'Food & Drink',
  'COFFEE_MENU': 'Menu',
  'BARISTA_STATION': 'Food & Drink',
  'ICE_CREAM_FREEZERS': 'Food & Drink',
  'FREE_WATER_REFILLS': 'Amenities',
  'PROMOTIONAL_FLYERS': 'Latest',
  'OFFERS': 'Latest',
};

// ✅ Generate file hash for duplicate detection
const generateFileHashFromMetadata = (file: any): string => {
  const identifier = `${file.originalname}_${file.size}_${file.mimetype}`;
  return crypto.createHash('sha256').update(identifier).digest('hex');
};

// ✅ Check if duplicate file exists in venue
const checkGlobalDuplicate = async (
  tempVenueId: string,
  fileHash: string,
  fileSize: number,
  fileName: string
): Promise<{ isDuplicate: boolean; existingMedia?: any }> => {
  try {
    let existingMedia = await VenueMedia.findOne({
      tempVenueId,
      fileHash,
    }).select('mediaType fileUrl thumbnailUrl mediumUrl createdAt');

    if (existingMedia) {
      console.log(
        `🚫 DUPLICATE DETECTED (by hash): ${fileName} matches existing file in ${existingMedia.mediaType}`
      );
      return { isDuplicate: true, existingMedia };
    }

    const existingBySize = await VenueMedia.find({
      tempVenueId,
      fileSize,
    }).select('mediaType fileUrl thumbnailUrl mediumUrl createdAt s3Key thumbnailS3Key mediumS3Key');

    for (const media of existingBySize) {
      const existingFileName = media.s3Key.split('/').pop() || '';
      if (existingFileName.includes(fileName.split('.')[0].slice(-10))) {
        console.log(
          `🚫 DUPLICATE DETECTED (by size + name): ${fileName} matches ${existingFileName}`
        );
        return { isDuplicate: true, existingMedia: media };
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('Error checking duplicate:', error);
    return { isDuplicate: false };
  }
};

/**
 * ✅ POST /api/agent/venues/:tempVenueId/media - Upload media WITH 3 SIZES
 * Uses memory storage + Sharp for thumbnail and medium generation
 */
export const uploadVenueMedia = async (req: AuthRequest, res: Response) => {
  try {
    req.setTimeout(600000);
    res.setTimeout(600000);

    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Agent access required' });
    }

    const currentUser = req.user;
    const { tempVenueId } = req.params;
    const { mediaType, captureContext, submittedByRole } = req.body;
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const venue = await AgentVenueTemp.findOne({
      tempVenueId,
      assignedTo: currentUser.userId,
    });

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found or not assigned to you',
      });
    }

    const fileHash = generateFileHashFromMetadata(file);
    const duplicateCheck = await checkGlobalDuplicate(
      tempVenueId,
      fileHash,
      file.size,
      file.originalname
    );

    if (duplicateCheck.isDuplicate && duplicateCheck.existingMedia) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate file detected',
        duplicate: {
          fileName: file.originalname,
          existingCategory: duplicateCheck.existingMedia.mediaType,
          existingUrl: duplicateCheck.existingMedia.fileUrl,
          thumbnailUrl: duplicateCheck.existingMedia.thumbnailUrl,
          mediumUrl: duplicateCheck.existingMedia.mediumUrl,
          uploadedAt: duplicateCheck.existingMedia.createdAt,
        },
      });
    }

    // ✅ PROCESS UPLOAD WITH 3 SIZES GENERATION
    console.log('📤 Uploading file with 3-size generation...');
    const { originalUrl, thumbnailUrl, mediumUrl, s3Key, thumbnailKey, mediumKey } = 
      await processVenueMediaUpload(file, req);

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const isVideo =
      file.mimetype?.startsWith('video') ||
      ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.3gp', '.3gpp', '.m4v'].includes(fileExtension);

    const is360 =
      file.originalname.toLowerCase().includes('360') ||
      file.originalname.toLowerCase().includes('insp') ||
      fileExtension === '.insp';

    const fileFormat = fileExtension.slice(1).toLowerCase();
    const frontendGroup = frontendGroupMap[mediaType] || 'Latest';

    let publicVisibility = 'Public (frontend)';
    if (
      ['DOC_LICENSE', 'SELFIE_OWNER_AGENT', 'SCREENSHOT_GPS_CHANGE', 'QR_INSTALL_SPOT'].includes(
        mediaType
      )
    ) {
      publicVisibility = 'Internal only';
    }

    // ✅ Convert to CloudFront URLs
    const cloudFrontUrl = convertToCloudFrontUrl(originalUrl);
    const cloudFrontThumbnailUrl = thumbnailUrl ? convertToCloudFrontUrl(thumbnailUrl) : cloudFrontUrl;
    const cloudFrontMediumUrl = mediumUrl ? convertToCloudFrontUrl(mediumUrl) : cloudFrontUrl;

    console.log('✅ URLS Generated:', {
      original: cloudFrontUrl.length,
      thumbnail: cloudFrontThumbnailUrl.length,
      medium: cloudFrontMediumUrl.length,
      thumbnailGenerated: !!thumbnailUrl,
      mediumGenerated: !!mediumUrl
    });

    // ✅ CREATE MEDIA RECORD WITH 3 SIZES
    const media = await VenueMedia.create({
      mediaId: `M-${uuidv4().slice(0, 8)}`,
      tempVenueId,
      venueId: venue.venueId,
      mediaType,
      captureContext: captureContext || 'Agent onboarding',
      submittedByRole: submittedByRole || 'Agent',
      submittedBy: currentUser.userId,
      fileUrl: cloudFrontUrl,
      thumbnailUrl: cloudFrontThumbnailUrl,
      mediumUrl: cloudFrontMediumUrl,
      s3Key,
      thumbnailS3Key: thumbnailKey,
      mediumS3Key: mediumKey,
      fileFormat,
      fileSize: file.size,
      fileHash,
      isVideo,
      is360,
      publicVisibility,
      frontendGroup,
      capturedAt: new Date(),
      // EXIF data if provided
      ...(req.body.exifDateTaken && { exifDateTaken: new Date(req.body.exifDateTaken) }),
      ...(req.body.exifLatitude && { exifLatitude: parseFloat(req.body.exifLatitude) }),
      ...(req.body.exifLongitude && { exifLongitude: parseFloat(req.body.exifLongitude) }),
      ...(req.body.exifCamera && { exifCamera: req.body.exifCamera }),
      ...(req.body.captureGpsLat && { captureGpsLat: parseFloat(req.body.captureGpsLat) }),
      ...(req.body.captureGpsLng && { captureGpsLng: parseFloat(req.body.captureGpsLng) }),
      ...(req.body.captureGpsAccuracy && { captureGpsAccuracy: parseFloat(req.body.captureGpsAccuracy) }),
    });

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
        fileHash,
        isVideo,
        is360,
        hasThumbnail: !!thumbnailUrl,
        hasMedium: !!mediumUrl,
        cloudFrontUrl,
        thumbnailUrl: cloudFrontThumbnailUrl,
        mediumUrl: cloudFrontMediumUrl,
        originalName: file.originalname,
      },
    });

    console.log('✅ Media record created with 3 sizes:', media.mediaId);

    // ✅ IMPORTANT: Return only thumbnail and medium, NOT original
    res.status(201).json({
      success: true,
      message: 'Media uploaded successfully',
      data: {
        _id: media._id,
        mediaId: media.mediaId,
        mediaType: media.mediaType,
        thumbnailUrl: media.thumbnailUrl,  // 10-20KB
        mediumUrl: media.mediumUrl,        // 50KB
        // fileUrl: NOT INCLUDED
        isVideo: media.isVideo,
        is360: media.is360,
        fileFormat: media.fileFormat,
        fileSize: media.fileSize,
        createdAt: media.createdAt,
      },
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

/**
 * ✅ POST /api/agent/venues/:tempVenueId/media/quick - Quick upload without size generation
 * Uses direct S3 upload for faster processing
 */
export const uploadVenueMediaQuick = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Agent access required' });
    }

    const currentUser = req.user;
    const { tempVenueId } = req.params;
    const { mediaType, captureContext, submittedByRole } = req.body;
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const venue = await AgentVenueTemp.findOne({
      tempVenueId,
      assignedTo: currentUser.userId,
    });

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found or not assigned to you',
      });
    }

    const fileHash = generateFileHashFromMetadata(file);
    const duplicateCheck = await checkGlobalDuplicate(
      tempVenueId,
      fileHash,
      file.size,
      file.originalname
    );

    if (duplicateCheck.isDuplicate && duplicateCheck.existingMedia) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate file detected',
        duplicate: {
          fileName: file.originalname,
          existingCategory: duplicateCheck.existingMedia.mediaType,
          existingUrl: duplicateCheck.existingMedia.fileUrl,
          thumbnailUrl: duplicateCheck.existingMedia.thumbnailUrl,
          mediumUrl: duplicateCheck.existingMedia.mediumUrl,
          uploadedAt: duplicateCheck.existingMedia.createdAt,
        },
      });
    }

    const s3Url = file.location;
    const cloudFrontUrl = convertToCloudFrontUrl(s3Url);

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const isVideo = file.mimetype?.startsWith('video') || 
                   ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.3gp', '.3gpp'].includes(fileExtension);
    const is360 = file.originalname.toLowerCase().includes('360') || 
                  file.originalname.toLowerCase().includes('insp') || 
                  fileExtension === '.insp';
    const fileFormat = fileExtension.slice(1).toLowerCase();
    const frontendGroup = frontendGroupMap[mediaType] || 'Latest';

    let publicVisibility = 'Public (frontend)';
    if (['DOC_LICENSE', 'SELFIE_OWNER_AGENT', 'SCREENSHOT_GPS_CHANGE', 'QR_INSTALL_SPOT'].includes(mediaType)) {
      publicVisibility = 'Internal only';
    }

    // For quick upload, use original as thumbnail and medium for images
    const thumbnailUrl = isVideo ? null : cloudFrontUrl;
    const mediumUrl = isVideo ? null : cloudFrontUrl;

    const media = await VenueMedia.create({
      mediaId: `M-${uuidv4().slice(0, 8)}`,
      tempVenueId,
      venueId: venue.venueId,
      mediaType,
      captureContext: captureContext || 'Agent onboarding',
      submittedByRole: submittedByRole || 'Agent',
      submittedBy: currentUser.userId,
      fileUrl: cloudFrontUrl,
      thumbnailUrl,
      mediumUrl,
      s3Key: file.key,
      fileFormat,
      fileSize: file.size,
      fileHash,
      isVideo,
      is360,
      publicVisibility,
      frontendGroup,
      capturedAt: new Date(),
    });

    await AuditLog.create({
      auditId: uuidv4(),
      actorId: currentUser.userId,
      actorRole: currentUser.role,
      venueId: venue.venueId?.toString(),
      action: 'VENUE_MEDIA_UPLOADED_QUICK',
      meta: {
        tempVenueId,
        mediaId: media.mediaId,
        mediaType,
        fileSize: file.size,
        fileHash,
        isVideo,
        is360,
        hasThumbnail: false,
        hasMedium: false,
        cloudFrontUrl,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Media uploaded quickly (no size generation)',
      data: {
        _id: media._id,
        mediaId: media.mediaId,
        mediaType: media.mediaType,
        thumbnailUrl: media.thumbnailUrl || media.fileUrl,
        mediumUrl: media.mediumUrl || media.fileUrl,
        isVideo: media.isVideo,
        is360: media.is360,
        fileFormat: media.fileFormat,
        fileSize: media.fileSize,
        createdAt: media.createdAt,
      },
    });
  } catch (error: any) {
    console.error('❌ Error in quick upload:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload media',
      error: error.message,
    });
  }
};

/**
 * ✅ POST /api/upload/profile - Upload profile image with 3 sizes
 */
export const uploadProfileImageWithSizes = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { originalUrl, thumbnailUrl, mediumUrl, s3Key, thumbnailKey, mediumKey } = 
      await processUploadWithSizes(file, req, 'profile-images');

    const cloudFrontUrl = convertToCloudFrontUrl(originalUrl);
    const cloudFrontThumbnailUrl = thumbnailUrl ? convertToCloudFrontUrl(thumbnailUrl) : cloudFrontUrl;
    const cloudFrontMediumUrl = mediumUrl ? convertToCloudFrontUrl(mediumUrl) : cloudFrontUrl;

    res.status(201).json({
      success: true,
      message: 'Profile image uploaded with 3 sizes',
      data: {
        fileUrl: cloudFrontUrl,
        thumbnailUrl: cloudFrontThumbnailUrl,
        mediumUrl: cloudFrontMediumUrl,
        s3Key,
        thumbnailKey,
        mediumKey,
      },
    });
  } catch (error: any) {
    console.error('❌ Error uploading profile image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile image',
      error: error.message,
    });
  }
};

/**
 * ✅ GET /api/agent/venues/:tempVenueId/media - Get all media for venue (AGENT)
 * Returns only thumbnail and medium URLs, NOT original file URL
 */
export const getVenueMedia = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Agent access required' });
    }

    const { tempVenueId } = req.params;
    const { mediaType, frontendGroup, includeInternal } = req.query;

    const filter: any = { tempVenueId };
    if (mediaType) filter.mediaType = mediaType;
    if (frontendGroup) filter.frontendGroup = frontendGroup;
    if (includeInternal !== 'true') {
      filter.publicVisibility = 'Public (frontend)';
    }

    const media = await VenueMedia.find(filter)
      .populate('submittedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // ✅ IMPORTANT: Return only thumbnail and medium, NOT original
    const mediaWithUrls = media.map((item: any) => {
      // Convert URLs to CloudFront
      const thumbnailUrl = convertToCloudFrontUrl(item.thumbnailUrl || item.fileUrl);
      const mediumUrl = convertToCloudFrontUrl(item.mediumUrl || item.thumbnailUrl || item.fileUrl);
      
      // Remove original fileUrl and internal fields
      const { fileUrl, s3Key, thumbnailS3Key, mediumS3Key, fileHash, reviewNotes, ...rest } = item;

      return {
        ...rest,
        thumbnailUrl,
        mediumUrl,
        // fileUrl: NOT INCLUDED
      };
    });

    console.log(`✅ Found ${mediaWithUrls.length} media items for ${tempVenueId}`);

    res.json({
      success: true,
      count: mediaWithUrls.length,
      data: mediaWithUrls,
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
 * ✅ GET /api/venues/:id/media - Get public media for venue (PUBLIC/USER)
 * Returns thumbnail and medium URLs for public consumption
 */
export const getPublicVenueMedia = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { mediaType, frontendGroup, publicOnly = 'true' } = req.query;

    console.log('🔍 Fetching public media for venue:', id);

    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({
        success: false,
        message: 'Invalid venue ID provided',
      });
    }

    const filter: any = {
      $or: [
        { tempVenueId: id },
        ...(mongoose.Types.ObjectId.isValid(id) 
          ? [{ venueId: new mongoose.Types.ObjectId(id) }]
          : [])
      ]
    };

    if (publicOnly === 'true') {
      filter.publicVisibility = 'Public (frontend)';
    }
    if (mediaType) filter.mediaType = mediaType;
    if (frontendGroup) filter.frontendGroup = frontendGroup;

    const media = await VenueMedia.find(filter)
      .select('-fileHash -s3Key -thumbnailS3Key -mediumS3Key -reviewNotes')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${media.length} media items for venue ${id}`);

    // ✅ For public API, return optimized URLs
    const mediaWithUrls = media.map((item: any) => {
      const thumbnailUrl = convertToCloudFrontUrl(item.thumbnailUrl || item.fileUrl);
      const mediumUrl = convertToCloudFrontUrl(item.mediumUrl || item.thumbnailUrl || item.fileUrl);

      return {
        _id: item._id,
        id: item._id,
        mediaId: item.mediaId,
        mediaType: item.mediaType,
        // Return optimized URLs for frontend
        thumbnailUrl,  // For grid/list views
        mediumUrl,     // For modal/preview views
        // fileUrl is intentionally omitted for public API
        isVideo: item.isVideo,
        is360: item.is360,
        frontendGroup: item.frontendGroup,
        createdAt: item.createdAt,
        exifDateTaken: item.exifDateTaken,
        exifLatitude: item.exifLatitude,
        exifLongitude: item.exifLongitude,
        exifCamera: item.exifCamera,
        captureGpsLat: item.captureGpsLat,
        captureGpsLng: item.captureGpsLng,
        captureGpsAccuracy: item.captureGpsAccuracy,
        distanceFromVenue: item.distanceFromVenue
      };
    });

    res.json({
      success: true,
      count: mediaWithUrls.length,
      data: mediaWithUrls,
      venueId: id
    });
  } catch (error: any) {
    console.error('❌ Error fetching public venue media:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch venue media',
      error: error.message,
    });
  }
};

/**
 * ✅ DELETE /api/agent/venues/:tempVenueId/media/:mediaId
 * Deletes all 3 sizes from S3 and the database record
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

    // ✅ Delete all 3 sizes (original, thumbnail, medium)
    let deleteSuccess = true;
    if (media.s3Key) {
      deleteSuccess = await deleteAllSizesFromS3(media.s3Key);
      if (!deleteSuccess) {
        console.warn(`Failed to delete all S3 files for: ${media.s3Key}`);
      } else {
        console.log(`✅ All 3 sizes deleted for: ${media.s3Key}`);
      }
    }

    await media.deleteOne();

    await AuditLog.create({
      auditId: uuidv4(),
      actorId: currentUser.userId,
      actorRole: currentUser.role,
      action: 'VENUE_MEDIA_DELETED',
      meta: {
        tempVenueId,
        mediaId: media.mediaId,
        s3Key: media.s3Key,
        thumbnailS3Key: media.thumbnailS3Key,
        mediumS3Key: media.mediumS3Key,
        fileHash: media.fileHash,
      },
    });

    console.log(`✅ Media deleted from DB: ${media.mediaId}`);

    res.json({
      success: deleteSuccess,
      message: deleteSuccess 
        ? 'All 3 media sizes deleted successfully' 
        : 'Media deleted, but some cleanup may have failed',
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
 * GET /api/agent/venues/:tempVenueId/media/stats
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
          hasThumbnailCount: {
            $sum: { $cond: [{ $ne: ['$thumbnailS3Key', null] }, 1, 0] }
          },
          hasMediumCount: {
            $sum: { $cond: [{ $ne: ['$mediumS3Key', null] }, 1, 0] }
          }
        },
      },
    ]);

    const stats = {
      totalMedia: await VenueMedia.countDocuments({ tempVenueId }),
      totalSize: mediaByType.reduce((sum: number, item: any) => sum + item.totalSize, 0),
      mediaWithThumbnails: mediaByType.reduce((sum: number, item: any) => sum + item.hasThumbnailCount, 0),
      mediaWithMedium: mediaByType.reduce((sum: number, item: any) => sum + item.hasMediumCount, 0),
      byType: mediaByType.reduce((acc: any, item: any) => {
        acc[item._id] = {
          count: item.count,
          totalSize: item.totalSize,
          hasThumbnails: item.hasThumbnailCount,
          hasMedium: item.hasMediumCount,
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

/**
 * ✅ POST /api/agent/venues/:tempVenueId/media/:mediaId/regenerate-sizes
 * Regenerate thumbnail and medium sizes for existing media
 */
export const regenerateMediaSizes = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Agent access required' });
    }

    const { tempVenueId, mediaId } = req.params;
    const media = await VenueMedia.findOne({ _id: mediaId, tempVenueId });

    if (!media) {
      return res.status(404).json({ success: false, message: 'Media not found' });
    }

    // Check if it's a video (can't generate sizes from video without processing)
    if (media.isVideo) {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate sizes for videos automatically',
      });
    }

    // TODO: Implement size regeneration logic
    // This would require:
    // 1. Downloading the original from S3
    // 2. Generating new thumbnail and medium with Sharp
    // 3. Uploading them to S3
    // 4. Updating the media record with new URLs and keys
    
    res.json({
      success: true,
      message: 'Size regeneration endpoint',
      note: 'Implementation pending - would regenerate thumbnail and medium sizes',
      mediaId: media.mediaId,
      currentSizes: {
        hasThumbnail: !!media.thumbnailS3Key,
        hasMedium: !!media.mediumS3Key,
        thumbnailUrl: media.thumbnailUrl,
        mediumUrl: media.mediumUrl
      }
    });
  } catch (error: any) {
    console.error('Error regenerating sizes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate sizes',
      error: error.message,
    });
  }
};

export default {
  uploadVenueMedia,
  uploadVenueMediaQuick,
  uploadProfileImageWithSizes,
  getVenueMedia,
  getPublicVenueMedia,
  deleteVenueMedia,
  getMediaStats,
  regenerateMediaSizes,
};