import { Router, Request, Response, NextFunction } from 'express';
import { uploadProfileImage, deleteFileFromS3, getS3KeyFromUrl } from '../config/s3Config';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import User from '../models/User';

const router = Router();

// Custom middleware to handle AuthRequest typing for multer
const handleUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadProfileImage.single('profileImage')(req, res, async (error: any) => {
    const authReq = req as AuthRequest;
    
    if (error) {
      console.error('Upload error:', error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          message: 'File too large. Maximum size is 5MB.',
          error: 'FILE_TOO_LARGE'
        });
      }
      if (authReq.fileValidationError) {
        return res.status(400).json({
          message: authReq.fileValidationError,
          error: 'INVALID_FILE_TYPE'
        });
      }
      return res.status(500).json({
        message: 'Upload failed',
        error: error.message
      });
    }

    if (!authReq.file) {
      return res.status(400).json({
        message: 'No file uploaded',
        error: 'NO_FILE'
      });
    }

    try {
      // Get current user to delete old profile image
      const currentUser = await User.findById(authReq.user?.userId);
      
      // Delete old profile image if it exists and is from our S3
      if (currentUser?.profileImage && currentUser.profileImage.includes(process.env.S3_BUCKET_NAME || '')) {
        const oldImageKey = getS3KeyFromUrl(currentUser.profileImage);
        if (oldImageKey) {
          await deleteFileFromS3(oldImageKey);
        }
      }

      // Update user's profileImage field
      const imageUrl = (authReq.file as any).location;
      await User.findByIdAndUpdate(authReq.user?.userId, { profileImage: imageUrl });

      res.json({
        message: 'Profile image uploaded successfully',
        imageUrl: imageUrl,
        fileName: (authReq.file as any).key
      });

    } catch (dbError) {
      console.error('Database error:', dbError);
      // If DB update fails, try to delete the uploaded file
      const uploadedKey = (authReq.file as any).key;
      if (uploadedKey) {
        await deleteFileFromS3(uploadedKey);
      }
      
      res.status(500).json({
        message: 'Failed to update profile image in database',
        error: 'DATABASE_ERROR'
      });
    }
  });
};

// Upload profile image
router.post('/profile-image', authenticate, handleUpload);

// Delete profile image
router.delete('/profile-image', authenticate, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  
  try {
    const user = await User.findById(authReq.user?.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.profileImage) {
      return res.status(400).json({ message: 'No profile image to delete' });
    }

    // Delete from S3 if it's our image
    if (user.profileImage.includes(process.env.S3_BUCKET_NAME || '')) {
      const imageKey = getS3KeyFromUrl(user.profileImage);
      if (imageKey) {
        await deleteFileFromS3(imageKey);
      }
    }

    // Update user record
    await User.findByIdAndUpdate(authReq.user?.userId, { profileImage: null });

    res.json({
      message: 'Profile image deleted successfully'
    });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      message: 'Failed to delete profile image',
      error: 'DELETE_ERROR'
    });
  }
});

export default router;
