import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// AWS S3 CLIENT CONFIGURATION - 10GB File Support
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: process.env.AWS_REGION || 'ap-south-1',
  // Configure for extremely large file uploads
  requestHandler: {
    connectionTimeout: 900000, // 15 minutes
    socketTimeout: 900000, // 15 minutes
  } as any,
  maxAttempts: 3, // Retry failed uploads
});

// ✅ MOBILE-FRIENDLY FILE FILTER - No Size Restrictions
const venueMediaFileFilter = (
  req: any,
  file: any,
  cb: any
) => {
  console.log('Venue Media Upload Attempt', {
    name: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    encoding: file.encoding,
  });

  // ✅ PRIORITY 1: Check file extension first (most reliable for mobile)
  const allowedExtensions = /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|mp4|mov|avi|webm|mkv|3gp|3gpp|ins|p)/i;
  if (allowedExtensions.test(file.originalname.toLowerCase())) {
    console.log('✅ File accepted by extension:', path.extname(file.originalname));
    cb(null, true);
    return;
  }

  // ✅ PRIORITY 2: Allowed MIME types (secondary check)
  const allowedMimeTypes = [
    // Images
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'image/heic', 'image/heif', 'image/bmp', 'image/tiff',
    // Videos
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
    'video/webm', 'video/x-matroska', 'video/3gpp', 'video/3gpp2',
    // ✅ MOBILE FALLBACKS - Critical for iOS/Android
    'application/octet-stream',
  ];

  if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    console.log('✅ File accepted by MIME type:', file.mimetype);
    cb(null, true);
    return;
  }

  // Reject file
  console.error('❌ File rejected', {
    name: file.originalname,
    mime: file.mimetype,
    reason: 'Invalid file type or extension',
  });
  const error: any = new Error('Only image and video files are allowed!');
  error.code = 'FILE_TYPE_NOT_ALLOWED';
  cb(error, false);
};

// VENUE MEDIA UPLOAD TO S3 - 10GB Support
export const uploadVenueMedia = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        originalName: file.originalname,
        uploadedBy: (req as any).user?.userId || 'agent',
        mimeType: file.mimetype || 'unknown',
        uploadTimestamp: new Date().toISOString(),
      });
    },
    key: function (req: any, file: any, cb: any) {
      const agentId = (req as any).user?.userId || 'anonymous';
      const tempVenueId = req.params?.tempVenueId || 'unknown';

      let fileExtension = path.extname(file.originalname).toLowerCase();

      // ✅ MOBILE FIX: Handle missing extensions (mobile uploads sometimes have no extension)
      if (!fileExtension) {
        fileExtension = '.jpg';
      }

      // ✅ MIME-to-Extension mapping for mobile files
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
        'video/3gpp2': '.3gp',
      };
      if (!fileExtension || fileExtension === '.') {
        fileExtension = mimeToExtMap[file.mimetype] || '.jpg';
        console.log('🔍 Extension guessed from MIME:', fileExtension);
      }

      // ✅ MOBILE FIX: Convert HEIC/HEIF to JPG for compatibility
      if (fileExtension === '.heic' || fileExtension === '.heif') {
        fileExtension = '.jpg';
      }

      const uniqueId = uuidv4();
      const timestamp = Date.now();
      const fileName = `venue-media/${tempVenueId}/${agentId}-${timestamp}-${uniqueId}${fileExtension}`;

      console.log('📤 S3 Upload Key:', fileName);
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
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
      };

      let contentType = contentTypeMap[ext];
      if (!contentType) {
        contentType = file.mimetype;
      }
      if (file.mimetype === 'application/octet-stream' && !contentType) {
        contentType = file.mimetype;
      }
      if (!contentType) {
        contentType = 'image/jpeg';
      }

      console.log('📋 Content-Type set to:', contentType, 'for', file.originalname);
      cb(null, contentType);
    },
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: Infinity, // No size limit (up to 10GB+ files)
    files: 100, // Max 100 files per batch
    fieldSize: 100 * 1024 * 1024, // 100MB field size
  },
});

// REVIEW IMAGES UPLOAD - 10GB Support
export const uploadReviewImages = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        originalName: file.originalname,
      });
    },
    key: function (req: any, file: any, cb: any) {
      const userId = (req as any).user?.userId || 'anonymous';
      let fileExtension = path.extname(file.originalname).toLowerCase();
      if (!fileExtension) fileExtension = '.jpg';
      if (fileExtension === '.heic' || fileExtension === '.heif') fileExtension = '.jpg';
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
        '.heif': 'image/jpeg',
      };
      let contentType = file.mimetype;
      if (!contentType || contentType === 'application/octet-stream') {
        contentType = mimeMap[ext] || 'image/jpeg';
      }
      cb(null, contentType);
    },
  }),
  fileFilter: venueMediaFileFilter,
  limits: { fileSize: Infinity, files: 20 },
});

// PROFILE IMAGE UPLOAD - 10GB Support
export const uploadProfileImage = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req: any, file: any, cb: any) {
      const userId = (req as any).user?.userId || 'anonymous';
      let fileExtension = path.extname(file.originalname).toLowerCase();
      if (!fileExtension) fileExtension = '.jpg';
      if (fileExtension === '.heic' || fileExtension === '.heif') fileExtension = '.jpg';
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
    },
  }),
  fileFilter: venueMediaFileFilter,
  limits: { fileSize: Infinity },
});

// EVENT IMAGES UPLOAD - 10GB Support
export const uploadEventImages = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req: any, file: any, cb: any) {
      const userId = (req as any).user?.userId || 'anonymous';
      let fileExtension = path.extname(file.originalname).toLowerCase();
      if (!fileExtension) fileExtension = '.jpg';
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
    },
  }),
  fileFilter: venueMediaFileFilter,
  limits: { fileSize: Infinity, files: 10 },
});

// S3 FILE OPERATIONS
export const deleteFileFromS3 = async (fileKey: string): Promise<boolean> => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
      Key: fileKey,
    });
    await s3.send(command);
    console.log('✅ File deleted from S3:', fileKey);
    return true;
  } catch (error) {
    console.error('❌ Error deleting file from S3:', error);
    return false;
  }
};

export const getS3KeyFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1); // Remove leading slash
  } catch (error) {
    console.error('Error parsing S3 URL:', error);
    return null;
  }
};
