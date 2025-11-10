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

// ✅ SerializeUser
passport.serializeUser((user: any, done) => {
  done(null, user.userId || user.id);
});

// ✅ DeserializeUser
passport.deserializeUser(async (userId: string, done) => {
  try {
    const user = await User.findById(userId).lean();
    if (!user) return done(null, false);
    
    done(null, {
      id: user._id.toString(),
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role as string,
      loginMethod: user.loginMethod as string,
      region: user.region,
      phone: user.phone,
      googleId: user.googleId,
      profileImage: user.profileImage,
      hlsourcetoken: user.hl_source_token,
      hlutmdata: user.hl_utm_data,
    });
  } catch (err) {
    done(err);
  }
});

const storeQrSource = (user: IUser, hl_src: any) => {
  if (!hl_src) return;
  if (hl_src.t) user.hl_source_token = hl_src.t.toUpperCase();
  if (hl_src.utm_source || hl_src.utm_medium || hl_src.utm_campaign) {
    user.hl_utm_data = {
      utm_source: hl_src.utm_source || undefined,
      utm_medium: hl_src.utm_medium || undefined,
      utm_campaign: hl_src.utm_campaign || undefined,
      utm_content: hl_src.utm_content || undefined,
      utm_term: hl_src.utm_term || undefined,
    };
  }
  if (hl_src.ts) user.qr_landing_timestamp = new Date(hl_src.ts);
  user.qr_auth_timestamp = new Date();
  user.qr_flow_completed = true;
};

passport.use(
  new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile: Profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) throw new Error('No email found in Google profile');

        let region = 'ae';
        let hlsrc: any = null;

        // Parse state parameter
        if (req.query?.state) {
          try {
            const stateData = JSON.parse(
              Buffer.from(req.query.state as string, 'base64').toString('utf-8')
            );
            region = stateData.region || 'ae';
            hlsrc = stateData.hlsrc || null;
            console.log(`✅ Passport: Decoded state - region=${region}, hlsrc=${hlsrc}`);
          } catch (e) {
            console.error('❌ Passport: Failed to parse state:', e);
          }
        }

        let user = await User.findOne({ email });

        if (!user) {
          user = new User({
            email,
            name: profile.displayName || email.split('@')[0],
            profileImage: profile.photos?.[0]?.value,
            role: Role.CONSUMER,
            loginMethod: LoginMethod.GOOGLE,
            region,
            isActive: true,
            googleId: profile.id,
          });
          storeQrSource(user, hlsrc);
          await user.save();
          console.log(`✅ New user created: ${user.email}`);
        } else {
          if (!user.loginMethod) user.loginMethod = LoginMethod.GOOGLE;
          if (!user.googleId) user.googleId = profile.id;
          if (profile.displayName && !user.name) user.name = profile.displayName;
          if (profile.photos?.[0]?.value && !user.profileImage) {
            user.profileImage = profile.photos[0].value;
          }
          user.lastLogin = new Date();
          storeQrSource(user, hlsrc);
          await user.save();
          console.log(`✅ Existing user updated: ${user.email}`);
        }

        // ✅ Return full user object with ALL properties needed by controller
        const userObject = {
          id: user._id.toString(),
          userId: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          loginMethod: user.loginMethod,
          region: region,
          phone: user.phone,
          googleId: user.googleId,
          profileImage: user.profileImage,
          hlsourcetoken: user.hl_source_token,
          hlutmdata: user.hl_utm_data,
        };

        console.log(`✅ Returning user object:`, userObject);
        done(null, userObject);
      } catch (error) {
        console.error('❌ Passport Google Strategy error:', error);
        done(error as Error);
      }
    }
  )
);

export default passport;