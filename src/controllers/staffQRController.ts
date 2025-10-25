import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middlewares/authMiddleware';
import StaffQR, { IStaffQR } from '../models/StaffQR';
import StaffSession, { IStaffSession } from '../models/StaffSession';
import VenueRoster from '../models/VenueRoster';

// POST /api/staff/qr/generate - Generate rotating staff QR
export const generateStaffRotatingQR = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['STAFF', 'MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId, ttlSeconds = 120 } = req.body;

    // Verify active session with type assertion
    const session = await StaffSession.findOne({
      staffUserId: req.user.userId,
      venueId,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }) as IStaffSession | null;

    if (!session) {
      return res.status(403).json({ success: false, message: 'No active session' });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Revoke any existing active staff QRs for this user/venue
    await StaffQR.updateMany(
      {
        venueId,
        issuerUserId: req.user.userId,
        type: 'STAFF_QR',
        state: 'ACTIVE'
      },
      { state: 'REVOKED' }
    );

    const staffQR = new StaffQR({
      venueId,
      roleScope: session.role,
      token,
      tokenHash,
      ttlSeconds,
      expiresAt,
      issuerSessionId: session._id,
      issuerUserId: req.user.userId,
      type: 'STAFF_QR'
    });

    await staffQR.save();

    // Generate QR data URL (in production, use a proper QR library)
    const qrDataUrl = `honestlee://staff-verify?token=${token}&venueId=${venueId}`;
    const shortUrl = `https://hnst.ly/s/${token.substring(0, 8)}`;

    res.json({
      success: true,
      data: {
        qrId: staffQR._id,
        token, // Only return once during generation
        qrDataUrl,
        shortUrl,
        expiresAt,
        ttlSeconds,
        issuedAt: staffQR.issuedAt
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error generating QR', error: error.message });
  }
};

// POST /api/staff/qr/rotate - Rotate staff QR (manually)
export const rotateStaffQR = async (req: AuthRequest, res: Response) => {
  try {
    // Same as generate, but with analytics event
    return generateStaffRotatingQR(req, res);
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error rotating QR', error: error.message });
  }
};

// POST /api/staff/qr/verify - Verify staff QR token
export const verifyStaffQR = async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const staffQR = await StaffQR.findOne({
      tokenHash,
      type: 'STAFF_QR',
      state: 'ACTIVE'
    }).populate('venueId', 'name') as IStaffQR | null;

    if (!staffQR) {
      return res.status(400).json({ success: false, message: 'Invalid or expired QR code' });
    }

    if (staffQR.expiresAt < new Date()) {
      staffQR.state = 'EXPIRED';
      await staffQR.save();
      return res.status(400).json({ success: false, message: 'QR code expired' });
    }

    res.json({
      success: true,
      data: {
        venueId: staffQR.venueId,
        roleScope: staffQR.roleScope,
        issuedAt: staffQR.issuedAt,
        expiresAt: staffQR.expiresAt
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error verifying QR', error: error.message });
  }
};

// POST /api/staff/qr/onboard/generate - Generate onboarding QR for new staff
export const generateOnboardQR = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId, roleScope = 'MEMBER', ttlSeconds = 3600 } = req.body;

    // Verify session with type assertion
    const session = await StaffSession.findOne({
      staffUserId: req.user.userId,
      venueId,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }) as IStaffSession | null;

    if (!session) {
      return res.status(403).json({ success: false, message: 'No active session' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const onboardQR = new StaffQR({
      venueId,
      roleScope,
      token,
      tokenHash,
      ttlSeconds,
      expiresAt,
      issuerSessionId: session._id,
      issuerUserId: req.user.userId,
      type: 'ONBOARD_QR'
    });

    await onboardQR.save();

    const qrDataUrl = `honestlee://staff-onboard?token=${token}&venueId=${venueId}&role=${roleScope}`;
    const shortUrl = `https://hnst.ly/o/${token.substring(0, 8)}`;

    res.json({
      success: true,
      data: {
        qrId: onboardQR._id,
        token,
        qrDataUrl,
        shortUrl,
        roleScope,
        expiresAt,
        ttlSeconds
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error generating onboard QR', error: error.message });
  }
};

// POST /api/staff/qr/onboard/activate - Activate staff member via onboarding QR
export const activateOnboardQR = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { token } = req.body;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const onboardQR = await StaffQR.findOne({
      tokenHash,
      type: 'ONBOARD_QR',
      state: 'ACTIVE'
    }) as IStaffQR | null;

    if (!onboardQR) {
      return res.status(400).json({ success: false, message: 'Invalid or already used onboarding code' });
    }

    if (onboardQR.expiresAt < new Date()) {
      onboardQR.state = 'EXPIRED';
      await onboardQR.save();
      return res.status(400).json({ success: false, message: 'Onboarding code expired' });
    }

    // Check if already on roster
    let roster = await VenueRoster.findOne({
      staffUserId: req.user.userId,
      venueId: onboardQR.venueId
    });

    if (roster && roster.status === 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Already active staff member' });
    }

    if (!roster) {
      roster = new VenueRoster({
        staffUserId: req.user.userId,
        venueId: onboardQR.venueId,
        role: onboardQR.roleScope,
        status: 'ACTIVE',
        invitedBy: onboardQR.issuerUserId,
        activatedAt: new Date()
      });
    } else {
      roster.status = 'ACTIVE';
      roster.role = onboardQR.roleScope;
      roster.activatedAt = new Date();
    }

    await roster.save();

    // Mark QR as used
    onboardQR.state = 'USED';
    onboardQR.usedBy = req.user.userId as any;
    onboardQR.usedAt = new Date();
    await onboardQR.save();

    res.json({
      success: true,
      message: 'Successfully joined venue staff',
      data: {
        venueId: roster.venueId,
        role: roster.role
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error activating onboard code', error: error.message });
  }
};
