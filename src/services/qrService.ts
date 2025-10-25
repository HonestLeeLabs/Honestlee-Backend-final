import crypto from 'crypto';
import jwt from 'jsonwebtoken';

interface QRPayload {
  venueId: string;
  staffId: string;
  timestamp: number;
  type: 'STAFF_QR' | 'VENUE_QR';
}

// Generate rotating QR code for staff
export async function generateRotatingQR(venueId: string, staffId: string): Promise<any> {
  const secret = process.env.QR_SECRET || 'your-qr-secret-key';
  
  const payload: QRPayload = {
    venueId,
    staffId,
    timestamp: Date.now(),
    type: 'STAFF_QR'
  };

  // Token valid for 2 minutes (120 seconds)
  const token = jwt.sign(payload, secret, { expiresIn: '2m' });

  // Generate HMAC for additional security
  const hmac = crypto.createHmac('sha256', secret)
    .update(`${venueId}-${staffId}-${payload.timestamp}`)
    .digest('hex');

  return {
    token,
    hmac,
    expiresAt: new Date(Date.now() + 2 * 60 * 1000),
    qrData: JSON.stringify({ token, hmac })
  };
}

// Verify rotating QR code
export async function verifyRotatingQR(qrToken: string): Promise<boolean> {
  try {
    const secret = process.env.QR_SECRET || 'your-qr-secret-key';
    
    const decoded = jwt.verify(qrToken, secret) as QRPayload;
    
    // Check if token is recent (within 2 minutes)
    const tokenAge = Date.now() - decoded.timestamp;
    if (tokenAge > 2 * 60 * 1000) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('QR verification error:', error);
    return false;
  }
}

// Generate venue-based self-serve QR (for user scanning)
export function generateVenueQR(venueId: string): string {
  const secret = process.env.QR_SECRET || 'your-qr-secret-key';
  
  const payload: QRPayload = {
    venueId,
    staffId: 'SELF_SERVE',
    timestamp: Date.now(),
    type: 'VENUE_QR'
  };

  return jwt.sign(payload, secret, { expiresIn: '24h' });
}
