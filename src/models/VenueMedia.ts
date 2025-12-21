// models/VenueMedia.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IVenueMedia extends Document {
  mediaId: string;
  tempVenueId: string;
  venueId?: mongoose.Types.ObjectId;
  mediaType: string;
  captureContext: string;
  submittedByRole: string;
  submittedBy: mongoose.Types.ObjectId;
  fileUrl: string;
  thumbnailUrl?: string; // ✅ Thumbnail URL (optimized WebP)
  mediumUrl?: string; // ✅ NEW: Medium size URL (optimized WebP)
  s3Key: string;
  thumbnailS3Key?: string; // ✅ Thumbnail S3 key for deletion
  mediumS3Key?: string; // ✅ NEW: Medium size S3 key for deletion
  fileFormat: string;
  fileSize: number;
  fileHash?: string;
  isVideo: boolean;
  is360: boolean;
  publicVisibility: string;
  frontendGroup: string;
  capturedAt?: Date;
  
  // GPS metadata from capture
  captureGpsLat?: number;
  captureGpsLng?: number;
  captureGpsAccuracy?: number;
  
  // EXIF metadata fields
  exifDateTaken?: Date;
  exifLatitude?: number;
  exifLongitude?: number;
  exifCamera?: string;
  exifAltitude?: number;
  
  // Distance from venue (calculated)
  distanceFromVenue?: number;
  
  aiTags?: string[];
  containsFaces: boolean;
  containsChildren: boolean;
  reviewStatus: string;
  reviewNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const VenueMediaSchema = new Schema<IVenueMedia>(
  {
    mediaId: { 
      type: String, 
      unique: true, 
      required: true, 
      index: true,
      default: () => `M-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    },
    
    tempVenueId: { 
      type: String, 
      required: true, 
      index: true 
    },
    
    venueId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Venue', 
      sparse: true, 
      index: true 
    },

    mediaType: {
      type: String,
      required: true,
      enum: [
        // ✅ Universal categories
        'LOGO', 'OUTSIDE_VIEW', 'PAYMENT_METHODS', 'SIGNBOARD', 'AMENITIES',
        'EVENT_POSTER', 'MENU_PRICES', 'VIEW_PANORAMA', 'EVENTS_PHOTOS',
        'DOC_LICENSE', 'SELFIE_OWNER_AGENT', 'QR_INSTALL_SPOT', 'PANO_360',
        'VIDEO_SHORT', 'COUNTER', 'PARKING_AREA', 'ACCESSIBILITY',
        'TOILET_FACILITIES', 'USER_GENERAL',
        
        // ✅ Menu & Food
        'MENU_BOARD', 'KIDS_MENU',
        
        // ✅ Food & Beverage
        'SEATING_AREA_WORK', 'VIBE_INTERIOR', 'FOOD_DISH', 'FOOD_DISPLAY_COUNTER',
        'DRINKS_BAR', 'ICE_CREAM_FREEZERS', 'TABLE_NUMBERS', 'SCHEDULE',
        
        // ✅ Coffee categories
        'COFFEE_MACHINE', 'COFFEE_ACCESSORIES', 'COFFEE_BEANS_DISPLAY',
        'COFFEE_MENU', 'BARISTA_STATION',
        
        // ✅ Workspace & Amenities
        'CHARGING_PORTS', 'WORKSTATIONS_LAPTOPS', 'FREE_WATER_REFILLS',
        'PROMOTIONAL_FLYERS', 'OFFERS',
        
        // ✅ Hotel features
        'ROOM_HOTEL', 'BATHROOM_HOTEL', 'LOBBY_RECEPTION', 'POOL_AREA',
        'GYM_AREA', 'CONFERENCE_ROOM',
        
        // ✅ Retail & Other
        'SUPERMARKET_AISLE',
        
        // ✅ Family & Pet
        'FAMILY_KIDS_AREA', 'HIGH_CHAIRS', 'PET_AREA',
        
        // ✅ WiFi & Connectivity
        'WIFI_BOASTING_SPEED', 'WIFI_SIGN_EXISTING', 'WIFI_PASSWORD',
        
        // ✅ Operational & Social
        'COUNTER_AREA', 'STAFF_CONTACTS', 'MANAGER_CONTACTS', 'RECEIPTS',
        'SOCIAL_MEDIA', 'SPORTS_AMENITIES', 'TV_DISPLAY',
        
        // ✅ Policy categories
        'POLICY_PAYMENT', 'POLICY_SMOKING', 'POLICY_OUTSIDE_FOOD',
        'POLICY_DRESS_CODE', 'POLICY_AGE_RESTRICTION', 'POLICY_RESERVATION',
        'POLICY_CANCELLATION', 'POLICY_REFUND', 'POLICY_PET',
        'POLICY_ALCOHOL', 'POLICY_NOISE', 'POLICY_PHOTOGRAPHY',
        'POLICY_TERMS_CONDITIONS', 'POLICY_PRIVACY', 'POLICY_LIABILITY',
        
        // ✅ Internal/Operational
        'SCREENSHOT_GPS_CHANGE', 'ZONE_PHOTO',

        
      ],
      index: true,
    },

    captureContext: {
      type: String,
      enum: [
        'Agent onboarding',
        'Owner self-onboarding',
        'Staff onboarding',
        'User contribution',
        'System auto (Insta360)',
        'External social import',
        'Manual upload',
        'API import',
      ],
      default: 'Agent onboarding',
    },

    submittedByRole: {
      type: String,
      enum: ['Agent', 'Owner', 'Staff', 'User', 'System', 'Admin'],
      required: true,
      default: 'Agent',
    },

    submittedBy: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    
    fileUrl: { 
      type: String, 
      required: true,
      index: true 
    },
    
    // ✅ Thumbnail URL (optimized WebP)
    thumbnailUrl: { 
      type: String, 
      default: null,
      index: true 
    },
    
    // ✅ Medium size URL (optimized WebP)
    mediumUrl: { 
      type: String, 
      default: null,
      index: true 
    },
    
    s3Key: { 
      type: String, 
      required: true, 
      index: true 
    },
    
    // ✅ Thumbnail S3 key (for easy deletion)
    thumbnailS3Key: { 
      type: String, 
      default: null,
      index: true 
    },
    
    // ✅ Medium size S3 key (for easy deletion)
    mediumS3Key: { 
      type: String, 
      default: null,
      index: true 
    },

    fileFormat: {
      type: String,
      enum: [
        // Images
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff', 'svg',
        // Videos
        'mp4', 'mov', 'avi', 'webm', 'mkv', '3gp', '3gpp', 'm4v', 'flv',
        // Special formats
        'insp', // Insta360
      ],
      required: true,
      index: true,
    },

    fileSize: { 
      type: Number, 
      required: true,
      min: 0,
      index: true 
    },
    
    fileHash: { 
      type: String, 
      index: true, 
      sparse: true 
    },
    
    isVideo: { 
      type: Boolean, 
      default: false, 
      index: true 
    },
    
    is360: { 
      type: Boolean, 
      default: false, 
      index: true 
    },

    publicVisibility: {
      type: String,
      enum: ['Public (frontend)', 'Internal only', 'Ops only', 'Hidden'],
      default: 'Public (frontend)',
      index: true,
    },

    frontendGroup: {
      type: String,
      enum: [
        'Latest', 'Videos', 'Menu', 'Food & Drink', 'Vibe', 'Amenities',
        'Charging & Power', 'Family-friendly', '360 view', 'Owner photos',
        'User photos', 'Hotel Features', 'Accessibility', 'Events', 'Operational',
        'Policies',
      ],
      default: 'Latest',
      index: true,
    },
    
    capturedAt: { 
      type: Date, 
      default: Date.now 
    },
    
    // GPS from capture device
    captureGpsLat: { 
      type: Number,
      min: -90,
      max: 90
    },
    
    captureGpsLng: { 
      type: Number,
      min: -180,
      max: 180
    },
    
    captureGpsAccuracy: { 
      type: Number,
      min: 0
    },
    
    // EXIF metadata (from original photo)
    exifDateTaken: { 
      type: Date 
    },
    
    exifLatitude: { 
      type: Number,
      min: -90,
      max: 90
    },
    
    exifLongitude: { 
      type: Number,
      min: -180,
      max: 180
    },
    
    exifCamera: { 
      type: String 
    },
    
    exifAltitude: { 
      type: Number 
    },
    
    // Calculated distance from venue center (in meters)
    distanceFromVenue: { 
      type: Number,
      min: 0
    },
    
    aiTags: [{ 
      type: String,
      index: true
    }],
    
    containsFaces: { 
      type: Boolean, 
      default: false 
    },
    
    containsChildren: { 
      type: Boolean, 
      default: false 
    },

    reviewStatus: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Flagged', 'Under Review'],
      default: 'Pending',
      index: true,
    },

    reviewNotes: { 
      type: String 
    },
  },
  { 
    timestamps: true, 
    collection: 'venuemedia',
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ✅ Virtual for easy access to cloudfront URLs
VenueMediaSchema.virtual('cloudfrontUrl').get(function() {
  if (this.fileUrl && this.fileUrl.includes('s3.ap-south-1.amazonaws.com')) {
    return this.fileUrl.replace(
      /https?:\/\/[^/]+\.s3\.ap-south-1\.amazonaws\.com\//,
      'https://d2j8mu1uew5u3d.cloudfront.net/'
    );
  }
  return this.fileUrl;
});

VenueMediaSchema.virtual('cloudfrontThumbnailUrl').get(function() {
  const url = this.thumbnailUrl || this.fileUrl;
  if (url && url.includes('s3.ap-south-1.amazonaws.com')) {
    return url.replace(
      /https?:\/\/[^/]+\.s3\.ap-south-1\.amazonaws\.com\//,
      'https://d2j8mu1uew5u3d.cloudfront.net/'
    );
  }
  return url;
});

// ✅ NEW: Virtual for medium size URL with CloudFront
VenueMediaSchema.virtual('cloudfrontMediumUrl').get(function() {
  const url = this.mediumUrl || this.fileUrl;
  if (url && url.includes('s3.ap-south-1.amazonaws.com')) {
    return url.replace(
      /https?:\/\/[^/]+\.s3\.ap-south-1\.amazonaws\.com\//,
      'https://d2j8mu1uew5u3d.cloudfront.net/'
    );
  }
  return url;
});

// ✅ Indexes for performance
VenueMediaSchema.index({ tempVenueId: 1, mediaType: 1 });
VenueMediaSchema.index({ tempVenueId: 1, fileHash: 1 });
VenueMediaSchema.index({ tempVenueId: 1, fileSize: 1, s3Key: 1 });
VenueMediaSchema.index({ tempVenueId: 1, frontendGroup: 1 });
VenueMediaSchema.index({ venueId: 1, publicVisibility: 1 });
VenueMediaSchema.index({ submittedBy: 1, createdAt: -1 });
VenueMediaSchema.index({ isVideo: 1, is360: 1 });
VenueMediaSchema.index({ createdAt: -1 });
VenueMediaSchema.index({ reviewStatus: 1, createdAt: -1 });
VenueMediaSchema.index({ fileFormat: 1 });
VenueMediaSchema.index({ thumbnailUrl: 1 }); // For thumbnail lookups
VenueMediaSchema.index({ mediumUrl: 1 }); // ✅ NEW: For medium URL lookups
VenueMediaSchema.index({ mediumS3Key: 1 }); // ✅ NEW: For medium S3 key lookups

// ✅ Compound indexes for common queries
VenueMediaSchema.index({ 
  tempVenueId: 1, 
  publicVisibility: 1, 
  isVideo: 1,
  createdAt: -1 
});

VenueMediaSchema.index({ 
  venueId: 1, 
  mediaType: 1, 
  frontendGroup: 1 
});

// ✅ Pre-save middleware for auto-calculations
VenueMediaSchema.pre('save', function(next) {
  // Auto-generate mediaId if not provided
  if (!this.mediaId) {
    this.mediaId = `M-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Auto-set capturedAt if not provided
  if (!this.capturedAt) {
    this.capturedAt = new Date();
  }
  
  // Auto-set fileFormat from fileUrl if not provided
  if (!this.fileFormat && this.fileUrl) {
    const extension = this.fileUrl.split('.').pop()?.toLowerCase();
    if (extension && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov'].includes(extension)) {
      this.fileFormat = extension;
    }
  }
  
  // Auto-detect isVideo from fileFormat
  if (!this.isVideo && this.fileFormat) {
    const videoFormats = ['mp4', 'mov', 'avi', 'webm', 'mkv', '3gp', '3gpp', 'm4v', 'flv'];
    this.isVideo = videoFormats.includes(this.fileFormat);
  }
  
  // ✅ FIXED: Auto-detect is360 from fileFormat or mediaType
  if (!this.is360) {
    const isInspFormat = this.fileFormat === 'insp';
    const isPano360MediaType = this.mediaType === 'PANO_360';
    const has360InUrl = this.fileUrl ? this.fileUrl.toLowerCase().includes('360') : false;
    
    this.is360 = isInspFormat || isPano360MediaType || has360InUrl;
  }
  
  next();
});

// ✅ Static method to find by mediaId
VenueMediaSchema.statics.findByMediaId = function(mediaId: string) {
  return this.findOne({ mediaId });
};

// ✅ Static method to find all media for a venue
VenueMediaSchema.statics.findByVenue = function(venueId: string | mongoose.Types.ObjectId) {
  const query = mongoose.Types.ObjectId.isValid(venueId) 
    ? { $or: [{ venueId: new mongoose.Types.ObjectId(venueId) }, { tempVenueId: venueId.toString() }] }
    : { tempVenueId: venueId.toString() };
    
  return this.find(query);
};

// ✅ Static method to get media stats (updated to include medium URLs)
VenueMediaSchema.statics.getStats = async function(venueId: string | mongoose.Types.ObjectId) {
  const matchStage: any = {
    $or: [{ tempVenueId: venueId.toString() }]
  };

  // Only add venueId match if it's a valid ObjectId
  if (mongoose.Types.ObjectId.isValid(venueId)) {
    matchStage.$or.push({ venueId: new mongoose.Types.ObjectId(venueId) });
  }

  const stats = await this.aggregate([
    {
      $match: matchStage
    },
    {
      $group: {
        _id: null,
        totalCount: { $sum: 1 },
        totalSize: { $sum: '$fileSize' },
        videoCount: { $sum: { $cond: ['$isVideo', 1, 0] } },
        imageCount: { $sum: { $cond: ['$isVideo', 0, 1] } },
        hasThumbnailCount: { $sum: { $cond: [{ $and: ['$thumbnailUrl', { $ne: ['$thumbnailUrl', null] }] }, 1, 0] } },
        hasMediumCount: { $sum: { $cond: [{ $and: ['$mediumUrl', { $ne: ['$mediumUrl', null] }] }, 1, 0] } }, // ✅ NEW
        byMediaType: { $push: '$mediaType' },
        byFrontendGroup: { $push: '$frontendGroup' }
      }
    },
    {
      $project: {
        totalCount: 1,
        totalSize: 1,
        videoCount: 1,
        imageCount: 1,
        hasThumbnailCount: 1,
        hasMediumCount: 1, // ✅ NEW
        totalSizeMB: { $divide: ['$totalSize', 1024 * 1024] },
        mediaTypeCount: {
          $arrayToObject: {
            $map: {
              input: { $setUnion: '$byMediaType' },
              as: 'type',
              in: {
                k: '$$type',
                v: {
                  $size: {
                    $filter: {
                      input: '$byMediaType',
                      as: 'item',
                      cond: { $eq: ['$$item', '$$type'] }
                    }
                  }
                }
              }
            }
          }
        },
        frontendGroupCount: {
          $arrayToObject: {
            $map: {
              input: { $setUnion: '$byFrontendGroup' },
              as: 'group',
              in: {
                k: '$$group',
                v: {
                  $size: {
                    $filter: {
                      input: '$byFrontendGroup',
                      as: 'item',
                      cond: { $eq: ['$$item', '$$group'] }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalCount: 0,
    totalSize: 0,
    totalSizeMB: 0,
    videoCount: 0,
    imageCount: 0,
    hasThumbnailCount: 0,
    hasMediumCount: 0, // ✅ NEW
    mediaTypeCount: {},
    frontendGroupCount: {}
  };
};

// ✅ Instance method to get thumbnail info (updated to include medium)
VenueMediaSchema.methods.getThumbnailInfo = function() {
  return {
    hasThumbnail: !!this.thumbnailUrl,
    thumbnailUrl: this.thumbnailUrl,
    thumbnailS3Key: this.thumbnailS3Key,
    hasMedium: !!this.mediumUrl, // ✅ NEW
    mediumUrl: this.mediumUrl, // ✅ NEW
    mediumS3Key: this.mediumS3Key, // ✅ NEW
    usesOriginalAsThumbnail: this.isVideo || !this.thumbnailUrl,
    recommendedSize: this.isVideo ? 'Original' : '300x300 WebP'
  };
};

// ✅ NEW: Instance method to get all media sizes info
VenueMediaSchema.methods.getMediaSizesInfo = function() {
  return {
    original: {
      url: this.fileUrl,
      s3Key: this.s3Key,
      size: this.fileSize,
      format: this.fileFormat
    },
    thumbnail: {
      has: !!this.thumbnailUrl,
      url: this.thumbnailUrl,
      s3Key: this.thumbnailS3Key,
      size: '200x200 WebP'
    },
    medium: {
      has: !!this.mediumUrl,
      url: this.mediumUrl,
      s3Key: this.mediumS3Key,
      size: '800px max WebP'
    },
    isVideo: this.isVideo,
    usesFallback: this.isVideo || !this.thumbnailUrl
  };
};

// ✅ Instance method to get public-safe data (updated to include mediumUrl)
VenueMediaSchema.methods.toPublicJSON = function() {
  const obj = this.toObject();
  
  // Remove sensitive/internal fields
  delete obj.s3Key;
  delete obj.thumbnailS3Key;
  delete obj.mediumS3Key; // ✅ NEW
  delete obj.fileHash;
  delete obj.reviewNotes;
  delete obj.captureGpsAccuracy;
  delete obj.distanceFromVenue;
  
  // Ensure URLs are CloudFront
  if (obj.fileUrl && obj.fileUrl.includes('s3.ap-south-1.amazonaws.com')) {
    obj.fileUrl = obj.fileUrl.replace(
      /https?:\/\/[^/]+\.s3\.ap-south-1\.amazonaws\.com\//,
      'https://d2j8mu1uew5u3d.cloudfront.net/'
    );
  }
  
  if (obj.thumbnailUrl && obj.thumbnailUrl.includes('s3.ap-south-1.amazonaws.com')) {
    obj.thumbnailUrl = obj.thumbnailUrl.replace(
      /https?:\/\/[^/]+\.s3\.ap-south-1\.amazonaws\.com\//,
      'https://d2j8mu1uew5u3d.cloudfront.net/'
    );
  } else if (!obj.thumbnailUrl) {
    obj.thumbnailUrl = obj.fileUrl; // Fallback
  }
  
  // ✅ NEW: Convert medium URL to CloudFront
  if (obj.mediumUrl && obj.mediumUrl.includes('s3.ap-south-1.amazonaws.com')) {
    obj.mediumUrl = obj.mediumUrl.replace(
      /https?:\/\/[^/]+\.s3\.ap-south-1\.amazonaws\.com\//,
      'https://d2j8mu1uew5u3d.cloudfront.net/'
    );
  } else if (!obj.mediumUrl) {
    obj.mediumUrl = obj.fileUrl; // Fallback
  }
  
  return obj;
};

// ✅ NEW: Instance method to get optimized URL based on use case
VenueMediaSchema.methods.getOptimizedUrl = function(useCase: 'grid' | 'modal' | 'full') {
  switch (useCase) {
    case 'grid':
      return this.thumbnailUrl || this.fileUrl;
    case 'modal':
      return this.mediumUrl || this.fileUrl;
    case 'full':
    default:
      return this.fileUrl;
  }
};

// Add TypeScript declarations for static methods
interface VenueMediaModel extends mongoose.Model<IVenueMedia> {
  findByMediaId(mediaId: string): Promise<IVenueMedia | null>;
  findByVenue(venueId: string | mongoose.Types.ObjectId): Promise<IVenueMedia[]>;
  getStats(venueId: string | mongoose.Types.ObjectId): Promise<any>;
}

export default mongoose.model<IVenueMedia, VenueMediaModel>('VenueMedia', VenueMediaSchema);