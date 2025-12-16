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
    building_no: '',
    street: '',
    address: '',
    city: '',
    zip: '',
    location_link: '',
    owner_phone: '',
    owner_email: '',
    price: '',
    bedrooms: 1,
    bathrooms: 1,
    area_sqft: '',
    available: true,
    status: 'available',
    terms_conditions: '',
    amenities: []
  })

  const [showAllAmenities, setShowAllAmenities] = useState(false)

  const availableAmenities = [
    'Kitchen',
    'Wifi',
    'Pool',
    'TV',
    'Elevator',
    'Air conditioning',
    'Heating',
    'Washing machine',
    'Dryer',
    'Parking',
    'Gym',
    'Security',
    'Balcony',
    'Garden',
    'Pet friendly',
    'Furnished',
    'Carbon monoxide alarm',
    'Smoke alarm',
    'Fire extinguisher',
    'First aid kit'
  ]

  const toggleAmenity = (amenity) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity]
    }))
  }

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
      .maybeSingle()
    
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
    <div className="h-[calc(100vh-64px)] bg-white p-3 overflow-hidden">
      <div className="h-full max-w-7xl mx-auto bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl md:text-2xl font-bold">Add New Property</h1>
          {message && (
            <div className={`px-3 py-1.5 text-sm ${
              message.includes('Error') || message.includes('error') || message.includes('denied')
                ? 'bg-white text-black border border-gray-300'
                : message.includes('successfully') || message.includes('complete')
                ? 'bg-black text-white'
                : 'bg-white text-black border border-gray-300'
            }`}>
              {message}
            </div>
          )}
        </div>
        
        <form onSubmit={handleSubmit} className="h-[calc(100%-60px)] flex gap-6">
          {/* Left Panel */}
          <div className="flex-1 flex flex-col gap-3">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                type="text"
                name="title"
                required
                className="w-full border border-gray-300 px-3 py-2 text-sm"
                value={formData.title}
                onChange={handleChange}
              />
            </div>

            {/* Address Row */}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1">Bldg No.</label>
                <input
                  type="text"
                  name="building_no"
                  placeholder="Bldg 5"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.building_no}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Street *</label>
                <input
                  type="text"
                  name="street"
                  required
                  placeholder="123 Main St"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.street}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Barangay *</label>
                <input
                  type="text"
                  name="address"
                  required
                  placeholder="San Roque"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.address}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">City *</label>
                <input
                  type="text"
                  name="city"
                  required
                  placeholder="Manila"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.city}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* ZIP, Maps, Contact Row */}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1">ZIP*</label>
                <input
                  type="text"
                  name="zip"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.zip}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Google map Link(Preffered)</label>
                <input
                  type="url"
                  name="location_link"
                  placeholder="https://maps.app.goo.gl/..."
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.location_link}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone*</label>
                <input
                  type="tel"
                  name="owner_phone"
                  placeholder="+63 912..."
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.owner_phone}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email*</label>
                <input
                  type="email"
                  name="owner_email"
                  placeholder="owner@email.com"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.owner_email}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Property Details Row */}
            <div className="grid grid-cols-5 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1">Price ₱/mo *</label>
                <input
                  type="number"
                  name="price"
                  required
                  min="0"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.price}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Beds</label>
                <input
                  type="number"
                  name="bedrooms"
                  min="0"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.bedrooms}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Baths</label>
                <input
                  type="number"
                  name="bathrooms"
                  min="0"
                  step="0.5"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.bathrooms}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Sqft</label>
                <input
                  type="number"
                  name="area_sqft"
                  min="0"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={formData.area_sqft}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full border border-gray-300 px-3 py-2 text-sm bg-white cursor-pointer"
                >
                  <option value="available">✓ Available</option>
                  <option value="occupied">◐ Occupied</option>
                  <option value="not available">✗ Not Available</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                name="description"
                rows="4"
                className="w-full border border-gray-300 px-3 py-2 text-sm"
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            {/* Terms */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium">Terms & Conditions</label>
                <a href="/terms" target="_blank" className="text-sm text-blue-600 hover:underline cursor-pointer">View Template →</a>
              </div>
              <textarea
                name="terms_conditions"
                rows="3"
                className="w-full border border-gray-300 px-3 py-2 text-sm"
                placeholder="Custom terms for this property..."
                value={formData.terms_conditions}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Right Panel */}
          <div className="w-80 flex flex-col gap-3">
            {/* Images */}
            <div>
              <label className="block text-sm font-medium mb-2">Property Images</label>
              <div className="flex flex-wrap gap-2">
                {imageUrls.map((url, index) => (
                  <div key={index} className="relative">
                    <label className="cursor-pointer block">
                      <div className={`w-12 h-12 border flex items-center justify-center text-sm ${
                        url ? 'bg-green-100 border-green-600' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                      } ${uploadingImages[index] ? 'animate-pulse bg-yellow-50' : ''}`}>
                        {uploadingImages[index] ? '...' : url ? '✓' : '+'}
                      </div>
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
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center cursor-pointer"
                      >×</button>
                    )}
                  </div>
                ))}
                {imageUrls.length < 10 && (
                  <button
                    type="button"
                    onClick={addImageUrlField}
                    className="w-12 h-12 border border-dashed border-gray-400 flex items-center justify-center text-gray-400 hover:border-gray-600 cursor-pointer"
                  >+</button>
                )}
              </div>
            </div>

            {/* Amenities */}
            <div className="flex-1 overflow-y-auto">
              <label className="block text-sm font-medium mb-2">Amenities</label>
              <div className="grid grid-cols-2 gap-1">
                {(showAllAmenities ? availableAmenities : availableAmenities.slice(0, 10)).map((amenity) => (
                  <label
                    key={amenity}
                    className={`flex items-center gap-2 px-2 py-1.5 border cursor-pointer text-xs ${
                      formData.amenities.includes(amenity)
                        ? 'border-gray-600 bg-gray-100'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.amenities.includes(amenity)}
                      onChange={() => toggleAmenity(amenity)}
                      className="w-3 h-3 cursor-pointer"
                    />
                    {amenity}
                  </label>
                ))}
                {availableAmenities.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAmenities(!showAllAmenities)}
                    className="col-span-2 py-1.5 text-sm text-black underline cursor-pointer text-center"
                  >
                    {showAllAmenities ? 'Show Less' : `See More (${availableAmenities.length - 10} more)`}
                  </button>
                )}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-black text-white text-sm font-medium disabled:opacity-50 cursor-pointer rounded-full"
              >
                {loading ? 'Creating...' : 'Create Property'}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 bg-white text-black border border-gray-300 text-sm font-medium cursor-pointer rounded-full"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
