import Head from 'next/head'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import Link from 'next/link'

export default function Terms() {
  const supportEmail = 'alfnzperez@gmail.com'
  const supportSubject = 'Terms of Service Support Request'
  const supportBody = 'Hi Abalay Support,\n\nI have a question about your Terms of Service.\n\nThank you.'
  const supportContactLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(supportEmail)}&su=${encodeURIComponent(supportSubject)}&body=${encodeURIComponent(supportBody)}`

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <Head>
        <title>Terms of Service | Abalay</title>
      </Head>

      <Navbar />

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12 border-b border-gray-100 pb-8">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-6">
            <Link href="/" className="hover:text-black">Home</Link>
            <span className="text-gray-300">/</span>
            <span className="text-black font-bold">Terms of Service</span>
          </div>
          <h1 className="text-4xl font-black mb-4 tracking-tight">Terms of Service</h1>
          <p className="text-lg text-gray-600">Last Updated: April 2026</p>
        </div>

        <div className="space-y-12">

          {/* 1. Multiple Accounts Policy (FROM YOUR TEXT) */}
          <section id="accounts" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-2xl font-bold">1. Multiple Accounts Policy</h2>
            </div>

            <div className="bg-gray-50 border border-gray-100 p-6 rounded-2xl mb-6">
              <p className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                *STRICTLY PROHIBITED
              </p>
              <p className="text-gray-900/80 font-medium">Creating multiple accounts for the same user identity is strictly prohibited on Abalay.</p>
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
            <p className="text-gray-600 mb-4">By using Abalay, you agree to:</p>
            <ul className="list-disc pl-5 space-y-2 text-gray-600">
              <li>Provide accurate and truthful information during registration.</li>
              <li>Maintain the confidentiality of your login credentials.</li>
              <li>Use the platform only for lawful property management and rental purposes.</li>
              <li>Treat other users (Landlords and Tenants) with respect and professionalism.</li>
            </ul>
          </section>

          {/* 3. Landlord Terms */}
          <section>
            <h2 className="text-2xl font-bold mb-4">3. Landlord Responsibilities & Terms</h2>
            <p className="text-gray-600 mb-4">As a Landlord listing properties on Abalay, you specifically agree that:</p>
            <ul className="list-disc pl-5 space-y-2 text-gray-600">
              <li><strong>Property Accuracy:</strong> You will provide accurate, truthful descriptions and photos of your properties. Misrepresentation is grounds for immediate listing removal.</li>
              <li><strong>Legal Compliance:</strong> You bear full responsibility for ensuring your properties comply with all local housing, safety, and health regulations.</li>
              <li><strong>Fair Dealing:</strong> You will not discriminate against prospective tenants based on race, religion, gender, disability, or other legally protected characteristics.</li>
              <li><strong>Maintenance:</strong> You will promptly respond to maintenance requests to ensure the property remains habitable.</li>
            </ul>
          </section>

          {/* 4. Tenant Terms */}
          <section>
            <h2 className="text-2xl font-bold mb-4">4. Tenant Responsibilities & Terms</h2>
            <p className="text-gray-600 mb-4">As a Tenant utilizing Abalay, you specifically agree that:</p>
            <ul className="list-disc pl-5 space-y-2 text-gray-600">
              <li><strong>Timely Payments:</strong> You are responsible for paying all rent and applicable fees on time, as scheduled by the platform or your lease agreement.</li>
              <li><strong>Property Care:</strong> You will maintain the property in a clean, sanitary condition and promptly report any damages or maintenance issues to the Landlord.</li>
              <li><strong>Lawful Use:</strong> You will not use the property for any illicit or prohibited activities, nor cause unreasonable nuisance to neighbors.</li>
              <li><strong>Compliance with Rules:</strong> You agree to abide by all specific property rules, such as those regarding pets, smoking, or noise, as outlined by the Landlord.</li>
            </ul>
          </section>

          {/* 5. Subscription & Slot Policy */}
          <section id="slots" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-2xl font-bold">5. Subscription & Slot Policy</h2>
            </div>

            <p className="text-gray-600 mb-6">Abalay provides certain features on a freemium basis. Users receive a limited number of free slots and may purchase additional slots to expand their capacity.</p>

            <div className="grid gap-5 md:grid-cols-2 mb-6">
              {/* Landlord Slot Policy */}
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <strong className="text-black text-lg">Landlord — Property Slots</strong>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span>*<strong>3 free property slots</strong> are included with every landlord account upon registration.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>*Additional property slots may be purchased at <strong>₱50.00 per slot</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>*Each landlord account may hold a <strong>maximum of 10 property slots</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>*Purchased slots are <strong>permanent</strong> and non-refundable.</span>
                  </li>
                </ul>
              </div>

              {/* Tenant Slot Policy */}
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <strong className="text-black text-lg">Tenant — Family Member Slots</strong>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span>*<strong>1 free family member slot</strong> is included with every tenant account upon registration.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>*Additional family member slots may be purchased at <strong>₱50.00 per slot</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>*Purchased slots are <strong>permanent</strong> and non-refundable.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-100 p-5 rounded-xl">
              <p className="text-sm text-gray-900">
                <strong>Payment:</strong> All slot purchases are processed securely through PayMongo. Accepted payment methods include GCash, Maya, and credit/debit cards. Once a slot is purchased, it is immediately available and permanently added to your account.
              </p>
            </div>
          </section>

          {/* 6. Privacy Reference */}
          <section>
            <h2 className="text-2xl font-bold mb-4">6. Privacy & Data</h2>
            <p className="text-gray-600">
              Your use of the platform is also governed by our <Link href="/privacy" className="text-black font-bold underline">Privacy Policy</Link>, which details how we collect, use, and protect your information.
            </p>
          </section>

          {/* 7. Disclaimers & Limitations */}
          <section>
            <h2 className="text-2xl font-bold mb-4">7. Disclaimers & Limitation of Liability</h2>
            <div className="space-y-4 text-gray-600">
              <p>
                <strong>"As Is" Basis:</strong> Abalay is provided indiscriminately on an "as is" and "as available" basis without any warranties of any kind, whether express or implied.
              </p>
              <p>
                <strong>Service Interruption:</strong> While we strive for 99.9% uptime, we do not guarantee that the service will be uninterrupted, error-free, or entirely secure at all times.
              </p>
              <p>
                <strong>Limitation of Liability:</strong> In no event shall Abalay, its directors, employees, or agents be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of or inability to use the platform.
              </p>
            </div>
          </section>

          {/* Contact */}
          <section className="bg-black text-white rounded-2xl p-8 mt-8">
            <h2 className="text-xl font-bold mb-2">Questions regarding these terms?</h2>
            <p className="text-gray-300 mb-4">
              If you have any clarifications required for our terms of service, reach out to us.
            </p>
            <a href={supportContactLink} target="_blank" rel="noopener noreferrer" className="inline-block bg-white text-black px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-gray-100 transition-colors">
              Contact Us
            </a>
          </section>

        </div>
      </main>
      <Footer />
    </div>
  )
}