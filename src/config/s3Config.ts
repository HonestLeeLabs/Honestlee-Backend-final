import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Configure AWS S3 Client (v3)
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: process.env.AWS_REGION || 'ap-south-1'
});

// File filter function
// ===== IMPROVED FILE FILTER =====
const fileFilter = (req: any, file: any, cb: any) => {
  // Accept images including HEIC/HEIF formats from iOS devices
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    ''
  ];

  const allowedExtensions = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i;

  // ✅ Check MIME type (if provided)
  if (file.mimetype && allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
    return;
  }

  // ✅ Check file extension as fallback (important for mobile)
  if (file.originalname && allowedExtensions.test(file.originalname.toLowerCase())) {
    cb(null, true);
    return;
  }

  req.fileValidationError = 'Only image files are allowed (JPG, PNG, GIF, WEBP, HEIC)!';
  return cb(new Error('Only image files are allowed!'), false);
};

// Configure multer for S3 upload
export const uploadProfileImage = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req: any, file, cb) {
      // Generate unique filename
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
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Function to delete file from S3 (v3)
export const deleteFileFromS3 = async (fileKey: string): Promise<boolean> => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'honestlee-user-upload',
      Key: fileKey
    });
    
    await s3.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    return false;
  }
};

// Function to extract S3 key from URL
export const getS3KeyFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    // Remove the leading slash
    return urlObj.pathname.substring(1);
  } catch (error) {
    return null;
  }
};
