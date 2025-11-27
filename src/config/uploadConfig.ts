import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// ===== AWS S3 CLIENT - MOBILE OPTIMIZED =====
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: process.env.AWS_REGION || 'ap-south-1',
  maxAttempts: 3,
});

// ===== FIXED MOBILE FILE FILTER (Accepts ALL mobile image formats) =====
const venueMediaFileFilter = (req: any, file: any, cb: any) => {
  console.log('📱 MOBILE DEBUG - Upload attempt:', {
    name: file.originalname,
    mimeType: file.mimetype || 'EMPTY',
    sizeMB: (file.size / 1024 / 1024).toFixed(2),
    encoding: file.encoding
  });

  // ✅ PRIORITY 1: Extension check (mobile reliable)
  const allowedExtensions = /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|mp4|mov|avi|webm|mkv|3gp|3gpp)$/i;
  if (file.originalname && allowedExtensions.test(file.originalname.toLowerCase())) {
    console.log('✅ ACCEPTED: Extension match', path.extname(file.originalname));
    cb(null, true);
    return;
  }

  // ✅ PRIORITY 2: Comprehensive MIME types (including mobile edge cases)
  const allowedMimeTypes = [
    // Images - Standard
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'image/bmp', 'image/tiff',
    // ✅ MOBILE CRITICAL: iOS formats
    'image/heic', 'image/heif',
    // Videos
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
    'video/webm', 'video/x-matroska', 'video/3gpp', 'video/3gpp2',
    // ✅ MOBILE BROWSER FALLBACKS (CRITICAL FIX)
    'application/octet-stream',
    '', // Empty MIME (iOS Safari)
    undefined // Undefined MIME
  ];

  const mimeLower = (file.mimetype || '').toLowerCase();
  if (allowedMimeTypes.includes(mimeLower)) {
    console.log('✅ ACCEPTED: MIME match', mimeLower);
    cb(null, true);
    return;
  }

  // ❌ Detailed rejection
  console.error('❌ REJECTED:', {
    name: file.originalname,
    mime: file.mimetype,
    reason: 'No extension OR MIME match'
  });
  
  const error: any = new Error(`Invalid file: ${file.originalname} (${file.mimetype}). Use JPG/PNG/HEIC/MP4.`);
  error.code = 'FILE_TYPE_NOT_ALLOWED';
  cb(error, false);
};

// ===== VENUE MEDIA UPLOAD (PRIMARY - Mobile Fixed) =====
export const uploadVenueMedia = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: (req, file, cb) => {
      cb(null, {
        fieldName: file.fieldname,
        originalName: file.originalname,
        uploadedBy: (req as any).user?.userId || 'agent',
        mimeType: file.mimetype || 'unknown',
        timestamp: new Date().toISOString()
      });
    },
    key: (req: any, file: any, cb: any) => {
      const agentId = (req as any).user?.userId || 'anonymous';
      const tempVenueId = req.params?.tempVenueId || 'unknown';
      
      let fileExtension = path.extname(file.originalname).toLowerCase();
      
      // ✅ MOBILE: Guess extension from MIME if missing
      if (!fileExtension || fileExtension === '.') {
        const mimeToExt: { [key: string]: string } = {
          'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
          'image/webp': '.webp', 'image/heic': '.jpg', 'image/heif': '.jpg',
          'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm'
        };
        fileExtension = mimeToExt[file.mimetype?.toLowerCase() as any] || '.jpg';
        console.log('🔍 Extension guessed:', fileExtension);
      }
      
      // ✅ Convert HEIC to JPG naming
      if (fileExtension === '.heic' || fileExtension === '.heif') {
        fileExtension = '.jpg';
      }
      
      const uniqueId = uuidv4().slice(0, 8);
      const timestamp = Date.now();
      const key = `venue-media/${tempVenueId}/${agentId}-${timestamp}-${uniqueId}${fileExtension}`;
      
      console.log('📤 S3 Key generated:', key);
      cb(null, key);
    },
    contentType: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const contentTypeMap: { [key: string]: string } = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/jpeg',
        '.heif': 'image/jpeg', '.bmp': 'image/bmp', '.tiff': 'image/tiff',
        '.mp4': 'video/mp4', '.mov': 'video/mp4', '.avi': 'video/mp4',
        '.webm': 'video/webm', '.mkv': 'video/mp4', '.3gp': 'video/mp4'
      };
      
      let contentType = contentTypeMap[ext];
      
      // ✅ HEIC always served as JPEG (browser compatibility)
      if (file.mimetype?.includes('heic') || file.mimetype?.includes('heif')) {
        contentType = 'image/jpeg';
      } else if (!contentType && file.mimetype && file.mimetype !== 'application/octet-stream') {
        contentType = file.mimetype;
      } else if (!contentType) {
        contentType = 'image/jpeg';
      }
      
      console.log('📦 Content-Type:', contentType);
      cb(null, contentType);
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: Infinity, // No limit (S3 handles 10GB+)
    files: 100,
    fieldSize: 500 * 1024 * 1024 // 500MB field
  }
});

// ===== OTHER UPLOADERS (Same mobile fixes) =====
export const uploadReviewImages = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: (req, file, cb) => cb(null, { fieldName: file.fieldname, originalName: file.originalname }),
    key: (req: any, file: any, cb: any) => {
      const userId = (req as any).user?.userId || 'anonymous';
      let ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      if (ext === '.heic' || ext === '.heif') ext = '.jpg';
      cb(null, `review-images/${userId}-${uuidv4()}${ext}`);
    },
    contentType: (req, file, cb) => {
      if (file.mimetype?.includes('heic') || file.mimetype?.includes('heif')) {
        cb(null, 'image/jpeg');
      } else {
        cb(null, file.mimetype || 'image/jpeg');
      }
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: { fileSize: Infinity, files: 20 }
});

export const uploadProfileImage = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: (req, file, cb) => cb(null, { fieldName: file.fieldname }),
    key: (req: any, file: any, cb: any) => {
      const userId = (req as any).user?.userId || 'anonymous';
      let ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      if (ext === '.heic' || ext === '.heif') ext = '.jpg';
      cb(null, `profile-images/${userId}-${uuidv4()}${ext}`);
    },
    contentType: (req, file, cb) => {
      if (file.mimetype?.includes('heic') || file.mimetype?.includes('heif')) {
        cb(null, 'image/jpeg');
      } else {
        cb(null, file.mimetype || 'image/jpeg');
      }
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: { fileSize: Infinity }
});

export const uploadEventImages = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: (req, file, cb) => cb(null, { fieldName: file.fieldname }),
    key: (req: any, file: any, cb: any) => {
      const userId = (req as any).user?.userId || 'anonymous';
      let ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `event-images/${userId}-${uuidv4()}${ext}`);
    },
    contentType: (req, file, cb) => cb(null, file.mimetype || 'image/jpeg')
  }),
  fileFilter: venueMediaFileFilter,
  limits: { fileSize: Infinity, files: 10 }
});

// ===== S3 UTILITIES =====
export const deleteFileFromS3 = async (fileKey: string): Promise<boolean> => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
      Key: fileKey
    });
    await s3.send(command);
    console.log('✅ Deleted:', fileKey);
    return true;
  } catch (error) {
    console.error('❌ Delete failed:', error);
    return false;
  }
};

export const getS3KeyFromUrl = (url: string): string | null => {
  try {
    return new URL(url).pathname.substring(1);
  } catch {
    return null;
  }
};
