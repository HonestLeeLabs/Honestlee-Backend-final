import { Request, Response } from 'express';
import Review from '../models/Review';
import { getVenueModel } from '../models/Venue';
import { dbManager } from '../config/database';
import { Region } from '../config/database';

export const createReview = async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const region = ((req as any).region || 'th') as Region;
  const { venueId, rating, comment, tags } = req.body;

  if (!venueId || !rating) {
    return res.status(400).json({ message: 'Venue ID and rating are required' });
  }

  try {
    // ✅ Connect to regional database to verify venue exists
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);
    
    // ✅ Find venue using multiple ID formats
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

    // ✅ Store the venue's actual ID (prefer globalId, then id, then _id)
    const venueIdentifier = venue.globalId || venue.id || venue._id.toString();

    // ✅ Create review in SHARED database
    const newReview = new Review({
      user: userId,
      venue: venueIdentifier,
      venueRegion: region,
      rating,
      comment,
      tags,
      createdAt: new Date(),
    });

    await newReview.save();

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

  try {
    // ✅ Connect to regional database to verify venue
    await dbManager.connectRegion(region);
    const Venue = getVenueModel(region);
    
    // ✅ Find venue using multiple ID formats
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

    // ✅ Get the venue identifier
    const venueIdentifier = venue.globalId || venue.id || venue._id.toString();

    // ✅ Find reviews from SHARED database
    const reviews = await Review.find({ 
      venue: venueIdentifier,
      venueRegion: region 
    }) 
      .populate('user', 'name')
      .sort({ createdAt: -1 });
    
    res.json(reviews);
  } catch (error: any) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ 
      message: 'Failed to fetch reviews', 
      error: error.message 
    });
  }
};
