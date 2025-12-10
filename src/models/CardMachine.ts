import mongoose, { Schema, Document } from 'mongoose';

export interface ICardMachine extends Document {
  machineId: string;
  venueId?: mongoose.Types.ObjectId;
  tempVenueId?: string;
  
  // Machine details
  brandProvider: string; // Paytm, Razorpay, PineLabs, etc.
  contactlessEnabled: boolean;
  supportedNetworks: string[]; // Visa, Mastercard, RuPay, Amex
  
  // MDR details
  mdrLocalCardsPercent?: number;
  mdrDebitPercent?: number;
  mdrCreditPercent?: number;
  mdrInternationalPercent?: number;
  
  // Additional info
  notes?: string;
  monthlyRental?: number;
  
  // Photo evidence
  machinePhotoUrl?: string;
  
  // Meta
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CardMachineSchema = new Schema<ICardMachine>(
  {
    machineId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    venueId: {
      type: Schema.Types.ObjectId,
      ref: 'Venue',
      sparse: true,
      index: true,
    },
    tempVenueId: {
      type: String,
      sparse: true,
      index: true,
    },
    brandProvider: {
      type: String,
      required: true,
    },
    contactlessEnabled: {
      type: Boolean,
      default: false,
    },
    supportedNetworks: [{
      type: String,
      enum: ['Visa', 'Mastercard', 'RuPay', 'Amex', 'Diners', 'Discover', 'JCB', 'UnionPay'],
    }],
    mdrLocalCardsPercent: Number,
    mdrDebitPercent: Number,
    mdrCreditPercent: Number,
    mdrInternationalPercent: Number,
    notes: String,
    monthlyRental: Number,
    machinePhotoUrl: String,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'card_machines',
  }
);

CardMachineSchema.index({ venueId: 1, isActive: 1 });
CardMachineSchema.index({ tempVenueId: 1, isActive: 1 });

export default mongoose.model<ICardMachine>('CardMachine', CardMachineSchema);
