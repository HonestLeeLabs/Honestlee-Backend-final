import mongoose, { Schema, Document } from 'mongoose';

export interface IWifiSpeedTest extends Document {
  testId: string;
  venueId: mongoose.Types.ObjectId;
  tempVenueId?: string;
  userId: mongoose.Types.ObjectId;
  userRole: 'USER' | 'AGENT' | 'ADMIN' | 'STAFF';
  
  // Speed Metrics
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  jitterMs?: number;
  packetLoss?: number;
  
  // Connection Info
  connectionType?: 'wifi' | '4g' | '5g' | 'ethernet' | 'unknown';
  ssid?: string;
  bssid?: string;
  signalStrength?: number; // dBm
  frequency?: string; // '2.4GHz' | '5GHz'
  
  // WiFi commercial/meta info
  isWifiFree?: boolean;
  wifiPassword?: string;
  wifiPasswordNote?: string;
  wifiQrCode?: string;
  
  // Device Info
  deviceInfo: {
    model: string;
    os: string;
    browser: string;
    userAgent?: string;
  };
  
  // Test Method
  testMethod: 'ookla' | 'fast.com' | 'manual' | 'speedtest-net' | 'cloudflare' | 'ndt7';
  testServer?: string;
  
  // Location & Time
  location?: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
  zoneId?: string;
  zoneName?: string;
  timestamp: Date;
  
  // Quality Metrics
  qualityScore?: number; // 0-100
  category?: 'excellent' | 'good' | 'fair' | 'poor';
  isReliable: boolean;
  
  // Additional
  notes?: string;
  region: string;
  
  // NEW contextual fields
  displayMethod?: 'signage' | 'tablets' | 'pamphlets' | 'verbal' | 'none' | 'other' | 'unknown';
  displayLocation?: string;
  peopleCount?: number;
  zoneInfo?: {
    zoneId?: string;
    zoneName?: string;
    hasWifi?: boolean;
  };
  hasNoWifi?: boolean;
  
  // NEW: Mobile Network Info (when WiFi not available)
  mobileNetworkInfo?: {
    carrier?: string;          // e.g., "AIS", "True", "DTAC", "Airtel", "Jio"
    networkType?: string;      // e.g., "5G", "4G LTE", "4G", "3G"
    signalStrength?: string;   // e.g., "-70 dBm"
    signalBars?: number;       // 1-5 bars
    towerDistance?: string;    // e.g., "500m", "1km"
  };
  
  // Network Info (if stored separately)
  networkInfo?: any;
  
  createdAt: Date;
  updatedAt: Date;
}

const WifiSpeedTestSchema = new Schema<IWifiSpeedTest>({
  testId: { type: String, required: true, unique: true, index: true },
  venueId: { type: Schema.Types.ObjectId, required: true, index: true },
  tempVenueId: { type: String, index: true },
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  userRole: { type: String, enum: ['USER', 'AGENT', 'ADMIN', 'STAFF'], required: true },
  
  downloadMbps: { type: Number, required: true, min: 0 },
  uploadMbps: { type: Number, required: true, min: 0 },
  latencyMs: { type: Number, required: true, min: 0 },
  jitterMs: { type: Number, min: 0 },
  packetLoss: { type: Number, min: 0, max: 100 },
  
  connectionType: { 
    type: String, 
    enum: ['wifi', '4g', '5g', 'ethernet', 'unknown'],
    default: 'unknown'
  },
  ssid: String,
  bssid: String,
  signalStrength: Number,
  frequency: String,
  
  // WiFi commercial/meta info
  isWifiFree: { type: Boolean, default: false },
  wifiPassword: { type: String },
  wifiPasswordNote: { type: String },
  wifiQrCode: { type: String },
  
  deviceInfo: {
    model: { type: String, required: true },
    os: { type: String, required: true },
    browser: { type: String, required: true },
    userAgent: String
  },
  
  testMethod: {
    type: String,
    enum: ['ookla', 'fast.com', 'manual', 'speedtest-net', 'cloudflare', 'ndt7'],
    required: true
  },
  testServer: String,
  
  location: {
    lat: Number,
    lng: Number,
    accuracy: Number
  },
  zoneId: String,
  zoneName: String,
  timestamp: { type: Date, default: Date.now },
  
  qualityScore: { type: Number, min: 0, max: 100 },
  category: { 
    type: String, 
    enum: ['excellent', 'good', 'fair', 'poor']
  },
  isReliable: { type: Boolean, default: true },
  
  notes: String,
  region: { type: String, required: true, index: true },
  
  // Network Info
  networkInfo: { type: Schema.Types.Mixed },
  
  // NEW contextual fields
  displayMethod: { 
    type: String, 
    enum: ['signage', 'tablets', 'pamphlets', 'verbal', 'none', 'other', 'unknown'],
    default: 'unknown'
  },
  displayLocation: String,
  peopleCount: { type: Number, min: 0 },
  zoneInfo: {
    zoneId: String,
    zoneName: String,
    hasWifi: Boolean
  },
  hasNoWifi: { type: Boolean, default: false },
  
  // NEW: Mobile Network Info
  mobileNetworkInfo: {
    carrier: String,
    networkType: String,
    signalStrength: String,
    signalBars: { type: Number, min: 1, max: 5 },
    towerDistance: String
  },
  
}, {
  timestamps: true,
  collection: 'wifi_speed_tests'
});

// Indexes
WifiSpeedTestSchema.index({ venueId: 1, timestamp: -1 });
WifiSpeedTestSchema.index({ userId: 1, timestamp: -1 });
WifiSpeedTestSchema.index({ region: 1, timestamp: -1 });
WifiSpeedTestSchema.index({ testId: 1 });

// Calculate quality score before saving
WifiSpeedTestSchema.pre('save', function(next) {
  const test = this;
  
  // Calculate quality score based on download speed and latency
  let score = 0;
  
  // Download speed scoring (0-60 points)
  if (test.downloadMbps >= 100) score += 60;
  else if (test.downloadMbps >= 50) score += 50;
  else if (test.downloadMbps >= 25) score += 40;
  else if (test.downloadMbps >= 10) score += 30;
  else if (test.downloadMbps >= 5) score += 20;
  else score += 10;
  
  // Latency scoring (0-25 points)
  if (test.latencyMs <= 20) score += 25;
  else if (test.latencyMs <= 50) score += 20;
  else if (test.latencyMs <= 100) score += 15;
  else if (test.latencyMs <= 200) score += 10;
  else score += 5;
  
  // Upload speed scoring (0-15 points)
  if (test.uploadMbps && test.uploadMbps > 0) {
    if (test.uploadMbps >= 20) score += 15;
    else if (test.uploadMbps >= 10) score += 12;
    else if (test.uploadMbps >= 5) score += 8;
    else score += 4;
  } else {
    // Give minimum points if upload wasn't measured
    score += 8; // neutral score
  }
  
  test.qualityScore = score;
  
  // Categorize
  if (score >= 85) test.category = 'excellent';
  else if (score >= 70) test.category = 'good';
  else if (score >= 50) test.category = 'fair';
  else test.category = 'poor';
  
  next();
});

export default mongoose.model<IWifiSpeedTest>('WifiSpeedTest', WifiSpeedTestSchema);