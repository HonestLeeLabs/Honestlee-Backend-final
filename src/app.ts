import express from 'express';
import cors from 'cors';
import 'express-async-errors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import passport from './config/passport';
import authRoutes from './routes/authRoutes';
import googleAuthRoutes from './routes/googleAuthRoutes';
import wifiRoutes from './routes/wifiRoutes';
import reviewRoutes from './routes/reviewRoutes';
import venueRoutes from './routes/venueRoutes';
import userRoutes from './routes/userRoutes';
import adminRoutes from './routes/adminRoutes';
import { errorHandler } from './utils/errorHandler';
import { testEmailConfig } from './services/emailService';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(passport.initialize());

mongoose.connect(process.env.MONGODB_URI || '')
  .then(async () => {
    console.log('MongoDB connected');
    
    // Fix the phone index issue
    try {
      const db = mongoose.connection.db;
      const collection = db.collection('users');
      
      // Drop existing indexes
      try {
        await collection.dropIndex('phone_1');
        console.log('Dropped phone_1 index');
      } catch (e) {
        console.log('phone_1 index not found or already dropped');
      }
      
      try {
        await collection.dropIndex('email_1');
        console.log('Dropped email_1 index');
      } catch (e) {
        console.log('email_1 index not found or already dropped');
      }
      
      // Create sparse unique indexes
      await collection.createIndex({ phone: 1 }, { unique: true, sparse: true });
      await collection.createIndex({ email: 1 }, { unique: true, sparse: true });
      console.log('Created sparse indexes for phone and email');
      
    } catch (error) {
      console.error('Error fixing indexes:', error);
    }
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Test email configuration
testEmailConfig();

app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/wifi', wifiRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

app.use(errorHandler);

export default app;
