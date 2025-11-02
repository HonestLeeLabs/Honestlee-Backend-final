import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReview extends Document {
  user: Types.ObjectId;
  venue: string; // ✅ Store as string to reference venue across regions
  venueRegion: string; // ✅ Store which region the venue is in
  rating: number;
  comment?: string;
  tags?: string[];
  createdAt: Date;
}

const ReviewSchema = new Schema<IReview>({
  user: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  venue: { 
    type: String,  // ✅ Store venue ID as string (can be _id, id, or globalId)
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
  comment: { type: String },
  tags: { type: [String] },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: -1
  }
});

// ✅ Compound index for efficient venue queries
ReviewSchema.index({ venue: 1, venueRegion: 1 });
ReviewSchema.index({ user: 1, createdAt: -1 });

// ✅ Use the SHARED database connection
export default mongoose.model<IReview>('Review', ReviewSchema);
