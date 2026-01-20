import Head from 'next/head'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

export default function Terms() {
  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <Head>
        <title>Terms & Privacy | EaseRent</title>
      </Head>

      <main className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12 border-b border-gray-100 pb-8">
          <h1 className="text-4xl font-black mb-4 tracking-tight">Terms & Privacy Policy</h1>
          <p className="text-gray-500 font-medium">Last Updated: January 2026</p>
        </div>

        {/* Content */}
        <div className="space-y-12">
          
          {/* Section 1 */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-black text-white rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </div>
              <h2 className="text-2xl font-bold">1. Multiple Accounts Policy</h2>
            </div>
            <div className="bg-gray-50 border border-gray-100 p-6 rounded-2xl mb-6">
              <p className="font-bold text-gray-900 mb-2">STRICT PROHIBITION</p>
              <p className="text-gray-700">Creating multiple accounts for the same user identity is strictly prohibited on EaseRent.</p>
            </div>
            <ul className="list-disc pl-5 space-y-3 text-gray-600 leading-relaxed">
              <li><strong>One Identity, One Account:</strong> You may not register multiple accounts using different email addresses, or phone numbers.</li>
              <li><strong>Detection & Enforcement:</strong> Our system actively monitors for duplicate data points. If a duplicate account is detected, access to platform features will be restricted immediately.</li>
              <li><strong>Permanent Ban:</strong> Repeated attempts to bypass this policy may result in a permanent ban from the platform.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-black text-white rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h2 className="text-2xl font-bold">2. Data Privacy & Security</h2>
            </div>
            <p className="text-gray-600 mb-6 leading-relaxed">
              We collect only the minimum amount of data required to verify your identity and facilitate rental agreements.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
                <div className="p-5 border border-gray-100 rounded-xl">
                    <h3 className="font-bold text-black mb-2">Data Collection</h3>
                    <p className="text-sm text-gray-500">We collect Name, Phone Number, and Government ID solely for identity verification and contract generation.</p>
                </div>
                <div className="p-5 border border-gray-100 rounded-xl">
                    <h3 className="font-bold text-black mb-2">No Third-Party Sharing</h3>
                    <p className="text-sm text-gray-500">Your personal data is never sold. It is only shared with the specific Landlord/Tenant you enter an agreement with.</p>
                </div>
            </div>
          </section>

        </div>
      </main>
      <Footer />
    </div>
  )
}