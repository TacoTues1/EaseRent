import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'

// Default terms and conditions template
export const DEFAULT_TERMS = `Lease Terms and Conditions

Welcome! By renting this property, you agree to the following terms:

1. Lease Duration
• The lease is effective from [Start Date] to [End Date].
• Renewal is possible if both parties agree.

2. Rent and Deposit
• Monthly rent: Depends on what Apartment (Philippine Pesos).
• Payment is due on [Day] of each month.
• Upon signing:
  - 1-month security deposit
  - 2-month advance rent
  - Total of 3 months' rent.
• Deposit may cover unpaid rent, damages, or lease violations and may be applied to the last month's rent.

3. Property Use & Maintenance
• Keep the property clean and orderly.
• Use appliances and furniture responsibly.
• Use the property only for lawful purposes.

4. Utilities
The tenant pays monthly bills for:
• Electricity
• Water
• Wi-Fi

5. Termination Notice
• Notify the landlord at least 30 days before the lease ends if you do not plan to renew.

6. Liability
• Tenant is responsible for any damage caused by negligence.
• Repair/replacement costs may be deducted from the deposit.
• The landlord is responsible for damages not caused by the tenant, including natural events.

7. Returning the Property
• Vacate the property at the end of the lease unless a renewal is agreed.
• Return the property in its original condition with all items intact.

8. Legal Fees
• If the lease is broken due to tenant default, the tenant pays reasonable legal fees.
• Any legal dispute will be filed in Negros Oriental courts.

By renting this property, you confirm that you have read and agree to these terms.`

export default function TermsPage() {
  const router = useRouter()
  const { propertyId } = router.query
  const [property, setProperty] = useState(null)
  const [terms, setTerms] = useState(DEFAULT_TERMS)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedTerms, setEditedTerms] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (router.isReady) {
      if (propertyId) {
        loadPropertyTerms()
      } else {
        setLoading(false)
      }
    }
  }, [propertyId, router.isReady])

  async function checkAuth() {
    const result = await supabase.auth.getSession()
    if (result.data?.session) {
      setSession(result.data.session)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', result.data.session.user.id)
        .maybeSingle()
      if (profileData) {
        setProfile(profileData)
      }
    }
  }

  async function loadPropertyTerms() {
    const { data, error } = await supabase
      .from('properties')
      .select('id, title, terms_conditions, landlord')
      .eq('id', propertyId)
      .maybeSingle()

    if (data) {
      setProperty(data)
      if (data.terms_conditions) {
        setTerms(data.terms_conditions)
        setEditedTerms(data.terms_conditions)
      } else {
        setEditedTerms(DEFAULT_TERMS)
      }
    }
    setLoading(false)
  }

  const isOwner = property && session && property.landlord === session.user.id
  const isLandlord = profile?.role === 'landlord'

  async function handleSaveTerms() {
    if (!property || !isOwner) return
    
    setSaving(true)
    setMessage(null)

    const { error } = await supabase
      .from('properties')
      .update({ terms_conditions: editedTerms })
      .eq('id', property.id)

    if (error) {
      setMessage({ type: 'error', text: 'Error saving terms: ' + error.message })
    } else {
      setTerms(editedTerms)
      setIsEditing(false)
      setMessage({ type: 'success', text: 'Terms updated successfully!' })
      setTimeout(() => setMessage(null), 3000)
    }
    setSaving(false)
  }

  function handleGoBack() {
    // Try to go back in history, fallback to dashboard
    if (window.history.length > 1) {
      router.back()
    } else if (property) {
      router.push(`/properties/${property.id}`)
    } else {
      router.push('/dashboard')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-black text-white rounded-t-xl p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">
                {property ? `Terms & Conditions` : 'General Terms & Conditions'}
              </h1>
              {property && (
                <p className="text-gray-300 mt-2">For: {property.title}</p>
              )}
            </div>
            {/* Edit button for property owner */}
            {isOwner && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors cursor-pointer"
              >
                ✏️ Edit Terms
              </button>
            )}
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message.text}
          </div>
        )}

        {/* Terms Content */}
        <div className="bg-white rounded-b-xl shadow-lg p-6 md:p-8">
          
          {/* Edit Mode */}
          {isEditing && isOwner ? (
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Edit Terms & Conditions for this property
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Customize the terms below. Use bullet points (•) for lists and numbered sections for organization.
                </p>
                <textarea
                  value={editedTerms}
                  onChange={(e) => setEditedTerms(e.target.value)}
                  className="w-full h-96 border-2 border-gray-300 rounded-lg p-4 font-mono text-sm focus:border-black focus:outline-none"
                  placeholder="Enter your terms and conditions..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSaveTerms}
                  disabled={saving}
                  className="px-6 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Terms'}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setEditedTerms(terms)
                  }}
                  className="px-6 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setEditedTerms(DEFAULT_TERMS)}
                  className="px-6 py-2 border-2 border-blue-500 text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors cursor-pointer ml-auto"
                >
                  Reset to Default
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* View Mode */}
              <div className="prose prose-sm max-w-none">
                {terms.split('\n').map((line, index) => {
                  // Main title
                  if (line.startsWith('Lease Terms')) {
                    return (
                      <h2 key={index} className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                        {line}
                      </h2>
                    )
                  }
                  // Section headers (numbered)
                  if (/^\d+\.\s/.test(line)) {
                    return (
                      <h3 key={index} className="text-lg font-semibold text-gray-800 mt-6 mb-2">
                        {line}
                      </h3>
                    )
                  }
                  // Bullet points
                  if (line.startsWith('•') || line.startsWith('-')) {
                    return (
                      <p key={index} className="text-gray-700 ml-4 mb-1">
                        {line}
                      </p>
                    )
                  }
                  // Sub-bullet points
                  if (line.trim().startsWith('-')) {
                    return (
                      <p key={index} className="text-gray-600 ml-8 mb-1 text-sm">
                        {line}
                      </p>
                    )
                  }
                  // Empty lines
                  if (line.trim() === '') {
                    return <div key={index} className="h-2"></div>
                  }
                  // Regular text
                  return (
                    <p key={index} className="text-gray-700 mb-2">
                      {line}
                    </p>
                  )
                })}
              </div>

              {/* Agreement Section */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 text-center">
                    By proceeding with your rental application, you acknowledge that you have read, 
                    understood, and agree to abide by these terms and conditions.
                  </p>
                </div>
              </div>

              {/* Back Button */}
              <div className="mt-6 flex justify-center gap-4">
                <button
                  onClick={handleGoBack}
                  className="px-6 py-2 border-2 border-black text-black rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  ← Go Back
                </button>
                {property && (
                  <button
                    onClick={() => router.push(`/properties/${property.id}`)}
                    className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    View Property
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Note */}
        <p className="text-center text-xs text-gray-500 mt-6">
          Last updated: December 2025 | EaseRent Property Management
        </p>
      </div>
    </div>
  )
}
