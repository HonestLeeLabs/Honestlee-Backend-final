import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import User, { Role, LoginMethod, IUser } from '../models/User';
import dotenv from 'dotenv';

dotenv.config();

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const callbackURL = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback';

if (!clientID || !clientSecret) {
  throw new Error('Google OAuth client ID and secret must be set in environment variables');
}

console.log('✅ Google OAuth configured with callback:', callbackURL);

// ✅ Properly type the serializeUser
passport.serializeUser((user: any, done) => {
  done(null, user._id || user.userId);
});

// ✅ Properly type the deserializeUser
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    if (!user) {
      return done(null, false);
    }
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Helper function to store QR source data
const storeQrSource = (user: IUser, hl_src: any) => {
  if (!hl_src) return;
  
  if (hl_src.t) {
    user.hl_source_token = hl_src.t.toUpperCase();
  }
  
  if (hl_src.utm_source || hl_src.utm_medium || hl_src.utm_campaign) {
    user.hl_utm_data = {
      utm_source: hl_src.utm_source || undefined,
      utm_medium: hl_src.utm_medium || undefined,
      utm_campaign: hl_src.utm_campaign || undefined,
      utm_content: hl_src.utm_content || undefined,
      utm_term: hl_src.utm_term || undefined
    };
  }
  
  if (hl_src.ts) {
    user.qr_landing_timestamp = new Date(hl_src.ts);
  }
  
  user.qr_auth_timestamp = new Date();
  user.qr_flow_completed = true;
};

passport.use(new GoogleStrategy({
  clientID,
  clientSecret,
  callbackURL,
  passReqToCallback: true,
}, async (req, accessToken, refreshToken, profile: Profile, done) => {
  try {
    console.log('🔍 Google profile received:', {
      id: profile.id,
      email: profile.emails?.[0]?.value,
      name: profile.displayName
    });

    const email = profile.emails?.[0]?.value;
    if (!email) {
      console.error('❌ No email found in Google profile');
      throw new Error('No email found in Google profile');
    }

    // Get region and QR source from OAuth state
    let region = 'ae';
    let hl_src = null;
    
    try {
      if (req.query?.state) {
        const stateData = JSON.parse(Buffer.from(req.query.state as string, 'base64').toString('utf-8'));
        region = stateData.region || 'ae';
        hl_src = stateData.hl_src || null;
        console.log('✅ Decoded OAuth state:', stateData);
      }
    } catch (e) {
      console.error('❌ Failed to parse OAuth state:', e);
    }

    let user = await User.findOne({ email });
    
    if (!user) {
      console.log('🆕 Creating new user for:', email);
      
      user = new User({
        email,
        name: profile.displayName || email.split('@')[0],
        profileImage: profile.photos?.[0]?.value,
        role: Role.CONSUMER,
        loginMethod: LoginMethod.GOOGLE,
        googleId: profile.id,
        region: region,
        isActive: true
      });
      
      // Store QR source for new users
      storeQrSource(user, hl_src);
      
      await user.save();
      console.log('✅ New user created:', user._id);
    } else {
      console.log('✅ Existing user found:', user._id);
      
      // Update loginMethod and profile if not set
      if (!user.loginMethod) {
        user.loginMethod = LoginMethod.GOOGLE;
      }
      if (!user.googleId) {
        user.googleId = profile.id;
      }
      if (profile.displayName && !user.name) {
        user.name = profile.displayName;
      }
      if (profile.photos?.[0]?.value && !user.profileImage) {
        user.profileImage = profile.photos[0].value;
      }
      
      // Update last login
      user.lastLogin = new Date();
      
      // Store QR source for existing users
      storeQrSource(user, hl_src);
      
      await user.save();
      console.log('✅ User updated:', user._id);
    }
    
    // ✅ CRITICAL: Return full user object with all required fields
    const userObject = {
      _id: user._id,
      email: user.email,
      name: user.name || email.split('@')[0],
      role: user.role,
      loginMethod: LoginMethod.GOOGLE,
      phone: user.phone,
      googleId: user.googleId,
      hl_source_token: user.hl_source_token,
      hl_utm_data: user.hl_utm_data,
      region: region
    };
    
    console.log('✅ Returning user object to passport:', {
      _id: userObject._id.toString(),
      email: userObject.email,
      role: userObject.role
    });
    
    done(null, userObject);
  } catch (error: any) {
    console.error('❌ Error in Google OAuth strategy:', error);
    done(error);
  }
}));

export default passport;
