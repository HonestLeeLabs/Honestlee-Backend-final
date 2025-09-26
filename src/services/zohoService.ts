import axios, { AxiosResponse, AxiosError } from 'axios';
import {
  ZohoTokenResponse,
  ZohoAPIResponse,
  ZohoVenue,
  ZohoHealthCheck,
  VenuesListResponse,
  VenueSearchResponse,
  VenueDetailsResponse,
  ZohoHealthResponse
} from '../models/ZohoTypes';

class ZohoService {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private dc: string;
  private baseURL: string;
  private authURL: string;
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;
  private debug: boolean;
  private isRefreshing: boolean = false;

  // 🆕 Dynamic field caching properties
  private availableFields: string[] = [];
  private fieldsLastFetched: number = 0;
  private fieldsCacheDuration: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID || '';
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET || '';
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN || '';
    this.dc = process.env.ZOHO_DC || 'in';
    this.baseURL = `https://www.zohoapis.${this.dc}/crm/v8`;
    this.authURL = `https://accounts.zoho.${this.dc}/oauth/v2/token`;
    this.debug = true;

    console.log('🔍 Zoho Service Initialization:');
    console.log('Client ID:', this.clientId ? `✅ Set (${this.clientId.substring(0, 10)}...)` : '❌ Missing');
    console.log('Client Secret:', this.clientSecret ? `✅ Set (${this.clientSecret.substring(0, 10)}...)` : '❌ Missing'); 
    console.log('Refresh Token:', this.refreshToken ? `✅ Set (${this.refreshToken.substring(0, 10)}...)` : '❌ Missing');

    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error('Missing Zoho configuration. Please check ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN in .env file.');
    }
    console.log('✅ Zoho configuration validation passed');
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`🔍 ZohoService: ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  /**
   * 🆕 FIXED: Get all available fields by analyzing actual venue data
   */
  public async getAvailableFields(forceRefresh: boolean = false): Promise<string[]> {
    try {
      // Check cache first
      const now = Date.now();
      if (!forceRefresh && this.availableFields.length > 0 && (now - this.fieldsLastFetched) < this.fieldsCacheDuration) {
        console.log(`🔄 Using cached fields (${this.availableFields.length} fields)`);
        return this.availableFields;
      }

      console.log('🔍 Discovering fields by analyzing actual venue data...');

      // 🆕 METHOD 1: Try the fields API first (if it works)
      try {
        const fieldsResponse = await this.apiRequest<{
          fields: Array<{
            api_name: string;
            field_label: string;
            data_type: string;
            visible: boolean;
            read_only: boolean;
            custom_field: boolean;
          }>;
        }>('GET', '/settings/fields?module=Accounts');

        if (fieldsResponse.fields && fieldsResponse.fields.length > 15) {
          console.log(`✅ Fields API returned ${fieldsResponse.fields.length} fields`);
          const apiFields = fieldsResponse.fields
            .map(field => field.api_name)
            .sort();
          
          this.availableFields = apiFields;
          this.fieldsLastFetched = now;
          return apiFields;
        } else {
          console.log('⚠️ Fields API returned limited data, falling back to data analysis...');
        }
      } catch (error) {
        console.log('⚠️ Fields API failed, falling back to data analysis...');
      }

      // 🆕 METHOD 2: Use a single venue to discover ALL available fields
      console.log('🔍 Fetching single venue to discover all available fields...');
      
      // First, get a list of venues with minimal fields to get IDs
      const venueListResponse = await this.apiRequest<{
        data: Array<{ id: string; Account_Name: string }>;
        info: any;
      }>('GET', `/Accounts?fields=id,Account_Name&per_page=5`);
      
      if (!venueListResponse.data || venueListResponse.data.length === 0) {
        console.log('⚠️ No venues found for field analysis, using fallback');
        throw new Error('No venues available for field discovery');
      }

      // Get the first venue ID
      const sampleVenueId = venueListResponse.data[0].id;
      console.log(`🔍 Using venue ${sampleVenueId} for complete field discovery...`);

      // 🆕 FIXED: Get single venue WITHOUT fields parameter (gets ALL fields)
      const singleVenueResponse = await this.apiRequest<{
        data: any[];
        info: any;
      }>('GET', `/Accounts/${sampleVenueId}`);
      
      if (singleVenueResponse.data && singleVenueResponse.data.length > 0) {
        const sampleVenue = singleVenueResponse.data[0];
        const discoveredFields = Object.keys(sampleVenue).sort();
        
        console.log(`✅ Field discovery complete: Found ${discoveredFields.length} total fields from single venue`);
        console.log(`🔍 Sample discovered fields:`, discoveredFields.slice(0, 20));
        
        // Cache the results
        this.availableFields = discoveredFields;
        this.fieldsLastFetched = now;
        
        return discoveredFields;
      } else {
        throw new Error('Failed to get venue data for field discovery');
      }

    } catch (error: any) {
      console.error('❌ Error in field discovery:', error);
      
      // 🆕 ENHANCED FALLBACK: Use your exact known field list
      const knownFields = [
        // System fields
        'id', 'Owner', 'Created_Time', 'Modified_Time', 'Created_By', 'Modified_By',
        
        // Standard fields  
        'Account_Name', 'Account_Number', 'Account_Type', 'Phone', 'Website', 'Industry',
        'Description', 'Rating', 'Employees', 'Annual_Revenue', 'Fax',
        
        // Address fields
        'Billing_Street', 'Billing_City', 'Billing_State', 'Billing_Code', 'Billing_Country',
        'Shipping_Street', 'Shipping_City', 'Shipping_State', 'Shipping_Code', 'Shipping_Country',
        
        // 🆕 Your exact custom fields (the ones you listed)
        'HL_Price_Level', 'PW', 'Latitude', 'HL_Photo_Ref', 'HL_Photo_Count', 'Noise_Level',
        'HL_Place_ID', 'Charging_Ports', 'Wifi_SSID', 'Pub_Wifi', 'HL_Ratings_Count',
        'HL_Opening_Hours_Text', 'Longitude', 'HL_Distance_km_from_center', 'Curr_Wifi_Display_Method'
      ];
      
      console.log(`🔄 Using enhanced fallback with ${knownFields.length} known fields`);
      this.availableFields = knownFields;
      this.fieldsLastFetched = Date.now();
      return knownFields;
    }
  }

  /**
   * 🆕 SMART: Get optimized field list (respects 50-field limit with priority)
   */
  private async getOptimizedFields(): Promise<string[]> {
    try {
      const allFields = await this.getAvailableFields();
      
      if (allFields.length <= 50) {
        console.log(`📋 Using all ${allFields.length} fields (within 50-field limit)`);
        return allFields;
      }

      // If more than 50 fields, prioritize them
      console.log(`📋 Found ${allFields.length} fields, selecting top 50 most important...`);

      // Priority-based field selection
      const highPriorityFields = [
        'Account_Name', 'id', 'Owner', 'Created_Time', 'Modified_Time',
        'Phone', 'Website', 'Billing_Street', 'Billing_City', 'Billing_State',
        'Billing_Code', 'Billing_Country', 'Industry', 'Description', 'Annual_Revenue'
      ];

      // Custom fields (your venue-specific fields)
      const customFieldPriority = allFields.filter(field => 
        field.includes('HL_') || 
        field.includes('Wifi') || 
        field.includes('Payment') ||
        field.includes('Speed_MBPS') ||
        field.includes('Charging') ||
        field.includes('AC_') ||
        field.includes('Noise') ||
        field.includes('Latitude') ||
        field.includes('Longitude') ||
        field.includes('PW') ||
        field.includes('Pub_')
      );

      // Combine priority fields with remaining fields up to 50
      const prioritizedFields = [
        ...highPriorityFields.filter(field => allFields.includes(field)),
        ...customFieldPriority,
        ...allFields.filter(field => 
          !highPriorityFields.includes(field) && 
          !customFieldPriority.includes(field)
        )
      ].slice(0, 50); // Take only first 50

      const uniqueFields = [...new Set(prioritizedFields)];
      
      console.log(`📋 Selected ${uniqueFields.length} priority fields out of ${allFields.length} total`);
      console.log(`🔍 Priority fields include:`, uniqueFields.slice(0, 20));
      
      return uniqueFields;

    } catch (error: any) {
      console.error('❌ Error getting optimized fields:', error);
      return await this.getAvailableFields(); // Fallback to all available fields
    }
  }

  /**
   * 🆕 ADMIN: Force refresh field cache
   */
  public async refreshFieldCache(): Promise<{
    success: boolean;
    message: string;
    fields_discovered: number;
    fields_list: string[];
  }> {
    try {
      console.log('🔄 Force refreshing field cache...');
      
      // Force clear the cache first
      this.availableFields = [];
      this.fieldsLastFetched = 0;
      
      // Now get fresh fields with force refresh
      const fields = await this.getAvailableFields(true);
      
      console.log(`✅ Field cache refreshed: ${fields.length} fields discovered`);
      
      return {
        success: true,
        message: 'Field cache refreshed successfully',
        fields_discovered: fields.length,
        fields_list: fields
      };
    } catch (error: any) {
      console.error('❌ Error refreshing field cache:', error);
      return {
        success: false,
        message: `Failed to refresh field cache: ${error.message}`,
        fields_discovered: 0,
        fields_list: []
      };
    }
  }

  /**
   * 🆕 Helper method to calculate venue data completeness
   */
  private calculateVenueCompleteness(venue: any): number {
    const importantFields = [
      'Account_Name', 'Phone', 'Website', 'Billing_City', 'Billing_State',
      'Industry', 'Description', 'Latitude', 'Longitude', 'HL_Place_ID',
      'HL_Opening_Hours_Text', 'HL_Ratings_Count'
    ];

    const filledFields = importantFields.filter(field => {
      const value = venue[field];
      return value !== null && value !== undefined && value !== '';
    });

    return Math.round((filledFields.length / importantFields.length) * 100);
  }

  /**
   * Get fresh access token with proper concurrency control
   */
  public async getAccessToken(): Promise<string> {
    if (this.isRefreshing) {
      console.log('⏳ Token refresh in progress, waiting...');
      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (!this.isRefreshing && this.accessToken) {
          return this.accessToken;
        }
      }
      throw new Error('Token refresh timeout');
    }

    if (this.accessToken && this.tokenExpiry && Date.now() < (this.tokenExpiry - 300000)) {
      this.log('Using cached access token');
      return this.accessToken;
    }

    this.isRefreshing = true;

    try {
      console.log('🔄 Refreshing Zoho access token...');

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken
      });

      const response: AxiosResponse<ZohoTokenResponse> = await axios.post(
        this.authURL,
        params,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000
        }
      );

      if (!response.data.access_token) {
        throw new Error('No access token received from Zoho');
      }

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + ((response.data.expires_in - 300) * 1000);

      console.log('✅ Zoho access token refreshed successfully');      
      return this.accessToken;

    } catch (error: any) {
      console.error('❌ Failed to refresh Zoho token:', error.response?.data || error.message);
      throw new Error(`Failed to authenticate with Zoho CRM: ${error.message}`);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Make authenticated API request with fixed retry logic
   */
  public async apiRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
    retryCount: number = 0
  ): Promise<T> {
    try {
      const token = await this.getAccessToken();
      
      this.log(`Making ${method} request to: ${endpoint}`);

      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        data: data || undefined
      };

      const response: AxiosResponse<T> = await axios(config);
      
      this.log(`✅ API request successful`, {
        status: response.status,
        endpoint: endpoint
      });

      return response.data;

    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 401 && retryCount === 0) {
        console.log('🔄 Got 401, clearing token cache and retrying ONCE...');
        
        this.accessToken = null;
        this.tokenExpiry = null;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return this.apiRequest<T>(method, endpoint, data, retryCount + 1);
      }
      
      console.error('❌ Zoho API error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        endpoint: endpoint,
        url: `${this.baseURL}${endpoint}`,
        retryCount: retryCount
      });

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        throw new Error(
          `Zoho API error: ${axiosError.response?.status} ${axiosError.response?.statusText} - ${JSON.stringify(axiosError.response?.data) || axiosError.message}`
        );
      }
      
      throw error;
    }
  }

  // READ METHODS

  public async healthCheck(): Promise<ZohoHealthResponse> {
    try {
      console.log('🏥 Performing Zoho CRM health check...');
      const fields = 'Account_Name,Modified_Time';
      const endpoint = `/Accounts?fields=${encodeURIComponent(fields)}&per_page=1`;
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
      const accountsFound = response.data?.length || 0;
      const totalCount = response.info?.count || 0;
      const firstAccountName = response.data?.[0]?.Account_Name || 'N/A';
      
      return {
        success: true,
        status: 'Connected to Zoho CRM (Accounts module)',
        org: `Found ${totalCount} total accounts${accountsFound > 0 ? ` (Sample: "${firstAccountName}")` : ''}`
      };
    } catch (error: any) {
      return {
        success: false,
        status: 'Failed to connect to Zoho CRM',
        error: error.message
      };
    }
  }

  /**
   * 🆕 DYNAMIC: Get venues with automatically discovered fields
   */
  public async getVenues(page: number = 1, perPage: number = 200): Promise<VenuesListResponse> {
    try {
      console.log(`📋 Fetching venues page ${page} (${perPage} per page) with DYNAMIC FIELDS...`);

      const validPage = Math.max(1, Math.floor(page));
      const validPerPage = Math.min(200, Math.max(1, Math.floor(perPage)));

      // 🆕 Get optimized fields dynamically
      const fields = await this.getOptimizedFields();
      const fieldsParam = fields.join(',');
      
      console.log(`🔍 Using ${fields.length} dynamically discovered fields`);
      console.log(`🔍 Sample fields:`, fields.slice(0, 15).join(', ') + (fields.length > 15 ? '...' : ''));
      
      const endpoint = `/Accounts?fields=${encodeURIComponent(fieldsParam)}&page=${validPage}&per_page=${validPerPage}&sort_by=Modified_Time&sort_order=desc`;
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
      console.log(`✅ Retrieved ${response.data?.length || 0} venues with ${fields.length} dynamic fields`);
      
      // Log field usage statistics
      if (response.data && response.data.length > 0) {
        const sampleVenue = response.data[0];
        const returnedFields = Object.keys(sampleVenue);
        const customFields = returnedFields.filter(field => 
          field.includes('HL_') || field.includes('Wifi') || field.includes('Payment') ||
          field.includes('Charging') || field.includes('Latitude') || field.includes('Longitude')
        );
        
        console.log(`📊 Field statistics:`, {
          requested: fields.length,
          returned: returnedFields.length,
          custom_fields: customFields.length,
          coverage: `${Math.round((returnedFields.length / fields.length) * 100)}%`
        });
      }
      
      return {
        success: true,
        message: `Venues retrieved with ${fields.length} dynamically discovered fields`,
        data: response.data || [],
        info: response.info,
        pagination: {
          page: validPage,
          perPage: validPerPage,
          hasMore: response.info?.more_records || false,
          count: response.data?.length || 0
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to fetch venues: ${error.message}`,
        data: [],
        pagination: { page, perPage, hasMore: false, count: 0 }
      };
    }
  }

  /**
   * 🆕 SPECIAL: Get venues with ALL fields (no 50-field limit) by fetching individually
   */
  public async getVenuesAllFields(page: number = 1, perPage: number = 10): Promise<VenuesListResponse> {
    try {
      console.log(`📋 Fetching venues with ALL FIELDS (no limit)...`);

      const validPage = Math.max(1, Math.floor(page));
      const validPerPage = Math.min(20, Math.max(1, Math.floor(perPage))); // Smaller limit for all fields

      // First get venue IDs with minimal fields
      const venueListResponse = await this.apiRequest<{
        data: Array<{ id: string; Account_Name: string }>;
        info: any;
      }>('GET', `/Accounts?fields=id,Account_Name&page=${validPage}&per_page=${validPerPage}&sort_by=Modified_Time&sort_order=desc`);
      
      if (!venueListResponse.data || venueListResponse.data.length === 0) {
        return {
          success: true,
          message: 'No venues found',
          data: [],
          pagination: { page: validPage, perPage: validPerPage, hasMore: false, count: 0 }
        };
      }

      // Get each venue individually to get ALL fields
      console.log(`🔍 Fetching ${venueListResponse.data.length} venues with ALL available fields...`);
      
      const venuesWithAllFields = [];
      for (const venueInfo of venueListResponse.data) {
        try {
          const fullVenueResponse = await this.apiRequest<{
            data: any[];
          }>('GET', `/Accounts/${venueInfo.id}`);
          
          if (fullVenueResponse.data && fullVenueResponse.data.length > 0) {
            const venue = fullVenueResponse.data[0];
            
            // Enhance with computed data
            venue._field_count = Object.keys(venue).length;
            venue._custom_fields = Object.keys(venue).filter(field => 
              field.includes('HL_') || field.includes('Wifi') || field.includes('Charging') ||
              field.includes('Mapsly') || field.includes('Payment')
            );
            venue._has_location = !!(venue.Latitude || venue.Latitude_Mapsly_text_singleLine);
            venue._data_completeness = this.calculateVenueCompleteness(venue);
            
            venuesWithAllFields.push(venue);
          }
        } catch (error: any) {
          console.warn(`⚠️ Failed to get full data for venue ${venueInfo.id}:`, error.message);
        }
      }

      console.log(`✅ Retrieved ${venuesWithAllFields.length} venues with ALL available fields`);
      
      if (venuesWithAllFields.length > 0) {
        const fieldCount = venuesWithAllFields[0]._field_count || Object.keys(venuesWithAllFields[0]).length;
        console.log(`📊 Each venue has ${fieldCount} total fields`);
      }
      
      return {
        success: true,
        message: `Venues retrieved with ALL available fields (${venuesWithAllFields.length} venues)`,
        data: venuesWithAllFields,
        info: venueListResponse.info,
        pagination: {
          page: validPage,
          perPage: validPerPage,
          hasMore: venueListResponse.info?.more_records || false,
          count: venuesWithAllFields.length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to fetch venues with all fields: ${error.message}`,
        data: [],
        pagination: { page, perPage, hasMore: false, count: 0 }
      };
    }
  }

  /**
   * 🆕 DYNAMIC: Get single venue with ALL available fields (no 50-field limit)
   */
  public async getVenueById(venueId: string): Promise<VenueDetailsResponse> {
    try {
      console.log(`📍 Fetching venue ${venueId} with ALL AVAILABLE FIELDS...`);

      // For single records, we can get ALL fields (no limit)
      const endpoint = `/Accounts/${venueId}`;
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
      if (response.data && response.data.length > 0) {
        const venue = response.data[0];
        const fieldCount = Object.keys(venue).length;
        console.log(`📍 Retrieved venue with ${fieldCount} total fields (all available)`);
        
        // Log some interesting field statistics
        const customFields = Object.keys(venue).filter(field => 
          field.includes('HL_') || field.includes('Wifi') || field.includes('Payment') || 
          field.includes('AC_') || field.includes('Charging') || field.includes('Speed_MBPS') ||
          field.includes('Latitude') || field.includes('Longitude')
        );
        
        console.log(`📊 Field breakdown for venue:`, {
          total_fields: fieldCount,
          custom_venue_fields: customFields.length,
          has_location: !!(venue as any).Latitude && !!(venue as any).Longitude,
          has_wifi_info: !!(venue as any).Wifi_SSID,
          has_hours: !!(venue as any).HL_Opening_Hours_Text,
          custom_field_names: customFields.slice(0, 10)
        });
      }
      
      return {
        success: true,
        message: 'Venue details retrieved with all available fields',
        data: response.data?.[0] || null
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to fetch venue details: ${error.message}`,
        data: null
      };
    }
  }

  // WRITE METHODS

  /**
   * CREATE: Add a new venue to Zoho CRM
   */
  public async createVenue(venueData: Partial<ZohoVenue>): Promise<{
    success: boolean;
    message: string;
    data?: ZohoVenue;
    zoho_id?: string;
    error?: string;
  }> {
    try {
      console.log('➕ Creating new venue in Zoho CRM...');

      // Validate required fields
      if (!venueData.Account_Name) {
        throw new Error('Account_Name is required to create a venue');
      }

      // Prepare the data payload
      const createPayload = {
        data: [
          {
            ...venueData,
            // Ensure required fields are present
            Account_Name: venueData.Account_Name,
            // Add any default values if needed
            ...(venueData.Phone && { Phone: venueData.Phone }),
            ...(venueData.Website && { Website: venueData.Website }),
            ...(venueData.Billing_City && { Billing_City: venueData.Billing_City }),
            ...(venueData.Industry && { Industry: venueData.Industry }),
          }
        ]
      };

      console.log(`📝 Creating venue: "${venueData.Account_Name}"`);
      this.log('Create payload', createPayload);

      const response = await this.apiRequest<{
        data: Array<{
          code: string;
          details: { id: string };
          message: string;
          status: string;
        }>;
      }>('POST', '/Accounts', createPayload);

      if (response.data && response.data.length > 0 && response.data[0].code === 'SUCCESS') {
        const createdId = response.data[0].details.id;
        console.log(`✅ Venue created successfully with ID: ${createdId}`);

        // Fetch the created venue to return complete data
        const createdVenueResult = await this.getVenueById(createdId);

        return {
          success: true,
          message: 'Venue created successfully in Zoho CRM',
          data: createdVenueResult.data || undefined,
          zoho_id: createdId
        };
      } else {
        throw new Error(response.data?.[0]?.message || 'Unknown error creating venue');
      }

    } catch (error: any) {
      console.error('❌ Error creating venue:', error);
      return {
        success: false,
        message: 'Failed to create venue in Zoho CRM',
        error: error.message
      };
    }
  }

  /**
   * UPDATE: Modify an existing venue in Zoho CRM
   */
  public async updateVenue(venueId: string, venueData: Partial<ZohoVenue>): Promise<{
    success: boolean;
    message: string;
    data?: ZohoVenue;
    error?: string;
  }> {
    try {
      console.log(`✏️ Updating venue ${venueId} in Zoho CRM...`);

      // Remove read-only fields that shouldn't be updated
      const { id, Created_Time, Created_By, Modified_Time, Modified_By, Owner, ...updateData } = venueData;

      const updatePayload = {
        data: [
          {
            id: venueId,
            ...updateData
          }
        ]
      };

      console.log(`📝 Updating venue fields:`, Object.keys(updateData));
      this.log('Update payload', updatePayload);

      const response = await this.apiRequest<{
        data: Array<{
          code: string;
          details: { id: string };
          message: string;
          status: string;
        }>;
      }>('PUT', '/Accounts', updatePayload);

      if (response.data && response.data.length > 0 && response.data[0].code === 'SUCCESS') {
        console.log(`✅ Venue ${venueId} updated successfully`);

        // Fetch the updated venue to return complete data
        const updatedVenueResult = await this.getVenueById(venueId);

        return {
          success: true,
          message: 'Venue updated successfully in Zoho CRM',
          data: updatedVenueResult.data || undefined
        };
      } else {
        throw new Error(response.data?.[0]?.message || 'Unknown error updating venue');
      }

    } catch (error: any) {
      console.error('❌ Error updating venue:', error);
      return {
        success: false,
        message: 'Failed to update venue in Zoho CRM',
        error: error.message
      };
    }
  }

  /**
   * DELETE: Remove a venue from Zoho CRM (move to trash)
   */
  public async deleteVenue(venueId: string): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    try {
      console.log(`🗑️ Deleting venue ${venueId} from Zoho CRM...`);

      const response = await this.apiRequest<{
        data: Array<{
          code: string;
          details: { id: string };
          message: string;
          status: string;
        }>;
      }>('DELETE', `/Accounts?ids=${venueId}`);

      if (response.data && response.data.length > 0 && response.data[0].code === 'SUCCESS') {
        console.log(`✅ Venue ${venueId} deleted successfully`);

        return {
          success: true,
          message: 'Venue deleted successfully from Zoho CRM'
        };
      } else {
        throw new Error(response.data?.[0]?.message || 'Unknown error deleting venue');
      }

    } catch (error: any) {
      console.error('❌ Error deleting venue:', error);
      return {
        success: false,
        message: 'Failed to delete venue from Zoho CRM',
        error: error.message
      };
    }
  }

  /**
   * BULK CREATE: Add multiple venues at once
   */
  public async createVenuesBulk(venuesData: Partial<ZohoVenue>[]): Promise<{
    success: boolean;
    message: string;
    created: number;
    failed: number;
    results: Array<{ success: boolean; zoho_id?: string; error?: string }>;
  }> {
    try {
      console.log(`➕ Creating ${venuesData.length} venues in bulk...`);

      // Validate all venues have required fields
      const validVenues = venuesData.filter(venue => venue.Account_Name);
      if (validVenues.length !== venuesData.length) {
        console.warn(`⚠️ ${venuesData.length - validVenues.length} venues missing Account_Name, skipping`);
      }

      const bulkPayload = {
        data: validVenues.map(venue => ({
          Account_Name: venue.Account_Name,
          ...venue
        }))
      };

      const response = await this.apiRequest<{
        data: Array<{
          code: string;
          details: { id: string };
          message: string;
          status: string;
        }>;
      }>('POST', '/Accounts', bulkPayload);

      const results = response.data.map(result => ({
        success: result.code === 'SUCCESS',
        zoho_id: result.code === 'SUCCESS' ? result.details.id : undefined,
        error: result.code !== 'SUCCESS' ? result.message : undefined
      }));

      const created = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log(`✅ Bulk create completed: ${created} created, ${failed} failed`);

      return {
        success: true,
        message: `Bulk create completed: ${created} created, ${failed} failed`,
        created,
        failed,
        results
      };

    } catch (error: any) {
      console.error('❌ Error in bulk create:', error);
      return {
        success: false,
        message: 'Bulk create failed',
        created: 0,
        failed: venuesData.length,
        results: venuesData.map(() => ({ success: false, error: error.message }))
      };
    }
  }

  public async searchVenues(searchTerm: string): Promise<VenueSearchResponse> {
    try {
      console.log(`🔍 Searching venues for: ${searchTerm} with essential fields...`);

      const essentialFields = [
        'Account_Name', 'Phone', 'Website', 'Billing_City', 'Billing_State', 'Billing_Country',
        'Industry', 'Owner', 'Description', 'Rating', 'HL_Distance_km_from_center', 
        'HL_Opening_Hours_Text', 'Payment_options', 'Wifi_SSID', 'Noise_Level', 
        'Latitude', 'Longitude', 'HL_Place_ID', 'Modified_Time'
      ];

      const endpoint = `/Accounts/search?criteria=(Account_Name:starts_with:${encodeURIComponent(searchTerm)}) or (Billing_City:starts_with:${encodeURIComponent(searchTerm)})&fields=${encodeURIComponent(essentialFields.join(','))}`;
      
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
      return {
        success: true,
        message: `Search results for "${searchTerm}" with essential fields`,
        data: response.data || [],
        count: response.data?.length || 0
      };

    } catch (error: any) {
      console.error('❌ Error searching venues:', error);
      return {
        success: false,
        message: `Search failed: ${error.message}`,
        data: [],
        count: 0
      };
    }
  }

  public async searchVenuesByCOQL(query: string): Promise<VenueSearchResponse> {
    console.log(`⚠️ COQL not available due to scope restrictions`);
    
    return {
      success: true,
      message: 'COQL not available - using fallback',
      data: [],
      count: 0
    };
  }

  /**
   * 🔧 DEBUG: Test field discovery directly
   */
  public async debugFieldDiscovery(): Promise<any> {
    try {
      console.log('🔧 DEBUG: Testing field discovery...');
      
      // Test direct API call
      const response = await this.apiRequest<{
        data: any[];
        info: any;
      }>('GET', `/Accounts?fields=id,Account_Name&per_page=5`);
      
      if (response.data && response.data.length > 0) {
        const sampleVenue = response.data[0];
        const fields = Object.keys(sampleVenue);
        
        console.log('✅ DEBUG: Sample venue fields found:', fields);
        
        return {
          success: true,
          sample_venue_id: sampleVenue.id,
          fields_found: fields,
          total_fields: fields.length,
          custom_fields: fields.filter(f => 
            f.includes('HL_') || f.includes('Wifi') || f.includes('Charging')
          ),
          sample_venue_data: sampleVenue
        };
      }
      
      return { success: false, message: 'No venues found' };
      
    } catch (error: any) {
      console.error('❌ DEBUG: Field discovery test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new ZohoService();
