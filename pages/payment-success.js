
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function PaymentSuccess() {
    const router = useRouter();
    const { session_id, bill_id } = router.query;
    const [status, setStatus] = useState('loading');
    const [message, setMessage] = useState('Verifying payment...');

    useEffect(() => {
        if (session_id) {
            // Optional: Verify session with backend if strictly needed, 
            // but for now we can assume success if reached here with session_id
            // In a real app, you'd call an API to confirm the session status definitively.
            setStatus('success');
            setMessage('Payment successful! You can now close this window.');
        } else if (router.isReady) { // Only set error if router ready and no session_id
            setStatus('error');
            setMessage('Invalid session.');
        }
    }, [session_id, router.isReady]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <Head>
                <title>Payment Success | EaseRent</title>
            </Head>
            <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg text-center">
                {status === 'loading' && (
                    <div className="animate-pulse flex flex-col items-center">
                        <div className="h-12 w-12 bg-gray-200 rounded-full mb-4"></div>
                        <div className="h-4 w-3/4 bg-gray-200 rounded mb-2"></div>
                    </div>
                )}

                {status === 'success' && (
                    <>
                        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
                            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
                        <p className="text-gray-600 mb-6">{message}</p>
                        <div className="text-sm text-gray-500 mb-6">
                            Reference ID: <span className="font-mono">{session_id?.slice(-8)}</span>
                        </div>

                        <p className="text-sm text-gray-400 mb-4">The app will update automatically.</p>
                        <button
                            onClick={() => window.close()}
                            className="w-full bg-black text-white py-3 px-4 rounded-xl font-bold font-[Manrope] hover:bg-gray-800 transition-colors"
                        >
                            Return to App
                        </button>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
                            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h2>
                        <p className="text-gray-600 mb-6">{message}</p>
                        <Link href="/" className="text-blue-600 font-semibold hover:underline">
                            Go Home
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}
