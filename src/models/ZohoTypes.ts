// Zoho API Types
export interface ZohoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface ZohoAPIResponse<T> {
  data: T[];
  info: {
    count: number;
    page: number;
    per_page: number;
    more_records: boolean;
  };
}

/**
 * Complete ZohoVenue interface with ALL 50+ fields (standard + custom)
 */
export interface ZohoVenue {
  // Primary identifier
  id: string;

  // Standard Account Fields
  Account_Name: string;
  Account_Number?: string;
  Account_Owner?: string;
  Account_Site?: string;
  Account_Type?: string;
  Annual_Revenue?: number;
  Billing_City?: string;
  Billing_Code?: string;
  Billing_Country?: string;
  Billing_State?: string;
  Billing_Street?: string;
  Description?: string;
  Employees?: number;
  Fax?: string;
  Industry?: string;
  Ownership?: string;
  Parent_Account?: any;
  Phone?: string;
  Rating?: string;
  Shipping_City?: string;
  Shipping_Code?: string;
  Shipping_Country?: string;
  Shipping_State?: string;
  Shipping_Street?: string;
  SIC_Code?: string;
  Ticker_Symbol?: string;
  Website?: string;
  
  // System fields
  Owner?: {
    name: string;
    id: string;
    email?: string;
  };
  Created_Time: string;
  Modified_Time: string;
  Created_By?: {
    name: string;
    id: string;
  };
  Modified_By?: {
    name: string;
    id: string;
  };

  // Your Custom Fields (from your Zoho CRM)
  AC_Fan?: string | boolean;
  Account_Image?: string;
  Charging_Ports?: string | boolean;
  Connected_To?: string;
  Curr_Wifi_Display_Method?: string;
  DL_Speed_MBPS?: number;
  HL_Distance_km_from_center?: number;
  HL_Opening_Hours_Text?: string;
  HL_Photo_Count?: number;
  HL_Photo_Ref?: string;
  HL_Place_ID?: string;
  HL_Price_Level?: number;
  HL_Ratings_Count?: number;
  Latitude?: number;
  Longitude?: number;
  Noise_Level?: string;
  Payment_options?: string;
  Photo_of_charging_ports?: string;
  Pub_Wifi?: string | boolean;
  PW?: string;
  UL_Speed_MBPS?: number;
  Wifi_SSID?: string;

  // Additional common custom fields that might exist
  Address?: string;
  City?: string;
  State?: string;
  Country?: string;
  Postal_Code?: string;
  Territory?: string;
  Lead_Source?: string;
  Tags?: string[];
  Status?: string;
  Priority?: string;
  Type?: string;
  Classification?: string;
  
  // Business specific fields
  Operating_Hours?: string;
  Email?: string;
  Secondary_Email?: string;
  Mobile?: string;
  Alternate_Phone?: string;
  Contact_Person?: string;
  Manager_Name?: string;
  Manager_Email?: string;
  Manager_Phone?: string;
  
  // Location and accessibility
  Floor_Number?: number;
  Building_Name?: string;
  Landmark?: string;
  Accessibility_Features?: string;
  Parking_Available?: boolean;
  Public_Transport_Access?: string;
  
  // Venue specific amenities
  Seating_Capacity?: number;
  Private_Rooms?: boolean;
  Meeting_Rooms?: boolean;
  Presentation_Equipment?: boolean;
  Kitchen_Access?: boolean;
  Coffee_Available?: boolean;
  Food_Options?: string;
  Alcohol_Served?: boolean;
  
  // Tech amenities
  WiFi_Password?: string;
  WiFi_Speed?: string;
  Power_Outlets?: number;
  Charging_Stations?: number;
  Computer_Access?: boolean;
  Printer_Access?: boolean;
  Projector_Available?: boolean;
  Audio_System?: boolean;
  Video_Conferencing?: boolean;
  
  // Ratings and reviews
  Overall_Rating?: number;
  Service_Rating?: number;
  Ambiance_Rating?: number;
  Value_Rating?: number;
  Cleanliness_Rating?: number;
  Review_Count?: number;
  
  // Pricing
  Average_Price_Per_Hour?: number;
  Minimum_Spend?: number;
  Deposit_Required?: boolean;
  Cancellation_Policy?: string;
  Payment_Methods_Accepted?: string;
  
  // Social media and web presence
  Facebook_URL?: string;
  Instagram_URL?: string;
  Twitter_URL?: string;
  LinkedIn_URL?: string;
  Google_Maps_URL?: string;
  
  // Internal tracking
  Last_Updated_By?: string;
  Data_Source?: string;
  Verification_Status?: string;
  Quality_Score?: number;
  Featured?: boolean;
  Active?: boolean;
  
  // Flexible field for any additional properties
  [key: string]: any;
}

export interface ZohoHealthCheck {
  company_name: string;
  org_id: string;
  zgid: string;
  phone: string;
  website: string;
  primary_email: string;
  country: string;
  time_zone: string;
  currency: string;
}

export interface VenuesListResponse {
  success: boolean;
  message: string;
  data: ZohoVenue[];
  pagination: {
    page: number;
    perPage: number;
    hasMore: boolean;
    count: number;
  };
  info?: any;
  meta?: {
    total_fields_requested?: number;
    total_fields_returned?: number;
    custom_fields_count?: number;
    timestamp?: string;
  };
}

export interface VenueSearchResponse {
  success: boolean;
  message: string;
  data: ZohoVenue[];
  count: number;
  meta?: {
    search_term?: string;
    total_fields_returned?: number;
    timestamp?: string;
  };
}

export interface VenueDetailsResponse {
  success: boolean;
  message: string;
  data: ZohoVenue | null;
  meta?: {
    venue_id?: string;
    total_fields_returned?: number;
    timestamp?: string;
  };
}

export interface ZohoHealthResponse {
  success: boolean;
  status: string;
  org?: string;
  error?: string;
  meta?: {
    timestamp?: string;
    connection_test?: string;
  };
}

/**
 * Zoho Field Metadata (for debugging field availability)
 */
export interface ZohoFieldMetadata {
  api_name: string;
  field_label: string;
  data_type: string;
  required: boolean;
  custom_field: boolean;
  visible: boolean;
  read_only: boolean;
  field_read_only: boolean;
  system_mandatory: boolean;
}

/**
 * Zoho User Info (for permission debugging)
 */
export interface ZohoUserInfo {
  id: string;
  full_name: string;
  email: string;
  role: {
    name: string;
    id: string;
  };
  profile: {
    name: string;
    id: string;
  };
  status: string;
  reporting_to?: {
    name: string;
    id: string;
  };
}

/**
 * Enhanced API response with field debugging
 */
export interface ZohoDebugResponse {
  success: boolean;
  message: string;
  data?: any;
  debug?: {
    fields_requested: string[];
    fields_returned: string[];
    missing_fields: string[];
    total_fields: number;
    custom_fields: number;
    timestamp: string;
  };
}

/**
 * Zoho Module Settings Response
 */
export interface ZohoModuleResponse {
  modules: Array<{
    api_name: string;
    module_name: string;
    id: string;
    creatable: boolean;
    editable: boolean;
    deletable: boolean;
    web_link: string;
    singular_label: string;
    plural_label: string;
    visibility: number;
  }>;
}

/**
 * Zoho Fields Response
 */
export interface ZohoFieldsResponse {
  fields: ZohoFieldMetadata[];
}

/**
 * Cache sync status types
 */
export type SyncStatus = 'synced' | 'pending' | 'error';

/**
 * Cache health status
 */
export type CacheHealth = 'healthy' | 'warning' | 'error';

/**
 * Sync operation types
 */
export type SyncType = 'full' | 'delta' | 'smart' | 'manual';

/**
 * API source types
 */
export type DataSource = 'zoho_direct' | 'mongodb_cache' | 'hybrid';

/**
 * Enhanced venue with cache metadata
 */
export interface CachedZohoVenue extends ZohoVenue {
  cache_meta?: {
    cached_at: string;
    synced_at: string;
    sync_status: SyncStatus;
    data_source: DataSource;
    field_count: number;
  };
}
