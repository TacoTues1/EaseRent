import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'

export default function NewProperty() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [imageUrls, setImageUrls] = useState([''])
  const [uploadingImages, setUploadingImages] = useState({})

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    price: '',
    bedrooms: 1,
    bathrooms: 1,
    area_sqft: '',
    available: true,
    terms_conditions: ''
  })

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    const result = await supabase.auth.getSession()
    if (!result.data?.session) {
      router.push('/auth')
      return
    }
    
    setSession(result.data.session)
    
    // Check if user is a landlord
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', result.data.session.user.id)
      .single()
    
    if (profileData) {
      setProfile(profileData)
      if (profileData.role !== 'landlord') {
        setMessage('Access denied. Only landlords can add properties.')
        setTimeout(() => router.push('/dashboard'), 2000)
      }
    }
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  function handleImageUrlChange(index, value) {
    const newUrls = [...imageUrls]
    newUrls[index] = value
    setImageUrls(newUrls)
  }

  function addImageUrlField() {
    setImageUrls([...imageUrls, ''])
  }

  function removeImageUrlField(index) {
    const newUrls = imageUrls.filter((_, i) => i !== index)
    setImageUrls(newUrls.length === 0 ? [''] : newUrls)
  }

  async function handleImageUpload(e, index) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage('Please upload an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Image size must be less than 5MB')
      return
    }

    setUploadingImages(prev => ({ ...prev, [index]: true }))
    try {
      // Create unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${session.user.id}/${Date.now()}.${fileExt}`
      
      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('property-images')
        .upload(fileName, file)

      if (error) {
        // Check if bucket doesn't exist
        if (error.message.includes('Bucket not found') || error.message.includes('bucket')) {
          throw new Error('Storage bucket not set up. Please create "property-images" bucket in Supabase Dashboard → Storage. See IMAGE_UPLOAD_GUIDE.md for instructions.')
        }
        throw error
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('property-images')
        .getPublicUrl(fileName)

      // Update the URL in the array
      const newUrls = [...imageUrls]
      newUrls[index] = publicUrlData.publicUrl
      setImageUrls(newUrls)
      
      setMessage('Image uploaded successfully!')
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Upload error:', error)
      setMessage(error.message || 'Error uploading image')
    } finally {
      setUploadingImages(prev => ({ ...prev, [index]: false }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!session) {
      setMessage('You must be signed in.')
      return
    }

    // Filter out empty URLs
    const validImageUrls = imageUrls.filter(url => url.trim() !== '')

    setLoading(true)
    const { error } = await supabase.from('properties').insert({
      ...formData,
      landlord: session.user.id,
      images: validImageUrls.length > 0 ? validImageUrls : null
    })

    if (error) {
      setMessage('Error creating property: ' + error.message)
    } else {
      setMessage('Property created successfully!')
      setTimeout(() => router.push('/dashboard'), 1500)
    }
    setLoading(false)
  }

  if (!session || !profile) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  // Block access for non-landlords
  if (profile.role !== 'landlord') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="p-6 bg-white text-black border-2 border-black max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p>Only landlords can add properties.</p>
          <p className="mt-4 text-sm">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto bg-white border-2 border-black p-6">
        <h1 className="text-2xl font-bold mb-4">Add New Property</h1>
        {message && (
          <div className={`mb-4 p-3 border-2 ${
            message.includes('Error') || message.includes('error') || message.includes('denied')
              ? 'bg-white text-black border-black rounded-[4px]'
              : message.includes('successfully') || message.includes('complete')
              ? 'bg-black text-white border-black'
              : 'bg-white text-black border-black'
          }`}>
            <div className="font-medium">{message}</div>
            {message.includes('Storage bucket not set up') && (
              <div className="mt-2 text-sm">
                <strong>Quick fix:</strong> See <code className="bg-white border border-black px-1">BUCKET_ERROR_FIX.txt</code> for setup instructions (takes 3 minutes).
              </div>
            )}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              name="title"
              required
              className="w-full border-2 border-black px-3 py-2"
              value={formData.title}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              name="description"
              rows="4"
              className="w-full border-2 border-black px-3 py-2"
              value={formData.description}
              onChange={handleChange}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input
                type="text"
                name="address"
                required
                className="w-full border-2 border-black px-3 py-2"
                value={formData.address}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">City</label>
              <input
                type="text"
                name="city"
                required
                className="w-full border-2 border-black px-3 py-2"
                value={formData.city}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">State</label>
              <input
                type="text"
                name="state"
                className="w-full border-2 border-black px-3 py-2"
                value={formData.state}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ZIP Code</label>
              <input
                type="text"
                name="zip"
                className="w-full border-2 border-black px-3 py-2"
                value={formData.zip}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Price (₱/month)</label>
              <input
                type="number"
                name="price"
                required
                min="0"
                step="0.01"
                className="w-full border-2 border-black px-3 py-2"
                value={formData.price}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bedrooms</label>
              <input
                type="number"
                name="bedrooms"
                min="0"
                className="w-full border-2 border-black px-3 py-2"
                value={formData.bedrooms}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bathrooms</label>
              <input
                type="number"
                name="bathrooms"
                min="0"
                step="0.5"
                className="w-full border-2 border-black px-3 py-2"
                value={formData.bathrooms}
                onChange={handleChange}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Area (sqft)</label>
            <input
              type="number"
              name="area_sqft"
              min="0"
              className="w-full border-2 border-black px-3 py-2"
              value={formData.area_sqft}
              onChange={handleChange}
            />
          </div>

          {/* Image Upload Section */}
          <div className="border-t-2 border-black pt-4">
            <label className="block text-sm font-medium mb-3">Property Images</label>
            
            <div className="flex flex-wrap gap-2">
              {imageUrls.map((url, index) => (
                <div key={index} className="relative">
                  <label className="cursor-pointer block">
                    <div className={`w-14 h-14 border-2 border-black flex items-center justify-center transition-all ${
                      url ? 'bg-green-100 border-green-600' : 'bg-gray-50 hover:bg-gray-100'
                    } ${uploadingImages[index] ? 'animate-pulse bg-yellow-50' : ''}`}>
                      {uploadingImages[index] ? (
                        <span className="text-xs">...</span>
                      ) : url ? (
                        <span className="text-green-600 text-lg">✓</span>
                      ) : (
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      )}
                    </div>
                    <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">{index + 1}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e, index)}
                      disabled={uploadingImages[index]}
                    />
                  </label>
                  {url && imageUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeImageUrlField(index)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              
              {imageUrls.length < 10 && (
                <button
                  type="button"
                  onClick={addImageUrlField}
                  className="w-14 h-14 border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-black hover:bg-gray-50 transition-all"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>
            
            <p className="mt-6 text-xs text-gray-500">
              Click boxes to upload images (max 5MB each)
            </p>
          </div>

          {/* Terms and Conditions Section */}
          <div className="border-t pt-4 mt-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Terms & Conditions</label>
              <a
                href="/terms"
                target="_blank"
                className="text-xs text-blue-600 hover:underline"
              >
                View Default Template →
              </a>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Customize the terms for this property. Leave empty to use the default terms.
            </p>
            <textarea
              name="terms_conditions"
              rows="8"
              className="w-full border-2 px-3 py-2 text-sm font-mono"
              placeholder="Enter custom terms and conditions for this property...\n\nExample:\n1. Lease Duration: 1 year minimum\n2. Monthly rent: ₱XX,XXX\n3. Security deposit: 1 month\n..."
              value={formData.terms_conditions}
              onChange={handleChange}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-black text-white border-2 border-black disabled:opacity-50 rounded-[4px]"
            >
              {loading ? 'Creating...' : 'Create Property'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-white text-black border-2 border-black rounded-[4px]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
