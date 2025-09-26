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

  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID || '';
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET || '';
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN || '';
    this.dc = process.env.ZOHO_DC || 'in';
    this.baseURL = `https://www.zohoapis.${this.dc}/crm/v4`;
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
   * Get the most important 50 fields (respecting Zoho's limit)
   */
  private getMostImportantFields(): string[] {
    return [
      'Account_Name', 'id', 'Owner', 'Created_Time', 'Modified_Time',
      'Phone', 'Website', 'Billing_Street', 'Billing_City', 'Billing_State', 
      'Billing_Code', 'Billing_Country', 'Industry', 'Description', 'Annual_Revenue',
      'Rating', 'Employees', 'HL_Distance_km_from_center', 'HL_Opening_Hours_Text',
      'HL_Place_ID', 'HL_Ratings_Count', 'HL_Price_Level', 'Latitude', 'Longitude',
      'Wifi_SSID', 'Payment_options', 'Noise_Level', 'DL_Speed_MBPS', 'UL_Speed_MBPS',
      'Pub_Wifi', 'AC_Fan', 'Charging_Ports', 'Fax', 'Account_Number', 'Account_Type',
      'Shipping_City', 'Shipping_State', 'Shipping_Country', 'Created_By', 'Modified_By',
      'PW', 'Connected_To', 'Curr_Wifi_Display_Method', 'HL_Photo_Count', 'HL_Photo_Ref',
      'Account_Image', 'Photo_of_charging_ports'
    ];
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

  // [EXISTING READ METHODS - Keep as they are]

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

  public async getVenues(page: number = 1, perPage: number = 200): Promise<VenuesListResponse> {
    try {
      console.log(`📋 Fetching venues page ${page} (${perPage} per page) with TOP 50 FIELDS...`);

      const validPage = Math.max(1, Math.floor(page));
      const validPerPage = Math.min(200, Math.max(1, Math.floor(perPage)));
      const fields = this.getMostImportantFields();
      const fieldsParam = fields.join(',');
      
      const endpoint = `/Accounts?fields=${encodeURIComponent(fieldsParam)}&page=${validPage}&per_page=${validPerPage}&sort_by=Modified_Time&sort_order=desc`;
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
      console.log(`✅ Retrieved ${response.data?.length || 0} venues with ${fields.length} fields`);
      
      return {
        success: true,
        message: `Venues retrieved with ${fields.length} most important fields`,
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

  public async getVenueById(venueId: string): Promise<VenueDetailsResponse> {
    try {
      console.log(`📍 Fetching venue details for ID: ${venueId}...`);
      const endpoint = `/Accounts/${venueId}`;
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
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

  // [NEW WRITE METHODS - The bidirectional functionality you requested]

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

  /**
   * BULK UPDATE: Update multiple venues at once
   */
  public async updateVenuesBulk(venuesData: Array<Partial<ZohoVenue> & { id: string }>): Promise<{
    success: boolean;
    message: string;
    updated: number;
    failed: number;
    results: Array<{ success: boolean; venue_id: string; error?: string }>;
  }> {
    try {
      console.log(`✏️ Updating ${venuesData.length} venues in bulk...`);

      const bulkPayload = {
        data: venuesData.map(venue => {
          const { Created_Time, Created_By, Modified_Time, Modified_By, Owner, ...updateData } = venue;
          return updateData;
        })
      };

      const response = await this.apiRequest<{
        data: Array<{
          code: string;
          details: { id: string };
          message: string;
          status: string;
        }>;
      }>('PUT', '/Accounts', bulkPayload);

      const results = response.data.map((result, index) => ({
        success: result.code === 'SUCCESS',
        venue_id: venuesData[index].id,
        error: result.code !== 'SUCCESS' ? result.message : undefined
      }));

      const updated = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log(`✅ Bulk update completed: ${updated} updated, ${failed} failed`);

      return {
        success: true,
        message: `Bulk update completed: ${updated} updated, ${failed} failed`,
        updated,
        failed,
        results
      };

    } catch (error: any) {
      console.error('❌ Error in bulk update:', error);
      return {
        success: false,
        message: 'Bulk update failed',
        updated: 0,
        failed: venuesData.length,
        results: venuesData.map(venue => ({ success: false, venue_id: venue.id, error: error.message }))
      };
    }
  }

  // [EXISTING METHODS - Keep searchVenues and searchVenuesByCOQL as they are]

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
}

export default new ZohoService();
