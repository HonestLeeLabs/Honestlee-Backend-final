import jwt, { SignOptions } from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

type JwtPayload = {
  userId: string;
  role: string;
  region?: string;
};

function getJwtSecret(region?: string): string {
  const regionMap: Record<string, string> = {
    'global': process.env.JWT_SECRET_GLOBAL || '',
    'india': process.env.JWT_SECRET_INDIA || '',
    'uae': process.env.JWT_SECRET_UAE || '',
    'brazil': process.env.JWT_SECRET_BRAZIL || ''
  };
  if (region && regionMap[region.toLowerCase()]) {
    return regionMap[region.toLowerCase()];
  }
  if (regionMap['global']) {
    return regionMap['global'];
  }
  throw new Error('No JWT secret configured for region or global');
}

export function signJwt(
  payload: JwtPayload,
  expiresIn: number | string = '1d',
): string {
  const secret = getJwtSecret(payload.region);
  const options: SignOptions = { expiresIn: expiresIn as any }; // <-- Fixed!
  return jwt.sign(payload, secret, options);
}

export function verifyJwt(token: string, region?: string): JwtPayload | null {
  try {
    const secret = getJwtSecret(region || 'global');
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}
