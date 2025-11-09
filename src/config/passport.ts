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

// ✅ SerializeUser - store the userId
passport.serializeUser((user: any, done) => {
  done(null, user._id ? user._id.toString() : user.userId);
});

// ✅ DeserializeUser - return a plain object matching Express.User interface
passport.deserializeUser(async (userId: string, done) => {
  try {
    const user = await User.findById(userId).lean();
    if (!user) return done(null, false);
    
    // ✅ Return a plain object with userId property (not _id)
    done(null, {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role as string,
      loginMethod: user.loginMethod as string,
      region: user.region,
      phone: user.phone,
      googleId: user.googleId,
      profileImage: user.profileImage,
      hl_source_token: user.hl_source_token,
      hl_utm_data: user.hl_utm_data,
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
        let hl_src: any = null;
        if (req.query?.state) {
          try {
            const stateData = JSON.parse(
              Buffer.from(req.query.state as string, 'base64').toString('utf-8'),
            );
            region = stateData.region || 'ae';
            hl_src = stateData.hl_src || null;
          } catch (e) {
            // ignore error
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
          storeQrSource(user, hl_src);
          await user.save();
        } else {
          if (!user.loginMethod) user.loginMethod = LoginMethod.GOOGLE;
          if (!user.googleId) user.googleId = profile.id;
          if (profile.displayName && !user.name) user.name = profile.displayName;
          if (profile.photos?.[0]?.value && !user.profileImage)
            user.profileImage = profile.photos[0].value;
          user.lastLogin = new Date();
          storeQrSource(user, hl_src);
          await user.save();
        }

        // ✅ CRITICAL FIX: Return a plain object with userId (not the Mongoose document)
        // This matches your Express.User interface which requires userId property
        done(null, {
          userId: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          loginMethod: user.loginMethod,
          region: region,
          phone: user.phone,
          googleId: user.googleId,
          profileImage: user.profileImage,
          hl_source_token: user.hl_source_token,
          hl_utm_data: user.hl_utm_data,
        });
      } catch (error) {
        done(error);
      }
    },
  ),
);

export default passport;
