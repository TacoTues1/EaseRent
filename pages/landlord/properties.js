import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { createNotification } from '../../lib/notifications'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Navbar from '../../components/Navbar'
import Footer from '../../components/Footer'
import Lottie from "lottie-react"
import loadingAnimation from "../../assets/loading.json"

export default function LandlordProperties() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [properties, setProperties] = useState([])
  const [occupancies, setOccupancies] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  // Assign Tenant Modal States - EXACTLY AS IN LANDLORD DASHBOARD
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [acceptedApplications, setAcceptedApplications] = useState([])
  const [penaltyDetails, setPenaltyDetails] = useState('')
  const [startDate, setStartDate] = useState('')
  const [contractMonths, setContractMonths] = useState(12)
  const [endDate, setEndDate] = useState('')
  const [wifiDueDay, setWifiDueDay] = useState('')
  const [electricityDueDay, setElectricityDueDay] = useState('')
  const [contractFile, setContractFile] = useState(null)
  const [uploadingContract, setUploadingContract] = useState(false)

  // End Contract Modal States
  const [endContractModal, setEndContractModal] = useState({
    isOpen: false,
    occupancy: null
  })
  const [endContractDate, setEndContractDate] = useState('')
  const [endContractReason, setEndContractReason] = useState('')

  // Check session and load data
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setSession(session)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profileData?.role !== 'landlord') {
        router.push('/')
        return
      }
      setProfile(profileData)
    }
    checkSession()
  }, [router])

  useEffect(() => {
    if (profile && session) {
      loadProperties()
      loadOccupancies()
    }
  }, [profile, session])

  // Auto-calculate end date when start date or contract months change - SAME AS DASHBOARD
  useEffect(() => {
    if (startDate && contractMonths) {
      const start = new Date(startDate)
      start.setMonth(start.getMonth() + parseInt(contractMonths))
      setEndDate(start.toISOString().split('T')[0])
    }
  }, [startDate, contractMonths])

  // Auto-slide images
  useEffect(() => {
    if (properties.length === 0) return
    const interval = setInterval(() => {
      setCurrentImageIndex(prev => {
        const newIndex = { ...prev }
        properties.forEach(property => {
          if (property.images && Array.isArray(property.images) && property.images.length > 1) {
            const currentIdx = prev[property.id] || 0
            newIndex[property.id] = (currentIdx + 1) % property.images.length
          }
        })
        return newIndex
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [properties])

  async function loadProperties() {
    setLoading(true)
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('landlord', session.user.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (!error) setProperties(data || [])
    setLoading(false)
  }

  async function loadOccupancies() {
    const { data } = await supabase
      .from('tenant_occupancies')
      .select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone), property:properties(id, title)`)
      .eq('landlord_id', session.user.id)
      .eq('status', 'active')

    setOccupancies(data || [])
  }

  async function refreshData() {
    setRefreshing(true)
    await Promise.all([loadProperties(), loadOccupancies()])
    setRefreshing(false)
    showToast.success('Data refreshed!', { duration: 2000, position: 'top-center' })
  }

  function getPropertyImages(property) {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) {
      return property.images
    }
    return []
  }

  function getPropertyOccupancy(propertyId) {
    return occupancies.find(o => o.property_id === propertyId)
  }

  // LOAD ACCEPTED APPLICATIONS - EXACTLY AS IN DASHBOARD
  async function loadAcceptedApplicationsForProperty(propertyId) {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('property_id', propertyId)
      .eq('status', 'approved')

    if (error) {
      console.error("Error loading bookings:", error)
      return
    }

    if (!bookings || bookings.length === 0) {
      setAcceptedApplications([])
      return
    }

    const tenantIds = bookings.map(b => b.tenant)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, middle_name, last_name, phone')
      .in('id', tenantIds)

    const profileMap = {}
    profiles?.forEach(p => profileMap[p.id] = p)

    const candidates = bookings.map(b => ({
      ...b,
      tenant_profile: profileMap[b.tenant]
    })).filter(item => item.tenant && item.tenant_profile)

    setAcceptedApplications(candidates)
  }

  // OPEN ASSIGN MODAL - EXACTLY AS IN DASHBOARD
  function openAssignModal(property) {
    setSelectedProperty(property);
    loadAcceptedApplicationsForProperty(property.id);
    setPenaltyDetails('');
    setStartDate(new Date().toISOString().split('T')[0]); // Default to today
    setContractMonths(12); // Default to 12 months
    setWifiDueDay('');
    setElectricityDueDay('');
    setContractFile(null);
    setShowAssignModal(true)
  }

  // ASSIGN TENANT - EXACTLY AS IN DASHBOARD
  async function assignTenant(candidate) {
    if (!candidate.tenant || !candidate.tenant_profile) {
      showToast.error("Invalid tenant", { duration: 4000, transition: "bounceIn" });
      return
    }

    if (!startDate) {
      showToast.error("Please select a start date", { duration: 4000, transition: "bounceIn" });
      return
    }

    if (!endDate) {
      showToast.error("Please select a contract end date", { duration: 4000, transition: "bounceIn" });
      return
    }

    if (!wifiDueDay || parseInt(wifiDueDay) <= 0 || parseInt(wifiDueDay) > 31) {
      showToast.error("Please enter a valid Wifi Due Day (1-31)", { duration: 4000, transition: "bounceIn" });
      return
    }

    if (!penaltyDetails || parseFloat(penaltyDetails) <= 0) {
      showToast.error("Please enter a Late Payment Fee", { duration: 4000, transition: "bounceIn" });
      return
    }

    if (!contractFile) {
      showToast.error("Please upload a contract PDF file", { duration: 4000, transition: "bounceIn" });
      return
    }

    // Security deposit equals one month's rent
    const securityDepositAmount = selectedProperty.price || 0;

    // Upload contract PDF
    setUploadingContract(true);
    let contractUrl = null;
    try {
      const fileExt = contractFile.name.split('.').pop();
      const fileName = `${selectedProperty.id}_${candidate.tenant}_${Date.now()}.${fileExt}`;
      const filePath = `contracts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(filePath, contractFile, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        console.error('Contract upload error:', uploadError);
        showToast.error('Failed to upload contract. Please try again.', { duration: 4000, transition: "bounceIn" });
        setUploadingContract(false);
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(filePath);
      contractUrl = urlData?.publicUrl;
    } catch (err) {
      console.error('Contract upload exception:', err);
      showToast.error('Failed to upload contract. Please try again.', { duration: 4000, transition: "bounceIn" });
      setUploadingContract(false);
      return;
    }
    setUploadingContract(false);

    // Create occupancy
    const { data: newOccupancy, error } = await supabase.from('tenant_occupancies').insert({
      property_id: selectedProperty.id,
      tenant_id: candidate.tenant,
      landlord_id: session.user.id,
      status: 'active',
      start_date: new Date(startDate).toISOString(),
      contract_end_date: endDate,
      security_deposit: securityDepositAmount,
      security_deposit_used: 0,
      wifi_due_day: wifiDueDay ? parseInt(wifiDueDay) : null,
      late_payment_fee: penaltyDetails ? parseFloat(penaltyDetails) : 0,
      contract_url: contractUrl
    }).select('id').single()

    if (error) {
      console.error('Assign Tenant Error:', error);
      showToast.error('Failed to assign tenant. Check console.', { duration: 4000, transition: "bounceIn" });
      return
    }

    const occupancyId = newOccupancy?.id

    await supabase.from('properties').update({ status: 'occupied' }).eq('id', selectedProperty.id)

    // Notification message
    let message = `You have been assigned to occupy "${selectedProperty.title}" from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}. Security deposit: ₱${Number(securityDepositAmount).toLocaleString()}.`
    if (penaltyDetails && parseFloat(penaltyDetails) > 0) {
      message += ` Late payment fee: ₱${Number(penaltyDetails).toLocaleString()}`
    }

    await createNotification({
      recipient: candidate.tenant,
      actor: session.user.id,
      type: 'occupancy_assigned',
      message: message,
      link: '/maintenance'
    })

    if (candidate.tenant_profile.phone) {
      fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: candidate.tenant_profile.phone,
          message: message
        })
      }).catch(err => console.error("SMS Error:", err));
    }

    // Send Email
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: candidate.id,
        type: 'assignment',
        customMessage: message
      })
    }).catch(err => console.error("Email Error:", err));

    // AUTO-SEND MOVE-IN PAYMENT BILL (Rent + Security Deposit)
    const rentAmount = selectedProperty.price || 0;
    const dueDate = new Date(startDate);

    try {
      const { error: billError } = await supabase.from('payment_requests').insert({
        landlord: session.user.id,
        tenant: candidate.tenant,
        property_id: selectedProperty.id,
        occupancy_id: occupancyId,
        rent_amount: rentAmount,
        security_deposit_amount: securityDepositAmount,
        advance_amount: 0,
        water_bill: 0,
        electrical_bill: 0,
        other_bills: 0,
        bills_description: 'Move-in Payment (Rent + Security Deposit)',
        due_date: dueDate.toISOString(),
        status: 'pending',
        is_move_in_payment: true
      });

      if (billError) {
        console.error('Auto-bill creation error:', billError);
      } else {
        const totalAmount = rentAmount + securityDepositAmount;
        await createNotification({
          recipient: candidate.tenant,
          actor: session.user.id,
          type: 'payment_request',
          message: `Your move-in payment bill has been sent: ₱${Number(rentAmount).toLocaleString()} (Rent) + ₱${Number(securityDepositAmount).toLocaleString()} (Security Deposit) = ₱${Number(totalAmount).toLocaleString()} Total. Due: ${dueDate.toLocaleDateString()}`,
          link: '/payments'
        });
      }
    } catch (err) {
      console.error('Auto-bill exception:', err);
    }

    showToast.success('Tenant assigned! Move-in payment bill sent automatically.', { duration: 4000, transition: "bounceIn" });
    setShowAssignModal(false);
    setContractFile(null);
    loadProperties();
    loadOccupancies();
  }

  // CANCEL ASSIGNMENT - EXACTLY AS IN DASHBOARD
  async function cancelAssignment(booking) {
    if (!confirm(`Cancel assignment for ${booking.tenant_profile?.first_name}?`)) return

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'rejected' })
      .eq('id', booking.id)

    if (error) {
      showToast.error('Failed to cancel assignment', { duration: 4000, transition: "bounceIn" });
      return
    }

    await createNotification({
      recipient: booking.tenant,
      actor: session.user.id,
      type: 'booking_rejected',
      message: `The assignment for "${selectedProperty.title}" was cancelled.`,
      link: '/bookings'
    })

    showToast.success('Cancelled', { duration: 4000, transition: "bounceIn" });
    loadAcceptedApplicationsForProperty(selectedProperty.id)
  }

  // OPEN END CONTRACT MODAL - EXACTLY AS IN DASHBOARD
  function openEndContractModal(occupancy) {
    setEndContractModal({ isOpen: true, occupancy })
    setEndContractDate('')
    setEndContractReason('')
  }

  // CONFIRM END CONTRACT - EXACTLY AS IN DASHBOARD
  async function confirmEndContract() {
    const occupancy = endContractModal.occupancy
    if (!occupancy) return

    if (!endContractDate) {
      showToast.error('Please select an end date', { duration: 3000, transition: "bounceIn" })
      return
    }
    if (!endContractReason) {
      showToast.error('Please enter a reason', { duration: 3000, transition: "bounceIn" })
      return
    }

    setEndContractModal({ isOpen: false, occupancy: null })

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({ status: 'ended', end_date: new Date(endContractDate).toISOString() })
      .eq('id', occupancy.id)

    if (error) {
      showToast.error(`Failed: ${error.message}`, { duration: 4000, transition: "bounceIn" });
      return
    }

    await supabase.from('properties').update({ status: 'available' }).eq('id', occupancy.property_id)

    // Mark the tenant's booking as completed
    await supabase.from('bookings')
      .update({ status: 'completed' })
      .eq('tenant', occupancy.tenant_id)
      .eq('property_id', occupancy.property_id)
      .in('status', ['pending', 'pending_approval', 'approved', 'accepted', 'cancelled'])

    // Mark application as completed
    await supabase.from('applications')
      .update({ status: 'completed' })
      .eq('tenant', occupancy.tenant_id)
      .eq('property_id', occupancy.property_id)
      .eq('status', 'accepted')

    // Notification Message
    const formattedDate = new Date(endContractDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const message = `Your contract for "${occupancy.property?.title}" has been ended by the landlord.\n\nEnd Date: ${formattedDate}\nReason: ${endContractReason}\n\nPlease vacate the premises by the end date.`

    // In-App Notification
    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'occupancy_ended', message: message, link: '/dashboard' })

    // SMS
    if (occupancy.tenant?.phone) {
      fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: occupancy.tenant.phone, message })
      }).catch(err => console.error("SMS Error:", err));
    }

    // Email
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        occupancyId: occupancy.id,
        type: 'end_contract',
        customMessage: message
      })
    }).catch(err => console.error("Email Error:", err));

    showToast.success('Contract ended successfully', { duration: 4000, transition: "bounceIn" });
    loadProperties();
    loadOccupancies()
  }

  // Handle property click
  const handlePropertyAction = (propertyId) => {
    router.push(`/properties/edit/${propertyId}`)
  }

  // Filter properties
  const filteredProperties = properties.filter(p => {
    const matchesSearch = p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.address?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus
    return matchesSearch && matchesStatus
  })

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <Lottie animationData={loadingAnimation} loop={true} className="w-64 h-64" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <Navbar session={session} profile={profile} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-10 h-10 bg-white rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 cursor-pointer transition-all"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-black text-gray-900">Your Properties</h1>
              <p className="text-sm text-gray-500">Manage listings, assignments, and property details</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refreshData}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold cursor-pointer hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={() => router.push('/properties/new')}
              className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-xl text-sm font-bold cursor-pointer hover:bg-gray-800 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Property
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Properties</p>
            <p className="text-3xl font-black text-gray-900 mt-1">{properties.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <p className="text-emerald-600 text-xs font-medium uppercase tracking-wider">Active Tenants</p>
            <p className="text-3xl font-black text-emerald-600 mt-1">{occupancies.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <p className="text-blue-600 text-xs font-medium uppercase tracking-wider">Available</p>
            <p className="text-3xl font-black text-blue-600 mt-1">{properties.filter(p => p.status === 'available').length}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <p className="text-orange-600 text-xs font-medium uppercase tracking-wider">Occupied</p>
            <p className="text-3xl font-black text-orange-600 mt-1">{properties.filter(p => p.status === 'occupied').length}</p>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search properties..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-black transition-colors"
              />
            </div>
            <div className="flex gap-2">
              {['all', 'available', 'occupied'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${filterStatus === status
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Properties Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Lottie animationData={loadingAnimation} loop={true} className="w-48 h-48" />
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-50 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {searchQuery || filterStatus !== 'all' ? 'No properties found' : 'No properties yet'}
            </h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              {searchQuery || filterStatus !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Start by adding your first property to manage'
              }
            </p>
            {!searchQuery && filterStatus === 'all' && (
              <button
                onClick={() => router.push('/properties/new')}
                className="px-6 py-3 bg-black text-white rounded-xl font-bold cursor-pointer hover:bg-gray-800 transition-all"
              >
                Add Your First Property
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProperties.map((property) => {
              const images = getPropertyImages(property)
              const currentIdx = currentImageIndex[property.id] || 0
              const occupancy = getPropertyOccupancy(property.id)

              return (
                <div
                  key={property.id}
                  className="group bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer flex flex-col"
                  onClick={() => handlePropertyAction(property.id)}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                    <img src={images[currentIdx] || '/placeholder-property.jpg'} alt={property.title} className="w-full h-full object-cover" />

                    {images.length > 1 && (
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                        {images.map((_, idx) => (
                          <div key={idx} className={`h-1 rounded-full transition-all duration-300 shadow-sm ${idx === currentIdx ? 'w-4 bg-white' : 'w-1 bg-white/60'}`} />
                        ))}
                      </div>
                    )}

                    <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10 flex flex-col gap-1">
                      <span className={`px-2 py-0.5 sm:px-3 sm:py-1 text-[8px] sm:text-[10px] uppercase font-bold tracking-wider rounded-lg shadow-sm backdrop-blur-md border border-white/20 ${property.status === 'available' ? 'bg-white/90 text-black' : 'bg-black/80 text-white'}`}>
                        {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
                      </span>
                    </div>
                  </div>

                  <div className="p-2 sm:p-4 flex flex-col flex-1">
                    <div className="mb-2 sm:mb-3">
                      <div className="flex justify-between items-start mb-0.5 sm:mb-1">
                        <h3 className="text-sm sm:text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-1.5 text-gray-500 text-[10px] sm:text-xs">
                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        <span className="truncate">{property.city}, Philippines</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 text-gray-700 text-[10px] sm:text-xs bg-gray-50 p-2 sm:p-2.5 rounded-xl mb-3 sm:mb-4">
                      <span className="flex items-center gap-1 font-bold">
                        <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
                        </svg>{property.bedrooms}
                      </span>
                      <span className="w-px h-3 bg-gray-300"></span>
                      <span className="flex items-center gap-1 font-bold">
                        <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" />
                        </svg>{property.bathrooms}
                      </span>
                      <span className="w-px h-3 bg-gray-300"></span>
                      <span className="flex items-center gap-1 font-bold">
                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        {property.area_sqft}
                      </span>
                    </div>

                    <div className="mt-auto">
                      <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <div className="flex items-baseline gap-1">
                          <p className="text-base sm:text-lg font-black text-black">
                            ₱{Number(property.price).toLocaleString()}
                          </p>
                          <span className="text-sm text-gray-600">/Monthly</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/properties/${property.id}`); }} className="text-[10px] sm:text-xs font-bold text-gray-400 hover:text-black hover:underline cursor-pointer" title="Preview">
                          View Details
                        </button>
                      </div>

                      <div className="pt-2 sm:pt-3 border-t border-gray-100">
                        {occupancy ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-700">
                              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500 animate-pulse"></div>
                              <span className="font-bold truncate max-w-[80px] sm:max-w-[100px]">{occupancy.tenant?.first_name}</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); openEndContractModal(occupancy) }} className="text-[9px] sm:text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg cursor-pointer transition-colors">End Contract</button>
                          </div>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); openAssignModal(property); }} className="w-full py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs font-bold text-black bg-gray-50 hover:bg-gray-300 border border-black rounded-xl transition-colors text-center cursor-pointer flex items-center justify-center gap-1 sm:gap-2">
                            <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                            Assign Tenant
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      <Footer />

      {/* Assign Modal - EXACTLY AS IN LANDLORD DASHBOARD */}
      {showAssignModal && selectedProperty && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-xl text-gray-900">Assign Tenant</h3>
              <button onClick={() => setShowAssignModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer text-gray-500 hover:text-black transition-colors">✕</button>
            </div>

            {/* Approved Tenants List */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Select Tenant to Assign</label>
              <div className="space-y-2">
                {acceptedApplications.map(app => (
                  <div key={app.id} className="p-3 border border-gray-100 rounded-xl hover:bg-gray-50 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-sm text-gray-900">{app.tenant_profile?.first_name} {app.tenant_profile?.last_name}</p>
                      <p className="text-xs text-gray-500">{app.tenant_profile?.phone}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => cancelAssignment(app)} disabled={uploadingContract} className="text-xs bg-white text-red-600 border border-red-100 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-red-50 font-bold transition-colors disabled:opacity-50">Cancel</button>
                      <button onClick={() => assignTenant(app)} disabled={uploadingContract} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-800 font-bold shadow-md transition-all disabled:opacity-50 flex items-center gap-1">
                        {uploadingContract ? (
                          <>
                            <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <span>Assigning...</span>
                          </>
                        ) : (
                          <span>Assign</span>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
                {acceptedApplications.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-2">No approved bookings found.</p>
                )}
              </div>
            </div>

            {/* Contract dates section */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Start Date <span className="text-red-500">*</span></label>
              <input type="date" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            {/* Contract Duration */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Contract Duration (Months) <span className="text-red-500">*</span></label>
              <input
                type="number"
                min="1"
                max="120"
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black"
                placeholder="e.g. 12"
                value={contractMonths}
                onChange={(e) => setContractMonths(e.target.value)}
              />
              <p className="text-[10px] text-gray-400 mt-1">Enter how many months the contract will last</p>
            </div>

            {/* Auto-calculated End Date */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">End Date (Auto-calculated)</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black bg-gray-50 cursor-not-allowed"
                value={endDate}
                disabled
                readOnly
              />
              <p className="text-[10px] text-gray-400 mt-1">Automatically calculated based on start date and contract duration</p>
            </div>

            {/* Security Deposit Info */}
            <div className="mb-3 p-2 bg-amber-50 rounded-lg border border-amber-100 flex items-center justify-between">
              <span className="text-xs font-bold text-amber-800">Security Deposit:</span>
              <span className="font-black text-amber-900">₱{Number(selectedProperty?.price || 0).toLocaleString()}</span>
            </div>

            {/* Contract PDF Upload */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Contract PDF <span className="text-red-500">*</span></label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center hover:border-gray-400 transition-colors">
                <input type="file" accept=".pdf" id="contractFile" className="hidden" onChange={(e) => setContractFile(e.target.files[0])} />
                <label htmlFor="contractFile" className="cursor-pointer">
                  {contractFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="text-sm font-medium text-gray-700">{contractFile.name}</span>
                      <button type="button" onClick={(e) => { e.preventDefault(); setContractFile(null); }} className="text-red-500 hover:text-red-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Click to upload contract PDF</p>
                  )}
                </label>
              </div>
            </div>

            {/* Late Payment Fee */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Late Payment Fee (₱) <span className="text-red-500">*</span></label>
              <input type="number" min="0" step="0.01" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black" placeholder="e.g. 500" value={penaltyDetails} onChange={(e) => setPenaltyDetails(e.target.value)} />
            </div>

            {/* Wifi Due Day */}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 mb-3">
              <p className="text-xs text-gray-600 font-medium mb-2">
                <span className="font-bold">Utility Reminders:</span> Tenants will receive SMS & email reminders 3 days before due dates (no payment bills created).
              </p>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Wifi Due Day <span className="text-red-500">*</span></label>
                <input type="number" min="1" max="31" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black bg-white" placeholder="e.g. 10" value={wifiDueDay} onChange={(e) => setWifiDueDay(e.target.value)} />
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Note: Electricity reminders are sent automatically (due date is always 1st week of the month).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* End Contract Confirmation Modal - EXACTLY AS IN LANDLORD DASHBOARD */}
      {endContractModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-gray-200">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-red-100 text-red-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">End Contract?</h3>

            <p className="text-sm text-gray-500 mb-4">
              Are you sure you want to end the contract for <strong>{endContractModal.occupancy?.tenant?.first_name} {endContractModal.occupancy?.tenant?.last_name}</strong>?
              This action cannot be undone. The tenant will be notified and the property will be marked as available.
            </p>

            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">End Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black"
                  value={endContractDate}
                  onChange={(e) => setEndContractDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Reason <span className="text-red-500">*</span></label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black resize-none"
                  rows="3"
                  placeholder="Enter reason for ending contract..."
                  value={endContractReason}
                  onChange={(e) => setEndContractReason(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEndContractModal({ isOpen: false, occupancy: null })}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmEndContract}
                className="flex-1 px-4 py-2 text-white font-bold rounded-xl md:cursor-pointer shadow-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!endContractDate || !endContractReason}
              >
                End Contract
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
