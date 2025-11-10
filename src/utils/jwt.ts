import jwt, { SignOptions } from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

type JwtPayload = {
  userId: string;
  role: string;
  region?: string;
};

function getJwtSecret(region?: string): string {
  const regionMap: Record<string, string> = {
    global: process.env.JWT_SECRET_GLOBAL!,
    india: process.env.JWT_SECRET_INDIA!,
    in: process.env.JWT_SECRET_INDIA!,
    uae: process.env.JWT_SECRET_UAE!,
    ae: process.env.JWT_SECRET_UAE!,
    brazil: process.env.JWT_SECRET_BRAZIL!,
    br: process.env.JWT_SECRET_BRAZIL!,
    thailand: process.env.JWT_SECRET_THAILAND!,
    th: process.env.JWT_SECRET_THAILAND!,
  };

  // Try to get region-specific secret
  if (region && regionMap[region.toLowerCase()]) {
    return regionMap[region.toLowerCase()];
  }

  // Fallback to global secret
  if (regionMap["global"]) {
    console.log(`⚠️ No JWT secret for region '${region}', using global secret`);
    return regionMap["global"];
  }

  throw new Error(`No JWT secret configured for region '${region}' or global`);
}

export function signJwt(
  payload: JwtPayload,
  expiresIn: number | string = "1d"
): string {
  try {
    const secret = getJwtSecret(payload.region);
    const options: SignOptions = {
      expiresIn: expiresIn as any,
    };

    console.log(`✅ Signing JWT for region: ${payload.region || "global"}`);
    return jwt.sign(payload, secret, options);
  } catch (error) {
    console.error("❌ JWT signing error:", error);
    throw error;
  }
}

export function verifyJwt(token: string, region?: string): JwtPayload | null {
  try {
    const secret = getJwtSecret(region || "global");
    return jwt.verify(token, secret) as JwtPayload;
  } catch (error) {
    console.error("❌ JWT verification error:", error);
    return null;
  }
}
