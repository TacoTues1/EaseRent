import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast, { Toaster } from 'react-hot-toast'

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
    status: 'available',
    terms_conditions: ''
  })

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
      .single()
    
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
      .single()
    
    if (error) {
      setMessage('Property not found')
      setTimeout(() => router.push('/dashboard'), 2000)
      return
    }

    // Check if user owns this property
    if (data.landlord !== session.user.id) {
      setMessage('You can only edit your own properties')
      setTimeout(() => router.push('/dashboard'), 2000)
      return
    }

    // Load property data into form
    setFormData({
      title: data.title || '',
      description: data.description || '',
      address: data.address || '',
      city: data.city || '',
      state: data.state || '',
      zip: data.zip || '',
      price: data.price || '',
      bedrooms: data.bedrooms || 1,
      bathrooms: data.bathrooms || 1,
      area_sqft: data.area_sqft || '',
      available: data.available ?? true,
      status: data.status || 'available',
      terms_conditions: data.terms_conditions || ''
    })

    // Load existing images
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
      const fileName = `${session.user.id}/${Date.now()}.${fileExt}`
      
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

    const validImageUrls = imageUrls.filter(url => url.trim() !== '')

    setLoading(true)
    const { error } = await supabase
      .from('properties')
      .update({
        ...formData,
        images: validImageUrls.length > 0 ? validImageUrls : null
      })
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
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Error deleting property: ' + error.message)
      setLoading(false)
    } else {
      toast.success('Property deleted successfully!')
      setTimeout(() => router.push('/dashboard'), 1500)
    }
  }

  if (!session || !profile) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  if (profile.role !== 'landlord') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="p-6 bg-white text-black border-2 border-black max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p>Only landlords can edit properties.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-6">    
      <div className="max-w-2xl mx-auto bg-white border-2 border-black p-6">
        <h1 className="text-2xl font-bold mb-4">Edit Property</h1>
        {message && (
          <div className={`mb-4 p-3 ${
            message.includes('Error') || message.includes('error') || message.includes('denied')
              ? 'bg-white text-black border-2 border-black'
              : message.includes('successfully') || message.includes('complete')
              ? 'bg-black text-white border-2 border-black'
              : 'bg-white text-black border-2 border-black'
          }`}>
            <div className="font-medium">{message}</div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              name="title"
              required
              className="w-full border-2 px-3 py-2"
              value={formData.title}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              name="description"
              rows="4"
              className="w-full border-2 px-3 py-2"
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
                className="w-full border-2 px-3 py-2"
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
                className="w-full border-2 px-3 py-2"
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
                className="w-full border-2 px-3 py-2"
                value={formData.state}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ZIP Code</label>
              <input
                type="text"
                name="zip"
                className="w-full border-2 px-3 py-2"
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
                className="w-full border-2 px-3 py-2"
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
                className="w-full border-2 px-3 py-2"
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
                className="w-full border-2 px-3 py-2"
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
              className="w-full border-2 px-3 py-2"
              value={formData.area_sqft}
              onChange={handleChange}
            />
          </div>

          {/* Property Status Dropdown */}
          <div className="p-4 bg-white border-2 border-black">
            <label className="block text-sm font-medium mb-2">Property Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full border-2 border-black px-3 py-2 bg-white font-medium"
            >
              <option value="available">✓ Available - Visible to tenants</option>
              <option value="occupied">◐ Occupied - Has current tenant</option>
              <option value="not available">✗ Not Available - Hidden from listings</option>
            </select>
            <p className="text-xs text-gray-600 mt-2">
              {formData.status === 'available' && 'Property is open for applications'}
              {formData.status === 'occupied' && 'Property has an assigned tenant'}
              {formData.status === 'not available' && 'Property is hidden from all listings'}
            </p>
          </div>

          {/* Image Upload Section */}
          <div className="border-t pt-4">
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

          <div className="flex gap-2 pt-4 border-t">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-black text-white disabled:opacity-50 hover:bg-black"
            >
              {loading ? 'Updating...' : 'Update Property'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-white text-black"
            >
              Cancel
            </button>
            {showDeleteConfirm ? (
              <div className="ml-auto flex items-center gap-2 bg-white px-3 py-2 border-2 border-black">
                <span className="text-sm text-black">Delete this property?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-3 py-1 bg-black text-white disabled:opacity-50 text-sm font-medium"
                >
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1 bg-white text-black text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
                className="px-6 py-2 bg-black text-white disabled:opacity-50 ml-auto"
              >
                Delete Property
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
