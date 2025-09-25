import { Request, Response } from 'express';
import zohoService from '../services/zohoService';

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
