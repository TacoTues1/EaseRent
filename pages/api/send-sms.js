import { sendSMS } from '../../lib/sms';

export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phoneNumber, message } = req.body;

  // 2. Validate input
  if (!phoneNumber || !message) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['phoneNumber', 'message']
    });
  }

  // 3. Configuration (Using the variables you provided)
  const GATEWAY_URL = process.env.SMS_GATEWAY_URL || 'https://api.sms-gate.app';
  const USERNAME = process.env.SMS_GATEWAY_USERNAME;
  const PASSWORD = process.env.SMS_GATEWAY_PASSWORD;
  const DEVICE_ID = process.env.SMS_GATEWAY_DEVICE_ID;

  if (!USERNAME || !PASSWORD || !DEVICE_ID) {
    console.error('SMS Gateway credentials missing');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // 4. Construct the specific payload for SMS Gateway for Android
    // Docs: https://docs.sms-gate.app/integration/api/
    const payload = {
      textMessage: {
        text: message
      },
      phoneNumbers: [phoneNumber], // API expects an array
      deviceId: DEVICE_ID
    };

    // 5. Create Basic Auth Header
    const authHeader = 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

    // 6. Send Request
    const response = await fetch(`${GATEWAY_URL}/3rdparty/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Gateway Error Response:', result);
      throw new Error(result.message || 'SMS Gateway rejected the request');
    }
    
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