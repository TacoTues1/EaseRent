import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { createNotification, NotificationTemplates } from '../../lib/notifications'

export default function PropertyDetail() {
  const router = useRouter()
  const { id } = router.query
  const [property, setProperty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [applicationMessage, setApplicationMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
      }
    })
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (data) setProfile(data)
  }

  useEffect(() => {
    if (id) loadProperty()
  }, [id])

  async function loadProperty() {
    setLoading(true)
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()
    
    if (!error) setProperty(data)
    setLoading(false)
  }

  async function handleApply(e) {
    e.preventDefault()
    if (!session) {
      setMessage('Please sign in to apply.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('applications').insert({
      property_id: id,
      tenant: session.user.id,
      message: applicationMessage,
      status: 'pending'
    })

    if (error) {
      setMessage('Error submitting application: ' + error.message)
    } else {
      // Send notification to landlord
      if (property.landlord) {
        const template = NotificationTemplates.newApplication(
          property.title,
          profile?.full_name || 'A tenant'
        )
        await createNotification({
          recipient: property.landlord,
          actor: session.user.id,
          type: template.type,
          message: template.message
        })
      }

      setMessage('Application submitted successfully!')
      setApplicationMessage('')
    }
    setSubmitting(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  if (!property) return <div className="min-h-screen flex items-center justify-center">Property not found</div>

  // Get property images or use placeholder
  const propertyImages = property.images && property.images.length > 0 
    ? property.images 
    : ['https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop']

  const isOwner = profile?.id === property.landlord
  const isLandlord = profile?.role === 'landlord'

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow overflow-hidden">
        {/* Image Slider */}
        <div className="relative h-96 bg-gray-200">
          <img 
            src={propertyImages[currentImageIndex]} 
            alt={property.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&h=800&fit=crop'
            }}
          />
          
          {/* Image navigation */}
          {propertyImages.length > 1 && (
            <>
              <button
                onClick={() => setCurrentImageIndex((currentImageIndex - 1 + propertyImages.length) % propertyImages.length)}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75"
              >
                ←
              </button>
              <button
                onClick={() => setCurrentImageIndex((currentImageIndex + 1) % propertyImages.length)}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75"
              >
                →
              </button>
              
              {/* Image indicators */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {propertyImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`w-2 h-2 rounded-full ${index === currentImageIndex ? 'bg-white' : 'bg-white bg-opacity-50'}`}
                  />
                ))}
              </div>
            </>
          )}
          
          {isOwner && (
            <div className="absolute top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded">
              Your Property
            </div>
          )}
        </div>

        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{property.title}</h1>
              <p className="text-gray-600">{property.address}, {property.city}, {property.state} {property.zip}</p>
            </div>
            {isOwner && (
              <Link 
                href={`/properties/edit/${property.id}`}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Edit Property
              </Link>
            )}
          </div>

          <div className="mb-4">
            <span className="text-3xl font-bold text-blue-600">₱{Number(property.price).toLocaleString()}</span>
            <span className="text-gray-600"> / month</span>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6 text-center">
            <div className="p-4 bg-gray-50 rounded">
              <div className="text-2xl font-bold">{property.bedrooms}</div>
              <div className="text-sm text-gray-600">Bedrooms</div>
            </div>
            <div className="p-4 bg-gray-50 rounded">
              <div className="text-2xl font-bold">{property.bathrooms}</div>
              <div className="text-sm text-gray-600">Bathrooms</div>
            </div>
            <div className="p-4 bg-gray-50 rounded">
              <div className="text-2xl font-bold">{property.area_sqft}</div>
              <div className="text-sm text-gray-600">Sqft</div>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Description</h2>
            <p className="text-gray-700">{property.description || 'No description provided.'}</p>
          </div>

          <div className="mb-6">
            <span className={`px-3 py-1 rounded text-sm ${property.available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {property.available ? 'Available' : 'Not Available'}
            </span>
          </div>

          {/* Only show application form to tenants (not landlords, not property owners) */}
          {property.available && !isOwner && !isLandlord && (
            <div className="border-t pt-6">
              <h2 className="text-xl font-semibold mb-4">Apply for this property</h2>
              {message && (
                <div className={`mb-4 p-3 rounded ${
                  message.includes('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
                }`}>
                  {message}
                </div>
              )}
              <form onSubmit={handleApply} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Message to landlord</label>
                  <textarea
                    className="w-full border rounded px-3 py-2"
                    rows="4"
                    value={applicationMessage}
                    onChange={e => setApplicationMessage(e.target.value)}
                    placeholder="Tell the landlord about yourself..."
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
                >
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </form>
            </div>
          )}

          {/* Message for landlords */}
          {isLandlord && !isOwner && (
            <div className="border-t pt-6">
              <div className="p-4 bg-blue-50 text-blue-800 rounded">
                <strong>Note:</strong> As a landlord, you cannot apply to properties. Only tenants can submit applications.
              </div>
            </div>
          )}

          {/* Message for property owners */}
          {isOwner && (
            <div className="border-t pt-6">
              <div className="p-4 bg-gray-50 text-gray-700 rounded">
                <strong>This is your property.</strong> You can edit details or view applications from tenants in your dashboard.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
