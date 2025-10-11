import { Request, Response } from 'express';
import User, { Role, LoginMethod } from '../models/User';
import { generateOtpHash, verifyOtpHash } from '../services/otpService';
import { sendOtpEmail } from '../services/emailService';
import { signJwt } from '../utils/jwt';

function generateRandomOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

// Send OTP via Phone
export const sendOtp = async (req: Request, res: Response) => {
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

  console.log(`Send OTP ${otp} to phone ${phone}`);

  res.json({ message: 'OTP sent to phone' });
};

// Send OTP via Email
export const sendEmailOtp = async (req: Request, res: Response) => {
  const { email, region } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  const otp = generateRandomOtp();
  const otpHash = await generateOtpHash(otp);
  const otpExpiry = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRY || '300') * 1000));

  let user = await User.findOne({ email });

  if (!user) {
    user = new User({
      email,
      otpCode: otpHash,
      otpExpiresAt: otpExpiry,
      role: Role.CONSUMER,
      loginMethod: LoginMethod.EMAIL
    });
  } else {
    user.otpCode = otpHash;
    user.otpExpiresAt = otpExpiry;
    if (!user.loginMethod) {
      user.loginMethod = LoginMethod.EMAIL;
    }
  }
  await user.save();

  try {
    await sendOtpEmail(email, otp);
    res.json({ message: 'OTP sent to email' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send OTP email' });
  }
};

// Verify OTP for Phone
export const verifyOtp = async (req: Request, res: Response) => {
  const { phone, otp, region, hl_src } = req.body;
  if (!phone || !otp) return res.status(400).json({ message: 'Phone and OTP are required' });

  const user = await User.findOne({ phone });
  if (!user || !user.otpCode || !user.otpExpiresAt) {
    return res.status(400).json({ message: 'OTP not requested' });
  }

  if (user.otpExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: 'OTP expired' });
  }

  const isValid = await verifyOtpHash(otp, user.otpCode);
  if (!isValid) return res.status(400).json({ message: 'Invalid OTP' });

  user.otpCode = undefined;
  user.otpExpiresAt = undefined;
  
  // Store QR source data
  storeQrSource(user, hl_src);
  
  await user.save();

  const token = signJwt({ userId: user._id.toString(), role: user.role, region });

  res.json({
    token,
    role: user.role,
    phone: user.phone,
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod,
    hl_source_token: user.hl_source_token,
    hl_utm_data: user.hl_utm_data
  });
};

// Verify OTP for Email
export const verifyEmailOtp = async (req: Request, res: Response) => {
  const { email, otp, region, hl_src } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

  const user = await User.findOne({ email });
  if (!user || !user.otpCode || !user.otpExpiresAt) {
    return res.status(400).json({ message: 'OTP not requested' });
  }

  if (user.otpExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: 'OTP expired' });
  }

  const isValid = await verifyOtpHash(otp, user.otpCode);
  if (!isValid) return res.status(400).json({ message: 'Invalid OTP' });

  user.otpCode = undefined;
  user.otpExpiresAt = undefined;
  
  // Store QR source data
  storeQrSource(user, hl_src);
  
  await user.save();

  const token = signJwt({ userId: user._id.toString(), role: user.role, region });

  res.json({
    token,
    role: user.role,
    email: user.email,
    name: user.name,
    phone: user.phone,
    loginMethod: user.loginMethod,
    hl_source_token: user.hl_source_token,
    hl_utm_data: user.hl_utm_data
  });
};
