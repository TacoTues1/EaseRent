import Head from 'next/head'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import Link from 'next/link'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <Head>
        <title>Privacy Policy | EaseRent</title>
      </Head>

      <Navbar />

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-8">
            <Link href="/" className="hover:text-black">Home</Link>
            <span className="text-gray-300">/</span>
            <span>Legal</span>
            <span className="text-gray-300">/</span>
            <span className="text-black font-bold">Privacy Policy</span>
        </div>

        {/* Header */}
        <div className="mb-12 border-b border-gray-100 pb-8">
          <h1 className="text-4xl font-black mb-4 tracking-tight">Privacy Policy</h1>
          <p className="text-lg text-gray-600">
            Last Updated: January 2026
          </p>
          <p className="mt-4 text-gray-600 leading-relaxed max-w-2xl">
            At EaseRent, we value your trust. This policy explains how we collect, use, and share your personal information when you use our property management platform, web, and mobile applications.
          </p>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            
          {/* Sidebar Navigation (Optional or just styling) */}
          <div className="hidden md:block col-span-1 space-y-4 text-sm font-medium text-gray-500 sticky top-24 h-fit">
            <p className="text-black font-bold mb-2">Contents</p>
            <ul className="space-y-3 border-l border-gray-200 pl-4">
                <li><a href="#collection" className="hover:text-black transition-colors">1. Information We Collect</a></li>
                <li><a href="#usage" className="hover:text-black transition-colors">2. How We Use Data</a></li>
                <li><a href="#sharing" className="hover:text-black transition-colors">3. Sharing & Disclosure</a></li>
                <li><a href="#security" className="hover:text-black transition-colors">4. Security & Retention</a></li>
                <li><a href="#payments" className="hover:text-black transition-colors">5. Payment Information</a></li>
                <li><a href="#rights" className="hover:text-black transition-colors">6. Your Rights</a></li>
            </ul>
          </div>

          {/* Main Text */}
          <div className="col-span-1 md:col-span-2 space-y-12">

            {/* 1. Collection */}
            <section id="collection">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                1. Information We Collect
              </h2>
              <p className="text-gray-600 mb-4">We collect information required to facilitate rentals and verify identities.</p>
              
              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <div>
                    <h3 className="font-bold text-sm uppercase text-gray-900 mb-1">Account Information</h3>
                    <p className="text-sm text-gray-600">Name, email address, phone number, and profile photo provided during registration.</p>
                </div>
                <div>
                    <h3 className="font-bold text-sm uppercase text-gray-900 mb-1">Identity Verification</h3>
                    <p className="text-sm text-gray-600">Government ID images or other verification documents required to prove your identity as a valid Landlord or Tenant.</p>
                </div>
                <div>
                    <h3 className="font-bold text-sm uppercase text-gray-900 mb-1">Property & Rental Data</h3>
                    <p className="text-sm text-gray-600">Property addresses, photos, lease terms, maintenance request photos/videos, and chat history between users.</p>
                </div>
              </div>
            </section>

            {/* 2. Usage */}
            <section id="usage">
              <h2 className="text-2xl font-bold mb-4">2. How We Use Information</h2>
              <ul className="list-disc pl-5 space-y-2 text-gray-600">
                <li><strong>Service Provision:</strong> To create bookings, generate lease agreements, and manage maintenance requests.</li>
                <li><strong>Communication:</strong> To send SMS notifications (via services like Twilio/MessageBird) regarding booking status, maintenance updates, or security alerts.</li>
                <li><strong>Safety & Security:</strong> To detect and prevent fraud, spam, and abuse. We use data to verify that landlords own their properties and tenants are real people.</li>
                <li><strong>Platform Improvement:</strong> To analyze usage trends and improve the EaseRent user experience.</li>
              </ul>
            </section>

            {/* 3. Sharing */}
            <section id="sharing">
              <h2 className="text-2xl font-bold mb-4">3. Sharing & Disclosure</h2>
              <p className="text-gray-600 mb-4">We do not sell your personal data. Data is shared only when necessary to perform the service:</p>
              
              <div className="space-y-4">
                <div className="border border-gray-100 rounded-lg p-4">
                    <h3 className="font-bold text-black">Between Users</h3>
                    <p className="text-sm text-gray-600 mt-1">
                        When a booking is confirmed, we share necessary contact info (Name, Phone) between the Landlord and Tenant to facilitate the meeting and move-in process.
                    </p>
                </div>
                <div className="border border-gray-100 rounded-lg p-4">
                    <h3 className="font-bold text-black">Service Providers</h3>
                    <p className="text-sm text-gray-600 mt-1">
                        We share data with trusted third-party providers who help us operate:
                        <br/>• <strong>Supabase:</strong> For secure database hosting and authentication.
                        <br/>• <strong>PayPal:</strong> For processing rental payments securely.
                        <br/>• <strong>Google Maps:</strong> To display property locations.
                    </p>
                </div>
              </div>
            </section>

             {/* 4. Security */}
             <section id="security">
              <h2 className="text-2xl font-bold mb-4">4. Data Security</h2>
              <p className="text-gray-600 leading-relaxed">
                We implement robust security measures, including <strong>Row Level Security (RLS)</strong>, to ensure that only authorized users can access specific data. Your passwords are never stored in plain text. While no system is 100% secure, we continuously monitor our systems to protect your information.
              </p>
            </section>

            {/* 5. Payments */}
            <section id="payments">
              <h2 className="text-2xl font-bold mb-4">5. Payment Information</h2>
              <p className="text-gray-600 leading-relaxed">
                EaseRent does not store your full credit card or bank account details on our servers. All payment transactions are processed securely through <strong>PayPal</strong>. We only retain transaction records (date, amount, status) for booking history and accounting purposes.
              </p>
            </section>

            {/* 6. Your Rights */}
            <section id="rights">
              <h2 className="text-2xl font-bold mb-4">6. Your Rights</h2>
              <p className="text-gray-600 mb-4">You have control over your data:</p>
              <ul className="list-disc pl-5 space-y-2 text-gray-600">
                <li><strong>Access & Update:</strong> You can edit your profile and property information directly through your dashboard.</li>
                <li><strong>Account Deletion:</strong> You may request to permanently delete your account and associated data via the Settings page. Note that some transaction records may be retained for legal compliance.</li>
              </ul>
            </section>

            {/* Contact */}
            <section className="bg-black text-white rounded-2xl p-8 mt-8">
              <h2 className="text-xl font-bold mb-2">Have questions?</h2>
              <p className="text-gray-300 mb-4">
                If you have questions about this policy or your privacy rights, please contact our support team.
              </p>
              <a href="mailto:support@easerent.com" className="inline-block bg-white text-black px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-gray-100 transition-colors">
                Contact Support
              </a>
            </section>

          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  )
}