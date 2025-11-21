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

// ===== VENUE MEDIA FILE FILTER (Images, Videos, 360°) =====
const venueMediaFileFilter = (req: any, file: any, cb: any) => {
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
    // 360° formats
    'application/octet-stream', // INSP and mobile uploads
    ''
  ];

  const allowedExtensions = /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|mp4|mov|avi|webm|mkv|insp)$/i;

  console.log('📸 Venue Media Upload:', {
    name: file.originalname,
    mimeType: file.mimetype,
    size: file.size
  });

  // Check MIME type
  if (file.mimetype && allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
    return;
  }

  // Check file extension as fallback
  if (file.originalname && allowedExtensions.test(file.originalname.toLowerCase())) {
    cb(null, true);
    return;
  }

  console.error('❌ File rejected:', file.originalname, file.mimetype);
  req.fileValidationError = 'Only image and video files are allowed!';
  return cb(new Error('Only image and video files are allowed!'), false);
};

// ===== VENUE MEDIA UPLOAD TO S3 =====
export const uploadVenueMedia = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { 
        fieldName: file.fieldname,
        originalName: file.originalname,
        uploadedBy: (req as any).user?.userId || 'agent'
      });
    },
    key: function (req: any, file, cb) {
      const agentId = req.user?.userId || 'anonymous';
      const tempVenueId = req.params?.tempVenueId || 'unknown';
      let fileExtension = path.extname(file.originalname).toLowerCase();
      
      // Convert HEIC/HEIF to JPG for compatibility
      if (fileExtension === '.heic' || fileExtension === '.heif') {
        fileExtension = '.jpg';
      }
      
      // Handle INSP (Insta360) files
      if (fileExtension === '.insp') {
        fileExtension = '.insp'; // Keep original
      }
      
      // Default extension if missing
      if (!fileExtension || fileExtension === '.') {
        fileExtension = '.jpg';
      }
      
      const uniqueId = uuidv4();
      const timestamp = Date.now();
      const fileName = `venue-media/${tempVenueId}/${agentId}-${timestamp}-${uniqueId}${fileExtension}`;
      
      console.log(`✅ S3 Upload Key: ${fileName}`);
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      // Map file types to proper content types
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
        // 360°
        '.insp': 'application/octet-stream'
      };
      
      const contentType = contentTypeMap[ext] || file.mimetype || 'application/octet-stream';
      cb(null, contentType);
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB per file (supports large videos and 360° files)
    files: 50 // Max 50 files per upload batch
  }
});

// ===== REVIEW IMAGES UPLOAD =====
export const uploadReviewImages = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req: any, file, cb) {
      const userId = req.user?.userId || 'anonymous';
      let fileExtension = path.extname(file.originalname).toLowerCase();
      
      if (fileExtension === '.heic' || fileExtension === '.heif') {
        fileExtension = '.jpg';
      }
      
      if (!fileExtension || fileExtension === '.') {
        fileExtension = '.jpg';
      }
      
      const uniqueId = uuidv4();
      const fileName = `review-images/${userId}-${uniqueId}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      if (file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
        cb(null, 'image/jpeg');
      } else if (!file.mimetype || file.mimetype === 'application/octet-stream') {
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
        cb(null, mimeMap[ext] || 'image/jpeg');
      } else {
        cb(null, file.mimetype);
      }
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 20
  }
});

// ===== PROFILE IMAGE UPLOAD =====
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
      const fileExtension = path.extname(file.originalname);
      const uniqueId = uuidv4();
      const fileName = `event-images/${userId}-${uniqueId}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 10
  }
});

// ===== S3 FILE OPERATIONS =====

// Delete file from S3
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

// Extract S3 key from URL
export const getS3KeyFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1);
  } catch (error) {
    console.error('❌ Error parsing S3 URL:', error);
    return null;
  }
};
