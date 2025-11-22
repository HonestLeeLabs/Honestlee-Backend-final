import mongoose, { Schema, Document } from 'mongoose';

export interface IVenueMedia extends Document {
  mediaId: string;
  tempVenueId: string;
  venueId?: mongoose.Types.ObjectId;
  mediaType: string;
  captureContext: string;
  submittedByRole: string;
  submittedBy: mongoose.Types.ObjectId;
  fileUrl: string; // S3 URL
  s3Key: string; // S3 key for deletion
  fileFormat: string;
  fileSize: number;
  isVideo: boolean;
  is360: boolean;
  publicVisibility: string;
  frontendGroup: string;
  capturedAt?: Date;
  capturedGPSLat?: number;
  capturedGPSLng?: number;
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
    mediaId: { type: String, unique: true, required: true, index: true },
    tempVenueId: { type: String, required: true, index: true },
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', sparse: true, index: true },

    // COMPLETE MEDIA TYPE ENUM WITH ALL HLMT_* TYPES
    mediaType: {
      type: String,
      required: true,
      enum: [
        // Original types
        'OUTSIDE_VIEW',
        'MENU_BOARD',
        'FOOD_DISH',
        'CHARGING_PORTS',
        'SEATING_AREA_WORK',
        'FAMILY_KIDS_AREA',
        'KIDS_MENU',
        'ROOM_HOTEL',
        'SELFIE_OWNER_AGENT',
        'DOC_LICENSE',
        'PANO_360',
        'USER_GENERAL',

        // New HLMT_* types from your list
        'DRINKS_BAR',
        'WORKSTATIONS_LAPTOPS',
        'BATHROOM_HOTEL',
        'LOBBY_RECEPTION',
        'POOL_AREA',
        'GYM_AREA',
        'CONFERENCE_ROOM',
        'SUPERMARKET_AISLE',
        'PARKING_AREA',
        'ACCESSIBILITY',
        'HIGH_CHAIRS',
        'PET_AREA',
        'COFFEE_MACHINE',
        'SCREENSHOT_GPS_CHANGE',
        'EVENTS_PHOTOS',
        'VIBE_INTERIOR',
        'SIGNBOARD',
        'AMENITIES',
        'EVENT_POSTER',
        'VIEW_PANORAMA',
        'TOILET_FACILITIES',
        'WIFI_SIGN_EXISTING',
        'WIFI_BOASTING_SPEED',
        'LOGO',
        'QR_INSTALL_SPOT',
        'VIDEO_SHORT',
        'COUNTER',
        'PAYMENT_METHODS',
        'MENU_PRICES',
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
      ],
      default: 'Agent onboarding',
    },

    submittedByRole: {
      type: String,
      enum: ['Agent', 'Owner', 'Staff', 'User', 'System'],
      required: true,
    },

    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fileUrl: { type: String, required: true },
    s3Key: { type: String, required: true, index: true },

    fileFormat: {
      type: String,
      enum: [
        // Images - lowercase
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff',
        // Videos - lowercase
        'mp4', 'mov', 'avi', 'webm', 'mkv', '3gp', '3gpp', 'insp',
      ],
      required: true,
    },

    fileSize: { type: Number, required: true },
    isVideo: { type: Boolean, default: false, index: true },
    is360: { type: Boolean, default: false, index: true },

    publicVisibility: {
      type: String,
      enum: ['Public (frontend)', 'Internal only', 'Ops only'],
      default: 'Public (frontend)',
      index: true,
    },

    frontendGroup: {
      type: String,
      enum: [
        'Latest',
        'Videos',
        'Menu',
        'Food & Drink',
        'Vibe',
        'Amenities',
        'Charging & Power',
        'Family-friendly',
        '360 view',
        'Owner photos',
        'User photos',
        'Hotel Features',
        'Accessibility',
        'Events',
        'Operational',
      ],
      default: 'Latest',
      index: true,
    },

    capturedAt: Date,
    capturedGPSLat: Number,
    capturedGPSLng: Number,
    aiTags: [String],
    containsFaces: { type: Boolean, default: false },
    containsChildren: { type: Boolean, default: false },

    reviewStatus: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
      index: true,
    },

    reviewNotes: String,
  },
  { timestamps: true, collection: 'venuemedia' }
);

// Indexes
VenueMediaSchema.index({ tempVenueId: 1, mediaType: 1 });
VenueMediaSchema.index({ venueId: 1, publicVisibility: 1 });
VenueMediaSchema.index({ submittedBy: 1, createdAt: -1 });
VenueMediaSchema.index({ s3Key: 1 });

export default mongoose.model<IVenueMedia>('VenueMedia', VenueMediaSchema);