import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({ 
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'HonestLee'}" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: 'Your OTP for HonestLee Login',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333; text-align: center;">HonestLee OTP Verification</h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="font-size: 16px; color: #555;">Hello,</p>
          <p style="font-size: 16px; color: #555;">Your OTP for login is:</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 5px; background-color: #e3f2fd; padding: 15px 30px; border-radius: 8px; display: inline-block;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #666;">This OTP will expire in 5 minutes.</p>
          <p style="font-size: 14px; color: #666;">If you didn't request this, please ignore this email.</p>
        </div>
        <p style="font-size: 12px; color: #999; text-align: center;">© 2025 HonestLee. All rights reserved.</p>
      </div>
    `,
    text: `Your OTP for HonestLee login is: ${otp}. This OTP will expire in 5 minutes.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP email sent successfully to ${email}`);
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    throw new Error('Failed to send OTP email');
  }
}

export async function testEmailConfig(): Promise<boolean> {
  try {
    await transporter.verify();
    console.log('Email server is ready to take our messages');
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
}
