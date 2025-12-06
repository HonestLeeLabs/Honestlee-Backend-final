// controllers/mediaController.ts

import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import VenueMedia from '../models/VenueMedia';
import AgentVenueTemp from '../models/AgentVenueTemp';
import AuditLog from '../models/AuditLog';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { deleteFileFromS3, getS3KeyFromUrl } from '../config/uploadConfig';
import crypto from 'crypto';

/**
 * ✅ CloudFront domain (PRIMARY CDN)
 * TEMP: https://dedllwce1iasg.cloudfront.net (your CloudFront distribution)
 * PROD: https://media.honestlee.app (once DNS mapped)
 */
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || 'https://dedllwce1iasg.cloudfront.net';

/**
 * ✅ Cloudinary Configuration (OPTIONAL image optimization)
 * Set USE_CLOUDINARY=false until CloudFront is stable
 */
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'dqftjs96p';
const USE_CLOUDINARY = process.env.USE_CLOUDINARY === 'true';

/**
 * ✅ CRITICAL: Convert S3 → CloudFront (FIXES 403 FORBIDDEN)
 * S3: https://honestlee-user-upload.s3.ap-south-1.amazonaws.com/venue-media/TEMP-123/image.jpg
 * ✅ CF: https://dedllwce1iasg.cloudfront.net/venue-media/TEMP-123/image.jpg
 */
function convertToCloudFrontUrl(s3Url: string): string {
  try {
    const url = new URL(s3Url);
    const path = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
    
    // ✅ FORCE CloudFront (browser CANNOT access S3 directly)
    return `${CLOUDFRONT_DOMAIN}/${path}`;
  } catch (error) {
    console.error('❌ S3→CloudFront conversion failed:', error, s3Url);
    throw new Error(`Invalid S3 URL: ${s3Url}`);
  }
}

/**
 * ✅ OPTIONAL: CloudFront → Cloudinary (image optimization)
 * ONLY works AFTER CloudFront URLs are accessible
 * CF: https://dedllwce1iasg.cloudfront.net/venue-media/123/image.jpg
 * CL: https://res.cloudinary.com/dqftjs96p/image/fetch/w_300,h_300,q_80,f_webp/CF_URL
 */
function convertToCloudinaryUrl(
  cdnUrl: string,
  width?: number,
  height?: number,
  quality = 80,
  format: string = 'auto'
): string {
  // ✅ DISABLED BY DEFAULT - enable only after CloudFront works
  if (!USE_CLOUDINARY || !CLOUDINARY_CLOUD_NAME) {
    return cdnUrl;
  }

  // ✅ Validate CloudFront URL first (no S3 allowed)
  if (cdnUrl.includes('s3.ap-south-1.amazonaws.com')) {
    console.warn('🚫 Cloudinary blocked: S3 URL detected', cdnUrl);
    return cdnUrl;
  }

  const transformations: string[] = [];
  if (width) transformations.push(`w_${width}`);
  if (height) transformations.push(`h_${height}`);
  if (width || height) transformations.push('c_fill');
  transformations.push(`q_${quality}`);
  transformations.push(`f_${format}`);

  const transformString = transformations.join(',');
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/${transformString}/${encodeURI(cdnUrl)}`;
}

/**
 * COMPLETE FRONTEND GROUP MAPPING
 */
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
  // ✅ POLICY CATEGORIES
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
  // ✅ COFFEE CATEGORIES
  'COFFEE_ACCESSORIES': 'Food & Drink',
  'COFFEE_BEANS_DISPLAY': 'Food & Drink',
  'COFFEE_MENU': 'Menu',
  'BARISTA_STATION': 'Food & Drink',
};

/**
 * ✅ Generate file hash for duplicate detection
 */
const generateFileHashFromMetadata = (file: any): string => {
  const identifier = `${file.originalname}_${file.size}_${file.mimetype}`;
  return crypto.createHash('sha256').update(identifier).digest('hex');
};

/**
 * ✅ Check if duplicate file exists in venue
 */
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
    }).select('mediaType fileUrl createdAt');

    if (existingMedia) {
      console.log(
        `🚫 DUPLICATE DETECTED (by hash): ${fileName} matches existing file in ${existingMedia.mediaType}`
      );
      return { isDuplicate: true, existingMedia };
    }

    const existingBySize = await VenueMedia.find({
      tempVenueId,
      fileSize,
    }).select('mediaType fileUrl createdAt s3Key');

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
 * POST /api/agent/venues/:tempVenueId/media - Upload media with duplicate detection
 * ✅ Stores CloudFront URL, generates Cloudinary thumbnail URLs
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

    const venue = await AgentVenueTemp.findOne({
      tempVenueId,
      assignedTo: currentUser.userId,
    });

    if (!venue) {
      console.error('Venue not found or not assigned:', { tempVenueId, agentId: currentUser.userId });

      if (file.key) {
        await deleteFileFromS3(file.key);
        console.log(`🗑️ Deleted S3 file due to venue check failure: ${file.key}`);
      }

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
      console.log(`🚫 DUPLICATE DETECTED: ${file.originalname} already exists`);

      if (file.key) {
        await deleteFileFromS3(file.key);
        console.log(`🗑️ Deleted duplicate S3 file: ${file.key}`);
      }

      return res.status(409).json({
        success: false,
        message: 'Duplicate file detected',
        duplicate: {
          fileName: file.originalname,
          existingCategory: duplicateCheck.existingMedia.mediaType,
          existingUrl: duplicateCheck.existingMedia.fileUrl,
          uploadedAt: duplicateCheck.existingMedia.createdAt,
        },
      });
    }

    console.log('🔍 S3 UPLOAD COMPLETE:', {
      key: file.key,
      s3Url: file.location,
      size: file.size,
      originalName: file.originalname,
      hash: fileHash,
    });

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const isVideo =
      file.contentType?.startsWith('video') ||
      ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.3gp', '.3gpp'].includes(fileExtension);

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

    // ✅ CRITICAL: S3 → CloudFront conversion (FIXES 403)
    const s3Url = file.location;
    const cloudFrontUrl = convertToCloudFrontUrl(s3Url);

    console.log('✅ URL CONVERSION:', { s3Url, cloudFrontUrl });

    // ✅ Generate thumbnail URL
    const thumbnailUrl = isVideo
      ? cloudFrontUrl  // Videos: native CloudFront
      : USE_CLOUDINARY 
        ? convertToCloudinaryUrl(cloudFrontUrl, 300, 300, 80, 'webp')  // Images: Cloudinary
        : cloudFrontUrl;  // Fallback: CloudFront only

    console.log('✅ FINAL URLS:', { 
      fileUrl: cloudFrontUrl, 
      thumbnailUrl, 
      isVideo,
      usingCloudinary: USE_CLOUDINARY 
    });

    // ✅ STORE CloudFront URLs in database
    const media = await VenueMedia.create({
      mediaId: `M-${uuidv4().slice(0, 8)}`,
      tempVenueId,
      venueId: venue.venueId,
      mediaType,
      captureContext: captureContext || 'Agent onboarding',
      submittedByRole: submittedByRole || 'Agent',
      submittedBy: currentUser.userId,
      fileUrl: cloudFrontUrl,          // ✅ PRIMARY: CloudFront full-size
      thumbnailUrl,                    // ✅ SECONDARY: Optimized thumbnail
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
      action: 'VENUE_MEDIA_UPLOADED',
      meta: {
        tempVenueId,
        mediaId: media.mediaId,
        mediaType,
        fileSize: file.size,
        fileHash,
        isVideo,
        is360,
        cloudFrontUrl,
        thumbnailUrl,
        originalName: file.originalname,
      },
    });

    console.log('✅ Media record created:', media.mediaId);

    res.status(201).json({
      success: true,
      message: 'Media uploaded successfully',
      data: {
        ...media.toObject(),
        fileUrl: cloudFrontUrl,
        thumbnailUrl,
      },
    });
  } catch (error: any) {
    console.error('❌ Error uploading media:', error);

    const file = (req as any).file;
    if (file?.key) {
      await deleteFileFromS3(file.key);
      console.log(`🗑️ Deleted S3 file due to error: ${file.key}`);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload media',
      error: error.message,
    });
  }
};

/**
 * GET /api/agent/venues/:tempVenueId/media - Get all media for venue
 * ✅ FIXED: Converts BOTH fileUrl AND thumbnailUrl from S3 to CloudFront
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
      .sort({ createdAt: -1 })
      .lean();

    // ✅ CRITICAL FIX: Convert ALL S3 URLs to CloudFront (fileUrl AND thumbnailUrl)
    const mediaWithThumbnails = media.map((item: any) => {
      let fileUrl = item.fileUrl;
      let thumbnailUrl = item.thumbnailUrl;

      // ✅ FIX 1: Convert S3 fileUrl to CloudFront
      if (fileUrl && fileUrl.includes('s3.ap-south-1.amazonaws.com')) {
        console.warn('🔧 Converting legacy S3 fileUrl:', fileUrl);
        fileUrl = convertToCloudFrontUrl(fileUrl);
      }

      // ✅ FIX 2: Convert S3 thumbnailUrl to CloudFront (CRITICAL!)
      if (thumbnailUrl && thumbnailUrl.includes('s3.ap-south-1.amazonaws.com')) {
        console.warn('🔧 Converting legacy S3 thumbnailUrl:', thumbnailUrl);
        thumbnailUrl = convertToCloudFrontUrl(thumbnailUrl);
      }

      // ✅ FIX 3: Generate thumbnail if missing or same as fileUrl
      if (!thumbnailUrl || thumbnailUrl === fileUrl) {
        thumbnailUrl = item.isVideo 
          ? fileUrl 
          : USE_CLOUDINARY 
            ? convertToCloudinaryUrl(fileUrl, 300, 300, 80, 'webp')
            : fileUrl;
      }

      return {
        ...item,
        fileUrl,        // ✅ CloudFront full-size
        thumbnailUrl,   // ✅ CloudFront/Cloudinary thumbnail
      };
    });

    console.log(`✅ Found ${mediaWithThumbnails.length} media items for ${tempVenueId}`);

    res.json({
      success: true,
      count: mediaWithThumbnails.length,
      data: mediaWithThumbnails,
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
 * DELETE /api/agent/venues/:tempVenueId/media/:mediaId - Delete media
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

    const s3Key = media.s3Key || getS3KeyFromUrl(media.fileUrl);
    if (s3Key) {
      const deleted = await deleteFileFromS3(s3Key);
      if (!deleted) {
        console.warn(`Failed to delete S3 file: ${s3Key}`);
      } else {
        console.log(`✅ S3 file deleted: ${s3Key}`);
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
        s3Key,
        fileHash: media.fileHash,
      },
    });

    console.log(`✅ Media deleted: ${media.mediaId}`);

    res.json({
      success: true,
      message: 'Media deleted successfully',
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
 * GET /api/agent/venues/:tempVenueId/media/stats - Get upload stats
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
      totalSize: mediaByType.reduce((sum: number, item: any) => sum + item.totalSize, 0),
      byType: mediaByType.reduce((acc: any, item: any) => {
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

export default {
  uploadVenueMedia,
  getVenueMedia,
  deleteVenueMedia,
  getMediaStats,
};
