// Fallback Email OTP API using Brevo (when Supabase email OTP is exceeded)

// In-memory OTP storage (for production, use Redis or database)
const emailOtpStore = new Map();
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;
const OTP_EXPIRY_MS = 5 * 60 * 1000;

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanupExpiredOTPs() {
    const now = Date.now();
    for (const [email, data] of emailOtpStore.entries()) {
        if (data.expiresAt < now) {
            emailOtpStore.delete(email);
        }
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, email, code } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    cleanupExpiredOTPs();

    if (action === 'send') {
        // Rate limiting - 2 minute cooldown
        const existing = emailOtpStore.get(normalizedEmail);
        if (existing && existing.sentAt > Date.now() - RESEND_COOLDOWN_MS) {
            const waitTime = Math.ceil((existing.sentAt + RESEND_COOLDOWN_MS - Date.now()) / 1000);
            return res.status(429).json({
                error: `Please wait ${waitTime} seconds before requesting a new code`,
                waitSeconds: waitTime
            });
        }

        const otpCode = generateOTP();
        const expiresAt = Date.now() + OTP_EXPIRY_MS; // 5 minutes

        emailOtpStore.set(normalizedEmail, {
            code: otpCode,
            expiresAt,
            sentAt: Date.now(),
            attempts: 0
        });

        try {
            // Send via Brevo (same SDK used in lib/email.js)
            let brevo;
            try {
                brevo = await import('@getbrevo/brevo');
            } catch (impErr) {
                console.error('Brevo SDK import failed:', impErr);
                emailOtpStore.delete(normalizedEmail);
                return res.status(500).json({ error: 'Email service not available' });
            }

            const apiInstance = new brevo.TransactionalEmailsApi();
            apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

            const sendSmtpEmail = new brevo.SendSmtpEmail();
            sendSmtpEmail.sender = { name: 'Abalay', email: 'alfnzperez@gmail.com' };
            sendSmtpEmail.to = [{ email: normalizedEmail }];
            sendSmtpEmail.subject = 'Abalay - Email Verification Code';
            sendSmtpEmail.htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">Abalay</h1>
            <p style="color: #666; margin-top: 5px;">Email Verification</p>
          </div>
          <div style="background: #f8f8f8; border-radius: 16px; padding: 30px; text-align: center;">
            <p style="color: #333; font-size: 16px; margin: 0 0 20px;">Your verification code is:</p>
            <div style="background: #1a1a1a; color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 15px 30px; border-radius: 12px; display: inline-block;">
              ${otpCode}
            </div>
                        <p style="color: #999; font-size: 13px; margin-top: 20px;">This code expires in 5 minutes.<br/>Do not share this code with anyone.</p>
          </div>
        </div>
      `;

            await apiInstance.sendTransacEmail(sendSmtpEmail);

            return res.status(200).json({
                success: true,
                                message: 'Verification code sent to your email',
                                waitSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000),
                                expiresInSeconds: Math.ceil(OTP_EXPIRY_MS / 1000)
            });
        } catch (error) {
            console.error('Failed to send email OTP via Brevo:', error);
            emailOtpStore.delete(normalizedEmail);
            return res.status(500).json({
                error: 'Failed to send verification code. Please try again.'
            });
        }
    }

    if (action === 'verify') {
        if (!code) {
            return res.status(400).json({ error: 'Verification code is required' });
        }

        const stored = emailOtpStore.get(normalizedEmail);

        if (!stored) {
            return res.status(400).json({ error: 'No verification code found. Please request a new one.' });
        }

        if (stored.expiresAt < Date.now()) {
            emailOtpStore.delete(normalizedEmail);
            return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
        }

        if (stored.attempts >= 5) {
            emailOtpStore.delete(normalizedEmail);
            return res.status(400).json({ error: 'Too many attempts. Please request a new code.' });
        }

        stored.attempts++;

        if (stored.code !== code) {
            return res.status(400).json({
                error: 'Invalid verification code',
                attemptsRemaining: 5 - stored.attempts
            });
        }

        emailOtpStore.delete(normalizedEmail);

        return res.status(200).json({
            success: true,
            message: 'Email verified successfully'
        });
    }

    return res.status(400).json({ error: 'Invalid action. Use "send" or "verify".' });
}
