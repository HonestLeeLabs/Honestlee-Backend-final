import { Request, Response } from 'express';
import Review from '../models/Review';
import Venue from '../models/Venue';

export const createReview = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { venueId, rating, comment, tags } = req.body;

  if (!venueId || !rating) {
    return res.status(400).json({ message: 'Venue ID and rating are required' });
  }

  // Check if venue exists
  const venue = await Venue.findById(venueId);
  if (!venue) return res.status(404).json({ message: 'Venue not found' });

  const newReview = new Review({
    user: userId,
    venue: venueId,
    rating,
    comment,
    tags,
    createdAt: new Date(),
  });

  await newReview.save();

  // Optionally update venue rating stats here (not implemented)

  res.status(201).json(newReview);
};

export const getReviewsByVenue = async (req: Request, res: Response) => {
  const { venueId } = req.params;
  const reviews = await Review.find({ venue: venueId }).populate('user', 'name');
  res.json(reviews);
};
