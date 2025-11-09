import jwt, { SignOptions } from 'jsonwebtoken';
import ms from 'ms'; // You may need to install this: npm install ms @types/ms
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
    'in': process.env.JWT_SECRET_INDIA || '', // Alias
    'uae': process.env.JWT_SECRET_UAE || '',
    'ae': process.env.JWT_SECRET_UAE || '', // Alias
    'thailand': process.env.JWT_SECRET_THAILAND || '',
    'th': process.env.JWT_SECRET_THAILAND || '', // Alias
    'brazil': process.env.JWT_SECRET_BRAZIL || ''
  };
  
  if (region && regionMap[region.toLowerCase()]) {
    const secret = regionMap[region.toLowerCase()];
    console.log(`✅ JWT secret found for region: ${region}`);
    return secret;
  }
  
  if (regionMap['global']) {
    console.log('⚠️ Using global JWT secret as fallback');
    return regionMap['global'];
  }
  
  console.error('❌ No JWT secret configured for region:', region);
  throw new Error(`No JWT secret configured for region: ${region} or global`);
}

export function signJwt(
  payload: JwtPayload,
  expiresIn: string | number = '30d',
): string {
  try {
    const secret = getJwtSecret(payload.region);
    
    // ✅ FIX: Type assertion for SignOptions
    const options = {
      expiresIn: expiresIn
    } as SignOptions;
    
    console.log('🔐 Signing JWT for:', {
      userId: payload.userId,
      role: payload.role,
      region: payload.region,
      expiresIn: expiresIn
    });
    
    const token = jwt.sign(payload, secret, options);
    console.log('✅ JWT token generated successfully');
    return token;
  } catch (error: any) {
    console.error('❌ Error signing JWT:', error.message);
    throw error;
  }
}

export function verifyJwt(token: string, region?: string): JwtPayload | null {
  try {
    const secret = getJwtSecret(region || 'global');
    const decoded = jwt.verify(token, secret) as JwtPayload;
    console.log('✅ JWT verified successfully for region:', region);
    return decoded;
  } catch (error: any) {
    console.error('❌ JWT verification failed:', error.message);
    return null;
  }
}
