import User, { IUser, Role } from '../models/User';
import { generateOtpHash, verifyOtpHash } from './otpService';

export async function createOrUpdateOtp(phone: string, otp: string, expirySeconds: number): Promise<IUser> {
  const otpHash = await generateOtpHash(otp);
  const otpExpiresAt = new Date(Date.now() + expirySeconds * 1000);

  let user = await User.findOne({ phone });

  if (!user) {
    user = new User({ phone, otpCode: otpHash, otpExpiresAt, role: Role.CONSUMER });
  } else {
    user.otpCode = otpHash;
    user.otpExpiresAt = otpExpiresAt;
  }
  await user.save();
  return user;
}

export async function verifyUserOtp(phone: string, otp: string): Promise<IUser | null> {
  const user = await User.findOne({ phone });
  if (!user || !user.otpCode || !user.otpExpiresAt) return null;
  if (user.otpExpiresAt < new Date()) return null;
  const valid = await verifyOtpHash(otp, user.otpCode);
  return valid ? user : null;
}
