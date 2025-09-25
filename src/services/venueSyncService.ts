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
   * Full sync of all venues
   */
  public async syncAllVenues(): Promise<{ synced: number; errors: number }> {
    try {
      console.log('🔄 Starting full venue sync...');
      
      let page = 1;
      let hasMore = true;
      let syncedCount = 0;
      let errorCount = 0;

      while (hasMore) {
        console.log(`📋 Syncing page ${page}...`);
        
        const result = await zohoService.getVenues(page, 200);
        
        if (!result.success) {
          console.error(`❌ Failed to fetch page ${page}:`, result.message);
          errorCount++;
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

        hasMore = result.pagination.hasMore;
        page++;

        // Rate limiting - pause between pages
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 1000));
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
   * Delta sync - only sync modified venues since last sync
   */
  public async deltaSyncVenues(): Promise<{ synced: number; errors: number }> {
    try {
      console.log('🔄 Starting delta venue sync...');

      // Get last successful sync time
      const lastSync = await VenueCache.findOne(
        { sync_status: 'synced' },
        {},
        { sort: { 'timestamps.synced_at': -1 } }
      );

      const sinceDate = lastSync?.timestamps.synced_at || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours if no previous sync
      
      console.log(`📅 Syncing changes since: ${sinceDate.toISOString()}`);

      // Use COQL to get recently modified accounts
      const coqlQuery = `select Account_Name, Phone, Website, Owner, Billing_Street, Billing_City, Billing_State, Billing_Code, Billing_Country, Description, Industry, Annual_Revenue, Rating, Employees, Modified_Time, Created_Time from Accounts where Modified_Time > '${sinceDate.toISOString()}' limit 200`;
      
      const result = await zohoService.searchVenuesByCOQL(coqlQuery);
      
      if (!result.success) {
        throw new Error(`Delta sync failed: ${result.message}`);
      }

      console.log(`📊 Found ${result.count} modified venues`);

      let syncedCount = 0;
      let errorCount = 0;

      // Process each modified venue
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

      return {
        total,
        synced,
        pending,
        errors,
        lastSync: lastSyncDoc?.timestamps.synced_at || null
      };

    } catch (error: any) {
      console.error('❌ Error getting cache stats:', error.message);
      throw error;
    }
  }
}

export default new VenueSyncService();
