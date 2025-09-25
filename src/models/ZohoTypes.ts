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

export interface ZohoVenue {
  id: string;
  Account_Name: string;
  Phone?: string;
  Website?: string;
  Owner?: {
    name: string;
    id: string;
    email: string;
  };
  Billing_Street?: string;
  Billing_City?: string;
  Billing_State?: string;
  Billing_Code?: string;
  Billing_Country?: string;
  Description?: string;
  Industry?: string;
  Annual_Revenue?: number;
  Rating?: string;
  Employees?: number;
  Fax?: string;
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
}

export interface VenueSearchResponse {
  success: boolean;
  message: string;
  data: ZohoVenue[];
  count: number;
}

export interface VenueDetailsResponse {
  success: boolean;
  message: string;
  data: ZohoVenue | null;
}

export interface ZohoHealthResponse {
  success: boolean;
  status: string;
  org?: string;
  error?: string;
}
