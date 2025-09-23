import express from 'express';
import { sendOtp, verifyOtp, sendEmailOtp, verifyEmailOtp } from '../controllers/authController';

const router = express.Router();

// Phone OTP routes
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

// Email OTP routes
router.post('/send-email-otp', sendEmailOtp);
router.post('/verify-email-otp', verifyEmailOtp);

export default router;
