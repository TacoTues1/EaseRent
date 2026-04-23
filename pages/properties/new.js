import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { normalizeImageForUpload } from '../../lib/imageCompression'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import { COUNTRY_SUGGESTIONS, getStateProvinceSuggestions, isPhilippinesCountry } from '../../lib/locationData'

const TOTAL_STEPS = 7

const STEP_LABELS = [
  'Title & Location',
  'Contact & Details',
  'Payment Terms',
  'Utilities',
  'Description & Terms',
  'Amenities',
  'Photos'
]

export default function NewProperty() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  
  const notifySuccess = (msg) => showToast.success(msg, { duration: 3000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true })
  const notifyError = (msg) => showToast.error(msg, { duration: 3000, progress: true, position: 'top-center', transition: 'bounceInDown', icon: '', sound: true })
  const [imageUrls, setImageUrls] = useState([''])
  const [uploadingImages, setUploadingImages] = useState({})
  const [uploadingTerms, setUploadingTerms] = useState(false)
  const [step, setStep] = useState(1)
  const [noOccupancyLimit, setNoOccupancyLimit] = useState(false)

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    building_no: '',
    street: '',
    address: '',
    city: '',
    state_province: '',
    country: 'Philippines',
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
    max_occupancy: 1,
    terms_conditions: '',
    amenities: [],
    has_security_deposit: true,
    security_deposit_amount: '',
    deposit_same_as_rent: true,
    has_advance: true,
    advance_amount: '',
    advance_same_as_rent: true,
  })

  const propertyTypes = ['House Apartment', 'Studio Type', 'Solo Room', 'Boarding House', 'Other']
  const bedTypes = ['Single Bed', 'Double Bed', 'Triple Bed']

  const [showAllAmenities, setShowAllAmenities] = useState(false)
  const [amenitiesSearch, setAmenitiesSearch] = useState('')
  const initialAmenitiesCount = 18

  const availableAmenities = [
  'Kitchen', 'Pool', 'TV', 'Elevator', 'Air conditioning', 'Heating', 'Basketball court',
  'Washing machine', 'Dryer', 'Parking', 'Gym', 'Security', 'Balcony', 'Garden', "Kid's Playground",
  'Pet friendly', 'Furnished', 'Carbon monoxide alarm', 'Smoke alarm', 'Fire extinguisher', 'First aid kit',
  'WiFi', 'Cable TV', 'Workspace', 'Study desk', 'Wardrobe', 'Closet', 'Hot water',
  'Refrigerator', 'Microwave', 'Oven', 'Dishwasher', 'Coffee maker',
  '24/7 Security', 'CCTV', 'Gated community', 'Doorman',
  'Private entrance', 'Fire exit', 'Emergency lighting',
  'Beach access', 'Mountain view', 'City view',
  'BBQ grill', 'Outdoor dining area', 'Patio', 'Terrace',
  'Game room', 'Billiards', 'Table tennis',
  'Sauna', 'Spa', 'Jacuzzi',
  'Power backup', 'Generator', 'Solar panels',
  'Water heater', 'Water tank', 'Deep well',
  'Garbage disposal', 'Recycling bins',
  'Bicycle parking', 'Motorcycle parking',
  'Shuttle service', 'Transport service',
  'Cleaning service', 'Laundry service',
  'Keycard access', 'Smart lock',
  'Soundproof rooms', 'Non-smoking rooms',
  'Wheelchair accessible', 'Ramp access'
]

  const normalizeAmenities = (amenities = []) => {
    const mapped = (amenities || []).map(a => (a === 'WiFi' ? 'Wifi' : a))
    const unique = [...new Set(mapped)]
    if (unique.includes('Free WiFi') && !unique.includes('Wifi')) unique.push('Wifi')
    return unique
  }

  const getWifiModeFromAmenities = (amenities = []) => {
    const normalized = normalizeAmenities(amenities)
    if (normalized.includes('Free WiFi')) return 'free'
    if (normalized.includes('Wifi')) return 'paid'
    return 'none'
  }

  const setWifiMode = (mode) => {
    setFormData(prev => {
      const normalized = normalizeAmenities(prev.amenities)
      const withoutWifi = normalized.filter(a => a !== 'Wifi' && a !== 'Free WiFi')

      if (mode === 'paid') return { ...prev, amenities: [...withoutWifi, 'Wifi'] }
      if (mode === 'free') return { ...prev, amenities: [...withoutWifi, 'Wifi', 'Free WiFi'] }
      return { ...prev, amenities: withoutWifi }
    })
  }

  const toggleAmenity = (amenity) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity]
    }))
  }

  const normalizedAmenitySearch = amenitiesSearch.trim().toLowerCase()

  const filteredAmenities = availableAmenities.filter((amenity) =>
    amenity.toLowerCase().includes(normalizedAmenitySearch)
  )

  const visibleAmenities = normalizedAmenitySearch
    ? filteredAmenities
    : (showAllAmenities ? availableAmenities : availableAmenities.slice(0, initialAmenitiesCount))

  useEffect(() => {
    checkAuth()
  }, [])

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
      if (profileData.role !== 'landlord' && profileData.role !== 'admin') {
        notifyError('Access denied. Only landlords and admins can add properties.')
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

  function handleCountryChange(e) {
    const { value } = e.target
    setFormData(prev => ({
      ...prev,
      country: value
    }))
  }

  function handleNoOccupancyLimitChange(e) {
    const checked = e.target.checked
    setNoOccupancyLimit(checked)
    setFormData(prev => ({
      ...prev,
      max_occupancy: checked
        ? 0
        : (Number(prev.max_occupancy) > 0 ? prev.max_occupancy : 1)
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
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      notifyError('Please upload an image file')
      return
    }

    setUploadingImages(prev => ({ ...prev, [index]: true }))
    try {
      const uploadFile = await normalizeImageForUpload(file)
      const fileExt = uploadFile.name.split('.').pop()
      const randomId = Math.random().toString(36).substring(2, 10)
      const fileName = `${session.user.id}/${Date.now()}_${randomId}.${fileExt}`

      const { data, error } = await supabase.storage
        .from('property-images')
        .upload(fileName, uploadFile)

      if (error) {
        if (error.message.includes('Bucket not found') || error.message.includes('bucket')) {
          throw new Error('Storage bucket not set up. Please create "property-images" bucket in Supabase Dashboard.')
        }
        throw error
      }

      const { data: publicUrlData } = supabase.storage
        .from('property-images')
        .getPublicUrl(fileName)

      setImageUrls(prev => {
        const newUrls = [...prev]
        newUrls[index] = publicUrlData.publicUrl
        return newUrls
      })

      notifySuccess('Image uploaded successfully!')
    } catch (error) {
      console.error('Upload error:', error)
      notifyError(error.message || 'Error uploading image')
    } finally {
      setUploadingImages(prev => ({ ...prev, [index]: false }))
    }
  }

  async function handleMultipleImageUpload(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''

    if (files.length === 0) return

    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        notifyError(`${file.name} is not an image file`)
        return false
      }
      return true
    })

    if (validFiles.length === 0) return

    let currentUrls = [...imageUrls]
    const emptySlots = []

    currentUrls.forEach((url, idx) => {
      if (!url) emptySlots.push(idx)
    })

    while (emptySlots.length < validFiles.length && currentUrls.length < 10) {
      emptySlots.push(currentUrls.length)
      currentUrls.push('')
    }

    setImageUrls(currentUrls)

    const filesToUpload = validFiles.slice(0, emptySlots.length)

    if (filesToUpload.length < validFiles.length) {
      showToast.warning(`Only uploading ${filesToUpload.length} of ${validFiles.length} images (max 10 total)`, { duration: 3000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true })
    }

    filesToUpload.forEach((file, i) => {
      const slotIndex = emptySlots[i]
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
      notifyError('Please upload a PDF file')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      notifyError('PDF size must be less than 2MB')
      return
    }

    setUploadingTerms(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${session.user.id}/terms-${Date.now()}.${fileExt}`

      const { data, error } = await supabase.storage
        .from('property-documents')
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

      setFormData(prev => ({ ...prev, terms_conditions: publicUrlData.publicUrl }))

      notifySuccess('Terms PDF uploaded successfully!')
    } catch (error) {
      console.error('Upload error:', error)
      notifyError(error.message || 'Error uploading PDF')
    } finally {
      setUploadingTerms(false)
    }
  }

  async function handleSubmit() {
    if (!session) {
      notifyError('You must be signed in.')
      return
    }

    const validImageUrls = imageUrls.filter(url => url.trim() !== '')
    if (validImageUrls.length === 0) {
      notifyError('Please upload at least one photo before creating the property')
      return
    }

    setLoading(true)

    const sanitizeNumber = (val) => (val === '' || val === null ? 0 : val)

    const { deposit_same_as_rent, advance_same_as_rent, ...cleanedFormData } = formData

    const payload = {
      ...cleanedFormData,
      amenities: normalizeAmenities(cleanedFormData.amenities),
      zip: sanitizeNumber(formData.zip),
      price: sanitizeNumber(formData.price),
      utilities_cost: sanitizeNumber(formData.utilities_cost),
      internet_cost: sanitizeNumber(formData.internet_cost),
      association_dues: sanitizeNumber(formData.association_dues),
      bedrooms: sanitizeNumber(formData.bedrooms),
      bathrooms: sanitizeNumber(formData.bathrooms),
      area_sqft: sanitizeNumber(formData.area_sqft),
      max_occupancy: sanitizeNumber(formData.max_occupancy),
      landlord: session.user.id,
      images: validImageUrls.length > 0 ? validImageUrls : null,
      has_security_deposit: formData.has_security_deposit,
      security_deposit_amount: formData.has_security_deposit ? (formData.deposit_same_as_rent ? sanitizeNumber(formData.price) : sanitizeNumber(formData.security_deposit_amount)) : 0,
      has_advance: formData.has_advance,
      advance_amount: formData.has_advance ? (formData.advance_same_as_rent ? sanitizeNumber(formData.price) : sanitizeNumber(formData.advance_amount)) : 0
    }

    if (profile.role === 'admin') {
      const response = await fetch('/api/admin/create-property', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accessToken: session.access_token,
          payload
        })
      })

      const result = await response.json()
      if (!response.ok) {
        notifyError('Error creating property: ' + (result.error || 'Unknown error'))
      } else {
        notifySuccess('Property created successfully!')
        setTimeout(() => router.push('/dashboard'), 1500)
      }
    } else {
      const { error } = await supabase.from('properties').insert(payload)

      if (error) {
        notifyError('Error creating property: ' + error.message)
      } else {
        notifySuccess('Property created successfully!')
        setTimeout(() => router.push('/dashboard'), 1500)
      }
    }
    setLoading(false)
  }

  const isUploading = Object.values(uploadingImages).some(v => v) || uploadingTerms
  const hasAtLeastOnePhoto = imageUrls.some(url => (url || '').trim() !== '')
  const shouldSuggestPhilippineProvinces = isPhilippinesCountry(formData.country)
  const stateProvinceSuggestions = getStateProvinceSuggestions(formData.country)

  function validateStep() {
    const warn = (msg) => {
      showToast.warning(msg, {
        duration: 3000,
        progress: true,
        position: 'top-center',
        transition: 'bounceIn',
        icon: '',
        sound: true,
      })
    }
    if (step === 1) {
      if (!formData.title.trim()) { warn('Rent title is required'); return false }
      if (!formData.street.trim()) { warn('Street is required'); return false }
      if (!formData.address.trim()) { warn('Barangay is required'); return false }
      if (!formData.city.trim()) { warn('City is required'); return false }
      if (!formData.country.trim()) { warn('Country is required'); return false }
      if (!formData.state_province.trim()) { warn(shouldSuggestPhilippineProvinces ? 'Province is required' : 'State/Province is required'); return false }
      if (!formData.zip) { warn('ZIP Code is required'); return false }
    }
    if (step === 2) {
      if (!formData.price) { warn('Monthly price is required'); return false }
      if (formData.property_type === 'Other' && !formData.custom_property_type.trim()) { return false }
    }
    return true
  }

  function goNext() {
    if (!validateStep()) return
    if (step < TOTAL_STEPS) setStep(step + 1)
  }

  function goBack() {
    if (step > 1) setStep(step - 1)
  }

  if (!session || !profile) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading...</div>

  if (profile.role !== 'landlord' && profile.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="p-8 bg-white text-black border border-gray-200 shadow-md rounded-xl max-w-md text-center">
          <h2 className="text-2xl font-bold mb-3 text-gray-900">Access Denied</h2>
          <p className="text-gray-600">Only landlords and admins can add properties.</p>
          <p className="mt-6 text-sm text-gray-400">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans">
      {/* Minimal Logo Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="w-full px-4 py-3 flex items-center justify-center">
          <button onClick={() => router.push('/dashboard')} className="flex items-center justify-center gap-2 hover:opacity-70 transition-opacity cursor-pointer">
            <img src="/home.png" alt="Logo" className="w-8 h-8 md:w-10 md:h-10 object-contain" />
            <span className="text-[22px] md:text-[28px] text-black tracking-normal leading-none" style={{ fontFamily: '"Pacifico", cursive', marginTop: '-4px' }}>Abalay</span>
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Add Property</h1>
          <p className="text-gray-500 text-sm mt-1">Step {step} of {TOTAL_STEPS} — {STEP_LABELS[step - 1]}</p>
        </div>

        {/* Progress Bar (Segmented line design) */}
        <div className="mb-10 w-full">
          <div className="hidden md:flex gap-2 w-full">
            {STEP_LABELS.map((label, i) => (
              <div key={i} className="flex-1 flex flex-col gap-2.5">
                <div className="h-2 rounded-full overflow-hidden bg-gray-200 w-full relative">
                  <div className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 bg-black ${i < step ? 'w-full' : 'w-0'}`} />
                </div>
                <span className={`text-[10px] md:text-[11px] font-bold tracking-wide text-center leading-tight mx-auto px-0.5 ${i < step ? 'text-gray-900' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Mobile minimal progress */}
          <div className="md:hidden flex gap-1.5 mb-2 mt-4">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-gray-200">
                <div className={`h-full rounded-full transition-all duration-500 ${i < step ? 'bg-black' : 'bg-transparent'}`} style={{ width: i < step ? '100%' : '0%' }} />
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 min-h-[360px]">

          {/* STEP 1: Title & Location */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Property Title *</label>
                <input
                  type="text"
                  name="title"
                  required
                  className="w-full bg-gray-50 border-2 border-transparent focus:bg-white focus:border-black rounded-xl px-4 py-4 text-lg font-medium transition-all outline-none placeholder-gray-400"
                  placeholder="e.g. Sunny Studio Near Downtown"
                  value={formData.title}
                  onChange={handleChange}
                />
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-black rounded-full"></span> Location
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Bldg No.</label>
                    <input type="text" name="building_no" placeholder="Bldg 5" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none" value={formData.building_no} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Street *</label>
                    <input type="text" name="street" required placeholder="Street" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none" value={formData.street} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Barangay *</label>
                    <input type="text" name="address" required placeholder="Barangay" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none" value={formData.address} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">City *</label>
                    <input type="text" name="city" required placeholder="City" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none" value={formData.city} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Country *</label>
                    <input type="text" name="country" required list="country-options" placeholder="Country" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none" value={formData.country} onChange={handleCountryChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">{shouldSuggestPhilippineProvinces ? 'Province *' : 'State / Province *'}</label>
                    <input type="text" name="state_province" required list="state-province-options" placeholder={shouldSuggestPhilippineProvinces ? 'Select or type a Philippine province' : 'Select or type a state/province'} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none" value={formData.state_province} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">ZIP *</label>
                  <input
                    type="number"
                    name="zip"
                    placeholder="ZIP Code"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none"
                    value={formData.zip}
                    onChange={handleChange}
                  />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Google Map Link</label>
                    <input type="url" name="location_link" placeholder="https://maps.app.goo.gl/..." className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none text-blue-600" value={formData.location_link} onChange={handleChange} />
                  </div>
                </div>
                <datalist id="country-options">
                  {COUNTRY_SUGGESTIONS.map((country) => (
                    <option key={country} value={country} />
                  ))}
                </datalist>
                <datalist id="state-province-options">
                  {stateProvinceSuggestions.map((entry) => (
                    <option key={entry} value={entry} />
                  ))}
                </datalist>
              </div>
            </div>
          )}

          {/* STEP 2: Contact & Details */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-black rounded-full"></span> Contact Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Phone Number</label>
                    <input type="tel" name="owner_phone" placeholder="Phone number" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none" value={formData.owner_phone} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Email Address</label>
                    <input type="email" name="owner_email" placeholder="Email Address" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none" value={formData.owner_email} onChange={handleChange} />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-black rounded-full"></span> Property Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 ml-1">Monthly Price (PHP) *</label>
                    <input type="number" name="price" required min="0" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:bg-white focus:border-black outline-none font-semibold" value={formData.price} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Status</label>
                    <select name="status" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none cursor-pointer">
                      <option value="available">Available</option>
                      <option value="occupied">Occupied</option>
                      <option value="not available">Unavailable</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Number of Beds</label>
                    <input type="number" name="bedrooms" min="0" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none" value={formData.bedrooms} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Number of Baths</label>
                    <input type="number" name="bathrooms" min="0" step="0.5" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none" value={formData.bathrooms} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Area (Sqft)</label>
                    <input type="number" name="area_sqft" min="0" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none" value={formData.area_sqft} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Good for (People)</label>
                    {noOccupancyLimit ? (
                      <input
                        type="text"
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:border-black outline-none"
                        value="No Limits"
                        readOnly
                      />
                    ) : (
                      <input
                        type="number"
                        name="max_occupancy"
                        min="1"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none"
                        value={formData.max_occupancy}
                        onChange={handleChange}
                      />
                    )}
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 mt-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={noOccupancyLimit}
                        onChange={handleNoOccupancyLimitChange}
                        className="accent-black cursor-pointer"
                      />
                      No limits
                    </label>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Payment Terms */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-black rounded-full"></span> Payment Terms
              </h3>

              {/* Security Deposit */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-bold text-gray-700">Require Security Deposit?</label>
                  <button type="button" onClick={() => setFormData(p => ({ ...p, has_security_deposit: !p.has_security_deposit }))} className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${formData.has_security_deposit ? 'bg-black' : 'bg-gray-300'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${formData.has_security_deposit ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {formData.has_security_deposit && (
                  <div className="space-y-3 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.deposit_same_as_rent} onChange={e => setFormData(p => ({ ...p, deposit_same_as_rent: e.target.checked }))} className="accent-black cursor-pointer" />
                      <span className="text-sm font-medium text-gray-600">Same as monthly rent</span>
                    </label>
                    {!formData.deposit_same_as_rent && (
                      <input type="number" name="security_deposit_amount" min="0" placeholder="Custom deposit amount" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none" value={formData.security_deposit_amount} onChange={handleChange} />
                    )}
                  </div>
                )}
              </div>

              {/* Advance Payment */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-bold text-gray-700">Require Advance Payment?</label>
                  <button type="button" onClick={() => setFormData(p => ({ ...p, has_advance: !p.has_advance }))} className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${formData.has_advance ? 'bg-black' : 'bg-gray-300'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${formData.has_advance ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {formData.has_advance && (
                  <div className="space-y-3 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.advance_same_as_rent} onChange={e => setFormData(p => ({ ...p, advance_same_as_rent: e.target.checked }))} className="accent-black cursor-pointer" />
                      <span className="text-sm font-medium text-gray-600">Same as monthly rent</span>
                    </label>
                    {!formData.advance_same_as_rent && (
                      <input type="number" name="advance_amount" min="0" placeholder="Custom advance amount" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none" value={formData.advance_amount} onChange={handleChange} />
                    )}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* STEP 4: Utilities */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {(() => {
                const wifiMode = getWifiModeFromAmenities(formData.amenities)
                return (
                  <>
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-black rounded-full"></span> Utilities
                </h3>
                <p className="text-xs text-gray-500 mb-5">Toggle which utilities are included free. Water and electricity require due dates when not free. WiFi due date is needed only when WiFi is available and paid.</p>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Water', amenity: 'Free Water', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21c-3.866 0-7-3.134-7-7 0-4.97 7-11 7-11s7 6.03 7 11c0 3.866-3.134 7-7 7z" /></svg>, colorFree: 'bg-blue-100 text-blue-600', colorPaid: 'bg-blue-50 text-blue-400' },
                  { label: 'Electricity', amenity: 'Free Electricity', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>, colorFree: 'bg-amber-100 text-amber-600', colorPaid: 'bg-amber-50 text-amber-400' }
                ].map(u => {
                  const isFree = formData.amenities.includes(u.amenity)
                  return (
                    <div key={u.amenity} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${isFree ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isFree ? 'bg-green-100 text-green-600' : u.colorPaid}`}>
                        {u.icon}
                      </div>
                      <div className="flex-1">
                        <span className={`text-sm font-bold ${isFree ? 'text-green-700' : 'text-gray-700'}`}>{u.label}</span>
                        <p className="text-[11px] text-gray-400">{isFree ? 'Included free with rent' : 'Tenant pays separately'}</p>
                      </div>
                      <button type="button" onClick={() => {
                        setFormData(p => ({
                          ...p,
                          amenities: isFree ? p.amenities.filter(a => a !== u.amenity) : [...p.amenities, u.amenity]
                        }))
                      }} className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${isFree ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
                        {isFree ? 'Free' : 'Not Free'}
                      </button>
                    </div>
                  )
                })}

                <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${wifiMode === 'none' ? 'bg-gray-50 border-gray-200' : wifiMode === 'free' ? 'bg-green-50 border-green-200' : 'bg-violet-50 border-violet-200'}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${wifiMode === 'none' ? 'bg-gray-200 text-gray-500' : wifiMode === 'free' ? 'bg-green-100 text-green-600' : 'bg-violet-100 text-violet-600'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01M5.636 13.636a9 9 0 0112.728 0M1.393 10.393a14 14 0 0121.213 0" /></svg>
                  </div>
                  <div className="flex-1">
                    <span className={`text-sm font-bold ${wifiMode === 'none' ? 'text-gray-700' : wifiMode === 'free' ? 'text-green-700' : 'text-violet-700'}`}>WiFi</span>
                    <p className="text-[11px] text-gray-400">
                      {wifiMode === 'none' ? 'Not available in this property' : wifiMode === 'free' ? 'Included free with rent' : 'Available with separate payment'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setWifiMode('none')}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${wifiMode === 'none' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                    >
                      Not Available
                    </button>
                    <button
                      type="button"
                      onClick={() => setWifiMode('paid')}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${wifiMode === 'paid' ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'}`}
                    >
                      Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => setWifiMode('free')}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${wifiMode === 'free' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                    >
                      Free
                    </button>
                  </div>
                </div>
              </div>
                  </>
                )
              })()}
            </div>
          )}

          {/* STEP 5: Description & Terms */}
          {step === 5 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-black rounded-full"></span> Description
                </h3>
                <textarea
                  name="description"
                  rows="6"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-black outline-none resize-none"
                  placeholder="Describe your property — features, neighborhood, rules, etc."
                  value={formData.description}
                  onChange={handleChange}
                />
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-black rounded-full"></span> Terms & Conditions (PDF — optional)
                </h3>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                  {formData.terms_conditions && formData.terms_conditions.startsWith('http') ? (
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 mb-3">
                      <a href={formData.terms_conditions} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:underline">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        View Uploaded PDF
                      </a>
                      <button type="button" onClick={() => setFormData(prev => ({ ...prev, terms_conditions: '' }))} className="text-red-500 hover:text-red-700 text-xs font-bold">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center mb-3">No custom terms uploaded. Default system terms will apply.</p>
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
          )}

          {/* STEP 6: Amenities */}
          {step === 6 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-black rounded-full"></span> Amenities
              </h3>
              <div>
                <input
                  type="text"
                  value={amenitiesSearch}
                  onChange={(e) => setAmenitiesSearch(e.target.value)}
                  placeholder="Search amenities..."
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-black outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleAmenities.map((amenity) => (
                  <label
                    key={amenity}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full cursor-pointer text-sm border transition-all ${formData.amenities.includes(amenity)
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
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
              {visibleAmenities.length === 0 && (
                <p className="text-sm text-gray-500">No amenities found for your search.</p>
              )}
              {!normalizedAmenitySearch && availableAmenities.length > initialAmenitiesCount && (
                <button
                  type="button"
                  onClick={() => setShowAllAmenities(prev => !prev)}
                  className="text-sm font-bold text-black underline underline-offset-4 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  {showAllAmenities ? 'See less amenities' : 'See more amenities'}
                </button>
              )}
              <p className="text-xs text-gray-400">Select all amenities available in your property.</p>
            </div>
          )}

          {/* STEP 7: Photos */}
          {step === 7 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-black rounded-full"></span> Photos
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {imageUrls.map((url, index) => (
                  <div key={index} className="relative aspect-square">
                    <label className="cursor-pointer block h-full">
                      {url ? (
                        <div className="w-full h-full rounded-xl overflow-hidden border-2 border-green-200 relative group">
                          <img src={url} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-white text-xs font-bold">Change</span>
                          </div>
                        </div>
                      ) : (
                        <div className={`w-full h-full border-2 border-dashed rounded-xl flex items-center justify-center text-sm transition-colors bg-gray-50 border-gray-300 text-gray-400 hover:border-gray-500 ${uploadingImages[index] ? 'bg-yellow-50 border-yellow-300' : ''}`}>
                          {uploadingImages[index] ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                              <span className="text-[10px]">Uploading</span>
                            </div>
                          ) : <span className="text-xl">+</span>}
                        </div>
                      )}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, index)} disabled={uploadingImages[index]} />
                    </label>
                    {url && (
                      <button type="button" onClick={() => removeImageUrlField(index)} className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center cursor-pointer shadow border-2 border-white hover:bg-red-600 transition-colors">x</button>
                    )}
                  </div>
                ))}
                {imageUrls.length < 10 && (
                  <button type="button" onClick={addImageUrlField} className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer bg-white hover:bg-gray-50 hover:border-gray-500 transition-colors text-xl">+</button>
                )}
              </div>
              {/* Multi-select upload button */}
              <label className="flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg cursor-pointer transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Upload Multiple Photos
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleMultipleImageUpload} />
              </label>
              <p className="text-[10px] text-gray-400 text-center">Max 2MB per image. Up to 10 photos.</p>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-6 gap-3">
          <button
            type="button"
            onClick={step === 1 ? () => router.back() : goBack}
            className="px-6 py-3 bg-white text-gray-700 border border-gray-200 text-sm font-bold cursor-pointer rounded-xl hover:bg-gray-50 transition-all"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={goNext}
              className="px-8 py-3 bg-black text-white text-sm font-bold cursor-pointer rounded-xl hover:bg-gray-800 transition-all"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || isUploading || !hasAtLeastOnePhoto}
              className="px-8 py-3 bg-black text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded-xl hover:bg-gray-800 transition-all"
            >
              {loading ? 'Saving...' : isUploading ? 'Uploading...' : !hasAtLeastOnePhoto ? 'Add At Least 1 Photo' : 'Add Property'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}