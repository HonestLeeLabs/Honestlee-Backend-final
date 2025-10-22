import { Request, Response } from 'express';
import VenueDubai, { IVenueDubai } from '../models/VenueDubai';
import EventDubai, { IEventDubai } from '../models/EventDubai';
import { AuthRequest } from '../middlewares/authMiddleware';

// GET /api/venues-dubai - Get all venues with filtering, pagination, and search
export const getAllVenues = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      venuetype,
      venuecategory,
      groupid,
      district,
      budget,
      wifi,
      alcohol,
      rating,
      latitude,
      longitude,
      radius,
      sort = 'Rating',
    } = req.query;

    // Build query object
    const query: any = {};

    // Text search across multiple fields
    if (search) {
      query.$or = [
        { AccountName: { $regex: search, $options: 'i' } },
        { Account_Name: { $regex: search, $options: 'i' } },
        { BillingDistrict: { $regex: search, $options: 'i' } },
        { Billing_District: { $regex: search, $options: 'i' } },
        { venuetypedisplay: { $regex: search, $options: 'i' } },
        { venue_type_display: { $regex: search, $options: 'i' } },
        { CuisineTags: { $regex: search, $options: 'i' } },
        { Cuisine_Tags: { $regex: search, $options: 'i' } },
        { groupiddisplayname: { $regex: search, $options: 'i' } },
      ];
    }

    // Filter by top-level group
    if (groupid) {
      query.groupid = groupid;
    }

    // Filter by venue type (support both formats)
    if (venuetype) {
      query.$or = [
        { venuetype: venuetype },
        { venue_type: venuetype }
      ];
    }

    // Filter by venue category (support both formats)
    if (venuecategory) {
      query.$or = [
        { venuecategory: venuecategory },
        { venue_category: venuecategory }
      ];
    }

    if (district) {
      query.$or = [
        { BillingDistrict: district },
        { Billing_District: district }
      ];
    }

    if (budget) {
      query.$or = [
        { BudgetFriendly: budget },
        { Budget_Friendly: budget }
      ];
    }

    if (wifi === 'true') {
      query.$or = [
        { PubWifi: 1 },
        { Pub_Wifi: 1 }
      ];
    }

    if (alcohol === 'true') {
      query.$or = [
        { Alcoholserved: 1 },
        { Alcohol_served: 1 }
      ];
    }

    if (rating) {
      query.Rating = { $gte: parseFloat(rating as string) };
    }

    // Geospatial query for nearby venues
    if (latitude && longitude) {
      const lat = parseFloat(latitude as string);
      const lng = parseFloat(longitude as string);
      const maxDistance = radius ? parseInt(radius as string) * 1000 : 5000;

      query.geometry = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          $maxDistance: maxDistance,
        },
      };
    }

    // Sort options
    const sortOptions: any = {};
    switch (sort) {
      case 'name':
        sortOptions.AccountName = 1;
        break;
      case 'rating':
        sortOptions.Rating = -1;
        break;
      case 'price':
        sortOptions.HLPriceLevel = 1;
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
      VenueDubai.find(query).sort(sortOptions).skip(skip).limit(pageSize).lean(),
      VenueDubai.countDocuments(query),
    ]);

    // Calculate distance if coordinates provided
    const venuesWithDistance =
      latitude && longitude
        ? venues.map((venue: any) => {
            const lat = parseFloat(latitude as string);
            const lng = parseFloat(longitude as string);

            if (venue.geometry?.coordinates) {
              const [venueLng, venueLat] = venue.geometry.coordinates;
              const distance = calculateDistance(lat, lng, venueLat, venueLng);
              return { ...venue, distance: Math.round(distance * 100) / 100 };
            }

            return venue;
          })
        : venues;

    res.json({
      success: true,
      data: venuesWithDistance,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / pageSize),
        totalCount,
        hasNextPage: pageNumber < Math.ceil(totalCount / pageSize),
        hasPrevPage: pageNumber > 1,
      },
      filters: {
        search,
        venuetype,
        venuecategory,
        groupid,
        district,
        budget,
        wifi: wifi === 'true',
        alcohol: alcohol === 'true',
        rating: rating ? parseFloat(rating as string) : undefined,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching venues', error: error.message });
  }
};

// GET /api/venues-dubai/groups - Get all top-level groups with counts
export const getGroups = async (req: Request, res: Response) => {
  try {
    const groups = await VenueDubai.aggregate([
      {
        $group: {
          _id: '$groupid',
          displayName: { $first: '$groupiddisplayname' },
          count: { $sum: 1 },
          avgRating: { $avg: '$Rating' },
          categories: { 
            $addToSet: { 
              id: { $ifNull: ['$venuecategory', '$venue_category'] },
              name: { $ifNull: ['$venuecategorydisplayname', '$venue_category_display'] }
            } 
          },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({
      success: true,
      data: groups,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching groups', error: error.message });
  }
};

// GET /api/venues-dubai/groups/:groupId - Get venues by top-level group
export const getVenuesByGroup = async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 20, sort = 'Rating' } = req.query;

    const pageNumber = parseInt(page as string);
    const pageSize = parseInt(limit as string);
    const skip = (pageNumber - 1) * pageSize;

    const sortOptions: any = {};
    switch (sort) {
      case 'name':
        sortOptions.AccountName = 1;
        break;
      case 'rating':
        sortOptions.Rating = -1;
        break;
      default:
        sortOptions.Rating = -1;
    }

    const [venues, totalCount, groupInfo] = await Promise.all([
      VenueDubai.find({ groupid: groupId }).sort(sortOptions).skip(skip).limit(pageSize).lean(),
      VenueDubai.countDocuments({ groupid: groupId }),
      VenueDubai.findOne({ groupid: groupId }).select('groupid groupiddisplayname'),
    ]);

    if (!groupInfo) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    res.json({
      success: true,
      group: {
        id: groupInfo.groupid,
        displayName: groupInfo.groupiddisplayname,
      },
      data: venues,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / pageSize),
        totalCount,
        hasNextPage: pageNumber < Math.ceil(totalCount / pageSize),
        hasPrevPage: pageNumber > 1,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching venues by group', error: error.message });
  }
};

// GET /api/venues-dubai/categories/:categoryId - Get venues by category
export const getVenuesByCategory = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const { page = 1, limit = 20, sort = 'Rating' } = req.query;

    const pageNumber = parseInt(page as string);
    const pageSize = parseInt(limit as string);
    const skip = (pageNumber - 1) * pageSize;

    const sortOptions: any = {};
    switch (sort) {
      case 'name':
        sortOptions.AccountName = 1;
        break;
      case 'rating':
        sortOptions.Rating = -1;
        break;
      default:
        sortOptions.Rating = -1;
    }

    // FIXED: Support both field name formats
    const query = {
      $or: [
        { venuecategory: categoryId },
        { venue_category: categoryId }
      ]
    };

    const [venues, totalCount, categoryInfo] = await Promise.all([
      VenueDubai.find(query).sort(sortOptions).skip(skip).limit(pageSize).lean(),
      VenueDubai.countDocuments(query),
      VenueDubai.findOne(query).select('venuecategory venue_category venuecategorydisplayname venue_category_display groupid groupiddisplayname').lean(),
    ]);

    if (!categoryInfo) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // Get category display name from either field format
    const categoryDisplayName = (categoryInfo as any).venuecategorydisplayname || 
                                 (categoryInfo as any).venue_category_display || 
                                 categoryId;

    res.json({
      success: true,
      category: {
        id: categoryId,
        displayName: categoryDisplayName,
      },
      group: {
        id: (categoryInfo as any).groupid,
        displayName: (categoryInfo as any).groupiddisplayname,
      },
      data: venues,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / pageSize),
        totalCount,
        hasNextPage: pageNumber < Math.ceil(totalCount / pageSize),
        hasPrevPage: pageNumber > 1,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching venues by category', error: error.message });
  }
};

// GET /api/venues-dubai/:id - Get single venue by ID
export const getVenueById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { includeevents = false } = req.query;

    let venue;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      venue = await VenueDubai.findById(id);
    } else {
      venue = await VenueDubai.findOne({ 
        $or: [
          { Dubaiid: id },
          { Dubai_id: id }
        ]
      });
    }

    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    // Optionally include events
    let events: IEventDubai[] = [];
    if (includeevents === 'true') {
      const accountName = (venue as any).AccountName || (venue as any).Account_Name;
      events = await EventDubai.find({
        Account_Name: accountName,
        EventStarts_At: { $gte: new Date() },
      }).sort({ EventStarts_At: 1 });
    }

    res.json({
      success: true,
      data: {
        ...venue.toObject(),
        events: includeevents === 'true' ? events : undefined,
        eventCount: includeevents === 'true' ? events.length : undefined,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching venue', error: error.message });
  }
};

// POST /api/venues-dubai - Create new venue (Admin/Staff only)
export const createVenue = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['ADMIN', 'STAFF'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions. Admin or Staff role required.' });
    }

    const venueData = req.body;

    if (!venueData.Dubaiid || !venueData.AccountName) {
      return res.status(400).json({ success: false, message: 'Dubaiid and AccountName are required' });
    }

    const existingVenue = await VenueDubai.findOne({ Dubaiid: venueData.Dubaiid });
    if (existingVenue) {
      return res.status(400).json({ success: false, message: 'Venue with this Dubaiid already exists' });
    }

    const venue = new VenueDubai(venueData);
    await venue.save();

    res.status(201).json({ success: true, message: 'Venue created successfully', data: venue });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate venue ID error',
        error: 'A venue with this Dubaiid already exists',
      });
    }
    res.status(400).json({ success: false, message: 'Error creating venue', error: error.message });
  }
};

// PUT /api/venues-dubai/:id - Update venue (Admin/Staff only)
export const updateVenue = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['ADMIN', 'STAFF'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions. Admin or Staff role required.' });
    }

    const { id } = req.params;
    const updateData = req.body;

    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    let venue;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      venue = await VenueDubai.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    } else {
      venue = await VenueDubai.findOneAndUpdate({ Dubaiid: id }, updateData, { new: true, runValidators: true });
    }

    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    res.json({ success: true, message: 'Venue updated successfully', data: venue });
  } catch (error: any) {
    res.status(400).json({ success: false, message: 'Error updating venue', error: error.message });
  }
};

// DELETE /api/venues-dubai/:id - Delete venue (Admin only)
export const deleteVenue = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Insufficient permissions. Admin role required.' });
    }

    const { id } = req.params;

    let venue;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      venue = await VenueDubai.findByIdAndDelete(id);
    } else {
      venue = await VenueDubai.findOneAndDelete({ Dubaiid: id });
    }

    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    res.json({ success: true, message: 'Venue deleted successfully', data: venue });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error deleting venue', error: error.message });
  }
};

// GET /api/venues-dubai/nearby - Find nearby venues
export const getNearbyVenues = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, radius = 5, limit = 10 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const maxDistance = parseInt(radius as string) * 1000;
    const maxResults = parseInt(limit as string);

    const venues = await VenueDubai.find({
      geometry: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          $maxDistance: maxDistance,
        },
      },
    }).limit(maxResults);

    const venuesWithDistance = venues.map((venue: any) => {
      const distance = venue.getDistance(lng, lat);
      return {
        ...venue.toObject(),
        distance: distance ? Math.round(distance * 100) / 100 : null,
      };
    });

    res.json({
      success: true,
      data: venuesWithDistance,
      search: {
        center: { latitude: lat, longitude: lng },
        radius: parseInt(radius as string),
        found: venues.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error finding nearby venues', error: error.message });
  }
};

// GET /api/venues-dubai/filters - Get available filter options
export const getFilterOptions = async (req: Request, res: Response) => {
  try {
    // Support both field name formats
    const [venueTypes, venueCategories, districts, budgetLevels, groups] = await Promise.all([
      Promise.all([
        VenueDubai.distinct('venuetype'),
        VenueDubai.distinct('venue_type')
      ]).then(([types1, types2]) => [...types1, ...types2].filter(Boolean)),
      
      Promise.all([
        VenueDubai.distinct('venuecategory'),
        VenueDubai.distinct('venue_category')
      ]).then(([cats1, cats2]) => [...cats1, ...cats2].filter(Boolean)),
      
      Promise.all([
        VenueDubai.distinct('BillingDistrict'),
        VenueDubai.distinct('Billing_District')
      ]).then(([dists1, dists2]) => [...dists1, ...dists2].filter(Boolean)),
      
      Promise.all([
        VenueDubai.distinct('BudgetFriendly'),
        VenueDubai.distinct('Budget_Friendly')
      ]).then(([budgets1, budgets2]) => [...budgets1, ...budgets2].filter(Boolean)),
      
      VenueDubai.distinct('groupid').then((groups) => groups.filter(Boolean)),
    ]);

    const groupsWithNames = await Promise.all(
      groups.map(async (groupId) => {
        const venue = await VenueDubai.findOne({ groupid: groupId }).select('groupid groupiddisplayname');
        return { id: groupId, name: venue?.groupiddisplayname || groupId };
      })
    );

    res.json({
      success: true,
      filters: {
        venueTypes: [...new Set(venueTypes)].sort(),
        venueCategories: [...new Set(venueCategories)].sort(),
        districts: [...new Set(districts)].sort(),
        budgetLevels: [...new Set(budgetLevels)].sort(),
        groups: groupsWithNames.sort((a, b) => a.name.localeCompare(b.name)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching filter options', error: error.message });
  }
};

// POST /api/venues-dubai/bulk-import - Import multiple venues from JSON (Admin only)
export const bulkImportVenues = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Insufficient permissions. Admin role required.' });
    }

    const { venues, overwrite = false } = req.body;

    if (!Array.isArray(venues) || venues.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid venues array provided' });
    }

    const results = {
      created: 0,
      updated: 0,
      errors: 0,
      details: [] as any[],
    };

    for (const venueData of venues) {
      try {
        const venueId = venueData.Dubaiid || venueData.Dubai_id;
        
        if (!venueId) {
          results.errors++;
          results.details.push({ error: 'Missing Dubaiid or Dubai_id' });
          continue;
        }

        const normalizedVenue = { ...venueData };
        if (venueData.Dubai_id && !venueData.Dubaiid) {
          normalizedVenue.Dubaiid = venueData.Dubai_id;
        }
        if (venueData.Account_Name && !venueData.AccountName) {
          normalizedVenue.AccountName = venueData.Account_Name;
        }

        const existingVenue = await VenueDubai.findOne({ Dubaiid: normalizedVenue.Dubaiid });

        if (existingVenue && overwrite) {
          await VenueDubai.findOneAndUpdate({ Dubaiid: normalizedVenue.Dubaiid }, normalizedVenue, { runValidators: true });
          results.updated++;
          results.details.push({ Dubaiid: normalizedVenue.Dubaiid, action: 'updated' });
        } else if (!existingVenue) {
          const venue = new VenueDubai(normalizedVenue);
          await venue.save();
          results.created++;
          results.details.push({ Dubaiid: normalizedVenue.Dubaiid, action: 'created' });
        } else {
          results.errors++;
          results.details.push({ Dubaiid: normalizedVenue.Dubaiid, error: 'Already exists (use overwrite:true to update)' });
        }
      } catch (error: any) {
        results.errors++;
        results.details.push({ Dubaiid: venueData.Dubaiid || venueData.Dubai_id || 'unknown', error: error.message });
      }
    }

    res.json({ success: true, message: 'Bulk import completed', results });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error during bulk import', error: error.message });
  }
};

// Utility function to calculate distance between two points
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
