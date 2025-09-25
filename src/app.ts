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
import zohoRoutes from './routes/zohoRoutes';
import { errorHandler } from './utils/errorHandler';
import { testEmailConfig } from './services/emailService';

dotenv.config();

const app = express();

// CORS Configuration for Frontend Access
const corsOptions = {
  origin: [
    'http://localhost:3000',      // React development server
    'http://localhost:3001',      // Alternative React/Next.js port
    'https://honestlee.app',      // Production frontend
    'https://www.honestlee.app',  // Production frontend with www
    'https://api.honestlee.app',  // API domain
  ],
  credentials: true,              // Allow cookies and authentication headers
  optionsSuccessStatus: 200,      // Support legacy browsers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name',
    'x-region',                   // Add this for your custom header
    'X-Region'                    // Add both cases to be safe
  ]
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(passport.initialize());

// Add preflight handler for complex CORS requests
app.options('*', cors(corsOptions));

// Add additional headers for streaming responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name, x-region, X-Region');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/wifi', wifiRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/zoho', zohoRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    cors: 'Enabled for ports 3000, 3001 and production domains'
  });
});

app.use(errorHandler);

export default app;
