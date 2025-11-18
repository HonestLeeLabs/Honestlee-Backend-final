// src/models/PhotoAsset.ts
import mongoose, { Schema, Document } from 'mongoose';

export enum PhotoAssetType {
  LOGO = 'logo',
  COVER = 'cover',
  STOREFRONT = 'storefront',
  INTERIOR = 'interior',
  MENU = 'menu',
  SIGNATURE = 'signature',
  CHARGING_PORTS = 'charging_ports',
  SELFIE_STAFF = 'selfie_staff',
  SELFIE_OWNER = 'selfie_owner',
  SELFIE_MANAGER = 'selfie_manager',
  FOOD = 'food',
  OUTDOOR = 'outdoor',
  OTHER = 'other'
}

export interface IPhotoAsset extends Document {
  assetId: string;
  venueId: mongoose.Types.ObjectId;
  type: PhotoAssetType;
  uri: string;
  width?: number;
  height?: number;
  contrastOk?: boolean;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
  isPublic: boolean;
  s3Key: string;
  createdAt: Date;
}

const PhotoAssetSchema = new Schema<IPhotoAsset>({
  assetId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  venueId: {
    type: Schema.Types.ObjectId,
    ref: 'Venue',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: Object.values(PhotoAssetType),
    required: true,
    index: true
  },
  uri: {
    type: String,
    required: true
  },
  width: Number,
  height: Number,
  contrastOk: Boolean,
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  s3Key: {
    type: String,
    required: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'photo_assets'
});

// Indexes
PhotoAssetSchema.index({ venueId: 1, type: 1 });
PhotoAssetSchema.index({ uploadedBy: 1, uploadedAt: -1 });

export default mongoose.model<IPhotoAsset>('PhotoAsset', PhotoAssetSchema);
