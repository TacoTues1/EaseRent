
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { amount, description, paymentRequestId } = req.body;

    try {
        const amountInCents = Math.round(parseFloat(amount) * 100);

        // Stripe limit for PHP is usually 999,999.99 PHP (approx 1M) depending on account settings
        // but explicitly catching the reported error "Amount must be no more than 999,999.99"
        if (amountInCents > 99999999) { // 999,999.99 * 100
            return res.status(400).json({ error: 'Amount exceeds the maximum limit of ₱999,999.99 allowed by Stripe.' });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents, // Stripe expects cents
            currency: 'php',
            description: description,
            metadata: {
                paymentRequestId: paymentRequestId
            },
            automatic_payment_methods: {
                enabled: true,
            },
        });

        res.status(200).json({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (err) {
        console.error('Stripe error:', err);
        res.status(500).json({ error: err.message });
    }
}
