import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEventDubai extends Document {
  Dubai_event_id: string;
  Event_Name: string;
  Dubai_id: string;
  Account_Name: string;
  Event_type: string;
  Event_typs_displayname: string;
  Event_Category: string;
  Even_description: string;
  EventStarts_At: Date;
  EventEnds_At: Date;
  Even_Duration: string;
  Event_Timezone: string;
  Event_Recurrence?: string;
  Event_Price_from: number;
  Event_Price_Max: number;
  Event_Currency: string;
  Event_Age_Restriction: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEventDubaiModel extends Model<IEventDubai> {
  findByVenue(account_name: string): Promise<IEventDubai[]>;
  findUpcoming(limit?: number): Promise<IEventDubai[]>;
}

const eventSchema = new mongoose.Schema({
  Dubai_event_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  Event_Name: {
    type: String,
    required: true
  },
  Dubai_id: {
    type: String,
    required: true,
    index: true
  },
  Account_Name: {
    type: String,
    required: true,
    index: true
  },
  Event_type: {
    type: String,
    required: true,
    index: true
  },
  Event_typs_displayname: String,
  Event_Category: {
    type: String,
    index: true
  },
  Even_description: String,
  EventStarts_At: {
    type: Date,
    required: true,
    index: true
  },
  EventEnds_At: {
    type: Date,
    required: true
  },
  Even_Duration: String,
  Event_Timezone: {
    type: String,
    default: 'Asia/Dubai'
  },
  Event_Recurrence: String,
  Event_Price_from: {
    type: Number,
    default: 0,
    min: 0
  },
  Event_Price_Max: {
    type: Number,
    default: 0,
    min: 0
  },
  Event_Currency: {
    type: String,
    default: 'AED'
  },
  Event_Age_Restriction: String
}, {
  timestamps: true,
  collection: 'eventsDubai'
});

// Compound indexes for common queries
eventSchema.index({ Account_Name: 1, EventStarts_At: 1 });
eventSchema.index({ Event_type: 1, EventStarts_At: 1 });
eventSchema.index({ EventStarts_At: 1, EventEnds_At: 1 });

// Static method to find events by venue
eventSchema.statics.findByVenue = function(account_name: string) {
  return this.find({ Account_Name: account_name })
    .sort({ EventStarts_At: 1 });
};

// Static method to find upcoming events
eventSchema.statics.findUpcoming = function(limit: number = 20) {
  return this.find({ 
    EventStarts_At: { $gte: new Date() } 
  })
    .sort({ EventStarts_At: 1 })
    .limit(limit);
};

// Virtual to check if event is active
eventSchema.virtual('isActive').get(function(this: IEventDubai) {
  const now = new Date();
  return now >= this.EventStarts_At && now <= this.EventEnds_At;
});

// Virtual to check if event is upcoming
eventSchema.virtual('isUpcoming').get(function(this: IEventDubai) {
  return new Date() < this.EventStarts_At;
});

export default mongoose.model<IEventDubai, IEventDubaiModel>('EventDubai', eventSchema);
