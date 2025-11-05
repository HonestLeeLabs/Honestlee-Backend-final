import { Request, Response } from 'express';
import Review from '../models/Review';
import { getVenueModel } from '../models/Venue';
import { dbManager } from '../config/database';
import { Region } from '../config/database';
import mongoose from 'mongoose';

// Helper functions for S3 (add these if not already present)
const getS3KeyFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    const key = urlObj.pathname.substring(1); // Remove leading slash
    return key;
  } catch {
    return null;
  }
};

const deleteFileFromS3 = async (key: string): Promise<void> => {
  // Implement your S3 deletion logic here
  // This is a placeholder - implement based on your S3 setup
  console.log('Deleting S3 file:', key);
};

export const createReview = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const region = ((req as any).region || 'th') as Region;
  const { venueId, rating, title, comment, tags } = req.body;

  console.log('📝 Creating review:', { venueId, rating, region });

  if (!venueId || !rating) {
    return res.status(400).json({ message: 'Venue ID and rating are required' });
  }

  try {
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);
    
    let venue = null;

    // Step 1: Try exact string match on globalId and id
    venue = await Venue.findOne({
      $or: [
        { globalId: venueId },
        { id: venueId }
      ]
    });

    // Step 2: If not found and venueId is a valid ObjectId, try _id
    if (!venue && mongoose.Types.ObjectId.isValid(venueId)) {
      venue = await Venue.findById(venueId);
    }

    if (!venue) {
      console.log('❌ Venue not found:', venueId);
      return res.status(404).json({ message: 'Venue not found' });
    }

    console.log('✅ Found venue:', venue.globalId || venue.id);

    const venueIdentifier = venue.globalId || venue.id || venue._id.toString();

    // Handle photos from multer S3 upload
    const photos = (req as any).files?.map((file: any) => file.location) || [];

    // Parse tags safely
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : Array.isArray(tags) ? tags : [];
      } catch (e) {
        parsedTags = [];
      }
    }

    const newReview = new Review({
      user: userId,
      venue: venueIdentifier,
      venueRegion: region,
      rating: parseInt(rating),
      title: title || '',
      comment: comment || '',
      tags: parsedTags,
      photos: photos.length > 0 ? photos : [],
      helpful: 0,
      helpfulBy: [],
      verified: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('💾 Saving review with', photos.length, 'photos');
    await newReview.save();
    await newReview.populate('user', 'name profileImage');

    console.log('✅ Review created:', newReview._id);
    res.status(201).json(newReview);
  } catch (error: any) {
    console.error('❌ Error creating review:', error);
    res.status(500).json({ 
      message: 'Failed to create review', 
      error: error.message 
    });
  }
};

export const getReviewsByVenue = async (req: Request, res: Response) => {
  const { venueId } = req.params;
  const region = ((req as any).region || 'th') as Region;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 5;
  const skip = (page - 1) * limit;

  console.log('🔍 Fetching reviews for venue:', { venueId, page, limit });

  try {
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);
    
    let venue = null;

    venue = await Venue.findOne({
      $or: [
        { globalId: venueId },
        { id: venueId }
      ]
    });

    if (!venue && mongoose.Types.ObjectId.isValid(venueId)) {
      venue = await Venue.findById(venueId);
    }

    if (!venue) {
      console.log('❌ Venue not found:', venueId);
      return res.status(404).json({ message: 'Venue not found' });
    }

    console.log('✅ Found venue for reviews:', venue.globalId || venue.id);

    const venueIdentifier = venue.globalId || venue.id || venue._id.toString();

    // Get total count
    const totalReviews = await Review.countDocuments({ 
      venue: venueIdentifier,
      venueRegion: region 
    });

    console.log('📊 Total reviews found:', totalReviews);

    // Get reviews with pagination
    const reviews = await Review.find({ 
      venue: venueIdentifier,
      venueRegion: region 
    })
      .populate('user', 'name profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Calculate rating statistics
    const ratingStats = await Review.aggregate([
      { 
        $match: { 
          venue: venueIdentifier,
          venueRegion: region 
        } 
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          ratings: {
            $push: '$rating'
          }
        }
      }
    ]);

    // Calculate rating breakdown
    const ratingBreakdown = [5, 4, 3, 2, 1].map(star => {
      const count = reviews.filter(r => r.rating === star).length;
      const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
      return {
        stars: star,
        count,
        percentage: Math.round(percentage)
      };
    });

    const stats = ratingStats.length > 0 ? {
      average: Math.round(ratingStats[0].averageRating * 10) / 10,
      total: ratingStats[0].totalReviews,
      breakdown: ratingBreakdown
    } : {
      average: 0,
      total: 0,
      breakdown: ratingBreakdown
    };

    res.json({
      reviews,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalReviews / limit),
        totalReviews,
        hasMore: skip + reviews.length < totalReviews
      },
      stats
    });
  } catch (error: any) {
    console.error('❌ Error fetching reviews:', error);
    res.status(500).json({ 
      message: 'Failed to fetch reviews', 
      error: error.message 
    });
  }
};

// GET user's own reviews
export const getMyReviews = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  console.log('🔍 Fetching reviews for user:', userId);

  try {
    // Get total count
    const totalReviews = await Review.countDocuments({ user: userId });

    console.log('📊 Total reviews found:', totalReviews);

    // Get reviews with pagination
    const reviews = await Review.find({ user: userId })
      .populate('user', 'name profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Fetch venue details for each review
    const reviewsWithVenues = await Promise.all(
      reviews.map(async (review) => {
        try {
          const region = review.venueRegion as Region;
          await dbManager.connectRegion(region);
          const Venue = getVenueModel(region);
          
          // Try to find venue by various identifiers
          let venue = await Venue.findOne({
            $or: [
              { globalId: review.venue },
              { id: review.venue }
            ]
          }).select('globalId AccountName BillingCity BillingCountry venuecategory Rating geometry').lean();

          // If not found and venue is valid ObjectId, try _id
          if (!venue && mongoose.Types.ObjectId.isValid(review.venue)) {
            venue = await Venue.findById(review.venue)
              .select('globalId AccountName BillingCity BillingCountry venuecategory Rating geometry')
              .lean();
          }

          return {
            ...review,
            venueDetails: venue ? {
              id: venue.globalId || venue._id,
              name: venue.AccountName,
              city: venue.BillingCity,
              country: venue.BillingCountry,
              category: venue.venuecategory,
              rating: venue.Rating,
              coordinates: venue.geometry?.coordinates
            } : null
          };
        } catch (error) {
          console.error(`Error fetching venue ${review.venue}:`, error);
          return {
            ...review,
            venueDetails: null
          };
        }
      })
    );

    res.json({
      reviews: reviewsWithVenues,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalReviews / limit),
        totalReviews,
        hasMore: skip + reviews.length < totalReviews
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching user reviews:', error);
    res.status(500).json({ 
      message: 'Failed to fetch reviews', 
      error: error.message 
    });
  }
};

// DELETE user's own review
export const deleteMyReview = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { reviewId } = req.params;

  console.log('🗑️ Deleting review:', reviewId, 'by user:', userId);

  try {
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ message: 'Invalid review ID' });
    }

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Check if user owns this review
    if (review.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You can only delete your own reviews' });
    }

    // Delete photos from S3 if any
    if (review.photos && review.photos.length > 0) {
      for (const photoUrl of review.photos) {
        const key = getS3KeyFromUrl(photoUrl);
        if (key) {
          await deleteFileFromS3(key);
        }
      }
    }

    await Review.findByIdAndDelete(reviewId);

    console.log('✅ Review deleted successfully');
    res.json({ message: 'Review deleted successfully' });
  } catch (error: any) {
    console.error('❌ Error deleting review:', error);
    res.status(500).json({ 
      message: 'Failed to delete review', 
      error: error.message 
    });
  }
};

// UPDATE user's own review
export const updateMyReview = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { reviewId } = req.params;
  const { rating, title, comment, tags } = req.body;

  console.log('✏️ Updating review:', reviewId);

  try {
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ message: 'Invalid review ID' });
    }

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Check if user owns this review
    if (review.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You can only edit your own reviews' });
    }

    // Handle new photos from multer
    const newPhotos = (req as any).files?.map((file: any) => file.location) || [];

    // Parse tags
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : Array.isArray(tags) ? tags : [];
      } catch (e) {
        parsedTags = [];
      }
    }

    // Update fields
    if (rating) review.rating = parseInt(rating);
    if (title !== undefined) review.title = title;
    if (comment !== undefined) review.comment = comment;
    if (parsedTags.length > 0) review.tags = parsedTags;
    
    // Append new photos
    if (newPhotos.length > 0) {
      review.photos = [...(review.photos || []), ...newPhotos];
    }

    review.updatedAt = new Date();
    await review.save();
    await review.populate('user', 'name profileImage');

    console.log('✅ Review updated successfully');
    res.json(review);
  } catch (error: any) {
    console.error('❌ Error updating review:', error);
    res.status(500).json({ 
      message: 'Failed to update review', 
      error: error.message 
    });
  }
};

// Toggle helpful vote
export const toggleHelpful = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { reviewId } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ message: 'Invalid review ID' });
    }

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    const hasVoted = review.helpfulBy.includes(userId);

    if (hasVoted) {
      // Remove vote
      review.helpful = Math.max(0, review.helpful - 1);
      review.helpfulBy = review.helpfulBy.filter(id => id.toString() !== userId.toString());
      console.log('👎 Removed helpful vote from review:', reviewId);
    } else {
      // Add vote
      review.helpful += 1;
      review.helpfulBy.push(userId);
      console.log('👍 Added helpful vote to review:', reviewId);
    }

    review.updatedAt = new Date();
    await review.save();

    res.json({
      helpful: review.helpful,
      userHelpful: !hasVoted
    });
  } catch (error: any) {
    console.error('❌ Error toggling helpful:', error);
    res.status(500).json({ 
      message: 'Failed to update helpful status', 
      error: error.message 
    });
  }
};
