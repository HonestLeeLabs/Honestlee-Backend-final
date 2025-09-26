import VenueCache, { IVenueCache } from '../models/VenueCache';
import zohoService from './zohoService';
import { ZohoVenue } from '../models/ZohoTypes';

class VenueSyncService {
  
  /**
   * 🆕 FIXED: Transform Zoho venue data with proper type conversion
   */
  private transformZohoVenue(zohoVenue: ZohoVenue): Partial<IVenueCache> {
    // Helper function to safely convert to number
    const toNumber = (value: string | number | undefined): number | undefined => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? undefined : parsed;
      }
      return undefined;
    };

    // Helper function to safely convert to string
    const toString = (value: string | number | undefined): string | undefined => {
      if (value === undefined || value === null) return undefined;
      return String(value);
    };

    // Helper function to safely convert to boolean
    const toBoolean = (value: string | boolean | undefined): boolean | undefined => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
        if (lower === 'false' || lower === '0' || lower === 'no') return false;
      }
      return undefined;
    };

    return {
      zoho_id: zohoVenue.id,
      account_name: zohoVenue.Account_Name,
      phone: zohoVenue.Phone,
      website: zohoVenue.Website,
      owner: zohoVenue.Owner ? {
        name: zohoVenue.Owner.name,
        id: zohoVenue.Owner.id,
        email: zohoVenue.Owner.email
      } : undefined,
      billing_address: {
        street: zohoVenue.Billing_Street,
        city: zohoVenue.Billing_City,
        state: zohoVenue.Billing_State,
        code: zohoVenue.Billing_Code,
        country: zohoVenue.Billing_Country
      },
      shipping_address: {
        street: zohoVenue.Shipping_Street,
        city: zohoVenue.Shipping_City,
        state: zohoVenue.Shipping_State,
        code: zohoVenue.Shipping_Code,
        country: zohoVenue.Shipping_Country
      },
      details: {
        description: zohoVenue.Description,
        industry: zohoVenue.Industry,
        // 🆕 FIXED: Proper type conversion
        annual_revenue: toNumber(zohoVenue.Annual_Revenue),
        rating: toString(zohoVenue.Rating),
        employees: toNumber(zohoVenue.Employees)
      },
      // 🆕 ENHANCED: Add ALL custom venue fields with proper conversion
      custom_fields: {
        // Venue amenities
        ac_fan: zohoVenue.AC_Fan,
        charging_ports: zohoVenue.Charging_Ports,
        pub_wifi: zohoVenue.Pub_Wifi,
        
        // Internet connectivity
        wifi_ssid: zohoVenue.Wifi_SSID,
        wifi_password: zohoVenue.PW,
        dl_speed_mbps: toNumber(zohoVenue.DL_Speed_MBPS),
        ul_speed_mbps: toNumber(zohoVenue.UL_Speed_MBPS),
        
        // Location data
        latitude: toNumber(zohoVenue.Latitude),
        longitude: toNumber(zohoVenue.Longitude),
        distance_from_center: toNumber(zohoVenue.HL_Distance_km_from_center),
        place_id: zohoVenue.HL_Place_ID,
        
        // Venue details
        opening_hours: zohoVenue.HL_Opening_Hours_Text || zohoVenue.Operating_Hours,
        noise_level: zohoVenue.Noise_Level,
        payment_options: zohoVenue.Payment_options,
        
        // Ratings and photos
        price_level: toNumber(zohoVenue.HL_Price_Level),
        ratings_count: toNumber(zohoVenue.HL_Ratings_Count),
        photo_count: toNumber(zohoVenue.HL_Photo_Count),
        photo_ref: zohoVenue.HL_Photo_Ref,
        
        // Additional fields
        account_image: zohoVenue.Account_Image,
        connected_to: zohoVenue.Connected_To,
        wifi_display_method: zohoVenue.Curr_Wifi_Display_Method,
        charging_ports_photo: zohoVenue.Photo_of_charging_ports,

        // Extended amenities - with full support
        seating_capacity: toNumber(zohoVenue.Seating_Capacity),
        private_rooms: toBoolean(zohoVenue.Private_Rooms),
        meeting_rooms: toBoolean(zohoVenue.Meeting_Rooms),
        presentation_equipment: toBoolean(zohoVenue.Presentation_Equipment),
        kitchen_access: toBoolean(zohoVenue.Kitchen_Access),
        coffee_available: toBoolean(zohoVenue.Coffee_Available),
        food_options: zohoVenue.Food_Options,
        alcohol_served: toBoolean(zohoVenue.Alcohol_Served),
        
        // Tech amenities
        power_outlets: toNumber(zohoVenue.Power_Outlets),
        charging_stations: toNumber(zohoVenue.Charging_Stations),
        computer_access: toBoolean(zohoVenue.Computer_Access),
        printer_access: toBoolean(zohoVenue.Printer_Access),
        projector_available: toBoolean(zohoVenue.Projector_Available),
        audio_system: toBoolean(zohoVenue.Audio_System),
        video_conferencing: toBoolean(zohoVenue.Video_Conferencing),
        
        // Accessibility
        accessibility_features: zohoVenue.Accessibility_Features,
        parking_available: toBoolean(zohoVenue.Parking_Available),
        public_transport_access: zohoVenue.Public_Transport_Access,
        floor_number: toNumber(zohoVenue.Floor_Number),
        building_name: zohoVenue.Building_Name,
        landmark: zohoVenue.Landmark
      },
      timestamps: {
        created_time: new Date(zohoVenue.Created_Time),
        modified_time: new Date(zohoVenue.Modified_Time),
        synced_at: new Date()
      },
      sync_status: 'synced',
      raw_data: zohoVenue
    };
  }

  /**
   * 🆕 ADDED: Helper function for field analysis (since it's not in the interface)
   */
  private getFieldAnalysis(venue: IVenueCache): {
    totalFields: number;
    customFields: number;
    populatedFields: number;
    completeness: number;
    customFieldNames: string[];
    emptyFields: string[];
  } {
    const rawData = venue.raw_data || {};
    const allFields = Object.keys(rawData);
    const customFields = allFields.filter(field => 
      field.includes('HL_') || field.includes('Wifi') || field.includes('Payment') ||
      field.includes('Speed_MBPS') || field.includes('AC_') || field.includes('Charging')
    );
    const populatedFields = allFields.filter(field => {
      const value = rawData[field];
      return value !== null && value !== undefined && value !== '';
    });

    return {
      totalFields: allFields.length,
      customFields: customFields.length,
      populatedFields: populatedFields.length,
      completeness: allFields.length > 0 ? Math.round((populatedFields.length / allFields.length) * 100) : 0,
      customFieldNames: customFields,
      emptyFields: allFields.filter(field => {
        const value = rawData[field];
        return value === null || value === undefined || value === '';
      })
    };
  }

  /**
   * Sync single venue by ID
   */
  public async syncVenueById(zohoId: string): Promise<IVenueCache | null> {
    try {
      console.log(`🔄 Syncing venue: ${zohoId}`);

      // Fetch from Zoho
      const result = await zohoService.getVenueById(zohoId);
      
      if (!result.success || !result.data) {
        console.log(`⚠️ Venue not found in Zoho: ${zohoId}`);
        // Mark as deleted if it existed in cache
        await VenueCache.findOneAndUpdate(
          { zoho_id: zohoId },
          { 
            sync_status: 'error',
            sync_error: 'Venue not found in Zoho',
            'timestamps.synced_at': new Date(),
            last_sync_attempt: new Date()
          }
        );
        return null;
      }

      // Transform and upsert to cache
      const venueData = this.transformZohoVenue(result.data);
      
      const cachedVenue = await VenueCache.findOneAndUpdate(
        { zoho_id: zohoId },
        venueData,
        { 
          upsert: true, 
          new: true,
          runValidators: true
        }
      );

      console.log(`✅ Venue synced: ${venueData.account_name}`);
      return cachedVenue;

    } catch (error: any) {
      console.error(`❌ Error syncing venue ${zohoId}:`, error.message);
      
      // Mark as error in cache
      await VenueCache.findOneAndUpdate(
        { zoho_id: zohoId },
        { 
          sync_status: 'error',
          sync_error: error.message,
          'timestamps.synced_at': new Date(),
          last_sync_attempt: new Date()
        }
      );
      
      throw error;
    }
  }

  /**
   * 🆕 ENHANCED: Full sync with dynamic field support
   */
  public async syncAllVenues(): Promise<{ synced: number; errors: number; fieldsDiscovered: number }> {
    try {
      console.log('🔄 Starting full venue sync with dynamic field discovery...');
      
      let page = 1;
      let hasMore = true;
      let syncedCount = 0;
      let errorCount = 0;
      let fieldsDiscovered = 0;
      const maxPages = 50; // Increased for complete sync

      while (hasMore && page <= maxPages) {
        console.log(`📋 Syncing page ${page}...`);
        
        const result = await zohoService.getVenues(page, 200);
        
        if (!result.success) {
          console.error(`❌ Failed to fetch page ${page}:`, result.message);
          errorCount++;
          break;
        }

        // If no data returned, we're done
        if (!result.data || result.data.length === 0) {
          console.log(`📋 No data on page ${page}, sync complete`);
          break;
        }

        // Track fields discovered
        if (result.data.length > 0 && page === 1) {
          fieldsDiscovered = Object.keys(result.data[0]).length;
          console.log(`🔍 Discovered ${fieldsDiscovered} fields in venue records`);
        }

        // Process each venue
        for (const venue of result.data) {
          try {
            const venueData = this.transformZohoVenue(venue);
            
            await VenueCache.findOneAndUpdate(
              { zoho_id: venue.id },
              venueData,
              { 
                upsert: true, 
                new: true,
                runValidators: true
              }
            );
            
            syncedCount++;
            
            if (syncedCount % 50 === 0) {
              console.log(`📊 Progress: ${syncedCount} venues synced`);
            }
          } catch (error: any) {
            console.error(`❌ Error syncing venue ${venue.id}:`, error.message);
            errorCount++;
          }
        }

        hasMore = result.pagination.hasMore && result.data.length === 200;
        page++;

        // Rate limiting - pause between pages
        if (hasMore) {
          console.log(`⏳ Pausing 2 seconds before next page...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log(`✅ Full sync completed: ${syncedCount} synced, ${errorCount} errors, ${fieldsDiscovered} fields`);
      
      return { synced: syncedCount, errors: errorCount, fieldsDiscovered };

    } catch (error: any) {
      console.error('❌ Full sync failed:', error.message);
      throw error;
    }
  }

  /**
   * 🆕 ENHANCED: Delta sync with field discovery
   */
  public async deltaSyncVenues(): Promise<{ synced: number; errors: number; checkedVenues: number }> {
    try {
      console.log('🔄 Starting delta venue sync with dynamic fields...');

      // Get last successful sync time
      const lastSync = await VenueCache.findOne(
        { sync_status: 'synced' },
        {},
        { sort: { 'timestamps.synced_at': -1 } }
      );

      const sinceDate = lastSync?.timestamps.synced_at || new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      console.log(`📅 Checking for changes since: ${sinceDate.toISOString()}`);

      // Strategy: Check first few pages (most recent data) for modifications
      console.log('📋 Fetching recent pages to check for modifications...');
      
      let allRecentVenues: ZohoVenue[] = [];
      const maxPagesToCheck = 5; // Only check first 5 pages for delta sync
      
      for (let page = 1; page <= maxPagesToCheck; page++) {
        console.log(`📄 Checking page ${page} for recent changes...`);
        
        const result = await zohoService.getVenues(page, 200);
        
        if (!result.success || !result.data || result.data.length === 0) {
          console.log(`📄 Page ${page} has no data, stopping delta sync`);
          break;
        }

        allRecentVenues.push(...result.data);
        console.log(`📄 Page ${page}: ${result.data.length} venues retrieved`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Filter venues modified since last sync
      const recentlyModified = allRecentVenues.filter(venue => {
        try {
          const modifiedTime = new Date(venue.Modified_Time);
          return modifiedTime > sinceDate;
        } catch (error) {
          console.warn(`⚠️ Invalid Modified_Time for venue ${venue.id}:`, venue.Modified_Time);
          return false;
        }
      });

      console.log(`📊 Found ${recentlyModified.length} recently modified venues out of ${allRecentVenues.length} total checked`);

      if (recentlyModified.length === 0) {
        console.log('✅ Delta sync completed: No recent changes detected');
        return { synced: 0, errors: 0, checkedVenues: allRecentVenues.length };
      }

      let syncedCount = 0;
      let errorCount = 0;

      // Process each modified venue
      for (const venue of recentlyModified) {
        try {
          const venueData = this.transformZohoVenue(venue);
          
          await VenueCache.findOneAndUpdate(
            { zoho_id: venue.id },
            venueData,
            { 
              upsert: true, 
              new: true,
              runValidators: true
            }
          );
          
          syncedCount++;
          console.log(`✅ Updated: ${venue.Account_Name} (Modified: ${venue.Modified_Time})`);
        } catch (error: any) {
          console.error(`❌ Error syncing venue ${venue.id}:`, error.message);
          errorCount++;
        }
      }

      console.log(`✅ Delta sync completed: ${syncedCount} synced, ${errorCount} errors`);
      
      return { synced: syncedCount, errors: errorCount, checkedVenues: allRecentVenues.length };

    } catch (error: any) {
      console.error('❌ Delta sync failed:', error.message);
      throw error;
    }
  }

  /**
   * 🆕 FIXED: Get cached venues with fixed MongoDB queries
   */
  public async getCachedVenues(options: {
    page?: number;
    limit?: number;
    city?: string;
    industry?: string;
    search?: string;
    hasWifi?: boolean;
    hasCharging?: boolean;
    hasLocation?: boolean;
    minRating?: number;
    hasParking?: boolean;
    hasFood?: boolean;
    hasMeetingRooms?: boolean;
  } = {}): Promise<{
    venues: IVenueCache[];
    total: number;
    page: number;
    hasMore: boolean;
    filters_applied: string[];
  }> {
    try {
      const {
        page = 1,
        limit = 20,
        city,
        industry,
        search,
        hasWifi,
        hasCharging,
        hasLocation,
        minRating,
        hasParking,
        hasFood,
        hasMeetingRooms
      } = options;

      console.log(`🔍 Fetching cached venues - Page: ${page}, Limit: ${limit}`, {
        city, industry, search, hasWifi, hasCharging, hasLocation, minRating, hasParking, hasFood, hasMeetingRooms
      });

      // Build query
      const query: any = { sync_status: 'synced' };
      const filtersApplied: string[] = [];

      if (city) {
        query['billing_address.city'] = new RegExp(city, 'i');
        filtersApplied.push('city');
      }

      if (industry) {
        query['details.industry'] = new RegExp(industry, 'i');
        filtersApplied.push('industry');
      }

      if (search) {
        query.$or = [
          { account_name: new RegExp(search, 'i') },
          { 'billing_address.city': new RegExp(search, 'i') },
          { 'details.industry': new RegExp(search, 'i') },
          { 'custom_fields.payment_options': new RegExp(search, 'i') },
          { 'details.description': new RegExp(search, 'i') }
        ];
        filtersApplied.push('search');
      }

      // 🆕 FIXED: Enhanced filters with proper MongoDB syntax
      if (hasWifi !== undefined) {
        if (hasWifi) {
          query['custom_fields.wifi_ssid'] = { $exists: true, $nin: [null, ''] };
        } else {
          query['custom_fields.wifi_ssid'] = { $exists: false };
        }
        filtersApplied.push('wifi');
      }

      if (hasCharging !== undefined) {
        query['custom_fields.charging_ports'] = hasCharging;
        filtersApplied.push('charging');
      }

      if (hasLocation !== undefined) {
        if (hasLocation) {
          query.$and = [
            { 'custom_fields.latitude': { $exists: true, $ne: null } },
            { 'custom_fields.longitude': { $exists: true, $ne: null } }
          ];
        } else {
          query.$or = [
            { 'custom_fields.latitude': { $exists: false } },
            { 'custom_fields.longitude': { $exists: false } },
            { 'custom_fields.latitude': null },
            { 'custom_fields.longitude': null }
          ];
        }
        filtersApplied.push('location');
      }

      if (minRating !== undefined) {
        // Handle both string and numeric ratings
        query.$or = [
          { 'details.rating': { $gte: minRating.toString() } },
          { 'details.rating': { $gte: minRating } }
        ];
        filtersApplied.push('rating');
      }

      // 🆕 FIXED: Additional amenity filters with proper syntax
      if (hasParking !== undefined) {
        query['custom_fields.parking_available'] = hasParking;
        filtersApplied.push('parking');
      }

      if (hasFood !== undefined) {
        query['custom_fields.coffee_available'] = hasFood;
        filtersApplied.push('food');
      }

      if (hasMeetingRooms !== undefined) {
        query['custom_fields.meeting_rooms'] = hasMeetingRooms;
        filtersApplied.push('meeting_rooms');
      }

      // Execute query with pagination
      const skip = (page - 1) * limit;
      
      const [venues, total] = await Promise.all([
        VenueCache.find(query)
          .sort({ 'timestamps.modified_time': -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        VenueCache.countDocuments(query)
      ]);

      console.log(`✅ Retrieved ${venues.length} cached venues out of ${total} total (filters: ${filtersApplied.join(', ')})`);

      return {
        venues,
        total,
        page,
        hasMore: skip + limit < total,
        filters_applied: filtersApplied
      };

    } catch (error: any) {
      console.error('❌ Error fetching cached venues:', error.message);
      throw error;
    }
  }

  /**
   * 🆕 FIXED: Get comprehensive cache statistics with fixed queries
   */
  public async getCacheStats(): Promise<{
    total: number;
    synced: number;
    pending: number;
    errors: number;
    lastSync: Date | null;
    cacheHealth: 'healthy' | 'warning' | 'error';
    recommendations: string[];
    fieldStats: {
      venues_with_wifi: number;
      venues_with_location: number;
      venues_with_charging: number;
      venues_with_parking: number;
      venues_with_food: number;
      venues_with_meeting_rooms: number;
      average_completeness: number;
      average_fields_per_venue: number;
    };
  }> {
    try {
      const [
        total,
        synced,
        pending,
        errors,
        lastSyncDoc
      ] = await Promise.all([
        VenueCache.countDocuments(),
        VenueCache.countDocuments({ sync_status: 'synced' }),
        VenueCache.countDocuments({ sync_status: 'pending' }),
        VenueCache.countDocuments({ sync_status: 'error' }),
        VenueCache.findOne({}, {}, { sort: { 'timestamps.synced_at': -1 } })
      ]);

      // 🆕 FIXED: Enhanced field statistics with proper MongoDB queries
      const [
        venuesWithWifi,
        venuesWithLocation,
        venuesWithCharging,
        venuesWithParking,
        venuesWithFood,
        venuesWithMeetingRooms
      ] = await Promise.all([
        VenueCache.countDocuments({ 
          sync_status: 'synced',
          'custom_fields.wifi_ssid': { $exists: true, $nin: [null, ''] }
        }),
        VenueCache.countDocuments({ 
          sync_status: 'synced',
          'custom_fields.latitude': { $exists: true, $ne: null },
          'custom_fields.longitude': { $exists: true, $ne: null }
        }),
        VenueCache.countDocuments({ 
          sync_status: 'synced',
          'custom_fields.charging_ports': true
        }),
        VenueCache.countDocuments({ 
          sync_status: 'synced',
          'custom_fields.parking_available': true
        }),
        VenueCache.countDocuments({ 
          sync_status: 'synced',
          'custom_fields.coffee_available': true
        }),
        VenueCache.countDocuments({ 
          sync_status: 'synced',
          'custom_fields.meeting_rooms': true
        })
      ]);

      // Calculate average completeness
      const completenessAgg = await VenueCache.aggregate([
        { $match: { sync_status: 'synced', data_completeness: { $exists: true } } },
        { $group: { _id: null, avgCompleteness: { $avg: '$data_completeness' }, avgFields: { $avg: '$field_count' } } }
      ]);

      const avgCompleteness = completenessAgg.length > 0 ? completenessAgg[0].avgCompleteness : 0;
      const avgFields = completenessAgg.length > 0 ? completenessAgg[0].avgFields : 0;

      // Determine cache health
      let cacheHealth: 'healthy' | 'warning' | 'error' = 'healthy';
      const recommendations: string[] = [];

      if (total === 0) {
        cacheHealth = 'error';
        recommendations.push('Cache is empty - run full sync');
      } else if (errors > synced * 0.1) {
        cacheHealth = 'warning';
        recommendations.push('High error rate detected - check sync logs');
      } else if (lastSyncDoc) {
        const hoursSinceLastSync = (Date.now() - lastSyncDoc.timestamps.synced_at.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSync > 12) {
          cacheHealth = 'warning';
          recommendations.push('Last sync was over 12 hours ago - consider running delta sync');
        }
      }

      if (avgCompleteness < 60) {
        cacheHealth = 'warning';
        recommendations.push('Data completeness is low - some venues have missing information');
      }

      if (recommendations.length === 0) {
        recommendations.push('Cache is healthy');
      }

      return {
        total,
        synced,
        pending,
        errors,
        lastSync: lastSyncDoc?.timestamps.synced_at || null,
        cacheHealth,
        recommendations,
        fieldStats: {
          venues_with_wifi: venuesWithWifi,
          venues_with_location: venuesWithLocation,
          venues_with_charging: venuesWithCharging,
          venues_with_parking: venuesWithParking,
          venues_with_food: venuesWithFood,
          venues_with_meeting_rooms: venuesWithMeetingRooms,
          average_completeness: Math.round(avgCompleteness || 0),
          average_fields_per_venue: Math.round(avgFields || 0)
        }
      };

    } catch (error: any) {
      console.error('❌ Error getting cache stats:', error.message);
      throw error;
    }
  }

  /**
   * Clear all cached venues
   */
  public async clearCache(): Promise<{ deleted: number }> {
    try {
      console.log('🧹 Clearing venue cache...');
      
      const result = await VenueCache.deleteMany({});
      
      console.log(`✅ Cleared ${result.deletedCount} cached venues`);
      
      return { deleted: result.deletedCount };

    } catch (error: any) {
      console.error('❌ Error clearing cache:', error.message);
      throw error;
    }
  }

  /**
   * 🆕 ENHANCED: Smart sync with field discovery reporting
   */
  public async smartSync(): Promise<{ 
    synced: number; 
    errors: number; 
    syncType: 'full' | 'delta';
    fieldsDiscovered?: number;
    checkedVenues?: number;
  }> {
    try {
      const stats = await this.getCacheStats();
      
      // If cache is empty or very old, do full sync
      if (stats.total === 0) {
        console.log('🧠 Smart sync: Cache is empty, running full sync');
        const result = await this.syncAllVenues();
        return { 
          synced: result.synced, 
          errors: result.errors, 
          syncType: 'full',
          fieldsDiscovered: result.fieldsDiscovered
        };
      }
      
      // If last sync was more than 6 hours ago, do full sync
      if (stats.lastSync) {
        const hoursSinceLastSync = (Date.now() - stats.lastSync.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSync > 6) {
          console.log('🧠 Smart sync: Last sync was over 6 hours ago, running full sync');
          const result = await this.syncAllVenues();
          return { 
            synced: result.synced, 
            errors: result.errors, 
            syncType: 'full',
            fieldsDiscovered: result.fieldsDiscovered
          };
        }
      }
      
      // Otherwise, do delta sync
      console.log('🧠 Smart sync: Running delta sync');
      const result = await this.deltaSyncVenues();
      return { 
        synced: result.synced, 
        errors: result.errors, 
        syncType: 'delta',
        checkedVenues: result.checkedVenues
      };
      
    } catch (error: any) {
      console.error('❌ Smart sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Get sync recommendations based on current state
   */
  public async getSyncRecommendations(): Promise<{
    action: 'full_sync' | 'delta_sync' | 'no_action';
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    try {
      const stats = await this.getCacheStats();
      
      if (stats.total === 0) {
        return {
          action: 'full_sync',
          reason: 'Cache is empty and needs initial population',
          priority: 'high'
        };
      }
      
      if (stats.lastSync) {
        const hoursSinceLastSync = (Date.now() - stats.lastSync.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceLastSync > 24) {
          return {
            action: 'full_sync',
            reason: 'Last sync was over 24 hours ago',
            priority: 'high'
          };
        } else if (hoursSinceLastSync > 2) {
          return {
            action: 'delta_sync',
            reason: 'Last sync was over 2 hours ago',
            priority: 'medium'
          };
        }
      }
      
      return {
        action: 'no_action',
        reason: 'Cache is up to date',
        priority: 'low'
      };
      
    } catch (error: any) {
      console.error('❌ Error getting sync recommendations:', error.message);
      return {
        action: 'full_sync',
        reason: 'Error checking cache state',
        priority: 'high'
      };
    }
  }

  /**
   * 🆕 FIXED: Sync specific venue and return detailed field information
   */
  public async syncVenueWithFieldAnalysis(zohoId: string): Promise<{
    success: boolean;
    venue?: IVenueCache;
    fieldAnalysis?: {
      totalFields: number;
      customFields: number;
      populatedFields: number;
      fieldCompleteness: number;
      customFieldNames: string[];
      emptyFields: string[];
    };
    error?: string;
  }> {
    try {
      const venue = await this.syncVenueById(zohoId);
      
      if (!venue) {
        return {
          success: false,
          error: 'Venue not found or sync failed'
        };
      }

      // 🆕 FIXED: Use the private helper method instead of non-existent interface method
      const fieldAnalysis = this.getFieldAnalysis(venue);

      return {
        success: true,
        venue,
        fieldAnalysis: {
          totalFields: fieldAnalysis.totalFields,
          customFields: fieldAnalysis.customFields,
          populatedFields: fieldAnalysis.populatedFields,
          fieldCompleteness: fieldAnalysis.completeness,
          customFieldNames: fieldAnalysis.customFieldNames,
          emptyFields: fieldAnalysis.emptyFields
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 🆕 FIXED: Get venues by specific amenities with fixed queries
   */
  public async getVenuesByAmenities(amenities: {
    wifi?: boolean;
    charging?: boolean;
    parking?: boolean;
    food?: boolean;
    meetingRooms?: boolean;
    audioSystem?: boolean;
    projector?: boolean;
  }): Promise<{
    venues: IVenueCache[];
    total: number;
    amenitiesMatched: string[];
  }> {
    try {
      const query: any = { sync_status: 'synced' };
      const amenitiesMatched: string[] = [];

      if (amenities.wifi) {
        query['custom_fields.wifi_ssid'] = { $exists: true, $nin: [null, ''] };
        amenitiesMatched.push('wifi');
      }

      if (amenities.charging) {
        query['custom_fields.charging_ports'] = true;
        amenitiesMatched.push('charging');
      }

      if (amenities.parking) {
        query['custom_fields.parking_available'] = true;
        amenitiesMatched.push('parking');
      }

      if (amenities.food) {
        query['custom_fields.coffee_available'] = true;
        amenitiesMatched.push('food');
      }

      if (amenities.meetingRooms) {
        query['custom_fields.meeting_rooms'] = true;
        amenitiesMatched.push('meetingRooms');
      }

      if (amenities.audioSystem) {
        query['custom_fields.audio_system'] = true;
        amenitiesMatched.push('audioSystem');
      }

      if (amenities.projector) {
        query['custom_fields.projector_available'] = true;
        amenitiesMatched.push('projector');
      }

      const [venues, total] = await Promise.all([
        VenueCache.find(query)
          .sort({ 'timestamps.modified_time': -1 })
          .lean(),
        VenueCache.countDocuments(query)
      ]);

      console.log(`✅ Found ${venues.length} venues with amenities: ${amenitiesMatched.join(', ')}`);

      return {
        venues,
        total,
        amenitiesMatched
      };

    } catch (error: any) {
      console.error('❌ Error getting venues by amenities:', error.message);
      throw error;
    }
  }

  /**
   * 🆕 Get venues within a specific radius from coordinates
   */
  public async getVenuesNearLocation(
    latitude: number, 
    longitude: number, 
    radiusKm: number = 5
  ): Promise<{
    venues: (IVenueCache & { distance?: number })[];
    total: number;
    searchRadius: number;
  }> {
    try {
      console.log(`📍 Finding venues within ${radiusKm}km of ${latitude}, ${longitude}`);

      // Find venues with location data
      const venues = await VenueCache.find({
        sync_status: 'synced',
        'custom_fields.latitude': { $exists: true, $ne: null },
        'custom_fields.longitude': { $exists: true, $ne: null }
      }).lean();

      // Calculate distances and filter by radius
      const nearbyVenues = venues
        .map(venue => {
          const venueLat = venue.custom_fields.latitude!;
          const venueLng = venue.custom_fields.longitude!;
          
          // Haversine formula for distance calculation
          const R = 6371; // Earth's radius in km
          const dLat = (venueLat - latitude) * Math.PI / 180;
          const dLon = (venueLng - longitude) * Math.PI / 180;
          const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(latitude * Math.PI / 180) * Math.cos(venueLat * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;

          return {
            ...venue,
            distance: Math.round(distance * 100) / 100 // Round to 2 decimal places
          };
        })
        .filter(venue => venue.distance! <= radiusKm)
        .sort((a, b) => a.distance! - b.distance!);

      console.log(`✅ Found ${nearbyVenues.length} venues within ${radiusKm}km radius`);

      return {
        venues: nearbyVenues,
        total: nearbyVenues.length,
        searchRadius: radiusKm
      };

    } catch (error: any) {
      console.error('❌ Error finding venues near location:', error.message);
      throw error;
    }
  }
}

export default new VenueSyncService();
