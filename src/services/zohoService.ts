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
  private isRefreshing: boolean = false; // Prevent concurrent token refreshes

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
   * Get fresh access token with proper concurrency control
   */
  public async getAccessToken(): Promise<string> {
    // If currently refreshing, wait for it to complete
    if (this.isRefreshing) {
      console.log('⏳ Token refresh in progress, waiting...');
      // Wait up to 10 seconds for refresh to complete
      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (!this.isRefreshing && this.accessToken) {
          return this.accessToken;
        }
      }
      throw new Error('Token refresh timeout');
    }

    // Check if current token is still valid (with 5 minute buffer for safety)
    if (this.accessToken && this.tokenExpiry && Date.now() < (this.tokenExpiry - 300000)) {
      this.log('Using cached access token');
      return this.accessToken;
    }

    // Start refresh process
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
      // Set expiry with 5 minute buffer to avoid edge cases
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
          // Wait 60 seconds before allowing retry
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
      // Handle 401 errors - but only retry ONCE to prevent infinite loop
      if (axios.isAxiosError(error) && error.response?.status === 401 && retryCount === 0) {
        console.log('🔄 Got 401, clearing token cache and retrying ONCE...');
        
        // Clear cached token
        this.accessToken = null;
        this.tokenExpiry = null;
        
        // Wait a bit to avoid rapid-fire requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Retry ONCE with incremented counter
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

    // Test with minimal required fields
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
    
    // Detailed status message
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
    
    // More detailed error handling
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
   * Get all venues (Accounts) with pagination
   */
  public async getVenues(page: number = 1, perPage: number = 200): Promise<VenuesListResponse> {
    try {
      console.log(`📋 Fetching venues page ${page} (${perPage} per page)...`);

      const validPage = Math.max(1, Math.floor(page));
      const validPerPage = Math.min(200, Math.max(1, Math.floor(perPage)));

      const fields: string[] = [
        'Account_Name', 'Phone', 'Website', 'Owner', 'Billing_Street',
        'Billing_City', 'Billing_State', 'Billing_Code', 'Billing_Country',
        'Description', 'Industry', 'Annual_Revenue', 'Rating', 'Employees',
        'Fax', 'Modified_Time', 'Created_Time', 'Created_By', 'Modified_By'
      ];

      const fieldsParam = fields.join(',');
      const endpoint = `/Accounts?fields=${encodeURIComponent(fieldsParam)}&page=${validPage}&per_page=${validPerPage}&sort_by=Modified_Time&sort_order=desc`;
      
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
      console.log(`✅ Retrieved ${response.data?.length || 0} venues from Zoho CRM`);
      
      return {
        success: true,
        message: 'Venues retrieved successfully',
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
   * Search venues by name, city, or other criteria
   */
  public async searchVenues(searchTerm: string): Promise<VenueSearchResponse> {
    try {
      console.log(`🔍 Searching venues for: ${searchTerm}`);

      const endpoint = `/Accounts/search?criteria=(Account_Name:starts_with:${encodeURIComponent(searchTerm)}) or (Billing_City:starts_with:${encodeURIComponent(searchTerm)})&fields=Account_Name,Phone,Website,Billing_City,Billing_State,Billing_Country`;
      
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
      return {
        success: true,
        message: `Search results for "${searchTerm}"`,
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
   * Get venue by ID
   */
  public async getVenueById(venueId: string): Promise<VenueDetailsResponse> {
    try {
      console.log(`📍 Fetching venue details for ID: ${venueId}`);

      const endpoint = `/Accounts/${venueId}`;
      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('GET', endpoint);
      
      return {
        success: true,
        message: 'Venue details retrieved successfully',
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
   * Advanced search using COQL (Composite Query Language)
   */
  public async searchVenuesByCOQL(query: string): Promise<VenueSearchResponse> {
    try {
      console.log(`🔍 Executing COQL query: ${query}`);

      const payload = {
        select_query: query
      };

      const response = await this.apiRequest<ZohoAPIResponse<ZohoVenue>>('POST', '/coql', payload);
      
      console.log(`✅ COQL query returned ${response.data?.length || 0} results`);
      
      return {
        success: true,
        message: 'COQL search completed successfully',
        data: response.data || [],
        count: response.data?.length || 0
      };

    } catch (error: any) {
      console.error('❌ Error executing COQL query:', error);
      return {
        success: false,
        message: `COQL query failed: ${error.message}`,
        data: [],
        count: 0
      };
    }
  }

  /**
   * Get venues by city using COQL
   */
  public async getVenuesByCity(city: string, limit: number = 200): Promise<VenueSearchResponse> {
    const query = `select Account_Name, Phone, Website, Billing_City, Billing_State, Billing_Country, Industry, Owner, Modified_Time from Accounts where (Billing_City = '${city}') limit ${Math.min(limit, 200)}`;
    
    return this.searchVenuesByCOQL(query);
  }

  /**
   * Get venues by industry
   */
  public async getVenuesByIndustry(industry: string, limit: number = 200): Promise<VenueSearchResponse> {
    const query = `select Account_Name, Phone, Website, Billing_City, Industry, Owner, Modified_Time from Accounts where (Industry = '${industry}') limit ${Math.min(limit, 200)}`;
    
    return this.searchVenuesByCOQL(query);
  }
}

export default new ZohoService();
