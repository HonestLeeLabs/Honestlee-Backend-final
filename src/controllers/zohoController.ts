import { Request, Response } from 'express';
import zohoService from '../services/zohoService';
import venueSyncService from '../services/venueSyncService';

// Type definitions for better TypeScript support
interface FieldUsageStats {
  field_name: string;
  usage_count: number;
  usage_percentage: number;
  is_custom_field: boolean;
  sample_values: any[];
}

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

/**
 * 🆕 ENHANCED: Get venues with dynamic field discovery
 */
export const getVenues = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = Math.min(parseInt(req.query.per_page as string) || 50, 200);
    const refreshFields = req.query.refresh_fields === 'true';
    
    console.log(`📋 Venues request - Page: ${page}, Per Page: ${perPage}, Refresh Fields: ${refreshFields}`);
    
    // 🆕 Get available fields dynamically (will cache for 24 hours unless forced)
    const availableFields = await zohoService.getAvailableFields(refreshFields);
    console.log(`🔍 Dynamic fields available: ${availableFields.length} total fields`);
    
    const result = await zohoService.getVenues(page, perPage);
    
    if (result.success) {
      // 🆕 Enhanced response with field information
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
          timestamp: new Date().toISOString(),
          // 🆕 Dynamic field metadata
          field_discovery: {
            total_available_fields: availableFields.length,
            fields_in_response: result.data.length > 0 ? Object.keys(result.data[0]).length : 0,
            custom_fields_detected: availableFields.filter((f: string) => 
              f.includes('HL_') || f.includes('Wifi') || f.includes('Payment')
            ).length,
            field_cache_fresh: !refreshFields
          }
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

/**
 * 🆕 ENHANCED: Get cached venues with dynamic field discovery
 */
export const getCachedVenues = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 200);
    const city = req.query.city as string;
    const industry = req.query.industry as string;
    const search = req.query.search as string;
    const refreshFields = req.query.refresh_fields === 'true';

    console.log(`📋 Cached venues request - Page: ${page}, Limit: ${limit}`);

    // 🆕 Auto-refresh fields if requested
    if (refreshFields) {
      console.log('🔄 Refreshing field cache for cached venues...');
      await zohoService.refreshFieldCache();
    }

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
    
    // 🆕 Enhanced filtering with dynamic field support
    if (search) {
      filteredData = filteredData.filter(venue => {
        // Search in standard fields
        const standardMatch = 
          venue.Account_Name?.toLowerCase().includes(search.toLowerCase()) ||
          venue.Billing_City?.toLowerCase().includes(search.toLowerCase()) ||
          venue.Industry?.toLowerCase().includes(search.toLowerCase());
        
        // 🆕 Search in custom fields dynamically
        const customFieldMatch = Object.keys(venue).some(key => {
          const value = venue[key as keyof typeof venue];
          return typeof value === 'string' && 
                 value.toLowerCase().includes(search.toLowerCase()) &&
                 (key.includes('HL_') || key.includes('Wifi') || key.includes('Payment'));
        });
        
        return standardMatch || customFieldMatch;
      });
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

    // 🆕 Analyze field usage in response
    const fieldAnalysis = filteredData.length > 0 ? {
      total_fields_per_venue: Object.keys(filteredData[0]).length,
      custom_venue_fields: Object.keys(filteredData[0]).filter(key => 
        key.includes('HL_') || key.includes('Wifi') || key.includes('Payment') || 
        key.includes('Speed_MBPS') || key.includes('AC_') || key.includes('Charging')
      ),
      has_location_data: filteredData.some(v => v.Latitude && v.Longitude),
      has_wifi_data: filteredData.some(v => (v as any).Wifi_SSID),
      has_payment_data: filteredData.some(v => (v as any).Payment_options)
    } : null;

    res.json({
      success: true,
      message: 'Venues retrieved successfully (via Zoho API with dynamic fields)',
      data: filteredData,
      pagination: {
        page: page,
        limit: limit,
        total: filteredData.length,
        hasMore: directResult.pagination.hasMore
      },
      meta: {
        source: 'zoho_api_dynamic',
        total_records: filteredData.length,
        fetched_from: 'zoho_crm_direct',
        timestamp: new Date().toISOString(),
        // 🆕 Dynamic field analysis
        field_analysis: fieldAnalysis
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

// WRITE METHODS

export const createVenue = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('➕ Create venue request received');
    
    const venueData = req.body;
    
    if (!venueData.Account_Name) {
      res.status(400).json({
        success: false,
        message: 'Account_Name is required',
        error: 'Missing required field'
      });
      return;
    }

    console.log(`📝 Creating venue: "${venueData.Account_Name}"`);

    // 🆕 Log field count being submitted
    const submittedFields = Object.keys(venueData);
    const customFields = submittedFields.filter(key => 
      key.includes('HL_') || key.includes('Wifi') || key.includes('Payment') || 
      key.includes('Speed_MBPS') || key.includes('AC_') || key.includes('Charging')
    );
    
    console.log(`📊 Creating venue with ${submittedFields.length} total fields (${customFields.length} custom fields)`);

    const result = await zohoService.createVenue(venueData);
    
    if (result.success) {
      // 🆕 Auto-refresh field cache after successful creation (in background)
      zohoService.refreshFieldCache().catch(err => 
        console.warn('Background field cache refresh failed:', err.message)
      );

      res.status(201).json({
        success: true,
        message: result.message,
        data: result.data,
        zoho_id: result.zoho_id,
        meta: {
          created_at: new Date().toISOString(),
          operation: 'create',
          fields_submitted: submittedFields.length,
          custom_fields_submitted: customFields.length
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

    // 🆕 Log update field analysis
    const updateFields = Object.keys(venueData);
    const customFields = updateFields.filter(key => 
      key.includes('HL_') || key.includes('Wifi') || key.includes('Payment') || 
      key.includes('Speed_MBPS') || key.includes('AC_') || key.includes('Charging')
    );
    
    console.log(`📊 Updating venue with ${updateFields.length} fields (${customFields.length} custom fields)`);

    const result = await zohoService.updateVenue(venueId, venueData);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data,
        meta: {
          updated_at: new Date().toISOString(),
          venue_id: venueId,
          operation: 'update',
          fields_updated: updateFields.length,
          custom_fields_updated: customFields.length
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

    // 🆕 Analyze bulk data fields
    const fieldAnalysis = venuesData.length > 0 ? {
      avg_fields_per_venue: Math.round(
        venuesData.reduce((sum, venue) => sum + Object.keys(venue).length, 0) / venuesData.length
      ),
      total_unique_fields: [...new Set(venuesData.flatMap(venue => Object.keys(venue)))].length,
      custom_fields_used: [...new Set(
        venuesData.flatMap(venue => 
          Object.keys(venue).filter(key => 
            key.includes('HL_') || key.includes('Wifi') || key.includes('Payment')
          )
        )
      )]
    } : null;

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
        operation: 'bulk_create',
        // 🆕 Field analysis for bulk operations
        field_analysis: fieldAnalysis
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
    
    // 🆕 Enhanced search results with field analysis
    const fieldAnalysis = result.data.length > 0 ? {
      fields_per_result: result.data.length > 0 ? Object.keys(result.data[0]).length : 0,
      custom_fields_present: result.data.length > 0 ? 
        Object.keys(result.data[0]).filter(key => 
          key.includes('HL_') || key.includes('Wifi') || key.includes('Payment')
        ).length : 0
    } : null;
    
    res.json({
      success: true,
      message: result.message,
      query: searchTerm,
      data: result.data,
      count: result.count,
      meta: {
        search_term: searchTerm,
        results_found: result.count,
        timestamp: new Date().toISOString(),
        // 🆕 Dynamic field information
        field_analysis: fieldAnalysis
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
      // 🆕 Analyze single venue field data
      const venue = result.data;
      const fieldAnalysis = {
        total_fields: Object.keys(venue).length,
        custom_fields: Object.keys(venue).filter(key => 
          key.includes('HL_') || key.includes('Wifi') || key.includes('Payment') || 
          key.includes('Speed_MBPS') || key.includes('AC_') || key.includes('Charging')
        ),
        has_complete_profile: !!(venue.Account_Name && venue.Billing_City && venue.Industry),
        has_location_data: !!(venue.Latitude && venue.Longitude),
        has_contact_info: !!(venue.Phone || venue.Website),
        field_completeness: Math.round(
          (Object.values(venue).filter(value => value !== null && value !== undefined && value !== '').length / 
           Object.keys(venue).length) * 100
        )
      };

      res.json({
        success: true,
        message: result.message,
        data: result.data,
        meta: {
          venue_id: venueId,
          fetched_at: new Date().toISOString(),
          // 🆕 Comprehensive field analysis
          field_analysis: fieldAnalysis
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

// 🆕 NEW DYNAMIC FIELD MANAGEMENT ENDPOINTS

/**
 * 🆕 FIXED: Get all available fields dynamically
 */
export const getFields = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📋 Get fields request received');
    
    const forceRefresh = req.query.refresh === 'true';
    const fields = await zohoService.getAvailableFields(forceRefresh);
    
    // Categorize fields
    const standardFields = fields.filter((field: string) => 
      !field.includes('HL_') && !field.includes('Wifi') && !field.includes('Payment') &&
      !field.includes('Speed_MBPS') && !field.includes('AC_') && !field.includes('Charging')
    );
    const customFields = fields.filter((field: string) => 
      field.includes('HL_') || field.includes('Wifi') || field.includes('Payment') || 
      field.includes('Speed_MBPS') || field.includes('AC_') || field.includes('Charging')
    );
    const venueSpecificFields = fields.filter((field: string) =>
      field.includes('HL_') || field.includes('Latitude') || field.includes('Longitude') ||
      field.includes('Rating') || field.includes('Opening_Hours')
    );

    res.json({
      success: true,
      message: 'Available fields retrieved successfully',
      total_fields: fields.length,
      fields: {
        all: fields,
        standard: standardFields,
        custom: customFields,
        venue_specific: venueSpecificFields
      },
      breakdown: {
        total: fields.length,
        standard: standardFields.length,
        custom: customFields.length,
        venue_specific: venueSpecificFields.length
      },
      meta: {
        cached: !forceRefresh,
        timestamp: new Date().toISOString(),
        next_auto_refresh: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ Error getting fields:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get fields',
      error: error.message
    });
  }
};

/**
 * 🆕 FIXED: Refresh field cache manually
 */
export const refreshFields = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔄 Field refresh request received');
    
    const result = await zohoService.refreshFieldCache();
    
    const response = {
      success: result.success,
      message: result.message,
      fields_discovered: result.fields_discovered,
      sample_fields: result.fields_list.slice(0, 15), // Show first 15 fields
      total_fields: result.fields_discovered,
      new_fields_detected: result.fields_list.filter(field => 
        field.includes('HL_') || field.includes('Wifi') || field.includes('Charging') ||
        field.includes('Latitude') || field.includes('Longitude')
      ),
      meta: {
        refreshed_at: new Date().toISOString(),
        cache_updated: result.success,
        valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        all_fields: result.fields_list // Include all fields for debugging
      }
    };

    console.log(`✅ Field refresh completed: ${result.fields_discovered} fields discovered`);
    
    res.json(response);

  } catch (error: any) {
    console.error('❌ Error in field refresh:', error);
    res.status(500).json({
      success: false,
      message: 'Field refresh failed',
      error: error.message,
      fields_discovered: 0,
      sample_fields: [],
      total_fields: 0,
      new_fields_detected: [],
      meta: {
        refreshed_at: new Date().toISOString(),
        cache_updated: false,
        error: error.message
      }
    });
  }
};

/**
 * 🔧 DEBUG: Test field discovery directly
 */
export const debugFieldDiscovery = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await zohoService.debugFieldDiscovery();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 🆕 Get field usage statistics across venues
 */
export const getFieldUsageStats = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 Field usage statistics requested');
    
    const sampleSize = Math.min(parseInt(req.query.sample_size as string) || 50, 200);
    
    // Get sample of venues to analyze field usage
    const venuesResult = await zohoService.getVenues(1, sampleSize);
    
    if (!venuesResult.success || venuesResult.data.length === 0) {
      res.status(500).json({
        success: false,
        message: 'Could not retrieve venues for field analysis',
        error: 'No venue data available'
      });
      return;
    }

    const venues = venuesResult.data;
    const allFields = [...new Set(venues.flatMap(venue => Object.keys(venue)))];
    
    // Calculate field usage statistics
    const fieldUsage = allFields.map((field: string) => {
      const usageCount = venues.filter(venue => {
        const value = venue[field as keyof typeof venue];
        return value !== null && value !== undefined && value !== '';
      }).length;
      
      return {
        field_name: field,
        usage_count: usageCount,
        usage_percentage: Math.round((usageCount / venues.length) * 100),
        is_custom_field: field.includes('HL_') || field.includes('Wifi') || field.includes('Payment') || 
                        field.includes('Speed_MBPS') || field.includes('AC_') || field.includes('Charging'),
        sample_values: venues
          .map(venue => venue[field as keyof typeof venue])
          .filter(value => value !== null && value !== undefined && value !== '')
          .slice(0, 3)
      };
    }).sort((a, b) => b.usage_percentage - a.usage_percentage);

    const customFieldUsage = fieldUsage.filter((field: FieldUsageStats) => field.is_custom_field);
    const mostUsedFields = fieldUsage.slice(0, 10);
    const leastUsedFields = fieldUsage.slice(-10).reverse();

    res.json({
      success: true,
      message: 'Field usage statistics calculated successfully',
      sample_size: venues.length,
      total_fields: allFields.length,
      statistics: {
        all_fields: fieldUsage,
        most_used: mostUsedFields,
        least_used: leastUsedFields,
        custom_fields: customFieldUsage
      },
      summary: {
        total_fields: allFields.length,
        custom_fields: customFieldUsage.length,
        fields_used_100_percent: fieldUsage.filter(f => f.usage_percentage === 100).length,
        fields_used_over_50_percent: fieldUsage.filter(f => f.usage_percentage > 50).length,
        unused_fields: fieldUsage.filter(f => f.usage_percentage === 0).length
      },
      meta: {
        analyzed_at: new Date().toISOString(),
        sample_size: sampleSize
      }
    });

  } catch (error: any) {
    console.error('❌ Error calculating field usage stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate field usage statistics',
      error: error.message
    });
  }
};
