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


// ===== FILE FILTER =====
const fileFilter = (req: any, file: any, cb: any) => {
  if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF|webp|WEBP)$/)) {
    req.fileValidationError = 'Only image files are allowed!';
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

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
      let fileExtension = path.extname(file.originalname);
      
      // Convert HEIC to JPG for compatibility
      if (fileExtension.toLowerCase() === '.heic' || fileExtension.toLowerCase() === '.heif') {
        fileExtension = '.jpg';
      }
      
      const uniqueId = uuidv4();
      const fileName = `review-images/${userId}-${uniqueId}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: function (req, file, cb) {
      // Force HEIC/HEIF to JPEG content type
      if (file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
        cb(null, 'image/jpeg');
      } else {
        cb(null, file.mimetype);
      }
    }
  }),
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 20 // Max 20 photos per review
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
      const fileExtension = path.extname(file.originalname);
      const uniqueId = uuidv4();
      const fileName = `profile-images/${userId}-${uniqueId}${fileExtension}`;
      cb(null, fileName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE
  }),
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // ✅ 50MB limit (increased from 5MB)
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
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 10 // Max 10 photos per event
  }
});

// ===== S3 FILE OPERATIONS =====

// Function to delete file from S3
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


// Function to extract S3 key from URL
export const getS3KeyFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    // Remove the leading slash to get the S3 key
    return urlObj.pathname.substring(1);
  } catch (error) {
    console.error('❌ Error parsing S3 URL:', error);
    return null;
  }
};
