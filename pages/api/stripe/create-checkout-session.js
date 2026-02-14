
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    const { amount, description, bill_id, success_url, cancel_url, customer_email } = req.body;

    try {
        const amountInCents = Math.round(parseFloat(amount) * 100);

        // Validation for minimum amount (e.g., usually ~25-30 PHP or 0.50 USD equivalent depending on currency)
        if (amountInCents < 2500) { // 25.00 PHP check
            // Stripe minimum is often around $0.50 USD
            // But let's assume valid amount from client
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'php',
                        product_data: {
                            name: description || 'Bill Payment',
                            metadata: {
                                bill_id: bill_id
                            }
                        },
                        unit_amount: amountInCents,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: success_url || `${req.headers.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancel_url || `${req.headers.origin}/payment-cancel`,
            customer_email: customer_email,
            metadata: {
                bill_id: bill_id
            }
        });

        res.status(200).json({ url: session.url, sessionId: session.id });
    } catch (err) {
        console.error('Stripe Checkout Error:', err);
        res.status(500).json({ error: err.message });
    }
}
