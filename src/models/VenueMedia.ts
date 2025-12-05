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
  s3Key: string;
  fileFormat: string;
  fileSize: number;
  fileHash?: string;
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

    mediaType: {
      type: String,
      required: true,
      enum: [
        // Existing categories
        'OUTSIDE_VIEW', 'MENU_BOARD', 'FOOD_DISH', 'CHARGING_PORTS',
        'SEATING_AREA_WORK', 'FAMILY_KIDS_AREA', 'KIDS_MENU', 'ROOM_HOTEL',
        'SELFIE_OWNER_AGENT', 'DOC_LICENSE', 'PANO_360', 'USER_GENERAL',
        'DRINKS_BAR', 'WORKSTATIONS_LAPTOPS', 'BATHROOM_HOTEL', 'LOBBY_RECEPTION',
        'POOL_AREA', 'GYM_AREA', 'CONFERENCE_ROOM', 'SUPERMARKET_AISLE',
        'PARKING_AREA', 'ACCESSIBILITY', 'HIGH_CHAIRS', 'PET_AREA',
        'COFFEE_MACHINE', 'SCREENSHOT_GPS_CHANGE', 'EVENTS_PHOTOS', 'VIBE_INTERIOR',
        'SIGNBOARD', 'AMENITIES', 'EVENT_POSTER', 'VIEW_PANORAMA',
        'TOILET_FACILITIES', 'WIFI_SIGN_EXISTING', 'WIFI_BOASTING_SPEED',
        'LOGO', 'QR_INSTALL_SPOT', 'VIDEO_SHORT', 'COUNTER',
        'PAYMENT_METHODS', 'MENU_PRICES', 'FOOD_DISPLAY_COUNTER',
        'COUNTER_AREA', 'STAFF_CONTACTS', 'MANAGER_CONTACTS', 'RECEIPTS',
        'SOCIAL_MEDIA', 'SPORTS_AMENITIES', 'TV_DISPLAY',
        
        // ✅ NEW: POLICY CATEGORIES
        'POLICY_PAYMENT', 'POLICY_SMOKING', 'POLICY_OUTSIDE_FOOD',
        'POLICY_DRESS_CODE', 'POLICY_AGE_RESTRICTION', 'POLICY_RESERVATION',
        'POLICY_CANCELLATION', 'POLICY_REFUND', 'POLICY_PET',
        'POLICY_ALCOHOL', 'POLICY_NOISE', 'POLICY_PHOTOGRAPHY',
        'POLICY_TERMS_CONDITIONS', 'POLICY_PRIVACY', 'POLICY_LIABILITY',
        
        // ✅ NEW: COFFEE CATEGORIES
        'COFFEE_MACHINE', 'COFFEE_ACCESSORIES', 'COFFEE_BEANS_DISPLAY',
        'COFFEE_MENU', 'BARISTA_STATION',
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
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff',
        'mp4', 'mov', 'avi', 'webm', 'mkv', '3gp', '3gpp', 'insp',
      ],
      required: true,
    },

    fileSize: { type: Number, required: true },
    fileHash: { type: String, index: true, sparse: true },
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
        'Latest', 'Videos', 'Menu', 'Food & Drink', 'Vibe', 'Amenities',
        'Charging & Power', 'Family-friendly', '360 view', 'Owner photos',
        'User photos', 'Hotel Features', 'Accessibility', 'Events', 'Operational',
        'Policies', // ✅ NEW GROUP
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

VenueMediaSchema.index({ tempVenueId: 1, fileHash: 1 });
VenueMediaSchema.index({ tempVenueId: 1, fileSize: 1, s3Key: 1 });
VenueMediaSchema.index({ tempVenueId: 1, mediaType: 1 });
VenueMediaSchema.index({ venueId: 1, publicVisibility: 1 });
VenueMediaSchema.index({ submittedBy: 1, createdAt: -1 });

export default mongoose.model<IVenueMedia>('VenueMedia', VenueMediaSchema);
