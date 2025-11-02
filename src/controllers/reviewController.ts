import { Request, Response } from 'express';
import Review from '../models/Review';
import { getVenueModel } from '../models/Venue';
import { dbManager } from '../config/database';
import { Region } from '../config/database';

export const createReview = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const region = ((req as any).region || 'th') as Region;
  const { venueId, rating, title, comment, tags, photos } = req.body;

  if (!venueId || !rating) {
    return res.status(400).json({ message: 'Venue ID and rating are required' });
  }

  try {
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);
    
    const venue = await Venue.findOne({
      $or: [
        { _id: venueId },
        { id: venueId },
        { globalId: venueId }
      ]
    });

    if (!venue) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    const venueIdentifier = venue.globalId || venue.id || venue._id.toString();

    const newReview = new Review({
      user: userId,
      venue: venueIdentifier,
      venueRegion: region,
      rating,
      title,
      comment,
      tags,
      photos: photos || [],
      helpful: 0,
      helpfulBy: [],
      verified: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newReview.save();
    await newReview.populate('user', 'name profileImage');

    res.status(201).json(newReview);
  } catch (error: any) {
    console.error('Error creating review:', error);
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

  try {
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);
    
    const venue = await Venue.findOne({
      $or: [
        { _id: venueId },
        { id: venueId },
        { globalId: venueId }
      ]
    });

    if (!venue) {
      return res.status(404).json({ message: 'Venue not found' });
    }

    const venueIdentifier = venue.globalId || venue.id || venue._id.toString();

    // Get total count
    const totalReviews = await Review.countDocuments({ 
      venue: venueIdentifier,
      venueRegion: region 
    });

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
    console.error('Error fetching reviews:', error);
    res.status(500).json({ 
      message: 'Failed to fetch reviews', 
      error: error.message 
    });
  }
};

// ✅ Toggle helpful vote
export const toggleHelpful = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { reviewId } = req.params;

  try {
    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    const hasVoted = review.helpfulBy.includes(userId);

    if (hasVoted) {
      // Remove vote
      review.helpful = Math.max(0, review.helpful - 1);
      review.helpfulBy = review.helpfulBy.filter(id => id.toString() !== userId.toString());
    } else {
      // Add vote
      review.helpful += 1;
      review.helpfulBy.push(userId);
    }

    review.updatedAt = new Date();
    await review.save();

    res.json({
      helpful: review.helpful,
      userHelpful: !hasVoted
    });
  } catch (error: any) {
    console.error('Error toggling helpful:', error);
    res.status(500).json({ 
      message: 'Failed to update helpful status', 
      error: error.message 
    });
  }
};
