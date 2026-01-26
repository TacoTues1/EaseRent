import Head from 'next/head'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import Link from 'next/link'

export default function Terms() {
  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <Head>
        <title>Terms of Service | EaseRent</title>
      </Head>

      <Navbar />

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12 border-b border-gray-100 pb-8">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-6">
            <Link href="/" className="hover:text-black">Home</Link>
            <span className="text-gray-300">/</span>
            <span>Legal</span>
            <span className="text-gray-300">/</span>
            <span className="text-black font-bold">Terms of Service</span>
          </div>
          <h1 className="text-4xl font-black mb-4 tracking-tight">Terms of Service</h1>
          <p className="text-lg text-gray-600">Last Updated: January 2026</p>
        </div>

        <div className="space-y-12">
            
          {/* 1. Multiple Accounts Policy (FROM YOUR TEXT) */}
          <section id="accounts" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h2 className="text-2xl font-bold">1. Multiple Accounts Policy</h2>
            </div>
            
            <div className="bg-red-50 border border-red-100 p-6 rounded-2xl mb-6">
              <p className="font-bold text-red-800 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                STRICT PROHIBITION
              </p>
              <p className="text-red-900/80 font-medium">Creating multiple accounts for the same user identity is strictly prohibited on EaseRent.</p>
            </div>

            <ul className="grid gap-4 md:grid-cols-2">
                <li className="bg-gray-50 p-5 rounded-xl border border-gray-100">
                    <strong className="block text-black mb-1">One Identity, One Account</strong>
                    <span className="text-gray-600 text-sm">You may not register multiple accounts using different email addresses or phone numbers.</span>
                </li>
                <li className="bg-gray-50 p-5 rounded-xl border border-gray-100">
                    <strong className="block text-black mb-1">Detection & Enforcement</strong>
                    <span className="text-gray-600 text-sm">Our system actively monitors for duplicate data points. If a duplicate account is detected, access will be restricted immediately.</span>
                </li>
            </ul>
            <p className="mt-4 text-sm text-gray-500">
                <strong>Permanent Ban:</strong> Repeated attempts to bypass this policy may result in a permanent ban from the platform.
            </p>
          </section>

          {/* 2. User Responsibilities (Standard Addition) */}
          <section>
            <h2 className="text-2xl font-bold mb-4">2. User Responsibilities</h2>
            <p className="text-gray-600 mb-4">By using EaseRent, you agree to:</p>
            <ul className="list-disc pl-5 space-y-2 text-gray-600">
                <li>Provide accurate and truthful information during registration.</li>
                <li>Maintain the confidentiality of your login credentials.</li>
                <li>Use the platform only for lawful property management and rental purposes.</li>
                <li>Treat other users (Landlords and Tenants) with respect and professionalism.</li>
            </ul>
          </section>

           {/* 3. Privacy Reference */}
           <section>
            <h2 className="text-2xl font-bold mb-4">3. Privacy & Data</h2>
            <p className="text-gray-600">
                Your use of the platform is also governed by our <Link href="/privacy" className="text-black font-bold underline">Privacy Policy</Link>, which details how we collect, use, and protect your information.
            </p>
          </section>

        </div>
      </main>
      <Footer />
    </div>
  )
}