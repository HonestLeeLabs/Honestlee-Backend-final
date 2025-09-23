import bcrypt from 'bcrypt';

export async function generateOtpHash(otp: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(otp, saltRounds);
}

export async function verifyOtpHash(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}
