
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    const { sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId' });
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        res.status(200).json({
            paymentIntentId: session.payment_intent,
            paymentStatus: session.payment_status,
            status: session.status,
            amountTotal: session.amount_total,
        });
    } catch (err) {
        console.error('Stripe Retrieve Session Error:', err);
        res.status(500).json({ error: err.message });
    }
}
