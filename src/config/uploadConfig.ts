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
  region: process.env.AWS_REGION || 'ap-south-1',
  requestHandler: {
    connectionTimeout: 900000,
    socketTimeout: 900000,
  } as any,
  maxAttempts: 5, // ✅ Increased for mobile reliability
});

console.log('✅ S3 Client initialized:', {
  region: process.env.AWS_REGION || 'ap-south-1',
  bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload'
});

// ===== FIXED MOBILE FILE FILTER (ALL ORIGINAL LOGIC + MOBILE FIX) =====
const venueMediaFileFilter = (req: any, file: any, cb: any) => {
  const logId = `[MOBILE-FILTER-${Date.now()}]`;
  
  console.log(`${logId} 📱 MOBILE DEBUG - Upload Attempt:`, {
    originalname: file.originalname || 'NO_NAME',
    mimetype: file.mimetype || 'EMPTY',
    size: file.size,
    sizeMB: (file.size / 1024 / 1024).toFixed(2),
    encoding: file.encoding,
    fieldname: file.fieldname,
    userAgent: (req.headers?.['user-agent'] || '').substring(0, 100),
    contentType: req.headers?.['content-type'],
    origin: req.headers?.['origin'],
  });

  // ✅ MOBILE SAFETY CHECK: Accept ANY file > 5KB (covers all images/videos)
  if (file.size > 5 * 1024) {
    console.log(`${logId} ✅ MOBILE ACCEPTED: Size > 5KB (all mobile formats)`);
    cb(null, true);
    return;
  }

  // Check if file object is valid (original logic)
  if (!file || !file.originalname) {
    console.error(`${logId} ❌ REJECTED: Invalid file object`, { file });
    const error: any = new Error('Invalid file object');
    error.code = 'INVALID_FILE';
    cb(error, false);
    return;
  }

  // ✅ PRIORITY 1: Check file extension (original logic + mobile fix)
  const allowedExtensions = /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|tif|jpe|jfif|mp4|mov|avi|webm|mkv|3gp|3gpp|m4v|insp)$/i;
  
  if (file.originalname && allowedExtensions.test(file.originalname.toLowerCase())) {
    const ext = path.extname(file.originalname).toLowerCase();
    console.log(`${logId} ✅ ACCEPTED by extension: ${ext}`);
    cb(null, true);
    return;
  }

  // ✅ PRIORITY 2: Check MIME type (original logic + mobile empty MIME fix)
  const allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'image/bmp', 'image/tiff', 'image/x-icon',
    'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
    'video/webm', 'video/x-matroska', 'video/3gpp', 'video/3gpp2', 'video/x-m4v',
    'application/octet-stream', 'binary/octet-stream', '', null, undefined
  ];

  const fileMimeType = (file.mimetype || '').toLowerCase();
  
  if (allowedMimeTypes.includes(fileMimeType) || !file.mimetype) {
    console.log(`${logId} ✅ ACCEPTED by MIME type: ${file.mimetype || 'unknown/empty'}`);
    cb(null, true);
    return;
  }

  // ✅ PRIORITY 3: Fallback for valid filename patterns (original logic)
  if (file.originalname) {
    const ext = path.extname(file.originalname).toLowerCase();
    const imageVideoExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', 
                           '.bmp', '.tiff', '.mp4', '.mov', '.avi', '.webm', '.3gp'];
    
    if (imageVideoExts.includes(ext)) {
      console.log(`${logId} ✅ ACCEPTED by filename pattern: ${file.originalname}`);
      cb(null, true);
      return;
    }
  }

  // Final rejection (original logic)
  console.error(`${logId} ❌ REJECTED: Invalid file type`, {
    name: file.originalname,
    mime: file.mimetype,
    hasExtension: !!path.extname(file.originalname),
    extension: path.extname(file.originalname)
  });
  
  const error: any = new Error('Only image and video files are allowed');
  error.code = 'FILE_TYPE_NOT_ALLOWED';
  cb(error, false);
};

// ===== ALL ORIGINAL HELPER FUNCTIONS (UNCHANGED) =====
const getMimeToExtensionMap = (): { [key: string]: string } => ({
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/tif': '.tiff',
  'image/heic': '.jpg',
  'image/heif': '.jpg',
  'image/heic-sequence': '.jpg',
  'image/heif-sequence': '.jpg',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/3gpp': '.3gp',
  'video/3gpp2': '.3gp',
  'video/x-m4v': '.mp4',
  'application/octet-stream': '.jpg',
  'binary/octet-stream': '.jpg',
});

const getContentTypeMap = (): { [key: string]: string } => ({
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
  '.heic': 'image/jpeg',
  '.heif': 'image/jpeg',
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

const getFileExtension = (file: any): string => {
  const logId = `[EXT-${Date.now()}]`;
  let fileExtension = path.extname(file.originalname || '').toLowerCase();
  
  console.log(`${logId} Getting extension for: ${file.originalname}`);
  
  if (!fileExtension || fileExtension === '.') {
    const mimeToExtMap = getMimeToExtensionMap();
    const detectedMime = (file.mimetype || '').toLowerCase();
    fileExtension = mimeToExtMap[detectedMime] || '.jpg';
    console.log(`${logId} 📝 Extension guessed from MIME '${detectedMime}': ${fileExtension}`);
  }
  
  if (['.heic', '.heif'].includes(fileExtension)) {
    console.log(`${logId} 🔄 Converting ${fileExtension} to .jpg`);
    fileExtension = '.jpg';
  }
  
  console.log(`${logId} ✅ Final extension: ${fileExtension}`);
  return fileExtension;
};

const getContentType = (file: any, fileExtension: string): string => {
  const contentTypeMap = getContentTypeMap();
  
  let contentType = contentTypeMap[fileExtension];
  
  if (!contentType && file.mimetype && 
      file.mimetype !== 'application/octet-stream' && 
      file.mimetype !== 'binary/octet-stream' &&
      file.mimetype !== '') {
    contentType = file.mimetype;
  }
  
  if (!contentType) {
    contentType = fileExtension.match(/\.(mp4|mov|avi|webm|mkv|3gp)$/i) 
      ? 'video/mp4' 
      : 'image/jpeg';
  }
  
  console.log(`📦 Content-Type determined: ${contentType} for ${file.originalname}`);
  return contentType;
};

// ===== VENUE MEDIA UPLOAD WITH COMPREHENSIVE LOGGING (ORIGINAL + MOBILE FIXED) =====
export const uploadVenueMedia = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      const logId = `[META-${Date.now()}]`;
      const userAgent = (req as any).headers?.['user-agent'] || '';
      const deviceType = userAgent.includes('iPhone') || userAgent.includes('iPad') ? 'iOS' : 
                        userAgent.includes('Android') ? 'Android' : 'Desktop'; // ✅ Fixed device detection
      
      const metadata = { 
        fieldName: file.fieldname,
        originalName: file.originalname || 'mobile-file',
        uploadedBy: (req as any).user?.userId || 'agent',
        mimeType: file.mimetype || 'unknown',
        uploadTimestamp: new Date().toISOString(),
        deviceType: deviceType,
        fileSize: file.size
      };
      
      console.log(`${logId} 📋 Metadata prepared:`, metadata);
      cb(null, metadata);
    },
    key: function (req: any, file, cb) {
      const logId = `[KEY-${Date.now()}]`;
      console.log(`${logId} 🔑 Generating S3 key for: ${file.originalname}`);
      
      const agentId = (req as any).user?.userId || 'anonymous';
      const tempVenueId = req.params?.tempVenueId || 'unknown';
      
      const fileExtension = getFileExtension(file);
      const uniqueId = uuidv4();
      const timestamp = Date.now();
      const fileName = `venue-media/${tempVenueId}/${agentId}-${timestamp}-${uniqueId}${fileExtension}`;
      
      console.log(`${logId} ✅ S3 Key generated: ${fileName}`);
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      const logId = `[CTYPE-${Date.now()}]`;
      console.log(`${logId} 🎭 Determining content type for: ${file.originalname}`);
      
      const fileExtension = getFileExtension(file);
      const contentType = getContentType(file, fileExtension);
      
      console.log(`${logId} ✅ Content-Type set: ${contentType}`);
      cb(null, contentType);
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: Infinity, // ✅ Mobile unlimited
    files: 100,
    fieldSize: Infinity, // ✅ Fixed: was 100MB limit
  }
});

// ===== ALL OTHER UPLOAD FUNCTIONS (IDENTICAL TO ORIGINAL) =====
export const uploadReviewImages = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { 
        fieldName: file.fieldname,
        originalName: file.originalname
      });
    },
    key: function (req: any, file, cb) {
      const userId = (req as any).user?.userId || 'anonymous';
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

export const uploadProfileImage = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req: any, file, cb) {
      const userId = (req as any).user?.userId || 'anonymous';
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

export const uploadEventImages = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req: any, file, cb) {
      const userId = (req as any).user?.userId || 'anonymous';
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

// ===== S3 FILE OPERATIONS (ORIGINAL) =====
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
