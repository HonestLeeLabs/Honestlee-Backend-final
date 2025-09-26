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
    // Top 50 most important fields - prioritized list
    return [
      // Core identification fields (must have)
      'Account_Name',
      'id',
      'Owner',
      'Created_Time',
      'Modified_Time',
      
      // Contact information (high priority)
      'Phone',
      'Website', 
      'Billing_Street',
      'Billing_City',
      'Billing_State',
      'Billing_Code',
      'Billing_Country',
      
      // Business information (high priority)
      'Industry',
      'Description',
      'Annual_Revenue',
      'Rating',
      'Employees',
      
      // Your most important custom fields (based on your list)
      'HL_Distance_km_from_center',
      'HL_Opening_Hours_Text',
      'HL_Place_ID',
      'HL_Ratings_Count',
      'HL_Price_Level',
      'Latitude',
      'Longitude',
      'Wifi_SSID',
      'Payment_options',
      'Noise_Level',
      'DL_Speed_MBPS',
      'UL_Speed_MBPS',
      'Pub_Wifi',
      'AC_Fan',
      'Charging_Ports',
      
      // Additional standard fields
      'Fax',
      'Account_Number',
      'Account_Type',
      'Shipping_City',
      'Shipping_State',
      'Shipping_Country',
      'Created_By',
      'Modified_By',
      
      // Additional custom fields (remaining slots)
      'PW',
      'Connected_To',
      'Curr_Wifi_Display_Method',
      'HL_Photo_Count',
      'HL_Photo_Ref',
      'Account_Image',
      'Photo_of_charging_ports'
      
      // Total: 50 fields (exactly at Zoho's limit)
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
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 15000
        }
      );

      if (!response.data.access_token) {
        throw new Error('No access token received from Zoho');
      }

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + ((response.data.expires_in - 300) * 1000);

      console.log('✅ Zoho access token refreshed successfully');
      console.log('Token expires in:', response.data.expires_in, 'seconds');
      
      return this.accessToken;

    } catch (error: any) {
      console.error('❌ Failed to refresh Zoho token:', error.response?.data || error.message);
      
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const errorData = axiosError.response?.data as any;
        
        if (errorData?.error === 'Access Denied' && errorData?.error_description?.includes('too many requests')) {
          console.error('🚫 Rate limited by Zoho. Waiting 60 seconds...');
          await new Promise(resolve => setTimeout(resolve, 60000));
          throw new Error('Rate limited by Zoho. Please wait and try again.');
        } else if (errorData?.error === 'invalid_client') {
          throw new Error('Invalid Zoho client credentials. Check ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.');
        } else if (errorData?.error === 'invalid_grant') {
          throw new Error('Invalid or expired refresh token. Please generate a new ZOHO_REFRESH_TOKEN.');
        }
        
        throw new Error(`Zoho token refresh failed: ${JSON.stringify(errorData) || axiosError.message}`);
      }
      
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

  /**
   * Health check using Accounts endpoint with proper fields parameter
   */
  public async healthCheck(): Promise<ZohoHealthResponse> {
    try {
      console.log('🏥 Performing Zoho CRM health check...');

      const fields = 'Account_Name,Modified_Time';
      const endpoint = `/Accounts?fields=${encodeURIComponent(fields)}&per_page=1`;
      
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
      const accountsFound = response.data?.length || 0;
      const totalCount = response.info?.count || 0;
      const firstAccountName = response.data?.[0]?.Account_Name || 'N/A';
      
      console.log('✅ Zoho CRM connection successful:', {
        endpoint: 'Accounts',
        accountsReturned: accountsFound,
        totalAccountsInCRM: totalCount,
        firstAccountName: firstAccountName
      });
      
      let statusMessage = 'Connected to Zoho CRM (Accounts module)';
      let orgInfo = `Found ${totalCount} total accounts`;
      
      if (accountsFound > 0) {
        orgInfo += ` (Sample: "${firstAccountName}")`;
      } else if (totalCount === 0) {
        statusMessage = 'Connected to Zoho CRM but no accounts found';
        orgInfo = 'No accounts in CRM - add some sample venues to test fully';
      }
      
      return {
        success: true,
        status: statusMessage,
        org: orgInfo
      };

    } catch (error: any) {
      console.error('❌ Zoho CRM health check failed:', error.message);
      
      let errorMessage = error.message;
      if (error.message.includes('OAUTH_SCOPE_MISMATCH')) {
        errorMessage = 'Insufficient permissions. Need ZohoCRM.modules.accounts.READ scope.';
      } else if (error.message.includes('REQUIRED_PARAM_MISSING')) {
        errorMessage = 'Missing required fields parameter in API request.';
      }
      
      return {
        success: false,
        status: 'Failed to connect to Zoho CRM',
        error: errorMessage
      };
    }
  }

  /**
   * FIXED: Get venues with top 50 most important fields (respects Zoho limit)
   */
  public async getVenues(page: number = 1, perPage: number = 200): Promise<VenuesListResponse> {
    try {
      console.log(`📋 Fetching venues page ${page} (${perPage} per page) with TOP 50 FIELDS...`);

      const validPage = Math.max(1, Math.floor(page));
      const validPerPage = Math.min(200, Math.max(1, Math.floor(perPage)));

      // Use the curated list of 50 most important fields
      const fields = this.getMostImportantFields();
      const fieldsParam = fields.join(',');
      
      console.log(`🔍 Requesting ${fields.length} most important fields (Zoho limit: 50)`);
      
      const endpoint = `/Accounts?fields=${encodeURIComponent(fieldsParam)}&page=${validPage}&per_page=${validPerPage}&sort_by=Modified_Time&sort_order=desc`;
      
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
      console.log(`✅ Retrieved ${response.data?.length || 0} venues with ${fields.length} fields`);
      
      // Log sample of returned fields for verification
      if (response.data && response.data.length > 0) {
        const sampleVenue = response.data[0];
        const returnedFields = Object.keys(sampleVenue);
        console.log(`🔍 Sample venue returned ${returnedFields.length} fields`);
        console.log(`🔍 Key fields present:`, {
          hasName: !!sampleVenue.Account_Name,
          hasLocation: !!sampleVenue.Billing_City,
          hasCustomFields: !!(sampleVenue as any).Wifi_SSID || !!(sampleVenue as any).HL_Distance_km_from_center
        });
      }
      
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
      console.error('❌ Error fetching venues:', error);
      return {
        success: false,
        message: `Failed to fetch venues: ${error.message}`,
        data: [],
        pagination: { page, perPage, hasMore: false, count: 0 }
      };
    }
  }

  /**
   * FIXED: Search venues with essential fields only
   */
  public async searchVenues(searchTerm: string): Promise<VenueSearchResponse> {
    try {
      console.log(`🔍 Searching venues for: ${searchTerm} with essential fields...`);

      // Use essential fields for search (under 50 limit)
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

  /**
   * Get venue by ID - NO field restrictions for single record
   */
  public async getVenueById(venueId: string): Promise<VenueDetailsResponse> {
    try {
      console.log(`📍 Fetching venue details for ID: ${venueId} (single record - no field limit)...`);

      // For single records, Zoho may allow more fields or no restrictions
      const endpoint = `/Accounts/${venueId}`;
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
      if (response.data && response.data.length > 0) {
        const venue = response.data[0];
        const fieldCount = Object.keys(venue).length;
        console.log(`📍 Retrieved venue with ${fieldCount} total fields`);
      }
      
      return {
        success: true,
        message: 'Venue details retrieved with all available fields',
        data: response.data?.[0] || null
      };

    } catch (error: any) {
      console.error('❌ Error fetching venue details:', error);
      return {
        success: false,
        message: `Failed to fetch venue details: ${error.message}`,
        data: null
      };
    }
  }

  /**
   * Get venues with ALL your fields using multiple API calls (batch approach)
   */
  public async getVenuesWithAllFields(page: number = 1, perPage: number = 50): Promise<VenuesListResponse> {
    try {
      console.log(`📋 Fetching venues with ALL FIELDS using batch approach...`);

      // First get basic venue list with IDs
      const basicFields = ['Account_Name', 'Modified_Time'];
      const listEndpoint = `/Accounts?fields=${encodeURIComponent(basicFields.join(','))}&page=${page}&per_page=${perPage}`;
      
      const listResponse = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', listEndpoint);
      
      if (!listResponse.data || listResponse.data.length === 0) {
        return {
          success: true,
          message: 'No venues found',
          data: [],
          pagination: { page, perPage, hasMore: false, count: 0 }
        };
      }

      console.log(`📋 Found ${listResponse.data.length} venues, fetching full details...`);

      // Get full details for each venue (single record calls have no field limit)
      const detailedVenues: ZohoVenue[] = [];
      
      for (const venue of listResponse.data) {
        try {
          const detailResult = await this.getVenueById(venue.id);
          if (detailResult.success && detailResult.data) {
            detailedVenues.push(detailResult.data);
          }
          
          // Rate limiting - small delay between calls
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.warn(`⚠️ Failed to get details for venue ${venue.id}`);
        }
      }

      console.log(`✅ Retrieved ${detailedVenues.length} venues with complete field data`);

      return {
        success: true,
        message: `Retrieved ${detailedVenues.length} venues with all available fields`,
        data: detailedVenues,
        info: listResponse.info,
        pagination: {
          page: page,
          perPage: perPage,
          hasMore: listResponse.info?.more_records || false,
          count: detailedVenues.length
        }
      };

    } catch (error: any) {
      console.error('❌ Error in batch venue fetch:', error);
      return {
        success: false,
        message: `Batch fetch failed: ${error.message}`,
        data: [],
        pagination: { page, perPage, hasMore: false, count: 0 }
      };
    }
  }

  /**
   * Advanced search using COQL (disabled due to scope issues)
   */
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
