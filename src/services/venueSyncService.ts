import VenueCache, { IVenueCache } from '../models/VenueCache';
import zohoService from './zohoService';
import { ZohoVenue } from '../models/ZohoTypes';

class VenueSyncService {
  
  /**
   * Transform Zoho venue data to our cache format
   */
  private transformZohoVenue(zohoVenue: ZohoVenue): Partial<IVenueCache> {
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
      details: {
        description: zohoVenue.Description,
        industry: zohoVenue.Industry,
        annual_revenue: zohoVenue.Annual_Revenue,
        rating: zohoVenue.Rating,
        employees: zohoVenue.Employees
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
            'timestamps.synced_at': new Date()
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
          'timestamps.synced_at': new Date()
        }
      );
      
      throw error;
    }
  }

  /**
   * Full sync of all venues - FIXED with better pagination handling
   */
  public async syncAllVenues(): Promise<{ synced: number; errors: number }> {
    try {
      console.log('🔄 Starting full venue sync...');
      
      let page = 1;
      let hasMore = true;
      let syncedCount = 0;
      let errorCount = 0;
      const maxPages = 20; // Safety limit to prevent infinite loops

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

      console.log(`✅ Full sync completed: ${syncedCount} synced, ${errorCount} errors`);
      
      return { synced: syncedCount, errors: errorCount };

    } catch (error: any) {
      console.error('❌ Full sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Delta sync - COMPLETELY REWRITTEN to avoid COQL
   */
  public async deltaSyncVenues(): Promise<{ synced: number; errors: number }> {
    try {
      console.log('🔄 Starting delta venue sync (NO COQL)...');

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
        return { synced: 0, errors: 0 };
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
      
      return { synced: syncedCount, errors: errorCount };

    } catch (error: any) {
      console.error('❌ Delta sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Get venues from cache (fast local queries)
   */
  public async getCachedVenues(options: {
    page?: number;
    limit?: number;
    city?: string;
    industry?: string;
    search?: string;
  } = {}): Promise<{
    venues: IVenueCache[];
    total: number;
    page: number;
    hasMore: boolean;
  }> {
    try {
      const {
        page = 1,
        limit = 20,
        city,
        industry,
        search
      } = options;

      console.log(`🔍 Fetching cached venues - Page: ${page}, Limit: ${limit}`, {
        city, industry, search
      });

      // Build query
      const query: any = { sync_status: 'synced' };

      if (city) {
        query['billing_address.city'] = new RegExp(city, 'i');
      }

      if (industry) {
        query['details.industry'] = new RegExp(industry, 'i');
      }

      if (search) {
        query.$or = [
          { account_name: new RegExp(search, 'i') },
          { 'billing_address.city': new RegExp(search, 'i') },
          { 'details.industry': new RegExp(search, 'i') }
        ];
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

      console.log(`✅ Retrieved ${venues.length} cached venues out of ${total} total`);

      return {
        venues,
        total,
        page,
        hasMore: skip + limit < total
      };

    } catch (error: any) {
      console.error('❌ Error fetching cached venues:', error.message);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<{
    total: number;
    synced: number;
    pending: number;
    errors: number;
    lastSync: Date | null;
    cacheHealth: 'healthy' | 'warning' | 'error';
    recommendations: string[];
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
        recommendations
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
   * Smart sync - decides between full or delta based on cache state
   */
  public async smartSync(): Promise<{ synced: number; errors: number; syncType: 'full' | 'delta' }> {
    try {
      const stats = await this.getCacheStats();
      
      // If cache is empty or very old, do full sync
      if (stats.total === 0) {
        console.log('🧠 Smart sync: Cache is empty, running full sync');
        const result = await this.syncAllVenues();
        return { ...result, syncType: 'full' };
      }
      
      // If last sync was more than 6 hours ago, do full sync
      if (stats.lastSync) {
        const hoursSinceLastSync = (Date.now() - stats.lastSync.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSync > 6) {
          console.log('🧠 Smart sync: Last sync was over 6 hours ago, running full sync');
          const result = await this.syncAllVenues();
          return { ...result, syncType: 'full' };
        }
      }
      
      // Otherwise, do delta sync
      console.log('🧠 Smart sync: Running delta sync');
      const result = await this.deltaSyncVenues();
      return { ...result, syncType: 'delta' };
      
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
}

export default new VenueSyncService();
