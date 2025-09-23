import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import User, { Role } from '../models/User';
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

passport.use(new GoogleStrategy({
  clientID,
  clientSecret,
  callbackURL,
}, async (accessToken, refreshToken, profile: Profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) throw new Error('No email found in Google profile');

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        email,
        name: profile.displayName,
        role: Role.CONSUMER,
      });
      await user.save();
    }
    done(null, user);
  } catch (error) {
    done(error);
  }
}));

export default passport;
