import Head from 'next/head'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import Link from 'next/link'
import { useState } from 'react'

export default function DeleteAccount() {
    const [expanded, setExpanded] = useState(null)

    const supportEmail = 'alfnzperez@gmail.com'
    const supportSubject = 'Account Deletion Request'
    const supportBody = 'Hi Abalay Support,\n\nI would like to request account deletion for my account.\n\nEmail associated with my account: \n\nThank you.'
    const supportContactLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(supportEmail)}&su=${encodeURIComponent(supportSubject)}&body=${encodeURIComponent(supportBody)}`

    const toggle = (index) => {
        setExpanded(expanded === index ? null : index)
    }

    const faqs = [
        {
            q: 'Can I reactivate my account after deletion?',
            a: 'No. Once your account is deleted, it cannot be recovered or reactivated. You would need to create a brand-new account if you wish to use Abalay again in the future.'
        },
        {
            q: 'What happens to my active lease or rental agreements?',
            a: 'You must resolve any active lease agreements, outstanding payments, or ongoing bookings before requesting account deletion. Our team will verify this before processing your request.'
        },
        {
            q: 'How long does the deletion process take?',
            a: 'Account deletion requests are typically processed within 7 business days. You will receive a confirmation email once your account and data have been fully removed.'
        },
        {
            q: 'Will my reviews and ratings be deleted?',
            a: 'Yes. All reviews and ratings you have submitted will be permanently removed from the platform as part of the deletion process.'
        }
    ]

    return (
        <div className="min-h-screen bg-white text-black font-sans">
            <Head>
                <title>Delete Your Account | Abalay</title>
                <meta name="description" content="Request deletion of your Abalay account and all associated personal data. Learn what data is deleted, what is retained, and the steps to complete your request." />
            </Head>

            <Navbar />

            <main className="max-w-4xl mx-auto px-6 py-12">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-8">
                    <Link href="/" className="hover:text-black">Home</Link>
                    <span className="text-gray-300">/</span>
                    <span className="text-black font-bold">Delete Your Account</span>
                </div>

                {/* Header */}
                <div className="mb-12 border-b border-gray-100 pb-8">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2.5 bg-red-50 text-red-600 rounded-xl">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <h1 className="text-4xl font-black tracking-tight">Delete Your Account</h1>
                    </div>
                    <p className="text-lg text-gray-600">
                        Last Updated: March 2026
                    </p>
                    <p className="mt-4 text-gray-600 leading-relaxed max-w-2xl">
                        At <strong>Abalay</strong>, we respect your right to control your personal data. We hate to see you go, but if you decide to leave, this page explains the steps you need to take to request permanent deletion of your account and all associated data from our property management platform.
                    </p>
                </div>

                {/* Content */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">

                    {/* Sidebar Navigation */}
                    <div className="hidden md:block col-span-1 space-y-4 text-sm font-medium text-gray-500 sticky top-24 h-fit">
                        <p className="text-black font-bold mb-2">Contents</p>
                        <ul className="space-y-3 border-l border-gray-200 pl-4">
                            <li><a href="#steps" className="hover:text-black transition-colors">1. Steps to Delete</a></li>
                            <li><a href="#data-deleted" className="hover:text-black transition-colors">2. Data That Is Deleted</a></li>
                            <li><a href="#faq" className="hover:text-black transition-colors">3. FAQ</a></li>
                            <li><a href="#contact" className="hover:text-black transition-colors">4. Contact Us</a></li>
                        </ul>
                    </div>

                    {/* Main Text */}
                    <div className="col-span-1 md:col-span-2 space-y-12">

                        {/* Important Notice */}
                        <div className="bg-red-50 border border-red-100 p-6 rounded-2xl">
                            <p className="font-bold text-red-800 mb-2 flex items-center gap-2">
                                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                                IMPORTANT — THIS ACTION IS PERMANENT
                            </p>
                            <p className="text-red-900/80 font-medium">
                                Deleting your Abalay account is irreversible. All your personal data, property listings, booking history, messages, and payment records will be permanently removed and cannot be recovered.
                            </p>
                        </div>

                        {/* 1. Steps to Delete */}
                        <section id="steps">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                                1. How to delete your Abalay account
                            </h2>
                            <p className="text-gray-600 mb-6">
                                Follow these steps to request the permanent deletion of your Abalay account:
                            </p>

                            <div className="space-y-4">
                                {/* Step 1 */}
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">1</div>
                                    <div className="bg-gray-50 rounded-xl p-5 flex-1 border border-gray-100">
                                        <h3 className="font-bold text-black mb-1">Log in to Your Abalay Account</h3>
                                        <p className="text-sm text-gray-600">
                                            Open the <strong>Abalay</strong> app or visit <a href="https://abalay-rent.me/" className="text-black underline font-semibold" target="_blank" rel="noopener noreferrer">abalay-rent.me</a> and sign in with your registered email and password.
                                        </p>
                                    </div>
                                </div>

                                {/* Step 2 */}
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">2</div>
                                    <div className="bg-gray-50 rounded-xl p-5 flex-1 border border-gray-100">
                                        <h3 className="font-bold text-black mb-1">Navigate to Account Settings</h3>
                                        <p className="text-sm text-gray-600">
                                            Go to your <strong>Dashboard</strong> → <strong>Settings</strong> (Profile dropdown) and click account settings. Scroll down to the <strong>&quot;Danger Zone&quot;</strong> section at the bottom of the page.
                                        </p>
                                    </div>
                                </div>

                                {/* Step 3 */}
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">3</div>
                                    <div className="bg-gray-50 rounded-xl p-5 flex-1 border border-gray-100">
                                        <h3 className="font-bold text-black mb-1">Click &quot;Delete Account&quot;</h3>
                                        <p className="text-sm text-gray-600">
                                            Click the <strong>&quot;Delete Account&quot;</strong> button. You will be asked to confirm your decision. Please ensure you have resolved any active leases, bookings, or outstanding payments before proceeding.
                                        </p>
                                    </div>
                                </div>

                                {/* Step 4 */}
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">4</div>
                                    <div className="bg-gray-50 rounded-xl p-5 flex-1 border border-gray-100">
                                        <h3 className="font-bold text-black mb-1">Confirm Deletion</h3>
                                        <p className="text-sm text-gray-600">
                                            Confirm by typing your password or following the on-screen prompt. Once confirmed, your account will be scheduled for permanent deletion.
                                        </p>
                                    </div>
                                </div>

                                {/* Alternative */}
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 text-black flex items-center justify-center font-bold text-sm">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-5 flex-1 border border-gray-100">
                                        <h3 className="font-bold text-black mb-1">Alternative: Request via Email</h3>
                                        <p className="text-sm text-gray-600">
                                                If you are unable to access your account, you may request account deletion by emailing <a href={supportContactLink} target="_blank" rel="noopener noreferrer" className="text-black underline font-semibold">{supportEmail}</a> with the subject line <strong>&quot;Account Deletion Request&quot;</strong>. Please include the email address associated with your account so we can verify your identity.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 2. Data That Is Deleted */}
                        <section id="data-deleted">
                            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 text-red-600">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </span>
                                2. Data That Is Permanently Deleted
                            </h2>
                            <p className="text-gray-600 mb-4">
                                Upon account deletion, the following data will be <strong>permanently removed</strong> from our systems:
                            </p>
                            <div className="bg-gray-50 rounded-xl p-6 space-y-4 border border-gray-100">
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 text-red-500 flex-shrink-0">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </span>
                                    <div>
                                        <h3 className="font-bold text-sm text-gray-900 mb-0.5">Account & Profile Information</h3>
                                        <p className="text-sm text-gray-600">Your name, email address, phone number, profile photo, and all account credentials.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 text-red-500 flex-shrink-0">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </span>
                                    <div>
                                        <h3 className="font-bold text-sm text-gray-900 mb-0.5">Property Listings</h3>
                                        <p className="text-sm text-gray-600">All property data including photos, descriptions, addresses, and pricing information (for landlord accounts).</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 text-red-500 flex-shrink-0">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </span>
                                    <div>
                                        <h3 className="font-bold text-sm text-gray-900 mb-0.5">Booking & Rental History</h3>
                                        <p className="text-sm text-gray-600">All booking requests, viewing schedules, and rental application records.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 text-red-500 flex-shrink-0">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </span>
                                    <div>
                                        <h3 className="font-bold text-sm text-gray-900 mb-0.5">Messages & Chat History</h3>
                                        <p className="text-sm text-gray-600">All private messages and conversations between landlords and tenants.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 text-red-500 flex-shrink-0">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </span>
                                    <div>
                                        <h3 className="font-bold text-sm text-gray-900 mb-0.5">Maintenance Requests</h3>
                                        <p className="text-sm text-gray-600">All submitted maintenance requests, including associated photos and videos.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 text-red-500 flex-shrink-0">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </span>
                                    <div>
                                        <h3 className="font-bold text-sm text-gray-900 mb-0.5">Reviews & Ratings</h3>
                                        <p className="text-sm text-gray-600">Any reviews or ratings you have submitted on the platform.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="mt-0.5 text-red-500 flex-shrink-0">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </span>
                                    <div>
                                        <h3 className="font-bold text-sm text-gray-900 mb-0.5">Notification Preferences & History</h3>
                                        <p className="text-sm text-gray-600">All push notification tokens, email preferences, and notification history.</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 3. FAQ */}
                        <section id="faq">
                            <h2 className="text-2xl font-bold mb-6">5. Frequently Asked Questions</h2>
                            <div className="space-y-3">
                                {faqs.map((faq, i) => (
                                    <div key={i} className="border border-gray-100 rounded-xl overflow-hidden">
                                        <button
                                            onClick={() => toggle(i)}
                                            className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                                        >
                                            <span className="font-bold text-black pr-4">{faq.q}</span>
                                            <svg
                                                className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-300 ${expanded === i ? 'rotate-180' : ''}`}
                                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        <div className={`overflow-hidden transition-all duration-300 ${expanded === i ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                                            <p className="px-5 pb-5 text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 4. Contact */}
                        <section id="contact" className="bg-black text-white rounded-2xl p-8 mt-8">
                            <h2 className="text-xl font-bold mb-2">Need help with account deletion?</h2>
                            <p className="text-gray-300 mb-4">
                                If you have questions about the deletion process, need help resolving active agreements, or want to submit a deletion request via email, please reach out to our support team.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <a href={supportContactLink} target="_blank" rel="noopener noreferrer" className="inline-block bg-white text-black px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-gray-100 transition-colors text-center">
                                    Email Support
                                </a>
                                <Link href="/privacy" className="inline-block bg-transparent border border-white/20 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-white/10 transition-colors text-center">
                                    View Privacy Policy
                                </Link>
                            </div>
                        </section>

                    </div>
                </div>
            </main>

            <Footer />
        </div>
    )
}
