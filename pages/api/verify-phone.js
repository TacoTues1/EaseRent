import { supabase } from '../../lib/supabaseClient';
import { sendOTP } from '../../lib/sms';

// In-memory OTP storage (for production, use Redis or database)
// Format: { [phone]: { code: string, expiresAt: number, attempts: number } }
const otpStore = new Map();

// Generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Clean up expired OTPs periodically
function cleanupExpiredOTPs() {
  const now = Date.now();
  for (const [phone, data] of otpStore.entries()) {
    if (data.expiresAt < now) {
      otpStore.delete(phone);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, phone, code, userId } = req.body;

  // Normalize phone number to E.164 format
  let normalizedPhone = phone?.replace(/[\s\-\(\)\.]/g, ''); // Remove spaces, dashes, parentheses, dots
  
  if (normalizedPhone) {
    // Remove any non-digit characters except leading +
    const hasPlus = normalizedPhone.startsWith('+');
    normalizedPhone = normalizedPhone.replace(/\D/g, ''); // Keep only digits
    
    // Handle different formats
    if (normalizedPhone.startsWith('63') && normalizedPhone.length >= 12) {
      // Already has country code (639XXXXXXXXX)
      normalizedPhone = '+' + normalizedPhone;
    } else if (normalizedPhone.startsWith('0') && normalizedPhone.length >= 11) {
      // Local format (09XXXXXXXXX) - remove leading 0 and add +63
      normalizedPhone = '+63' + normalizedPhone.slice(1);
    } else if (normalizedPhone.length === 10 && normalizedPhone.startsWith('9')) {
      // Without leading 0 (9XXXXXXXXX)
      normalizedPhone = '+63' + normalizedPhone;
    } else if (hasPlus && normalizedPhone.length >= 10) {
      // Had a + sign, restore it
      normalizedPhone = '+' + normalizedPhone;
    } else {
      // Default: assume Philippines mobile without prefix
      normalizedPhone = '+63' + normalizedPhone;
    }
  }

  // Validate E.164 format: + followed by 10-15 digits
  const e164Regex = /^\+[1-9]\d{9,14}$/;
  if (!normalizedPhone || !e164Regex.test(normalizedPhone)) {
    return res.status(400).json({ 
      error: 'Invalid phone number format. Please enter a valid phone number (e.g., 09171234567 or +639171234567)' 
    });
  }

  // Clean up expired OTPs
  cleanupExpiredOTPs();

  if (action === 'send') {
    // Check if there's a recent OTP (rate limiting - 1 minute cooldown)
    const existing = otpStore.get(normalizedPhone);
    if (existing && existing.expiresAt > Date.now() && existing.sentAt > Date.now() - 60000) {
      const waitTime = Math.ceil((existing.sentAt + 60000 - Date.now()) / 1000);
      return res.status(429).json({ 
        error: `Please wait ${waitTime} seconds before requesting a new code` 
      });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP
    otpStore.set(normalizedPhone, {
      code: otpCode,
      expiresAt,
      sentAt: Date.now(),
      attempts: 0
    });

    try {
      // Send OTP via SMS Gateway
      await sendOTP(normalizedPhone, otpCode);

      return res.status(200).json({
        success: true,
        message: 'Verification code sent',
        phone: normalizedPhone
      });
    } catch (error) {
      console.error('Failed to send OTP:', error);
      otpStore.delete(normalizedPhone);
      return res.status(500).json({ 
        error: 'Failed to send verification code. Please try again.' 
      });
    }
  }

  if (action === 'verify') {
    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    const stored = otpStore.get(normalizedPhone);

    if (!stored) {
      return res.status(400).json({ error: 'No verification code found. Please request a new one.' });
    }

    // Check if expired
    if (stored.expiresAt < Date.now()) {
      otpStore.delete(normalizedPhone);
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    // Check attempts (max 5)
    if (stored.attempts >= 5) {
      otpStore.delete(normalizedPhone);
      return res.status(400).json({ error: 'Too many attempts. Please request a new code.' });
    }

    // Increment attempts
    stored.attempts++;

    // Verify code
    if (stored.code !== code) {
      return res.status(400).json({ 
        error: 'Invalid verification code',
        attemptsRemaining: 5 - stored.attempts
      });
    }

    // Success! Delete the OTP
    otpStore.delete(normalizedPhone);

    // Update user's phone in profiles table if userId provided
    if (userId) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ 
          phone: normalizedPhone,
          phone_verified: true,
          phone_verified_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Failed to update profile:', updateError);
        // Still return success since OTP was verified
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Phone number verified successfully',
      phone: normalizedPhone
    });
  }

  return res.status(400).json({ error: 'Invalid action. Use "send" or "verify".' });
}
