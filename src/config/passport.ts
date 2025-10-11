import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import User, { Role, LoginMethod } from '../models/User';
import dotenv from 'dotenv';

dotenv.config();

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const callbackURL = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback';

if (!clientID || !clientSecret) {
  throw new Error('Google OAuth client ID and secret must be set in environment variables');
}

passport.serializeUser((user: any, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// 🆕 Helper function to store QR source data
const storeQrSource = (user: any, hl_src: any) => {
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
  passReqToCallback: true, // 🆕 Enable access to req object
}, async (req, accessToken, refreshToken, profile: Profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) throw new Error('No email found in Google profile');

    // 🆕 Get QR source from query params (passed from frontend)
    const hl_src = req.query?.hl_src ? JSON.parse(req.query.hl_src as string) : null;

    let user = await User.findOne({ email });
    
    if (!user) {
      user = new User({
        email,
        name: profile.displayName,
        profileImage: profile.photos?.[0]?.value,
        role: Role.CONSUMER,
        loginMethod: LoginMethod.GOOGLE,
      });
      
      // 🆕 Store QR source for new users
      storeQrSource(user, hl_src);
      
      await user.save();
    } else {
      // Update loginMethod and profile if not set
      if (!user.loginMethod) {
        user.loginMethod = LoginMethod.GOOGLE;
      }
      if (profile.displayName && !user.name) {
        user.name = profile.displayName;
      }
      if (profile.photos?.[0]?.value && !user.profileImage) {
        user.profileImage = profile.photos[0].value;
      }
      
      // 🆕 Store QR source for existing users
      storeQrSource(user, hl_src);
      
      await user.save();
    }
    
    done(null, user);
  } catch (error) {
    done(error);
  }
}));

export default passport;
