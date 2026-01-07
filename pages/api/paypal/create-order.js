// PayPal Create Order API
// Set your PayPal credentials in environment variables:
// PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET

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

  const { amount, currency = 'USD', description, paymentRequestId } = req.body

  if (!amount || !paymentRequestId) {
    return res.status(400).json({ error: 'Amount and paymentRequestId are required' })
  }

  try {
    const accessToken = await getPayPalAccessToken()

    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: paymentRequestId,
          description: description || 'EaseRent Payment',
          amount: {
            currency_code: currency,
            value: parseFloat(amount).toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: 'EaseRent',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/payments?paypal=success`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/payments?paypal=cancelled`,
      },
    }

    const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    })

    const order = await response.json()

    if (!response.ok) {
      console.error('PayPal Error:', order)
      return res.status(response.status).json({ error: order.message || 'Failed to create PayPal order' })
    }

    res.status(200).json({ orderId: order.id, order })
  } catch (error) {
    console.error('PayPal Create Order Error:', error)
    res.status(500).json({ error: 'Failed to create PayPal order' })
  }
}
