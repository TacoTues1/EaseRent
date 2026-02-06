import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST'])
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` })
    }

    const { amount, description, remarks, paymentRequestId } = req.body;

    if (!process.env.PAYMONGO_SECRET_KEY) {
        return res.status(500).json({ error: 'PayMongo Secret Key is missing' });
    }

    try {
        const encoded = Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');

        const options = {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                authorization: `Basic ${encoded}`
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        amount: Math.round(parseFloat(amount) * 100), // Convert to centavos (integer)
                        description: description,
                        remarks: remarks || `Payment Request ID: ${paymentRequestId}`
                    }
                }
            })
        };

        const response = await fetch('https://api.paymongo.com/v1/links', options);
        const apiData = await response.json();

        if (apiData.errors) {
            throw new Error(apiData.errors[0]?.detail || 'PayMongo API Error');
        }

        const checkoutUrl = apiData.data?.attributes?.checkout_url;

        if (!checkoutUrl) {
            throw new Error('No checkout URL returned from PayMongo');
        }

        res.status(200).json({ checkoutUrl });

    } catch (error) {
        console.error('PayMongo Error:', error);
        res.status(500).json({ error: error.message });
    }
}
