import { Request, Response } from 'express';
import User, { Role } from '../models/User';
import { generateOtpHash, verifyOtpHash } from '../services/otpService';
import { sendOtpEmail } from '../services/emailService';
import { signJwt } from '../utils/jwt';

function generateRandomOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via Phone
export const sendOtp = async (req: Request, res: Response) => {
  const { phone, region } = req.body;
  if (!phone) return res.status(400).json({ message: 'Phone number is required' });

  const otp = generateRandomOtp();
  const otpHash = await generateOtpHash(otp);
  const otpExpiry = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRY || '300') * 1000));

  let user = await User.findOne({ phone });

  if (!user) {
    user = new User({ phone, otpCode: otpHash, otpExpiresAt: otpExpiry, role: Role.CONSUMER });
  } else {
    user.otpCode = otpHash;
    user.otpExpiresAt = otpExpiry;
  }
  await user.save();

  console.log(`Send OTP ${otp} to phone ${phone}`); // Replace with real SMS logic

  res.json({ message: 'OTP sent to phone' });
};

// Send OTP via Email
export const sendEmailOtp = async (req: Request, res: Response) => {
  const { email, region } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  const otp = generateRandomOtp();
  const otpHash = await generateOtpHash(otp);
  const otpExpiry = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRY || '300') * 1000));

  let user = await User.findOne({ email });

  if (!user) {
    user = new User({ email, otpCode: otpHash, otpExpiresAt: otpExpiry, role: Role.CONSUMER });
  } else {
    user.otpCode = otpHash;
    user.otpExpiresAt = otpExpiry;
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
  const { phone, otp, region } = req.body;
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
  await user.save();

  const token = signJwt({ userId: user._id.toString(), role: user.role, region });

  res.json({ token, role: user.role, phone: user.phone, name: user.name, email: user.email });
};

// Verify OTP for Email
export const verifyEmailOtp = async (req: Request, res: Response) => {
  const { email, otp, region } = req.body;
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
  await user.save();

  const token = signJwt({ userId: user._id.toString(), role: user.role, region });

  res.json({ token, role: user.role, email: user.email, name: user.name, phone: user.phone });
};
