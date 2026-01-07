import { sendSMS } from '../../lib/sms';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phoneNumber, message } = req.body;

  // Validate input
  if (!phoneNumber || !message) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['phoneNumber', 'message']
    });
  }

  try {
    // Send the SMS (will be queued even if device is temporarily offline)
    const result = await sendSMS(phoneNumber, message);
    
    return res.status(200).json({
      success: true,
      message: 'SMS sent successfully',
      data: result
    });
  } catch (error) {
    console.error('SMS API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to send SMS'
    });
  }
}
