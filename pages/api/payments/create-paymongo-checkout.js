

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST'])
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` })
    }

    // Use Links API as fallback since Checkout Session is restricted
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
                        amount: Math.round(parseFloat(amount) * 100),
                        description: description,
                        remarks: remarks
                    }
                }
            })
        };

        const response = await fetch('https://api.paymongo.com/v1/links', options);
        const apiData = await response.json();

        if (apiData.errors) {
            console.error('PayMongo Link Error Payload:', JSON.stringify(options.body, null, 2));
            throw new Error(apiData.errors[0]?.detail || 'PayMongo API Error');
        }

        const checkoutUrl = apiData.data?.attributes?.checkout_url;
        const checkoutSessionId = apiData.data?.id; // Link ID, not Session ID, but serves similar purpose for ref

        res.status(200).json({ checkoutUrl, checkoutSessionId });

    } catch (error) {
        console.error('PayMongo Checkout Error:', error);
        res.status(500).json({ error: error.message });
    }
}
