// ===== COMPLETE FIXED FILE: src/controllers/authController.ts =====
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User, { Role, LoginMethod } from '../models/User';
import { generateOtpHash, verifyOtpHash } from '../services/otpService';
import { sendOtpEmail } from '../services/emailService';

function generateRandomOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper function to sign JWT token
function signJwt(payload: { userId: string; role: string; region?: string }): string {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// Helper function to store QR source data
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

// ===== SEND OTP VIA PHONE =====
export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { phone, region } = req.body;
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });

    const otp = generateRandomOtp();
    const otpHash = await generateOtpHash(otp);
    const otpExpiry = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRY || '300') * 1000));

    let user = await User.findOne({ phone });

    if (!user) {
      user = new User({
        phone,
        otpCode: otpHash,
        otpExpiresAt: otpExpiry,
        role: Role.CONSUMER,
        loginMethod: LoginMethod.PHONE
      });
    } else {
      user.otpCode = otpHash;
      user.otpExpiresAt = otpExpiry;
      if (!user.loginMethod) {
        user.loginMethod = LoginMethod.PHONE;
      }
    }
    await user.save();

    console.log(`📱 Send OTP ${otp} to phone ${phone}`);

    res.json({ 
      success: true,
      message: 'OTP sent to phone' 
    });
  } catch (error: any) {
    console.error('❌ Error sending phone OTP:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to send OTP' 
    });
  }
};

// ===== SEND OTP VIA EMAIL =====
export const sendEmailOtp = async (req: Request, res: Response) => {
  try {
    const { email, region } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const otp = generateRandomOtp();
    const otpHash = await generateOtpHash(otp);
    const otpExpiry = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRY || '300') * 1000));

    // ✅ Use case-insensitive email lookup
    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ 
      email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } 
    });

    if (!user) {
      user = new User({
        email: normalizedEmail,
        otpCode: otpHash,
        otpExpiresAt: otpExpiry,
        role: Role.CONSUMER,
        loginMethod: LoginMethod.EMAIL
      });
      console.log(`📝 Creating NEW user with email: ${normalizedEmail}`);
    } else {
      user.otpCode = otpHash;
      user.otpExpiresAt = otpExpiry;
      if (!user.loginMethod) {
        user.loginMethod = LoginMethod.EMAIL;
      }
      console.log(`♻️ EXISTING user found: ${user._id} for email: ${normalizedEmail}`);
    }
    await user.save();

    await sendOtpEmail(email, otp);
    
    res.json({ 
      success: true,
      message: 'OTP sent to email',
      debug: {
        userId: user._id.toString(),
        isNewUser: !user.createdAt || (Date.now() - user.createdAt.getTime() < 5000)
      }
    });
  } catch (error: any) {
    console.error('❌ Error sending email OTP:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to send OTP email' 
    });
  }
};

// ===== VERIFY OTP FOR PHONE =====
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { phone, otp, region, hl_src } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required' });
    }

    const user = await User.findOne({ phone });
    if (!user || !user.otpCode || !user.otpExpiresAt) {
      return res.status(400).json({ message: 'OTP not requested' });
    }

    if (user.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    const isValid = await verifyOtpHash(otp, user.otpCode);
    if (!isValid) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    user.otpCode = undefined;
    user.otpExpiresAt = undefined;
    
    // Store QR source data
    storeQrSource(user, hl_src);
    
    await user.save();

    // ✅ Generate JWT token
    const token = signJwt({ 
      userId: user._id.toString(), 
      role: user.role, 
      region: region || 'ae'
    });

    console.log(`✅ Login successful for phone ${phone}, userId: ${user._id}`);

    res.json({
      success: true,
      token,
      role: user.role,
      phone: user.phone,
      name: user.name,
      email: user.email,
      loginMethod: user.loginMethod,
      userId: user._id.toString(),
      hl_source_token: user.hl_source_token,
      hl_utm_data: user.hl_utm_data
    });
  } catch (error: any) {
    console.error('❌ Phone login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
};

// ===== VERIFY OTP FOR EMAIL =====
export const verifyEmailOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp, region, hl_src } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    // ✅ Use case-insensitive email lookup
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ 
      email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } 
    });
    
    if (!user || !user.otpCode || !user.otpExpiresAt) {
      console.error(`❌ OTP verification failed: User not found or OTP not set for ${normalizedEmail}`);
      return res.status(400).json({ message: 'OTP not requested' });
    }

    console.log(`🔍 Verifying OTP for userId: ${user._id}, email: ${user.email}`);

    if (user.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    const isValid = await verifyOtpHash(otp, user.otpCode);
    if (!isValid) {
      console.error(`❌ Invalid OTP for userId: ${user._id}`);
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    user.otpCode = undefined;
    user.otpExpiresAt = undefined;
    
    // Store QR source data
    storeQrSource(user, hl_src);
    
    await user.save();

    // ✅ Generate JWT token with SAME userId
    const token = signJwt({ 
      userId: user._id.toString(), 
      role: user.role, 
      region: region || 'ae'
    });

    console.log(`✅ Login successful for ${normalizedEmail}, userId: ${user._id}`);
    console.log(`✅ Token generated for userId: ${user._id}, role: ${user.role}`);

    res.json({
      success: true,
      token,
      role: user.role,
      email: user.email,
      name: user.name,
      phone: user.phone,
      loginMethod: user.loginMethod,
      userId: user._id.toString(),
      hl_source_token: user.hl_source_token,
      hl_utm_data: user.hl_utm_data
    });
  } catch (error: any) {
    console.error('❌ Email login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
};

// Export all functions
export default {
  sendOtp,
  sendEmailOtp,
  verifyOtp,
  verifyEmailOtp
};
