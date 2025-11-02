import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReview extends Document {
  user: Types.ObjectId;
  venue: string;
  venueRegion: string;
  rating: number;
  title?: string;
  comment?: string;
  tags?: string[];
  photos?: string[]; // ✅ Array of S3 URLs
  verified?: boolean;
  helpful: number; // ✅ Count of helpful votes
  helpfulBy: Types.ObjectId[]; // ✅ Users who marked as helpful
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>({
  user: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  venue: { 
    type: String,
    required: true,
    index: true
  },
  venueRegion: {
    type: String,
    required: true,
    enum: ['ae', 'th', 'in', 'global'],
    index: true
  },
  rating: { 
    type: Number, 
    required: true, 
    min: 1, 
    max: 5 
  },
  title: { type: String },
  comment: { type: String },
  tags: { type: [String] },
  photos: { type: [String], default: [] }, // ✅ S3 image URLs
  verified: { type: Boolean, default: false },
  helpful: { type: Number, default: 0 },
  helpfulBy: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: -1
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// ✅ Compound indexes
ReviewSchema.index({ venue: 1, venueRegion: 1, createdAt: -1 });
ReviewSchema.index({ user: 1, createdAt: -1 });
ReviewSchema.index({ rating: 1 });

export default mongoose.model<IReview>('Review', ReviewSchema);
