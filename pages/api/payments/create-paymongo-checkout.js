

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST'])
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` })
    }

    const { amount, description, remarks, paymentRequestId, allowedMethods, landlordId } = req.body;

    if (!process.env.PAYMONGO_SECRET_KEY) {
        return res.status(500).json({ error: 'PayMongo Secret Key is missing' });
    }

    const encoded = Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');
    const amountInCentavos = Math.round(parseFloat(amount) * 100);

    // Build the success/cancel URLs
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000');

    const successUrl = `${baseUrl}/payments?paymongo_success=true&payment_request_id=${paymentRequestId}`;
    const cancelUrl = `${baseUrl}/payments?paymongo_cancelled=true`;

    // Use allowed methods from request, fallback to defaults
    const paymentMethodTypes = allowedMethods && allowedMethods.length > 0
        ? allowedMethods
        : ['gcash', 'paymaya', 'card', 'qrph', 'grab_pay'];

    try {
        // === PRIMARY: Use Checkout Sessions API (supports QR PH + all methods) ===
        const checkoutResponse = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                authorization: `Basic ${encoded}`
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        send_email_receipt: false,
                        show_description: true,
                        show_line_items: true,
                        description: description,
                        line_items: [
                            {
                                currency: 'PHP',
                                amount: amountInCentavos,
                                name: description || 'Property Payment',
                                quantity: 1
                            }
                        ],
                        payment_method_types: paymentMethodTypes,
                        success_url: successUrl,
                        cancel_url: cancelUrl,
                        metadata: {
                            payment_request_id: paymentRequestId,
                            landlord_id: landlordId || '',
                            remarks: remarks || ''
                        }
                    }
                }
            })
        });

        const checkoutData = await checkoutResponse.json();

        if (!checkoutData.errors && checkoutData.data) {
            const checkoutUrl = checkoutData.data?.attributes?.checkout_url;
            const checkoutSessionId = checkoutData.data?.id;

            return res.status(200).json({ checkoutUrl, checkoutSessionId });
        }

        // If Checkout Sessions API fails, log the error and try Links API as fallback
        console.warn('PayMongo Checkout Sessions API failed, falling back to Links API:', checkoutData.errors);

        // === FALLBACK: Use Links API (does NOT support QR PH) ===
        const linkResponse = await fetch('https://api.paymongo.com/v1/links', {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                authorization: `Basic ${encoded}`
            },
            body: JSON.stringify({
                data: {
                    attributes: {
                        amount: amountInCentavos,
                        description: description,
                        remarks: remarks || `Payment Request ID: ${paymentRequestId}`
                    }
                }
            })
        });

        const linkData = await linkResponse.json();

        if (linkData.errors) {
            console.error('PayMongo Link Error:', JSON.stringify(linkData.errors, null, 2));
            throw new Error(linkData.errors[0]?.detail || 'PayMongo API Error');
        }

        const checkoutUrl = linkData.data?.attributes?.checkout_url;
        const checkoutSessionId = linkData.data?.id;

        res.status(200).json({ checkoutUrl, checkoutSessionId });

    } catch (error) {
        console.error('PayMongo Checkout Error:', error);
        res.status(500).json({ error: error.message });
    }
}
