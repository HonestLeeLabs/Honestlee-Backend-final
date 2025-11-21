// config/uploadConfig.ts
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// ===== AWS S3 CLIENT CONFIGURATION =====
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: process.env.AWS_REGION || 'ap-south-1'
});

// ===== IMPROVED VENUE MEDIA FILE FILTER (Mobile-Friendly) =====
const venueMediaFileFilter = (req: any, file: any, cb: any) => {
  console.log('📸 Venue Media Upload Attempt:', {
    name: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    encoding: file.encoding
  });

  // Allowed file extensions (CRITICAL for mobile - CHECK THIS FIRST)
  const allowedExtensions = /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|mp4|mov|avi|webm|mkv|3gp|3gpp|insp)$/i;

  // Allowed MIME types (including mobile variants)
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/bmp',
    'image/tiff',
    // Videos
    'video/mp4',
    'video/mpeg',
    'video/quicktime', // .mov
    'video/x-msvideo', // .avi
    'video/webm',
    'video/x-matroska', // .mkv
    'video/3gpp', // Mobile video
    'video/3gpp2', // Mobile video
    // Mobile fallbacks
    'application/octet-stream', // Mobile browsers often use this
    '' // Some mobile browsers send empty MIME type
  ];

  // ✅ STRATEGY 1: Check file extension FIRST (MOST RELIABLE for mobile)
  if (file.originalname && allowedExtensions.test(file.originalname.toLowerCase())) {
    console.log('✅ File accepted by extension:', path.extname(file.originalname));
    cb(null, true);
    return;
  }

  // ✅ STRATEGY 2: Check MIME type if extension check failed (fallback)
  if (file.mimetype && allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    console.log('✅ File accepted by MIME type:', file.mimetype);
    cb(null, true);
    return;
  }

  // ✅ STRATEGY 3: If MIME type is generic but has valid extension, allow it
  if ((file.mimetype === 'application/octet-stream' || !file.mimetype) && 
      file.originalname && 
      allowedExtensions.test(file.originalname.toLowerCase())) {
    console.log('✅ File accepted by extension fallback:', file.originalname);
    cb(null, true);
    return;
  }

  // Reject file
  console.error('❌ File rejected:', {
    name: file.originalname,
    mime: file.mimetype,
    reason: 'Invalid file type or extension'
  });
  
  // Set error for better error handling
  req.fileValidationError = 'Only image and video files are allowed!';
  const error: any = new Error('Only image and video files are allowed!');
  error.code = 'FILE_TYPE_NOT_ALLOWED';
  return cb(error, false);
};

// ===== VENUE MEDIA UPLOAD TO S3 (Mobile-Optimized) =====
export const uploadVenueMedia = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { 
        fieldName: file.fieldname,
        originalName: file.originalname,
        uploadedBy: (req as any).user?.userId || 'agent',
        mimeType: file.mimetype || 'unknown'
      });
    },
    key: function (req: any, file, cb) {
      const agentId = req.user?.userId || 'anonymous';
      const tempVenueId = req.params?.tempVenueId || 'unknown';
      let fileExtension = path.extname(file.originalname).toLowerCase();
      
      // Handle missing extensions (mobile uploads sometimes have no extension)
      if (!fileExtension || fileExtension === '.') {
        // Guess from MIME type
        const mimeToExtMap: { [key: string]: string } = {
          'image/jpeg': '.jpg',
          'image/jpg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'image/webp': '.webp',
          'image/heic': '.jpg',
          'image/heif': '.jpg',
          'video/mp4': '.mp4',
          'video/quicktime': '.mov',
          'video/webm': '.webm',
          'video/3gpp': '.3gp',
          'video/3gpp2': '.3gp'
        };
        fileExtension = mimeToExtMap[file.mimetype] || '.jpg';
        console.log(`📝 Extension guessed from MIME: ${fileExtension}`);
      }
      
      // Convert HEIC/HEIF to JPG for compatibility
      if (fileExtension === '.heic' || fileExtension === '.heif') {
        fileExtension = '.jpg';
      }
      
      const uniqueId = uuidv4();
      const timestamp = Date.now();
      const fileName = `venue-media/${tempVenueId}/${agentId}-${timestamp}-${uniqueId}${fileExtension}`;
      
      console.log(`✅ S3 Upload Key: ${fileName}`);
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      
      // Comprehensive content type mapping
      const contentTypeMap: { [key: string]: string } = {
        // Images
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.heic': 'image/jpeg',
        '.heif': 'image/jpeg',
        '.bmp': 'image/bmp',
        '.tiff': 'image/tiff',
        // Videos
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska',
        '.3gp': 'video/3gpp',
        '.3gpp': 'video/3gpp',
        // 360°
        '.insp': 'application/octet-stream'
      };
      
      let contentType = file.mimetype;
      
      // Override if we have a better mapping
      if (contentTypeMap[ext]) {
        contentType = contentTypeMap[ext];
      }
      
      // Handle empty or generic MIME types
      if (!contentType || contentType === 'application/octet-stream') {
        contentType = contentTypeMap[ext] || 'image/jpeg';
      }
      
      console.log(`📦 Content-Type set to: ${contentType} for ${file.originalname}`);
      cb(null, contentType);
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB per file
    files: 50 // Max 50 files per upload batch
  }
});

// ===== REVIEW IMAGES UPLOAD (Mobile-Optimized) =====
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
      let fileExtension = path.extname(file.originalname).toLowerCase();
      
      if (!fileExtension || fileExtension === '.') {
        fileExtension = '.jpg';
      }
      
      if (fileExtension === '.heic' || fileExtension === '.heif') {
        fileExtension = '.jpg';
      }
      
      const uniqueId = uuidv4();
      const fileName = `review-images/${userId}-${uniqueId}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const mimeMap: { [key: string]: string } = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.heic': 'image/jpeg',
        '.heif': 'image/jpeg'
      };
      
      let contentType = file.mimetype;
      if (!contentType || contentType === 'application/octet-stream' || contentType === '') {
        contentType = mimeMap[ext] || 'image/jpeg';
      }
      
      cb(null, contentType);
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 20
  }
});

// ===== PROFILE IMAGE UPLOAD (Mobile-Optimized) =====
export const uploadProfileImage = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req: any, file, cb) {
      const userId = req.user?.userId || 'anonymous';
      let fileExtension = path.extname(file.originalname).toLowerCase();
      
      if (!fileExtension || fileExtension === '.') {
        fileExtension = '.jpg';
      }
      
      if (fileExtension === '.heic' || fileExtension === '.heif') {
        fileExtension = '.jpg';
      }
      
      const uniqueId = uuidv4();
      const fileName = `profile-images/${userId}-${uniqueId}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      if (file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
        cb(null, 'image/jpeg');
      } else if (!file.mimetype || file.mimetype === 'application/octet-stream') {
        cb(null, 'image/jpeg');
      } else {
        cb(null, file.mimetype);
      }
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

// ===== EVENT IMAGES UPLOAD =====
export const uploadEventImages = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req: any, file, cb) {
      const userId = req.user?.userId || 'anonymous';
      let fileExtension = path.extname(file.originalname).toLowerCase();
      
      if (!fileExtension || fileExtension === '.') {
        fileExtension = '.jpg';
      }
      
      const uniqueId = uuidv4();
      const fileName = `event-images/${userId}-${uniqueId}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      if (!file.mimetype || file.mimetype === 'application/octet-stream') {
        cb(null, 'image/jpeg');
      } else {
        cb(null, file.mimetype);
      }
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 10
  }
});

// ===== S3 FILE OPERATIONS =====

/**
 * Delete file from S3
 * @param fileKey - S3 object key (e.g., 'venue-media/TV-123/file.jpg')
 * @returns Promise<boolean> - true if successful, false otherwise
 */
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

/**
 * Extract S3 key from full S3 URL
 * @param url - Full S3 URL (e.g., 'https://bucket.s3.region.amazonaws.com/path/to/file.jpg')
 * @returns string | null - S3 key or null if parsing fails
 */
export const getS3KeyFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1); // Remove leading slash
  } catch (error) {
    console.error('❌ Error parsing S3 URL:', error);
    return null;
  }
};
