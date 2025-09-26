import { Request, Response } from 'express';
import zohoService from '../services/zohoService';
import venueSyncService from '../services/venueSyncService';

// [EXISTING READ METHODS - Keep all your existing methods]

export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🏥 Health check request received');
    const result = await zohoService.healthCheck();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error('❌ Health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Zoho health check failed',
      message: error.message
    });
  }
};

export const getVenues = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = Math.min(parseInt(req.query.per_page as string) || 50, 200);
    
    console.log(`📋 Venues request - Page: ${page}, Per Page: ${perPage}`);
    
    const result = await zohoService.getVenues(page, perPage);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data,
        pagination: result.pagination,
        info: result.info,
        meta: {
          page: page,
          per_page: perPage,
          total_records: result.data.length,
          has_more: result.pagination.hasMore,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: 'Failed to fetch venues from Zoho CRM'
      });
    }
  } catch (error: any) {
    console.error('❌ Get venues error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

export const getCachedVenues = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 200);
    const city = req.query.city as string;
    const industry = req.query.industry as string;
    const search = req.query.search as string;

    console.log(`📋 Cached venues request - Page: ${page}, Limit: ${limit}`);

    const directResult = await zohoService.getVenues(page, Math.min(limit, 200));
    
    if (!directResult.success) {
      res.status(500).json({
        success: false,
        message: directResult.message,
        error: 'Failed to fetch venues'
      });
      return;
    }

    let filteredData = directResult.data;
    
    if (search) {
      filteredData = filteredData.filter(venue => 
        venue.Account_Name?.toLowerCase().includes(search.toLowerCase()) ||
        venue.Billing_City?.toLowerCase().includes(search.toLowerCase()) ||
        venue.Industry?.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    if (city) {
      filteredData = filteredData.filter(venue => 
        venue.Billing_City?.toLowerCase().includes(city.toLowerCase())
      );
    }
    
    if (industry) {
      filteredData = filteredData.filter(venue => 
        venue.Industry?.toLowerCase().includes(industry.toLowerCase())
      );
    }

    res.json({
      success: true,
      message: 'Venues retrieved successfully (via Zoho API)',
      data: filteredData,
      pagination: {
        page: page,
        limit: limit,
        total: filteredData.length,
        hasMore: directResult.pagination.hasMore
      },
      meta: {
        source: 'zoho_api',
        total_records: filteredData.length,
        fetched_from: 'zoho_crm_direct',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching venues:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch venues',
      error: error.message
    });
  }
};

// [NEW WRITE METHODS - The bidirectional functionality]

/**
 * CREATE: Add a new venue
 */
export const createVenue = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('➕ Create venue request received');
    
    const venueData = req.body;
    
    // Validate required fields
    if (!venueData.Account_Name) {
      res.status(400).json({
        success: false,
        message: 'Account_Name is required',
        error: 'Missing required field'
      });
      return;
    }

    console.log(`📝 Creating venue: "${venueData.Account_Name}"`);

    const result = await zohoService.createVenue(venueData);
    
    if (result.success) {
      res.status(201).json({
        success: true,
        message: result.message,
        data: result.data,
        zoho_id: result.zoho_id,
        meta: {
          created_at: new Date().toISOString(),
          operation: 'create'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }

  } catch (error: any) {
    console.error('❌ Create venue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create venue',
      error: error.message
    });
  }
};

/**
 * UPDATE: Modify an existing venue
 */
export const updateVenue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { venueId } = req.params;
    const venueData = req.body;
    
    if (!venueId) {
      res.status(400).json({
        success: false,
        message: 'Venue ID is required',
        error: 'Missing venue ID'
      });
      return;
    }

    console.log(`✏️ Update venue request for ID: ${venueId}`);

    const result = await zohoService.updateVenue(venueId, venueData);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data,
        meta: {
          updated_at: new Date().toISOString(),
          venue_id: venueId,
          operation: 'update'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }

  } catch (error: any) {
    console.error('❌ Update venue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update venue',
      error: error.message
    });
  }
};

/**
 * DELETE: Remove a venue
 */
export const deleteVenue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { venueId } = req.params;
    
    if (!venueId) {
      res.status(400).json({
        success: false,
        message: 'Venue ID is required',
        error: 'Missing venue ID'
      });
      return;
    }

    console.log(`🗑️ Delete venue request for ID: ${venueId}`);

    const result = await zohoService.deleteVenue(venueId);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        meta: {
          deleted_at: new Date().toISOString(),
          venue_id: venueId,
          operation: 'delete'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }

  } catch (error: any) {
    console.error('❌ Delete venue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete venue',
      error: error.message
    });
  }
};

/**
 * BULK CREATE: Add multiple venues
 */
export const createVenuesBulk = async (req: Request, res: Response): Promise<void> => {
  try {
    const venuesData = req.body.venues || req.body;
    
    if (!Array.isArray(venuesData)) {
      res.status(400).json({
        success: false,
        message: 'Venues data must be an array',
        error: 'Invalid data format'
      });
      return;
    }

    console.log(`➕ Bulk create request for ${venuesData.length} venues`);

    const result = await zohoService.createVenuesBulk(venuesData);
    
    res.status(result.created > 0 ? 201 : 400).json({
      success: result.success,
      message: result.message,
      summary: {
        total: venuesData.length,
        created: result.created,
        failed: result.failed
      },
      results: result.results,
      meta: {
        created_at: new Date().toISOString(),
        operation: 'bulk_create'
      }
    });

  } catch (error: any) {
    console.error('❌ Bulk create error:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk create failed',
      error: error.message
    });
  }
};

// [EXISTING METHODS - Keep searchVenues and getVenueById as they are]

export const searchVenues = async (req: Request, res: Response): Promise<void> => {
  try {
    const searchTerm = (req.query.q || req.query.search) as string;
    
    if (!searchTerm) {
      res.status(400).json({
        success: false,
        message: 'Search term is required',
        example: '/api/zoho/venues/search?q=restaurant'
      });
      return;
    }

    console.log(`🔍 Search venues request: "${searchTerm}"`);

    const result = await zohoService.searchVenues(searchTerm);
    
    res.json({
      success: true,
      message: result.message,
      query: searchTerm,
      data: result.data,
      count: result.count,
      meta: {
        search_term: searchTerm,
        results_found: result.count,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Search venues error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message
    });
  }
};

export const getVenueById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { venueId } = req.params;
    
    if (!venueId) {
      res.status(400).json({
        success: false,
        message: 'Venue ID is required'
      });
      return;
    }

    console.log(`📍 Get venue by ID request: ${venueId}`);

    const result = await zohoService.getVenueById(venueId);
    
    if (result.success && result.data) {
      res.json({
        success: true,
        message: result.message,
        data: result.data,
        meta: {
          venue_id: venueId,
          fetched_at: new Date().toISOString()
        }
      });
    } else if (result.success && !result.data) {
      res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: 'Failed to fetch venue details'
      });
    }
  } catch (error: any) {
    console.error('❌ Get venue by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
