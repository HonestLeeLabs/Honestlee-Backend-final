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
  s3Key: string; // ✅ S3 key for deletion
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

const VenueMediaSchema = new Schema<IVenueMedia>({
  mediaId: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },
  tempVenueId: {
    type: String,
    required: true,
    index: true,
  },
  venueId: {
    type: Schema.Types.ObjectId,
    ref: 'Venue',
    sparse: true,
    index: true,
  },
  mediaType: {
    type: String,
    required: true,
    enum: [
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
  submittedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  s3Key: {
    type: String,
    required: true,
    index: true,
  },
 fileFormat: {
    type: String,
    enum: [
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff', // Images - lowercase
      'mp4', 'mov', 'avi', 'webm', 'mkv', '3gp', '3gpp', 'insp' // Videos - lowercase
    ],
    required: true
  },
  fileSize: {
    type: Number,
    required: true,
  },
  isVideo: {
    type: Boolean,
    default: false,
    index: true,
  },
  is360: {
    type: Boolean,
    default: false,
    index: true,
  },
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
      'Charging ports',
      'Family-friendly',
      '360 view',
      'Owner photos',
      'User photos',
    ],
    default: 'Latest',
    index: true,
  },
  capturedAt: Date,
  capturedGPSLat: Number,
  capturedGPSLng: Number,
  aiTags: [String],
  containsFaces: {
    type: Boolean,
    default: false,
  },
  containsChildren: {
    type: Boolean,
    default: false,
  },
  reviewStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true,
  },
  reviewNotes: String,
}, {
  timestamps: true,
  collection: 'venue_media',
});

// Indexes
VenueMediaSchema.index({ tempVenueId: 1, mediaType: 1 });
VenueMediaSchema.index({ venueId: 1, publicVisibility: 1 });
VenueMediaSchema.index({ submittedBy: 1, createdAt: -1 });
VenueMediaSchema.index({ s3Key: 1 });

export default mongoose.model<IVenueMedia>('VenueMedia', VenueMediaSchema);