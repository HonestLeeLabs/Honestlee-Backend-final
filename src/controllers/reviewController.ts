import { Request, Response } from 'express';
import Review from '../models/Review';
import { getVenueModel } from '../models/Venue';

export const createReview = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const region = (req as any).region || 'th';
  const { venueId, rating, comment, tags } = req.body;

  if (!venueId || !rating) {
    return res.status(400).json({ message: 'Venue ID and rating are required' });
  }

  try {
    // Get the correct venue model for the region
    const Venue = getVenueModel(region);
    
    // ✅ FIXED: Support multiple venue ID formats
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

    // ✅ Use the MongoDB _id for the review
    const newReview = new Review({
      user: userId,
      venue: venue._id,  // Use the actual MongoDB _id
      rating,
      comment,
      tags,
      createdAt: new Date(),
    });

    await newReview.save();

    res.status(201).json(newReview);
  } catch (error: any) {
    console.error('Error creating review:', error);
    res.status(500).json({ message: 'Failed to create review', error: error.message });
  }
};

export const getReviewsByVenue = async (req: Request, res: Response) => {
  const { venueId } = req.params;
  const region = (req as any).region || 'th';

  try {
    // Get the correct venue model for the region
    const Venue = getVenueModel(region);
    
    // ✅ FIXED: Support multiple venue ID formats
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

    // ✅ Use the MongoDB _id to find reviews
    const reviews = await Review.find({ venue: venue._id })
      .populate('user', 'name')
      .sort({ createdAt: -1 });
    
    res.json(reviews);
  } catch (error: any) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ message: 'Failed to fetch reviews', error: error.message });
  }
};
