// =============================================================================
// ZOHO CRM API TYPE DEFINITIONS
// Complete type definitions for bidirectional Zoho CRM integration
// with dynamic field discovery and comprehensive venue management
// =============================================================================

/**
 * Base Zoho OAuth Token Response
 */
export interface ZohoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  api_domain?: string;
  token_type_hint?: string;
}

/**
 * Standard Zoho API Response Wrapper
 */
export interface ZohoAPIResponse<T> {
  data: T[];
  info: {
    count: number;
    page: number;
    per_page: number;
    more_records: boolean;
    next_page_token?: string;
    previous_page_token?: string;
  };
  message?: string;
  status?: string;
}

// =============================================================================
// TYPE UNIONS & ENUMS (DEFINED FIRST TO AVOID CONFLICTS)
// =============================================================================

/**
 * Cache synchronization status
 */
export type SyncStatus = 'synced' | 'pending' | 'error' | 'partial' | 'stale';

/**
 * Overall cache health indicator
 */
export type CacheHealth = 'healthy' | 'warning' | 'error' | 'unknown';

/**
 * Types of sync operations
 */
export type SyncType = 'full' | 'delta' | 'smart' | 'manual' | 'scheduled' | 'webhook';

/**
 * Data source indicators
 */
export type DataSource = 'zoho_direct' | 'mongodb_cache' | 'hybrid' | 'fallback';

/**
 * Field discovery modes
 */
export type FieldDiscoveryMode = 'auto' | 'manual' | 'cached' | 'hybrid';

/**
 * API operation types
 */
export type ZohoOperation = 'create' | 'read' | 'update' | 'delete' | 'search' | 'bulk_create' | 'bulk_update' | 'bulk_delete';

/**
 * Venue status types
 */
export type VenueStatus = 'active' | 'inactive' | 'pending' | 'verified' | 'suspended';

/**
 * Data quality levels
 */
export type DataQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

/**
 * 🆕 COMPLETE ZohoVenue Interface - Dynamic & Comprehensive
 * Supports 100+ potential fields with full extensibility
 */
export interface ZohoVenue {
  // ===========================================
  // CORE IDENTIFIER & SYSTEM FIELDS
  // ===========================================
  
  /** Unique Zoho record ID */
  id: string;
  
  /** Primary venue name (REQUIRED) */
  Account_Name: string;
  
  // System audit fields
  Created_Time: string;
  Modified_Time: string;
  Owner?: {
    name: string;
    id: string;
    email?: string;
    full_name?: string;
  };
  Created_By?: {
    name: string;
    id: string;
    email?: string;
  };
  Modified_By?: {
    name: string;
    id: string;
    email?: string;
  };

  // ===========================================
  // STANDARD ZOHO ACCOUNT FIELDS
  // ===========================================
  
  Account_Number?: string;
  Account_Owner?: string;
  Account_Site?: string;
  Account_Type?: string;
  Annual_Revenue?: number | string;
  Description?: string;
  Employees?: number | string;
  Fax?: string;
  Industry?: string;
  Ownership?: string;
  Parent_Account?: {
    name: string;
    id: string;
  } | string;
  Phone?: string;
  Rating?: string | number;
  SIC_Code?: string;
  Ticker_Symbol?: string;
  Website?: string;

  // ===========================================
  // BILLING & SHIPPING ADDRESS FIELDS
  // ===========================================
  
  // Billing Address
  Billing_Street?: string;
  Billing_City?: string;
  Billing_State?: string;
  Billing_Code?: string;
  Billing_Country?: string;
  
  // Shipping Address
  Shipping_Street?: string;
  Shipping_City?: string;
  Shipping_State?: string;
  Shipping_Code?: string;
  Shipping_Country?: string;

  // ===========================================
  // YOUR CUSTOM VENUE-SPECIFIC FIELDS
  // ===========================================
  
  // Venue Amenities
  AC_Fan?: string | boolean;
  Account_Image?: string;
  Charging_Ports?: string | boolean;
  Connected_To?: string;
  Curr_Wifi_Display_Method?: string;
  Photo_of_charging_ports?: string;
  
  // Internet & Connectivity
  DL_Speed_MBPS?: number;
  UL_Speed_MBPS?: number;
  Wifi_SSID?: string;
  WiFi_Password?: string;
  WiFi_Speed?: string;
  Pub_Wifi?: string | boolean;
  PW?: string;
  
  // Location & Geographic Data
  Latitude?: number;
  Longitude?: number;
  HL_Distance_km_from_center?: number;
  HL_Place_ID?: string;
  
  // Venue Details & Hours
  HL_Opening_Hours_Text?: string;
  Operating_Hours?: string;
  Noise_Level?: string;
  
  // Ratings & Reviews
  HL_Price_Level?: number;
  HL_Ratings_Count?: number;
  Overall_Rating?: number;
  Service_Rating?: number;
  Ambiance_Rating?: number;
  Value_Rating?: number;
  Cleanliness_Rating?: number;
  Review_Count?: number;
  
  // Photos & Media
  HL_Photo_Count?: number;
  HL_Photo_Ref?: string;
  
  // Payment & Pricing
  Payment_options?: string;
  Payment_Methods_Accepted?: string;
  Average_Price_Per_Hour?: number;
  Minimum_Spend?: number;
  Deposit_Required?: boolean;
  Cancellation_Policy?: string;

  // ===========================================
  // EXTENDED BUSINESS FIELDS
  // ===========================================
  
  // Additional Location Details
  Address?: string;
  City?: string;
  State?: string;
  Country?: string;
  Postal_Code?: string;
  Territory?: string;
  Floor_Number?: number;
  Building_Name?: string;
  Landmark?: string;
  
  // Business Operations
  Lead_Source?: string;
  Tags?: string[] | string;
  Status?: string;
  Priority?: string;
  Type?: string;
  Classification?: string;
  Verification_Status?: string;
  Quality_Score?: number;
  Featured?: boolean;
  Active?: boolean;
  
  // Contact Information
  Email?: string;
  Secondary_Email?: string;
  Mobile?: string;
  Alternate_Phone?: string;
  Contact_Person?: string;
  Manager_Name?: string;
  Manager_Email?: string;
  Manager_Phone?: string;

  // ===========================================
  // VENUE-SPECIFIC AMENITIES & FEATURES
  // ===========================================
  
  // Accessibility & Transportation
  Accessibility_Features?: string;
  Parking_Available?: boolean;
  Public_Transport_Access?: string;
  
  // Seating & Space
  Seating_Capacity?: number;
  Private_Rooms?: boolean;
  Meeting_Rooms?: boolean;
  
  // Equipment & Technology
  Presentation_Equipment?: boolean;
  Power_Outlets?: number;
  Charging_Stations?: number;
  Computer_Access?: boolean;
  Printer_Access?: boolean;
  Projector_Available?: boolean;
  Audio_System?: boolean;
  Video_Conferencing?: boolean;
  
  // Food & Beverage
  Kitchen_Access?: boolean;
  Coffee_Available?: boolean;
  Food_Options?: string;
  Alcohol_Served?: boolean;

  // ===========================================
  // DIGITAL PRESENCE & SOCIAL MEDIA
  // ===========================================
  
  Facebook_URL?: string;
  Instagram_URL?: string;
  Twitter_URL?: string;
  LinkedIn_URL?: string;
  Google_Maps_URL?: string;
  YouTube_URL?: string;
  TikTok_URL?: string;

  // ===========================================
  // INTERNAL TRACKING & METADATA
  // ===========================================
  
  Last_Updated_By?: string;
  Data_Source?: string;
  Import_Date?: string;
  Last_Verified?: string;
  Data_Quality_Score?: number;
  Completeness_Percentage?: number;
  
  // Campaign & Marketing
  Campaign_Source?: string;
  Marketing_Channel?: string;
  Customer_Segment?: string;
  
  // Financial & Business Metrics
  Revenue_Potential?: number;
  Customer_Value?: string;
  Business_Priority?: string;
  
  // Custom Tags & Categories
  Primary_Category?: string;
  Secondary_Category?: string;
  Venue_Style?: string;
  Target_Audience?: string;
  Unique_Features?: string;

  // ===========================================
  // FUTURE-PROOF EXTENSIBILITY
  // ===========================================
  
  /**
   * Dynamic field support - allows any additional fields
   * that may be added to Zoho CRM without code changes
   */
  [key: string]: any;
}

/**
 * 🆕 Enhanced Venue with Cache Metadata
 */
export interface CachedZohoVenue extends ZohoVenue {
  cache_meta?: {
    cached_at: string;
    synced_at: string;
    sync_status: SyncStatus;
    data_source: DataSource;
    field_count: number;
    cache_version?: string;
    sync_duration_ms?: number;
  };
}

/**
 * Zoho Organization Health Check Response
 */
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
  domain_name?: string;
  plan_type?: string;
  users_limit?: number;
}

// =============================================================================
// API RESPONSE INTERFACES
// =============================================================================

/**
 * 🆕 Enhanced Venues List Response with Dynamic Field Metadata
 */
export interface VenuesListResponse {
  success: boolean;
  message: string;
  data: ZohoVenue[];
  pagination: {
    page: number;
    perPage: number;
    hasMore: boolean;
    count: number;
    total_pages?: number;
    total_records?: number;
  };
  info?: {
    count: number;
    page: number;
    per_page: number;
    more_records: boolean;
  };
  meta?: {
    total_fields_requested?: number;
    total_fields_returned?: number;
    custom_fields_count?: number;
    standard_fields_count?: number;
    timestamp: string;
    api_version?: string;
    cache_status?: 'hit' | 'miss' | 'refresh';
    field_discovery?: {
      total_available_fields: number;
      fields_used_in_response: number;
      custom_fields_detected: number;
      field_coverage_percentage: number;
    };
  };
}

/**
 * 🆕 Enhanced Venue Search Response
 */
export interface VenueSearchResponse {
  success: boolean;
  message: string;
  data: ZohoVenue[];
  count: number;
  meta?: {
    search_term: string;
    search_type?: 'name' | 'city' | 'industry' | 'mixed';
    total_fields_returned?: number;
    search_duration_ms?: number;
    timestamp: string;
    matches_found?: {
      name_matches: number;
      city_matches: number;
      industry_matches: number;
      custom_field_matches: number;
    };
  };
}

/**
 * 🆕 Enhanced Venue Details Response
 */
export interface VenueDetailsResponse {
  success: boolean;
  message: string;
  data: ZohoVenue | null;
  meta?: {
    venue_id: string;
    total_fields_returned?: number;
    field_completeness_percentage?: number;
    last_modified?: string;
    timestamp: string;
    data_quality_score?: number;
    field_analysis?: {
      total_fields: number;
      populated_fields: number;
      custom_fields: number;
      required_fields_complete: boolean;
    };
  };
}

/**
 * 🆕 Enhanced Health Check Response
 */
export interface ZohoHealthResponse {
  success: boolean;
  status: string;
  org?: string;
  error?: string;
  meta?: {
    timestamp: string;
    connection_test: 'passed' | 'failed';
    response_time_ms?: number;
    api_version?: string;
    permissions_verified?: boolean;
  };
}

// =============================================================================
// FIELD MANAGEMENT & DISCOVERY INTERFACES
// =============================================================================

/**
 * 🆕 Comprehensive Field Metadata Interface
 */
export interface ZohoFieldMetadata {
  api_name: string;
  field_label: string;
  data_type: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'email' | 'phone' | 'url' | 'textarea' | 'picklist' | 'currency' | 'decimal';
  required: boolean;
  custom_field: boolean;
  visible: boolean;
  read_only: boolean;
  field_read_only: boolean;
  system_mandatory: boolean;
  max_length?: number;
  precision?: number;
  scale?: number;
  default_value?: any;
  tooltip?: string;
  help_text?: string;
  picklist_values?: Array<{
    display_value: string;
    actual_value: string;
    sequence_number?: number;
  }>;
  validation_rule?: {
    name: string;
    criteria: string;
  };
  field_dependency?: {
    parent_field: string;
    dependent_values: string[];
  };
}

/**
 * 🆕 Field Usage Analytics Interface
 */
export interface FieldUsageAnalytics {
  field_name: string;
  usage_count: number;
  usage_percentage: number;
  is_custom_field: boolean;
  is_required_field: boolean;
  data_type: string;
  sample_values: any[];
  null_count: number;
  empty_string_count: number;
  unique_values_count?: number;
  most_common_value?: any;
  data_quality_score: number;
}

/**
 * Zoho User Information (for permission debugging)
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
  status: 'active' | 'inactive';
  reporting_to?: {
    name: string;
    id: string;
  };
  department?: string;
  mobile?: string;
  website?: string;
  date_of_birth?: string;
  language?: string;
  locale?: string;
  time_zone?: string;
  currency?: string;
}

/**
 * 🆕 Enhanced Debug Response with Field Analysis
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
    standard_fields: number;
    field_types: Record<string, number>;
    api_call_duration_ms: number;
    timestamp: string;
    zoho_api_version?: string;
    rate_limit_info?: {
      calls_remaining: number;
      reset_time: string;
    };
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
    viewable: boolean;
    web_link: string;
    singular_label: string;
    plural_label: string;
    visibility: number;
    sequence_number?: number;
    presence_sub_menu?: boolean;
    triggers_supported?: boolean;
    search_layout_fields?: string[];
  }>;
}

/**
 * 🆕 Enhanced Fields Discovery Response
 */
export interface ZohoFieldsResponse {
  fields: ZohoFieldMetadata[];
  info?: {
    total_fields: number;
    custom_fields: number;
    standard_fields: number;
    required_fields: number;
    visible_fields: number;
    readonly_fields: number;
  };
}

// =============================================================================
// BULK OPERATIONS & BATCH INTERFACES
// =============================================================================

/**
 * Bulk Operation Result
 */
export interface BulkOperationResult {
  success: boolean;
  message: string;
  total_records: number;
  successful_records: number;
  failed_records: number;
  results: Array<{
    success: boolean;
    zoho_id?: string;
    error?: string;
    record_index?: number;
  }>;
  meta: {
    operation_type: ZohoOperation;
    batch_size: number;
    processing_time_ms: number;
    timestamp: string;
  };
}

/**
 * Field Cache Management Interface
 */
export interface FieldCacheInfo {
  total_fields: number;
  custom_fields: number;
  standard_fields: number;
  last_updated: string;
  expires_at: string;
  cache_version: string;
  is_stale: boolean;
  auto_refresh_enabled: boolean;
  next_refresh_at?: string;
}

/**
 * 🆕 Advanced Analytics Interface
 */
export interface VenueAnalytics {
  total_venues: number;
  active_venues: number;
  verified_venues: number;
  venues_by_city: Record<string, number>;
  venues_by_industry: Record<string, number>;
  average_rating: number;
  field_completeness: {
    overall_percentage: number;
    by_field: Record<string, number>;
    most_complete_venues: string[];
    least_complete_venues: string[];
  };
  data_quality: {
    overall_score: number;
    by_category: Record<string, number>;
  };
  last_updated: string;
}

// =============================================================================
// ERROR HANDLING INTERFACES
// =============================================================================

/**
 * Standardized Error Response
 */
export interface ZohoErrorResponse {
  success: false;
  error_code: string;
  error_message: string;
  details?: any;
  suggestions?: string[];
  documentation_url?: string;
  timestamp: string;
  request_id?: string;
}

/**
 * Validation Error Details
 */
export interface ValidationError {
  field: string;
  value: any;
  error_type: 'required' | 'invalid_format' | 'out_of_range' | 'duplicate' | 'custom';
  message: string;
  suggested_value?: any;
}

// =============================================================================
// WEBHOOK & REAL-TIME UPDATE INTERFACES
// =============================================================================

/**
 * Webhook Event Interface
 */
export interface ZohoWebhookEvent {
  event_type: 'create' | 'update' | 'delete';
  module: string;
  record_id: string;
  timestamp: string;
  changed_fields?: string[];
  previous_values?: Record<string, any>;
  current_values?: Record<string, any>;
  user_id: string;
  operation_id?: string;
}

/**
 * Real-time Update Configuration
 */
export interface RealTimeConfig {
  enabled: boolean;
  webhook_url: string;
  events: Array<'create' | 'update' | 'delete'>;
  modules: string[];
  field_filters?: string[];
  retry_attempts: number;
  retry_delay_ms: number;
}

/**
 * 🆕 Complete Type Collection for Easy Import
 */
export interface ZohoTypes {
  // Venue & Data Types
  ZohoVenue: ZohoVenue;
  CachedZohoVenue: CachedZohoVenue;
  
  // Response Types
  VenuesListResponse: VenuesListResponse;
  VenueSearchResponse: VenueSearchResponse;
  VenueDetailsResponse: VenueDetailsResponse;
  ZohoHealthResponse: ZohoHealthResponse;
  
  // Field Management
  ZohoFieldMetadata: ZohoFieldMetadata;
  FieldUsageAnalytics: FieldUsageAnalytics;
  FieldCacheInfo: FieldCacheInfo;
  
  // Analytics & Operations
  VenueAnalytics: VenueAnalytics;
  BulkOperationResult: BulkOperationResult;
  
  // System Types
  ZohoUserInfo: ZohoUserInfo;
  ZohoDebugResponse: ZohoDebugResponse;
  ZohoErrorResponse: ZohoErrorResponse;
}

/**
 * Default export for convenience
 */
export default ZohoTypes;
