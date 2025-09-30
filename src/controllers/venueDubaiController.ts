import { Request, Response } from 'express';
import VenueDubai, { IVenueDubai } from '../models/VenueDubai';
import { AuthRequest } from '../middlewares/authMiddleware';

// GET /api/venues-dubai - Get all venues with filtering, pagination, and search
export const getAllVenues = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      venue_type,
      venue_category,
      district,
      budget,
      wifi,
      alcohol,
      rating,
      latitude,
      longitude,
      radius,
      sort = 'Rating'
    } = req.query;

    // Build query object
    const query: any = {};

    // Text search across multiple fields
    if (search) {
      query.$or = [
        { Account_Name: { $regex: search, $options: 'i' } },
        { Billing_District: { $regex: search, $options: 'i' } },
        { venue_type_display: { $regex: search, $options: 'i' } },
        { Cuisine_Tags: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by venue type
    if (venue_type) query.venue_type = venue_type;
    if (venue_category) query.venue_category = venue_category;
    if (district) query.Billing_District = district;
    if (budget) query.Budget_Friendly = budget;
    if (wifi === 'true') query.Pub_Wifi = 1;
    if (alcohol === 'true') query.Alcohol_served = 1;
    if (rating) query.Rating = { $gte: parseFloat(rating as string) };

    // Geospatial query for nearby venues
    if (latitude && longitude) {
      const lat = parseFloat(latitude as string);
      const lng = parseFloat(longitude as string);
      const maxDistance = radius ? parseInt(radius as string) * 1000 : 5000; // Default 5km

      query.geometry = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: maxDistance
        }
      };
    }

    // Sort options
    const sortOptions: any = {};
    switch (sort) {
      case 'name':
        sortOptions.Account_Name = 1;
        break;
      case 'rating':
        sortOptions.Rating = -1;
        break;
      case 'price':
        sortOptions.HL_Price_Level = 1;
        break;
      default:
        sortOptions.Rating = -1;
    }

    // Pagination
    const pageNumber = parseInt(page as string);
    const pageSize = parseInt(limit as string);
    const skip = (pageNumber - 1) * pageSize;

    // Execute query
    const [venues, totalCount] = await Promise.all([
      VenueDubai.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      VenueDubai.countDocuments(query)
    ]);

    // Calculate distance if coordinates provided
    const venuesWithDistance = latitude && longitude ? venues.map(venue => {
      const lat = parseFloat(latitude as string);
      const lng = parseFloat(longitude as string);

      if (venue.geometry?.coordinates) {
        const [venueLng, venueLat] = venue.geometry.coordinates;
        const distance = calculateDistance(lat, lng, venueLat, venueLng);
        return { ...venue, distance: Math.round(distance * 100) / 100 };
      }
      return venue;
    }) : venues;

    res.json({
      success: true,
      data: venuesWithDistance,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / pageSize),
        totalCount,
        hasNextPage: pageNumber < Math.ceil(totalCount / pageSize),
        hasPrevPage: pageNumber > 1
      },
      filters: {
        search,
        venue_type,
        venue_category,
        district,
        budget,
        wifi: wifi === 'true',
        alcohol: alcohol === 'true',
        rating: rating ? parseFloat(rating as string) : undefined
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching venues',
      error: error.message
    });
  }
};

// GET /api/venues-dubai/:id - Get single venue by ID
export const getVenueById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    let venue;

    // Try to find by MongoDB ObjectId first, then by Dubai_id
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      venue = await VenueDubai.findById(id);
    } else {
      venue = await VenueDubai.findOne({ Dubai_id: id });
    }

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    res.json({
      success: true,
      data: venue
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching venue',
      error: error.message
    });
  }
};

// POST /api/venues-dubai - Create new venue (Admin/Staff only)
export const createVenue = async (req: AuthRequest, res: Response) => {
  try {
    // Check permissions
    if (!req.user || !['ADMIN', 'STAFF'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Admin or Staff role required.'
      });
    }

    const venueData = req.body;

    // Validate required fields
    if (!venueData.Dubai_id || !venueData.Account_Name) {
      return res.status(400).json({
        success: false,
        message: 'Dubai_id and Account_Name are required'
      });
    }

    // Check if venue with same Dubai_id already exists
    const existingVenue = await VenueDubai.findOne({ Dubai_id: venueData.Dubai_id });
    if (existingVenue) {
      return res.status(400).json({
        success: false,
        message: 'Venue with this Dubai_id already exists'
      });
    }

    // Create new venue
    const venue = new VenueDubai(venueData);
    await venue.save();

    res.status(201).json({
      success: true,
      message: 'Venue created successfully',
      data: venue
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate venue ID',
        error: 'A venue with this Dubai_id already exists'
      });
    }

    res.status(400).json({
      success: false,
      message: 'Error creating venue',
      error: error.message
    });
  }
};

// PUT /api/venues-dubai/:id - Update venue (Admin/Staff only)
export const updateVenue = async (req: AuthRequest, res: Response) => {
  try {
    // Check permissions
    if (!req.user || !['ADMIN', 'STAFF'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Admin or Staff role required.'
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Remove sensitive fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    let venue;

    // Try to find by MongoDB ObjectId first, then by Dubai_id
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      venue = await VenueDubai.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );
    } else {
      venue = await VenueDubai.findOneAndUpdate(
        { Dubai_id: id },
        updateData,
        { new: true, runValidators: true }
      );
    }

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    res.json({
      success: true,
      message: 'Venue updated successfully',
      data: venue
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: 'Error updating venue',
      error: error.message
    });
  }
};

// DELETE /api/venues-dubai/:id - Delete venue (Admin only)
export const deleteVenue = async (req: AuthRequest, res: Response) => {
  try {
    // Check permissions - Only Admin can delete
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Admin role required.'
      });
    }

    const { id } = req.params;

    let venue;

    // Try to find by MongoDB ObjectId first, then by Dubai_id
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      venue = await VenueDubai.findByIdAndDelete(id);
    } else {
      venue = await VenueDubai.findOneAndDelete({ Dubai_id: id });
    }

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    res.json({
      success: true,
      message: 'Venue deleted successfully',
      data: venue
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting venue',
      error: error.message
    });
  }
};

// GET /api/venues-dubai/nearby - Find nearby venues
export const getNearbyVenues = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, radius = 5, limit = 10 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const maxDistance = parseInt(radius as string) * 1000; // Convert to meters
    const maxResults = parseInt(limit as string);

    const venues = await VenueDubai.find({
      geometry: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: maxDistance
        }
      }
    }).limit(maxResults);

    // Calculate distances
    const venuesWithDistance = venues.map(venue => {
      const distance = venue.getDistance(lng, lat);
      return {
        ...venue.toObject(),
        distance: distance ? Math.round(distance * 100) / 100 : null
      };
    });

    res.json({
      success: true,
      data: venuesWithDistance,
      search: {
        center: { latitude: lat, longitude: lng },
        radius: parseInt(radius as string),
        found: venues.length
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error finding nearby venues',
      error: error.message
    });
  }
};

// GET /api/venues-dubai/filters - Get available filter options
export const getFilterOptions = async (req: Request, res: Response) => {
  try {
    const [
      venueTypes,
      venueCategories,
      districts,
      budgetLevels
    ] = await Promise.all([
      VenueDubai.distinct('venue_type').then(types => types.filter(Boolean)),
      VenueDubai.distinct('venue_category').then(cats => cats.filter(Boolean)),
      VenueDubai.distinct('Billing_District').then(dists => dists.filter(Boolean)),
      VenueDubai.distinct('Budget_Friendly').then(budgets => budgets.filter(Boolean))
    ]);

    res.json({
      success: true,
      filters: {
        venueTypes: venueTypes.sort(),
        venueCategories: venueCategories.sort(),
        districts: districts.sort(),
        budgetLevels: budgetLevels.sort()
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching filter options',
      error: error.message
    });
  }
};

// POST /api/venues-dubai/bulk-import - Import multiple venues from JSON (Admin only)
export const bulkImportVenues = async (req: AuthRequest, res: Response) => {
  try {
    // Check permissions
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Admin role required.'
      });
    }

    const { venues, overwrite = false } = req.body;

    if (!Array.isArray(venues) || venues.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid venues array provided'
      });
    }

    const results = {
      created: 0,
      updated: 0,
      errors: 0,
      details: [] as any[]
    };

    for (const venueData of venues) {
      try {
        if (!venueData.Dubai_id) {
          results.errors++;
          results.details.push({
            Dubai_id: venueData.Dubai_id || 'unknown',
            error: 'Missing Dubai_id'
          });
          continue;
        }

        const existingVenue = await VenueDubai.findOne({ Dubai_id: venueData.Dubai_id });

        if (existingVenue && overwrite) {
          await VenueDubai.findOneAndUpdate(
            { Dubai_id: venueData.Dubai_id },
            venueData,
            { runValidators: true }
          );
          results.updated++;
          results.details.push({
            Dubai_id: venueData.Dubai_id,
            action: 'updated'
          });
        } else if (!existingVenue) {
          const venue = new VenueDubai(venueData);
          await venue.save();
          results.created++;
          results.details.push({
            Dubai_id: venueData.Dubai_id,
            action: 'created'
          });
        } else {
          results.errors++;
          results.details.push({
            Dubai_id: venueData.Dubai_id,
            error: 'Already exists (use overwrite=true to update)'
          });
        }
      } catch (error: any) {
        results.errors++;
        results.details.push({
          Dubai_id: venueData.Dubai_id || 'unknown',
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: 'Bulk import completed',
      results
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error during bulk import',
      error: error.message
    });
  }
};

// Utility function to calculate distance between two points
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
