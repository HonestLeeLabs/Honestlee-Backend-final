// config/uploadConfig.ts
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import sharp from 'sharp';

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

// ===== IMAGE SIZE GENERATION (3 VERSIONS) =====
const generateImageSizes = async (
  fileBuffer: Buffer,
  isVideo: boolean
): Promise<{
  thumbnail: Buffer | null;
  medium: Buffer | null;
}> => {
  if (isVideo) return { thumbnail: null, medium: null };
  
  try {
    // 1. THUMBNAIL: 200x200, WebP 70% (~10-20KB for grid)
    const thumbnail = await sharp(fileBuffer)
      .resize(200, 200, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 70, effort: 6 })
      .toBuffer();
    
    console.log(`✅ Thumbnail: ${(thumbnail.length / 1024).toFixed(2)} KB`);
    
    // 2. MEDIUM: 800px max, WebP 75% (~50KB for modal)
    const medium = await sharp(fileBuffer)
      .resize(800, 800, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 75, effort: 6 })
      .toBuffer();
    
    console.log(`✅ Medium: ${(medium.length / 1024).toFixed(2)} KB`);
    
    return { thumbnail, medium };
  } catch (error) {
    console.error('❌ Size generation failed:', error);
    return { thumbnail: null, medium: null };
  }
};

// ===== UPLOAD TO S3 WITH ALL SIZES =====
export const uploadToS3WithSizes = async (
  file: Express.Multer.File,
  s3Key: string,
  contentType: string
): Promise<{ 
  originalUrl: string; 
  thumbnailUrl: string | null; 
  mediumUrl: string | null;
  thumbnailKey: string | null;
  mediumKey: string | null;
}> => {
  const bucketName = process.env.S3_BUCKET_NAME || 'honestlee-user-upload';
  const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;
  
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const isVideo = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.3gp', '.3gpp', '.m4v'].includes(fileExtension);
  
  // Upload original
  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    Body: file.buffer,
    ContentType: contentType,
  }));
  
  const originalUrl = cloudFrontDomain 
    ? `https://${cloudFrontDomain}/${s3Key}`
    : `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${s3Key}`;
  
  console.log(`✅ Original uploaded: ${originalUrl}`);
  
  let thumbnailUrl: string | null = null;
  let mediumUrl: string | null = null;
  let thumbnailKey: string | null = null;
  let mediumKey: string | null = null;
  
  // Generate sizes for images only
  if (!isVideo && file.buffer) {
    const { thumbnail, medium } = await generateImageSizes(file.buffer, isVideo);
    const parsedPath = path.parse(s3Key);
    
    // Upload thumbnail
    if (thumbnail) {
      thumbnailKey = `${parsedPath.dir}/${parsedPath.name}-thumb.webp`;
      await s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: thumbnailKey,
        Body: thumbnail,
        ContentType: 'image/webp',
      }));
      thumbnailUrl = cloudFrontDomain
        ? `https://${cloudFrontDomain}/${thumbnailKey}`
        : `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${thumbnailKey}`;
      console.log(`✅ Thumbnail uploaded: ${thumbnailUrl}`);
    }
    
    // Upload medium
    if (medium) {
      mediumKey = `${parsedPath.dir}/${parsedPath.name}-medium.webp`;
      await s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: mediumKey,
        Body: medium,
        ContentType: 'image/webp',
      }));
      mediumUrl = cloudFrontDomain
        ? `https://${cloudFrontDomain}/${mediumKey}`
        : `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${mediumKey}`;
      console.log(`✅ Medium uploaded: ${mediumUrl}`);
    }
  }
  
  return { originalUrl, thumbnailUrl, mediumUrl, thumbnailKey, mediumKey };
};

// ===== FIXED MOBILE FILE FILTER =====
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

  // ✅ MOBILE SAFETY CHECK: Accept ANY file > 5KB
  if (file.size > 5 * 1024) {
    console.log(`${logId} ✅ MOBILE ACCEPTED: Size > 5KB`);
    cb(null, true);
    return;
  }

  if (!file || !file.originalname) {
    console.error(`${logId} ❌ REJECTED: Invalid file object`);
    const error: any = new Error('Invalid file object');
    error.code = 'INVALID_FILE';
    cb(error, false);
    return;
  }

  const allowedExtensions = /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|tif|jpe|jfif|mp4|mov|avi|webm|mkv|3gp|3gpp|m4v|insp)$/i;
  
  if (file.originalname && allowedExtensions.test(file.originalname.toLowerCase())) {
    const ext = path.extname(file.originalname).toLowerCase();
    console.log(`${logId} ✅ ACCEPTED by extension: ${ext}`);
    cb(null, true);
    return;
  }

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

  console.error(`${logId} ❌ REJECTED: Invalid file type`);
  const error: any = new Error('Only image and video files are allowed');
  error.code = 'FILE_TYPE_NOT_ALLOWED';
  cb(error, false);
};

// ===== HELPER FUNCTIONS =====
const getMimeToExtensionMap = (): { [key: string]: string } => ({
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/heic': '.jpg',
  'image/heif': '.jpg',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/3gpp': '.3gp',
});

const getContentTypeMap = (): { [key: string]: string } => ({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.heic': 'image/jpeg',
  '.heif': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.3gp': 'video/3gpp',
});

const getFileExtension = (file: any): string => {
  let fileExtension = path.extname(file.originalname || '').toLowerCase();
  
  if (!fileExtension || fileExtension === '.') {
    const mimeToExtMap = getMimeToExtensionMap();
    const detectedMime = (file.mimetype || '').toLowerCase();
    fileExtension = mimeToExtMap[detectedMime] || '.jpg';
  }
  
  if (['.heic', '.heif'].includes(fileExtension)) {
    fileExtension = '.jpg';
  }
  
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
  
  return contentType;
};

// ===== MANUAL UPLOAD HANDLER (for thumbnail generation) =====
export const processVenueMediaUpload = async (
  file: Express.Multer.File,
  req: any
): Promise<{ 
  originalUrl: string; 
  thumbnailUrl: string | null; 
  mediumUrl: string | null;
  s3Key: string; 
  thumbnailKey: string | null;
  mediumKey: string | null;
}> => {
  const agentId = req.user?.userId || 'anonymous';
  const tempVenueId = req.params?.tempVenueId || 'unknown';
  
  const fileExtension = getFileExtension(file);
  const contentType = getContentType(file, fileExtension);
  
  const uniqueId = uuidv4();
  const timestamp = Date.now();
  const s3Key = `venue-media/${tempVenueId}/${agentId}-${timestamp}-${uniqueId}${fileExtension}`;
  
  console.log(`✅ Processing upload with sizes: ${file.originalname} → ${s3Key}`);
  
  const { originalUrl, thumbnailUrl, mediumUrl, thumbnailKey, mediumKey } = 
    await uploadToS3WithSizes(file, s3Key, contentType);
  
  return { originalUrl, thumbnailUrl, mediumUrl, s3Key, thumbnailKey, mediumKey };
};

// ===== HELPER: PROCESS OTHER UPLOADS WITH SIZES =====
export const processUploadWithSizes = async (
  file: Express.Multer.File,
  req: any,
  folder: 'review-images' | 'profile-images' | 'event-images'
): Promise<{ 
  originalUrl: string; 
  thumbnailUrl: string | null; 
  mediumUrl: string | null;
  s3Key: string; 
  thumbnailKey: string | null;
  mediumKey: string | null;
}> => {
  const userId = req.user?.userId || 'anonymous';
  
  const fileExtension = getFileExtension(file);
  const contentType = getContentType(file, fileExtension);
  
  const uniqueId = uuidv4();
  const timestamp = Date.now();
  const s3Key = `${folder}/${userId}-${timestamp}-${uniqueId}${fileExtension}`;
  
  console.log(`✅ Processing ${folder} upload with sizes: ${file.originalname} → ${s3Key}`);
  
  const { originalUrl, thumbnailUrl, mediumUrl, thumbnailKey, mediumKey } = 
    await uploadToS3WithSizes(file, s3Key, contentType);
  
  return { originalUrl, thumbnailUrl, mediumUrl, s3Key, thumbnailKey, mediumKey };
};

// ===== DELETE ALL SIZES =====
export const deleteAllSizesFromS3 = async (originalKey: string): Promise<boolean> => {
  try {
    const parsedPath = path.parse(originalKey);
    const bucketName = process.env.S3_BUCKET_NAME || 'honestlee-user-upload';
    
    // Delete all 3 versions
    const deletePromises = [
      // Delete original
      s3.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: originalKey
      })),
      // Delete thumbnail (if exists)
      s3.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: `${parsedPath.dir}/${parsedPath.name}-thumb.webp`
      })).catch(() => {}),
      // Delete medium (if exists)
      s3.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: `${parsedPath.dir}/${parsedPath.name}-medium.webp`
      })).catch(() => {})
    ];
    
    await Promise.all(deletePromises);
    console.log(`✅ All sizes deleted from S3: ${originalKey}`);
    return true;
  } catch (error) {
    console.error('❌ Error deleting sizes:', error);
    return false;
  }
};

// ===== DELETE THUMBNAIL HELPER (backward compatibility) =====
export const deleteThumbnailFromS3 = async (originalKey: string): Promise<boolean> => {
  try {
    const parsedPath = path.parse(originalKey);
    const thumbnailKey = `${parsedPath.dir}/${parsedPath.name}-thumb.webp`;
    
    const command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
      Key: thumbnailKey
    });
    
    await s3.send(command);
    console.log(`✅ Thumbnail deleted from S3: ${thumbnailKey}`);
    return true;
  } catch (error) {
    // It's okay if thumbnail doesn't exist
    if ((error as any).name === 'NoSuchKey') {
      console.log(`ℹ️ Thumbnail not found, may already be deleted: ${originalKey}`);
      return true;
    }
    console.error('❌ Error deleting thumbnail from S3:', error);
    return false;
  }
};

// ===== DIRECT S3 UPLOAD CONFIGURATIONS (for non-venue uploads without thumbnails) =====

// ===== VENUE MEDIA UPLOAD TO S3 (10GB+ Support) =====
export const uploadVenueMediaDirect = multer({
  storage: multerS3({
    s3: s3 as any,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        originalName: file.originalname,
        uploadedBy: (req as any).user?.userId || 'agent',
        mimeType: file.mimetype || 'unknown',
        uploadTimestamp: new Date().toISOString()
      });
    },
    key: function (req: any, file, cb) {
      const agentId = (req as any).user?.userId || 'anonymous';
      const tempVenueId = req.params?.tempVenueId || 'unknown';

      let fileExtension = getFileExtension(file);
      
      const uniqueId = uuidv4();
      const timestamp = Date.now();
      const fileName = `venue-media/${tempVenueId}/${agentId}-${timestamp}-${uniqueId}${fileExtension}`;

      console.log(`✅ S3 Upload Key: ${fileName}`);
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      const fileExtension = getFileExtension(file);
      const contentType = getContentType(file, fileExtension);
      
      console.log(`📦 Content-Type set to: ${contentType} for ${file.originalname}`);
      cb(null, contentType);
    }
  }),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: Infinity,       // No size limit (up to 10GB+)
    files: 100,              // Max 100 files per batch
    fieldSize: Infinity, // ✅ Fixed: was 100MB limit
  }
});

// ===== REVIEW IMAGES UPLOAD (10GB Support) =====
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
      const timestamp = Date.now();
      const fileName = `review-images/${userId}-${timestamp}-${uniqueId}${fileExtension}`;
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

// ===== PROFILE IMAGE UPLOAD (10GB Support) =====
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
      const timestamp = Date.now();
      const fileName = `profile-images/${userId}-${timestamp}-${uniqueId}${fileExtension}`;
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

// ===== EVENT IMAGES UPLOAD (10GB Support) =====
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
      const timestamp = Date.now();
      const fileName = `event-images/${userId}-${timestamp}-${uniqueId}${fileExtension}`;
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

// ===== MEMORY STORAGE UPLOADS (for manual processing with sizes) =====
export const uploadVenueMediaMemory = multer({
  storage: multer.memoryStorage(), // Use memory storage to access buffer
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: Infinity,
    files: 100,
    fieldSize: Infinity,
  }
});

export const uploadReviewImagesMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: Infinity,
    files: 20
  }
});

export const uploadProfileImageMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: venueMediaFileFilter,
  limits: {
    fileSize: Infinity
  }
});

export const uploadEventImagesMemory = multer({
  storage: multer.memoryStorage(),
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

// ===== BATCH DELETE =====
export const deleteMultipleFilesFromS3 = async (fileKeys: string[]): Promise<boolean> => {
  try {
    const deletePromises = fileKeys.map(key => deleteFileFromS3(key));
    await Promise.all(deletePromises);
    console.log(`✅ ${fileKeys.length} files deleted from S3`);
    return true;
  } catch (error) {
    console.error('❌ Error deleting multiple files from S3:', error);
    return false;
  }
};