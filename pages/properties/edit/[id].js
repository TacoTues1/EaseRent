import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'

export default function EditProperty() {
  const router = useRouter()
  const { id } = router.query
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [imageUrls, setImageUrls] = useState([''])
  const [uploadingImages, setUploadingImages] = useState({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [uploadingTerms, setUploadingTerms] = useState(false)

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    building_no: '',
    address: '',
    city: '',
    street: '',
    zip: '',
    location_link: '',
    owner_phone: '',
    owner_email: '',
    price: '',
    utilities_cost: '',
    internet_cost: '',
    association_dues: '',
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
    'Wifi', 'Air Condition', 'Washing Machine', 'Parking',
    'Hot Shower', 'Bathroom', 'Smoke Alarm', 'Veranda',
    'Fire Extinguisher', 'Outside Garden', 'Furnished',
    'Semi-Furnished', 'Pet Friendly', 'Kitchen', 'Smart TV'
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

  useEffect(() => {
    if (id && session) {
      loadProperty()
    }
  }, [id, session])

  async function checkAuth() {
    const result = await supabase.auth.getSession()
    if (!result.data?.session) {
      router.push('/')
      return
    }

    setSession(result.data.session)

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', result.data.session.user.id)
      .maybeSingle()

    if (profileData) {
      setProfile(profileData)
      if (profileData.role !== 'landlord') {
        setMessage('Access denied. Only landlords can edit properties.')
        setTimeout(() => router.push('/dashboard'), 2000)
      }
    }
  }

  async function loadProperty() {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) {
      setMessage('Property not found')
      setTimeout(() => router.push('/dashboard'), 2000)
      return
    }

    if (data.landlord !== session.user.id) {
      setMessage('You can only edit your own properties')
      setTimeout(() => router.push('/dashboard'), 2000)
      return
    }

    setFormData({
      title: data.title || '',
      description: data.description || '',
      building_no: data.building_no || '',
      street: data.street || '',
      address: data.address || '',
      city: data.city || '',
      zip: data.zip || '',
      location_link: data.location_link || '',
      owner_phone: data.owner_phone || '',
      owner_email: data.owner_email || '',
      price: data.price || '',
      // Populate New Cost Fields
      utilities_cost: data.utilities_cost || '',
      internet_cost: data.internet_cost || '',
      association_dues: data.association_dues || '',
      bedrooms: data.bedrooms || 1,
      bathrooms: data.bathrooms || 1,
      area_sqft: data.area_sqft || '',
      available: data.available ?? true,
      status: data.status || 'available',
      terms_conditions: data.terms_conditions || '',
      amenities: data.amenities || []
    })

    if (data.images && data.images.length > 0) {
      setImageUrls(data.images)
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
    // Reset input value to allow re-uploading the same file
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage('Please upload an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage('Image size must be less than 5MB')
      return
    }

    setUploadingImages(prev => ({ ...prev, [index]: true }))
    try {
      const fileExt = file.name.split('.').pop()
      const randomId = Math.random().toString(36).substring(2, 10)
      const fileName = `${session.user.id}/${Date.now()}_${randomId}.${fileExt}`

      const { data, error } = await supabase.storage
        .from('property-images')
        .upload(fileName, file)

      if (error) {
        if (error.message.includes('Bucket not found') || error.message.includes('bucket')) {
          throw new Error('Storage bucket not set up. Please create "property-images" bucket in Supabase Dashboard.')
        }
        throw error
      }

      const { data: publicUrlData } = supabase.storage
        .from('property-images')
        .getPublicUrl(fileName)

      // Use functional update to avoid race conditions with concurrent uploads
      setImageUrls(prev => {
        const newUrls = [...prev]
        newUrls[index] = publicUrlData.publicUrl
        return newUrls
      })

      setMessage('Image uploaded successfully!')
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Upload error:', error)
      setMessage(error.message || 'Error uploading image')
    } finally {
      setUploadingImages(prev => ({ ...prev, [index]: false }))
    }
  }

  // Handle multiple file uploads at once
  async function handleMultipleImageUpload(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''

    if (files.length === 0) return

    // Filter valid images
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        setMessage(`${file.name} is not an image file`)
        return false
      }
      if (file.size > 5 * 1024 * 1024) {
        setMessage(`${file.name} is too large (max 5MB)`)
        return false
      }
      return true
    })

    if (validFiles.length === 0) return

    // Find empty slots and add more if needed
    let currentUrls = [...imageUrls]
    const emptySlots = []

    // Find existing empty slots
    currentUrls.forEach((url, idx) => {
      if (!url) emptySlots.push(idx)
    })

    // Add more slots if needed (up to 10 total)
    while (emptySlots.length < validFiles.length && currentUrls.length < 10) {
      emptySlots.push(currentUrls.length)
      currentUrls.push('')
    }

    // Update state with new slots
    setImageUrls(currentUrls)

    // Limit to available slots
    const filesToUpload = validFiles.slice(0, emptySlots.length)

    if (filesToUpload.length < validFiles.length) {
      setMessage(`Only uploading ${filesToUpload.length} of ${validFiles.length} images (max 10 total)`)
    }

    // Upload each file to its slot
    filesToUpload.forEach((file, i) => {
      const slotIndex = emptySlots[i]
      // Create a fake event object for the existing upload function
      const fakeEvent = {
        target: {
          files: [file],
          value: ''
        }
      }
      handleImageUpload(fakeEvent, slotIndex)
    })
  }

  async function handleTermsUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setMessage('Please upload a PDF file')
      return
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setMessage('PDF size must be less than 10MB')
      return
    }

    setUploadingTerms(true)
    try {
      const fileExt = file.name.split('.').pop()
      // Create a unique filename for the terms
      const fileName = `${session.user.id}/terms-${Date.now()}.${fileExt}`

      const { data, error } = await supabase.storage
        .from('property-documents') // Needs a bucket named 'property-documents'
        .upload(fileName, file)

      if (error) {
        if (error.message.includes('Bucket not found') || error.message.includes('bucket')) {
          throw new Error('Storage bucket not set up. Please create "property-documents" bucket in Supabase Dashboard.')
        }
        throw error
      }

      const { data: publicUrlData } = supabase.storage
        .from('property-documents')
        .getPublicUrl(fileName)

      // Save URL to formData
      setFormData(prev => ({ ...prev, terms_conditions: publicUrlData.publicUrl }))

      setMessage('Terms PDF uploaded successfully!')
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Upload error:', error)
      setMessage(error.message || 'Error uploading PDF')
    } finally {
      setUploadingTerms(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!session) {
      setMessage('You must be signed in.')
      return
    }

    const validImageUrls = imageUrls.filter(url => url.trim() !== '')

    setLoading(true)

    // Helper to ensure numeric fields are sent as numbers or 0 (not empty strings)
    const sanitizeNumber = (val) => (val === '' || val === null ? 0 : val)

    const payload = {
      ...formData,
      price: sanitizeNumber(formData.price),
      utilities_cost: sanitizeNumber(formData.utilities_cost),
      internet_cost: sanitizeNumber(formData.internet_cost),
      association_dues: sanitizeNumber(formData.association_dues),
      bedrooms: sanitizeNumber(formData.bedrooms),
      bathrooms: sanitizeNumber(formData.bathrooms),
      area_sqft: sanitizeNumber(formData.area_sqft),
      images: validImageUrls.length > 0 ? validImageUrls : null
    }

    const { error } = await supabase
      .from('properties')
      .update(payload)
      .eq('id', id)

    if (error) {
      setMessage('Error updating property: ' + error.message)
    } else {
      setMessage('Property updated successfully!')
      setTimeout(() => router.push(`/properties/${id}`), 1500)
    }
    setLoading(false)
  }

  async function handleDelete() {
    setShowDeleteConfirm(false)
    setLoading(true)

    // CHANGED: Instead of .delete(), we .update() the is_deleted flag
    const { error } = await supabase
      .from('properties')
      .update({ is_deleted: true })
      .eq('id', id)

    if (error) {
      showToast.error('Error deleting property: ' + error.message, {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });

      setLoading(false)
    } else {
      showToast.success('Property deleted successfully!', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      setTimeout(() => router.push('/dashboard'), 1500)
    }
  }

  // Check if any uploads are in progress
  const isUploading = Object.values(uploadingImages).some(v => v) || uploadingTerms

  if (!session || !profile) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading...</div>

  if (profile.role !== 'landlord') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="p-8 bg-white text-black border border-gray-200 shadow-md rounded-xl max-w-md text-center">
          <h2 className="text-2xl font-bold mb-3 text-gray-900">Access Denied</h2>
          <p className="text-gray-600">Only landlords can edit properties.</p>
          <p className="mt-6 text-sm text-gray-400">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#FAFAFA] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Edit Property</h1>
            <p className="text-gray-500 text-sm mt-1">Update details for this listing.</p>
          </div>
          {message && (
            <div className={`px-4 py-3 text-sm font-medium rounded-lg shadow-sm border ${message.includes('Error') || message.includes('error') || message.includes('denied')
              ? 'bg-red-50 text-red-700 border-red-100'
              : message.includes('successfully') || message.includes('complete')
                ? 'bg-green-50 text-green-700 border-green-100'
                : 'bg-white text-gray-700 border-gray-200'
              }`}>
              {message}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 bg-white p-6 mFd:p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-8">

            {/* Title Section */}
            <div className="pb-6 border-b border-gray-50">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Property Title *</label>
              <input
                type="text"
                name="title"
                required
                className="w-full bg-gray-50 border-2 border-transparent focus:bg-white focus:border-black rounded-xl px-4 py-4 text-xl font-medium transition-all outline-none placeholder-gray-400"
                placeholder="e.g. Modern Loft in Downtown"
                value={formData.title}
                onChange={handleChange}
              />
            </div>

            {/* Location Section */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-black rounded-full"></span> Location
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 ml-1">Bldg No.</label>
                  <input
                    type="text"
                    name="building_no"
                    placeholder="Bldg 5"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                    value={formData.building_no}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 ml-1">Street *</label>
                  <input
                    type="text"
                    name="street"
                    required
                    placeholder="123 Main St"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                    value={formData.street}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 ml-1">Barangay *</label>
                  <input
                    type="text"
                    name="address"
                    required
                    placeholder="San Roque"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                    value={formData.address}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 ml-1">City *</label>
                  <input
                    type="text"
                    name="city"
                    required
                    placeholder="Manila"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                    value={formData.city}
                    onChange={handleChange}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 ml-1">ZIP *</label>
                  <input
                    type="text"
                    name="zip"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                    value={formData.zip}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <label className="text-xs font-semibold text-gray-500 ml-1">Google Map Link (Preferred)</label>
                  <input
                    type="url"
                    name="location_link"
                    placeholder="https://maps.app.goo.gl/..."
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none text-blue-600"
                    value={formData.location_link}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            {/* Specs & Contact Split */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
              {/* Contact */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-black rounded-full"></span> Contact
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Phone *</label>
                    <input
                      type="tel"
                      name="owner_phone"
                      placeholder="+63 912..."
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                      value={formData.owner_phone}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Email *</label>
                    <input
                      type="email"
                      name="owner_email"
                      placeholder="owner@email.com"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                      value={formData.owner_email}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>

              {/* Specs */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-black rounded-full"></span> Details
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs font-bold text-gray-700 ml-1">Monthly Price (₱) *</label>
                    <input
                      type="number"
                      name="price"
                      required
                      min="0"
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:bg-white focus:border-black outline-none font-semibold"
                      value={formData.price}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Beds</label>
                    <input
                      type="number"
                      name="bedrooms"
                      min="0"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none"
                      value={formData.bedrooms}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Baths</label>
                    <input
                      type="number"
                      name="bathrooms"
                      min="0"
                      step="0.5"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none"
                      value={formData.bathrooms}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Sqft</label>
                    <input
                      type="number"
                      name="area_sqft"
                      min="0"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none"
                      value={formData.area_sqft}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none cursor-pointer"
                    >
                      <option value="available">Available</option>
                      <option value="occupied">Occupied</option>
                      <option value="not available">Unavailable</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Description & Terms */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-50">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Description</label>
                <textarea
                  name="description"
                  rows="5"
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-black outline-none resize-none"
                  placeholder="Describe the property..."
                  value={formData.description}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Terms & Conditions (PDF)</label>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col justify-center h-[132px]">

                  {formData.terms_conditions && formData.terms_conditions.startsWith('http') ? (
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 mb-2">
                      <a href={formData.terms_conditions} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:underline">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        View Uploaded PDF
                      </a>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, terms_conditions: '' }))}
                        className="text-red-500 hover:text-red-700 text-xs font-bold uppercase tracking-wider"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center mb-3">
                      No custom terms uploaded. The default system terms will be used.
                    </p>
                  )}

                  <div className="relative">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleTermsUpload}
                      disabled={uploadingTerms}
                      className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-black file:text-white hover:file:bg-gray-800 cursor-pointer"
                    />
                    {uploadingTerms && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-black font-bold bg-white px-2">Uploading...</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>



          {/* Sidebar - Media & Actions */}
          <div className="w-full lg:w-80 flex flex-col gap-6">

            {/* Images Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <label className="block text-sm font-bold text-gray-900 mb-4">Photos (Max 10)</label>
              <div className="grid grid-cols-5 gap-2">
                {imageUrls.map((url, index) => (
                  <div key={index} className="relative aspect-square">
                    <label className="cursor-pointer block h-full">
                      {url ? (
                        <div className="w-full h-full rounded-lg overflow-hidden border-2 border-green-200 relative group">
                          <img
                            src={url}
                            alt={`Preview ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold">Change</span>
                          </div>
                        </div>
                      ) : (
                        <div className={`w-full h-full border rounded-lg flex items-center justify-center text-xs transition-colors bg-gray-50 border-gray-200 text-gray-400 ${uploadingImages[index] ? 'bg-yellow-50 border-yellow-300' : ''}`}>
                          {uploadingImages[index] ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                              <span className="text-[8px]">...</span>
                            </div>
                          ) : '+'}
                        </div>
                      )}
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
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center cursor-pointer shadow-sm border border-white hover:bg-red-600 transition-colors"
                      >×</button>
                    )}
                  </div>
                ))}
                {imageUrls.length < 10 && (
                  <button
                    type="button"
                    onClick={addImageUrlField}
                    className="aspect-square rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer bg-white hover:bg-gray-50 hover:border-gray-400 transition-colors"
                  >+</button>
                )}
              </div>
              {/* Multi-select upload button */}
              <label className="mt-3 flex items-center justify-center gap-2 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg cursor-pointer transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Upload Multiple Photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleMultipleImageUpload}
                />
              </label>
              <p className="text-[10px] text-gray-400 mt-2 text-center">Max 5MB per image. Up to 10 photos.</p>
            </div>

            {/* Amenities Card */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 h-fit">
              <label className="block text-m font-bold text-gray-900 mb-3">Amenities</label>
              <div className="flex flex-wrap gap-1.5 content-start">
                {(showAllAmenities ? availableAmenities : availableAmenities.slice(0, 10)).map((amenity) => (
                  <label
                    key={amenity}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full cursor-pointer text-xs border transition-all ${formData.amenities.includes(amenity)
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 bg-white text-gray-600'
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.amenities.includes(amenity)}
                      onChange={() => toggleAmenity(amenity)}
                      className="hidden"
                    />
                    {amenity}
                  </label>
                ))}
              </div>
              {availableAmenities.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAllAmenities(!showAllAmenities)}
                  className="mt-3 text-[10px] font-bold text-black border-b border-black w-max cursor-pointer self-center uppercase tracking-wide"
                >
                  {showAllAmenities ? 'Show Less' : `Show All (${availableAmenities.length})`}
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="px-4 py-3 bg-white text-black border border-gray-200 text-sm font-bold cursor-pointer rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || isUploading}
                  className="px-4 py-3 bg-black text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded-xl shadow-lg shadow-gray-200"
                >
                  {loading ? 'Saving...' : isUploading ? 'Uploading...' : 'Update'}
                </button>
              </div>

              {showDeleteConfirm ? (
                <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex flex-col gap-3 animate-in fade-in zoom-in duration-200">
                  <p className="text-xs font-bold text-red-800 text-center">Are you sure you want to delete this property?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={loading}
                      className="flex-1 px-3 py-2 bg-red-600 text-white text-xs font-bold cursor-pointer rounded-lg"
                    >
                      Yes, Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 px-3 py-2 bg-white text-red-800 border border-red-200 text-xs font-bold cursor-pointer rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={loading}
                  className="w-full px-4 py-3 text-red-600 border border-transparent hover:bg-red-50 text-sm font-semibold cursor-pointer rounded-xl transition-colors"
                >
                  Delete Property
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}