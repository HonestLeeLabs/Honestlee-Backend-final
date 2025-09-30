import VenueDubai, { IVenueDubai } from '../models/VenueDubai';

export interface VenueFilters {
  search?: string;
  venue_type?: string;
  venue_category?: string;
  district?: string;
  budget?: string;
  wifi?: boolean;
  alcohol?: boolean;
  rating?: number;
  latitude?: number;
  longitude?: number;
  radius?: number;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: 'name' | 'rating' | 'price' | 'distance';
}

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

export class VenueDubaiService {

  static async findVenues(filters: VenueFilters = {}, pagination: PaginationOptions = {}) {
    const {
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
      radius
    } = filters;

    const {
      page = 1,
      limit = 20,
      sort = 'rating'
    } = pagination;

    // Build query
    const query: any = {};

    // Text search
    if (search) {
      query.$or = [
        { Account_Name: { $regex: search, $options: 'i' } },
        { Billing_District: { $regex: search, $options: 'i' } },
        { venue_type_display: { $regex: search, $options: 'i' } },
        { Cuisine_Tags: { $regex: search, $options: 'i' } }
      ];
    }

    // Filters
    if (venue_type) query.venue_type = venue_type;
    if (venue_category) query.venue_category = venue_category;
    if (district) query.Billing_District = district;
    if (budget) query.Budget_Friendly = budget;
    if (wifi) query.Pub_Wifi = 1;
    if (alcohol) query.Alcohol_served = 1;
    if (rating) query.Rating = { $gte: rating };

    // Geospatial query
    if (latitude && longitude) {
      const maxDistance = radius ? radius * 1000 : 5000;
      query.geometry = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
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
    const skip = (page - 1) * limit;

    // Execute query
    const [venues, totalCount] = await Promise.all([
      VenueDubai.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      VenueDubai.countDocuments(query)
    ]);

    return {
      venues,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    };
  }

  static async findNearbyVenues(latitude: number, longitude: number, radius: number = 5, limit: number = 10) {
    const maxDistance = radius * 1000; // Convert to meters

    const venues = await VenueDubai.find({
      geometry: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: maxDistance
        }
      }
    }).limit(limit);

    // Use the instance method for distance calculation
    return venues.map(venue => {
      const distance = venue.getDistance(longitude, latitude);
      return {
        ...venue.toObject(),
        distance: distance ? Math.round(distance * 100) / 100 : null
      };
    });
  }

  static async getFilterOptions() {
    const [venueTypes, venueCategories, districts, budgetLevels] = await Promise.all([
      VenueDubai.distinct('venue_type').then(types => types.filter(Boolean)),
      VenueDubai.distinct('venue_category').then(cats => cats.filter(Boolean)),
      VenueDubai.distinct('Billing_District').then(dists => dists.filter(Boolean)),
      VenueDubai.distinct('Budget_Friendly').then(budgets => budgets.filter(Boolean))
    ]);

    return {
      venueTypes: venueTypes.sort(),
      venueCategories: venueCategories.sort(),
      districts: districts.sort(),
      budgetLevels: budgetLevels.sort()
    };
  }

  static async createVenue(venueData: Partial<IVenueDubai>) {
    const venue = new VenueDubai(venueData);
    return await venue.save();
  }

  static async updateVenue(id: string, updateData: Partial<IVenueDubai>) {
    // Try to find by MongoDB ObjectId first, then by Dubai_id
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      return await VenueDubai.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    } else {
      return await VenueDubai.findOneAndUpdate({ Dubai_id: id }, updateData, { new: true, runValidators: true });
    }
  }

  static async deleteVenue(id: string) {
    // Try to find by MongoDB ObjectId first, then by Dubai_id
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      return await VenueDubai.findByIdAndDelete(id);
    } else {
      return await VenueDubai.findOneAndDelete({ Dubai_id: id });
    }
  }

  static async findVenueById(id: string) {
    // Try to find by MongoDB ObjectId first, then by Dubai_id
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      return await VenueDubai.findById(id);
    } else {
      return await VenueDubai.findOne({ Dubai_id: id });
    }
  }
}
