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
    available: true
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
      setTimeout(() => router.push('/properties'), 2000)
      return
    }

    // Check if user owns this property
    if (data.landlord !== session.user.id) {
      setMessage('You can only edit your own properties')
      setTimeout(() => router.push('/properties'), 2000)
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
      available: data.available ?? true
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
      setTimeout(() => router.push('/properties'), 1500)
    }
  }

  if (!session || !profile) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  if (profile.role !== 'landlord') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="p-6 bg-red-50 text-red-800 rounded shadow max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p>Only landlords can edit properties.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Toaster position="top-right" />
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Edit Property</h1>
        {message && (
          <div className={`mb-4 p-3 rounded ${
            message.includes('Error') || message.includes('error') || message.includes('denied')
              ? 'bg-red-50 text-red-800 border border-red-200'
              : message.includes('successfully') || message.includes('complete')
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
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
              className="w-full border rounded px-3 py-2"
              value={formData.title}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              name="description"
              rows="4"
              className="w-full border rounded px-3 py-2"
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
                className="w-full border rounded px-3 py-2"
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
                className="w-full border rounded px-3 py-2"
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
                className="w-full border rounded px-3 py-2"
                value={formData.state}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ZIP Code</label>
              <input
                type="text"
                name="zip"
                className="w-full border rounded px-3 py-2"
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
                className="w-full border rounded px-3 py-2"
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
                className="w-full border rounded px-3 py-2"
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
                className="w-full border rounded px-3 py-2"
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
              className="w-full border rounded px-3 py-2"
              value={formData.area_sqft}
              onChange={handleChange}
            />
          </div>

          {/* Availability Toggle */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded border border-gray-200">
            <input
              type="checkbox"
              id="available"
              name="available"
              checked={formData.available}
              onChange={(e) => setFormData({ ...formData, available: e.target.checked })}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <label htmlFor="available" className="text-sm font-medium cursor-pointer">
              Property is available for rent
              <span className="block text-xs text-gray-600 font-normal mt-1">
                {formData.available ? '✓ This property will be visible to tenants' : '✗ This property will be hidden from tenants'}
              </span>
            </label>
          </div>

          {/* Image Upload Section */}
          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium">Property Images</label>
              <button
                type="button"
                onClick={addImageUrlField}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add Image
              </button>
            </div>
            
            <div className="space-y-3">
              {imageUrls.map((url, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <div className="flex gap-2 mb-1">
                      <input
                        type="url"
                        placeholder="Paste image URL or upload file below"
                        className="flex-1 border rounded px-3 py-2 text-sm"
                        value={url}
                        onChange={(e) => handleImageUrlChange(index, e.target.value)}
                      />
                      {imageUrls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeImageUrlField(index)}
                          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded border border-red-200"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    
                    <div className="flex gap-2 items-center">
                      <label className="cursor-pointer">
                        <span className="text-xs text-blue-600 hover:text-blue-700 underline">
                          Upload from computer
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageUpload(e, index)}
                          disabled={uploadingImages[index]}
                        />
                      </label>
                      {uploadingImages[index] && (
                        <span className="text-xs text-gray-500">Uploading...</span>
                      )}
                      {url && !uploadingImages[index] && (
                        <span className="text-xs text-green-600">✓ Uploaded</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* <div className="flex items-center">
            <input
              type="checkbox"
              name="available"
              id="available"
              className="mr-2"
              checked={formData.available}
              onChange={handleChange}
            />
            <label htmlFor="available" className="text-sm">Available for rent</label>
          </div> */}

          <div className="flex gap-2 pt-4 border-t">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
            >
              {loading ? 'Updating...' : 'Update Property'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            {showDeleteConfirm ? (
              <div className="ml-auto flex items-center gap-2 bg-red-50 px-3 py-2 rounded border border-red-200">
                <span className="text-sm text-gray-700">Delete this property?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50 hover:bg-red-700 text-sm font-medium"
                >
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
                className="px-6 py-2 bg-red-600 text-white rounded disabled:opacity-50 hover:bg-red-700 ml-auto"
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
