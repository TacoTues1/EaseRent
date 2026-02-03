
import React, { useState, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { showToast } from 'nextjs-toast-notify';

// Make sure to call loadStripe outside of a component’s render to avoid
// recreating the Stripe object on every render.
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

function CheckoutForm({ amount, onSuccess, onCancel }) {
    const stripe = useStripe();
    const elements = useElements();
    const [message, setMessage] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!stripe) {
            return;
        }

        const clientSecret = new URLSearchParams(window.location.search).get(
            "payment_intent_client_secret"
        );

        if (!clientSecret) {
            return;
        }

        stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
            switch (paymentIntent.status) {
                case "succeeded":
                    setMessage("Payment succeeded!");
                    break;
                case "processing":
                    setMessage("Your payment is processing.");
                    break;
                case "requires_payment_method":
                    setMessage("Your payment was not successful, please try again.");
                    break;
                default:
                    setMessage("Something went wrong.");
                    break;
            }
        });
    }, [stripe]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        setIsLoading(true);

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                // We don't want to redirect, we want to handle it inline if possible or return to specific URL
                // But confirmPayment usually triggers a redirect or reloads unless we use redirect: "if_required"
                return_url: `${window.location.origin}/payments`,
            },
            redirect: "if_required"
        });

        if (error) {
            if (error.type === "card_error" || error.type === "validation_error") {
                setMessage(error.message);
                showToast.error(error.message, { duration: 4000, transition: "bounceIn" });
            } else {
                setMessage("An unexpected error occurred.");
                showToast.error("An unexpected error occurred.", { duration: 4000, transition: "bounceIn" });
            }
        } else {
            if (paymentIntent && paymentIntent.status === "succeeded") {
                onSuccess(paymentIntent);
            }
        }

        setIsLoading(false);
    };

    return (
        <form id="payment-form" onSubmit={handleSubmit}>
            <PaymentElement id="payment-element" options={{ layout: "tabs" }} />

            {/* Show any error or success messages */}
            {message && <div id="payment-message" className="text-red-500 text-sm mt-2">{message}</div>}

            <div className="flex gap-3 mt-6">
                <button
                    disabled={isLoading || !stripe || !elements}
                    id="submit"
                    className="flex-1 bg-black text-white p-3 rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <span id="button-text">
                        {isLoading ? "Processing..." : `Pay ₱${amount}`}
                    </span>
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-3 border border-gray-300 rounded-lg font-bold hover:bg-gray-50 transition-colors"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}

export default function StripePaymentForm({ amount, description, paymentRequestId, onSuccess, onCancel }) {
    const [clientSecret, setClientSecret] = useState("");
    const [isLoadingSecret, setIsLoadingSecret] = useState(false);
    const debounceTimer = useRef(null);

    useEffect(() => {
        // Clear previous timer
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        setIsLoadingSecret(true);
        setClientSecret("");

        // Debounce API call to avoid spamming Stripe while typing
        debounceTimer.current = setTimeout(() => {
            fetch("/api/stripe/create-payment-intent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount, description, paymentRequestId }),
            })
                .then(async (res) => {
                    const data = await res.json();
                    if (!res.ok) {
                        // Handle error directly without throwing to avoid Next.js overlay
                        console.error("Payment intent error:", data.error);
                        setClientSecret("");
                        showToast.error(data.error || 'Failed to create payment intent', { duration: 4000, transition: "bounceIn" });
                        setIsLoadingSecret(false);
                        return;
                    }
                    setClientSecret(data.clientSecret);
                    setIsLoadingSecret(false);
                })
                .catch(err => {
                    console.error("Network/Fetch error:", err);
                    setClientSecret("");
                    showToast.error("Connection failed. Please try again.", { duration: 4000, transition: "bounceIn" });
                    setIsLoadingSecret(false);
                });
        }, 800); // 800ms delay

        return () => clearTimeout(debounceTimer.current);
    }, [amount, description, paymentRequestId]);

    const appearance = {
        theme: 'stripe',
    };
    const options = {
        clientSecret,
        appearance,
    };

    return (
        <div className="w-full">
            {clientSecret ? (
                <Elements options={options} stripe={stripePromise}>
                    <CheckoutForm amount={amount} onSuccess={onSuccess} onCancel={onCancel} />
                </Elements>
            ) : (
                <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-black"></div>
                </div>
            )}
        </div>
    );
}
