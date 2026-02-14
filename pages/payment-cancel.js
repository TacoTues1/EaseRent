
import { useRouter } from 'next/router';

export default function PaymentCancel() {
    const router = useRouter();

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg text-center">
                <>
                    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 mb-6">
                        <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Cancelled</h2>
                    <p className="text-gray-600 mb-6">Your payment was not processed.</p>
                    <button
                        onClick={() => window.close()}
                        className="w-full bg-black text-white py-3 px-4 rounded-xl font-bold font-[Manrope] hover:bg-gray-800 transition-colors"
                    >
                        Return to App
                    </button>
                </>
            </div>
        </div>
    );
}
