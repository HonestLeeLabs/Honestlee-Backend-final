import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReview extends Document {
  user: Types.ObjectId;
  venue: Types.ObjectId;
  rating: number;
  comment?: string;
  tags?: string[];
  createdAt: Date;
}

const ReviewSchema = new Schema<IReview>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  venue: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String },
  tags: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IReview>('Review', ReviewSchema);
