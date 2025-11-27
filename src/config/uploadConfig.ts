// config/uploadConfig.ts
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// ===== AWS S3 CLIENT CONFIGURATION (10GB+ File Support) =====
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: process.env.AWS_REGION || 'ap-south-1',
  requestHandler: {
    connectionTimeout: 900000, // 15 minutes
    socketTimeout: 900000, // 15 minutes
  } as any,
  maxAttempts: 3,
});

// ===== ENHANCED FILE FILTER (iOS-Optimized) =====
const venueMediaFileFilter = (req: any, file: any, cb: any) => {
  console.log('📸 iOS Upload Attempt:', {
    name: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    encoding: file.encoding
  });

  // ✅ PRIORITY 1: Check file extension (most reliable for iOS)
  const allowedExtensions = /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|tif|jpe|jfif|mp4|mov|avi|webm|mkv|3gp|3gpp|m4v|insp)$/i;

  if (file.originalname && allowedExtensions.test(file.originalname.toLowerCase())) {
    console.log('✅ File accepted by extension:', path.extname(file.originalname));
    cb(null, true);
    return;
  }

  // ✅ PRIORITY 2: Expanded MIME types for iOS compatibility
  const allowedMimeTypes = [
    // Standard image formats
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'image/x-icon',
    // iOS-specific formats
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
    // Standard video formats
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/x-matroska',
    'video/3gpp',
    'video/3gpp2',
    'video/x-m4v',
    // iOS fallbacks (common when iOS doesn't detect MIME properly)
    'application/octet-stream',
    'binary/octet-stream',
    '',
    null,
    undefined
  ];

  // Convert to lowercase and check, handling null/undefined
  const fileMimeType = (file.mimetype || '').toLowerCase();
  
  if (allowedMimeTypes.includes(fileMimeType) || !file.mimetype) {
    console.log('✅ File accepted by MIME type:', file.mimetype || 'unknown (accepted)');
    cb(null, true);
    return;
  }

  // ✅ PRIORITY 3: If we have a valid filename but no recognized MIME, accept it
  // (iOS often sends valid images with incorrect/missing MIME types)
  if (file.originalname) {
    const ext = path.extname(file.originalname).toLowerCase();
    const imageVideoExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', 
                            '.mp4', '.mov', '.avi', '.webm', '.3gp'];
    
    if (imageVideoExts.includes(ext)) {
      console.log('✅ File accepted by filename pattern (iOS fallback):', file.originalname);
      cb(null, true);
      return;
    }
  }

  // Reject only if we're absolutely sure it's invalid
  console.error('❌ File rejected:', {
    name: file.originalname,
    mime: file.mimetype,
    reason: 'Invalid file type'
  });
  
  const error: any = new Error('Only image and video files are allowed');
  error.code = 'FILE_TYPE_NOT_ALLOWED';
  cb(error, false);
};

// ===== ENHANCED MIME-TO-EXTENSION MAPPING (iOS-Optimized) =====
const getMimeToExtensionMap = (): { [key: string]: string } => ({
  // Standard images
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/tif': '.tiff',
  // iOS formats (convert to JPG for compatibility)
  'image/heic': '.jpg',
  'image/heif': '.jpg',
  'image/heic-sequence': '.jpg',
  'image/heif-sequence': '.jpg',
  // Videos
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/3gpp': '.3gp',
  'video/3gpp2': '.3gp',
  'video/x-m4v': '.mp4',
  // Fallback
  'application/octet-stream': '.jpg',
  'binary/octet-stream': '.jpg',
});

// ===== ENHANCED CONTENT-TYPE MAPPING (iOS-Optimized) =====
const getContentTypeMap = (): { [key: string]: string } => ({
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jpe': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  // iOS formats (store as JPEG)
  '.heic': 'image/jpeg',
  '.heif': 'image/jpeg',
  // Videos
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.qt': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.3gp': 'video/3gpp',
  '.3gpp': 'video/3gpp',
});

// ===== HELPER: Smart Extension Detection =====
const getFileExtension = (file: any): string => {
  let fileExtension = path.extname(file.originalname || '').toLowerCase();
  
  // If no extension or just a dot, guess from MIME type
  if (!fileExtension || fileExtension === '.') {
    const mimeToExtMap = getMimeToExtensionMap();
    const detectedMime = (file.mimetype || '').toLowerCase();
    fileExtension = mimeToExtMap[detectedMime] || '.jpg';
    console.log(`📝 Extension guessed from MIME '${detectedMime}': ${fileExtension}`);
  }
  
  // Convert iOS formats to JPG
  if (['.heic', '.heif'].includes(fileExtension)) {
    console.log(`🔄 Converting ${fileExtension} to .jpg for compatibility`);
    fileExtension = '.jpg';
  }
  
  return fileExtension;
};

// ===== HELPER: Smart Content-Type Detection =====
const getContentType = (file: any, fileExtension: string): string => {
  const contentTypeMap = getContentTypeMap();
  
  // Try to get from extension first
  let contentType = contentTypeMap[fileExtension];
  
  // If not found, try from MIME (but ignore octet-stream)
  if (!contentType && file.mimetype && 
      file.mimetype !== 'application/octet-stream' && 
      file.mimetype !== 'binary/octet-stream' &&
      file.mimetype !== '') {
    contentType = file.mimetype;
  }
  
  // Final fallback
  if (!contentType) {
    contentType = fileExtension.match(/\.(mp4|mov|avi|webm|mkv|3gp)$/i) 
      ? 'video/mp4' 
      : 'image/jpeg';
  }
  
  console.log(`📦 Content-Type: ${contentType} for ${file.originalname} (ext: ${fileExtension})`);
  return contentType;
};

// ===== VENUE MEDIA UPLOAD TO S3 (iOS-OPTIMIZED) =====
export const uploadVenueMedia = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      const userAgent = (req as any).headers?.['user-agent'] || '';
      const deviceType = userAgent.includes('iPhone') || userAgent.includes('iPad') ? 'iOS' : 'other';
      
      cb(null, { 
        fieldName: file.fieldname,
        originalName: file.originalname,
        uploadedBy: (req as any).user?.userId || 'agent',
        mimeType: file.mimetype || 'unknown',
        uploadTimestamp: new Date().toISOString(),
        deviceType: deviceType
      });
    },
    key: function (req: any, file, cb) {
      const agentId = req.user?.userId || 'anonymous';
      const tempVenueId = req.params?.tempVenueId || 'unknown';
      
      const fileExtension = getFileExtension(file);
      const uniqueId = uuidv4();
      const timestamp = Date.now();
      const fileName = `venue-media/${tempVenueId}/${agentId}-${timestamp}-${uniqueId}${fileExtension}`;
      
      console.log(`✅ S3 Upload Key: ${fileName}`);
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      const fileExtension = getFileExtension(file);
      const contentType = getContentType(file, fileExtension);
      cb(null, contentType);
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: Infinity,
    files: 100,
    fieldSize: 100 * 1024 * 1024,
  }
});

// ===== REVIEW IMAGES UPLOAD (iOS-OPTIMIZED) =====
export const uploadReviewImages = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { 
        fieldName: file.fieldname,
        originalName: file.originalname
      });
    },
    key: function (req: any, file, cb) {
      const userId = req.user?.userId || 'anonymous';
      const fileExtension = getFileExtension(file);
      const uniqueId = uuidv4();
      const fileName = `review-images/${userId}-${uniqueId}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      const fileExtension = getFileExtension(file);
      const contentType = getContentType(file, fileExtension);
      cb(null, contentType);
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: Infinity,
    files: 20
  }
});

// ===== PROFILE IMAGE UPLOAD (iOS-OPTIMIZED) =====
export const uploadProfileImage = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req: any, file, cb) {
      const userId = req.user?.userId || 'anonymous';
      const fileExtension = getFileExtension(file);
      const uniqueId = uuidv4();
      const fileName = `profile-images/${userId}-${uniqueId}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      const fileExtension = getFileExtension(file);
      const contentType = getContentType(file, fileExtension);
      cb(null, contentType);
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: Infinity
  }
});

// ===== EVENT IMAGES UPLOAD (iOS-OPTIMIZED) =====
export const uploadEventImages = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req: any, file, cb) {
      const userId = req.user?.userId || 'anonymous';
      const fileExtension = getFileExtension(file);
      const uniqueId = uuidv4();
      const fileName = `event-images/${userId}-${uniqueId}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      const fileExtension = getFileExtension(file);
      const contentType = getContentType(file, fileExtension);
      cb(null, contentType);
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: Infinity,
    files: 10
  }
});

// ===== S3 FILE OPERATIONS =====

export const deleteFileFromS3 = async (fileKey: string): Promise<boolean> => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
      Key: fileKey
    });
    
    await s3.send(command);
    console.log(`✅ File deleted from S3: ${fileKey}`);
    return true;
  } catch (error) {
    console.error('❌ Error deleting file from S3:', error);
    return false;
  }
};

export const getS3KeyFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1);
  } catch (error) {
    console.error('❌ Error parsing S3 URL:', error);
    return null;
  }
};