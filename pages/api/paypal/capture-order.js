// PayPal Capture Order API
// This is called after the user approves the payment

const PAYPAL_API_URL = process.env.PAYPAL_MODE === 'live' 
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com'

async function getPayPalAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64')

  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  const data = await response.json()
  return data.access_token
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { orderId } = req.body

  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required' })
  }

  try {
    const accessToken = await getPayPalAccessToken()

    const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    const captureData = await response.json()

    if (!response.ok) {
      console.error('PayPal Capture Error:', captureData)
      return res.status(response.status).json({ error: captureData.message || 'Failed to capture PayPal order' })
    }

    // Extract transaction details
    const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0]
    const transactionId = capture?.id
    const status = captureData.status

    res.status(200).json({ 
      success: true,
      transactionId,
      status,
      captureData 
    })
  } catch (error) {
    console.error('PayPal Capture Error:', error)
    res.status(500).json({ error: 'Failed to capture PayPal payment' })
  }
}
