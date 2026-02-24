import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import { createNotification } from '../lib/notifications'

const STEPS = [
    { label: 'Property', icon: '1' },
    { label: 'Contract', icon: '2' },
    { label: 'Documents', icon: '3' },
    { label: 'Utilities', icon: '4' },
]

export default function AssignTenantPage() {
    const router = useRouter()
    const { bookingId } = router.query

    const [session, setSession] = useState(null)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [step, setStep] = useState(0)

    // Booking & tenant info
    const [booking, setBooking] = useState(null)
    const [tenantProfile, setTenantProfile] = useState(null)

    // Step 1 - Property
    const [availableProperties, setAvailableProperties] = useState([])
    const [selectedPropertyId, setSelectedPropertyId] = useState('')
    const [selectedProp, setSelectedProp] = useState(null)

    // Step 2 - Contract
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
    const [contractMonths, setContractMonths] = useState(12)
    const [endDate, setEndDate] = useState('')

    // Step 3 - Documents
    const [contractFile, setContractFile] = useState(null)
    const [penaltyDetails, setPenaltyDetails] = useState('')
    const [uploadingContract, setUploadingContract] = useState(false)

    // Step 4 - Utilities & Payment
    const [wifiDueDay, setWifiDueDay] = useState('')
    const [waterDueDay, setWaterDueDay] = useState('')
    const [electricityDueDay, setElectricityDueDay] = useState('')
    const [alreadyPaid, setAlreadyPaid] = useState(false)

    // Confirmation
    const [showConfirm, setShowConfirm] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    useEffect(() => {
        async function init() {
            const result = await supabase.auth.getSession()
            if (!result.data?.session) { router.push('/login'); return }
            setSession(result.data.session)

            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', result.data.session.user.id)
                .maybeSingle()
            if (profileData) setProfile(profileData)
            if (!profileData || profileData.role !== 'landlord') {
                router.push('/dashboard')
                return
            }
            setLoading(false)
        }
        init()
    }, [])

    // Load booking data when bookingId available
    useEffect(() => {
        if (!bookingId || !session) return
        async function loadBooking() {
            const { data: bk } = await supabase
                .from('bookings')
                .select('*, property:properties(*)')
                .eq('id', bookingId)
                .maybeSingle()

            if (!bk) { showToast.error('Booking not found'); router.push('/bookings'); return }
            setBooking(bk)

            // Load tenant profile
            const { data: tp } = await supabase
                .from('profiles')
                .select('first_name, last_name, email, phone')
                .eq('id', bk.tenant)
                .maybeSingle()
            setTenantProfile(tp)

            // Load available properties
            const { data: props } = await supabase
                .from('properties')
                .select('*')
                .eq('landlord', session.user.id)
                .eq('status', 'available')
                .eq('is_deleted', false)

            let properties = props || []
            // Booked property first
            if (bk.property_id) {
                properties.sort((a, b) => {
                    if (a.id === bk.property_id) return -1
                    if (b.id === bk.property_id) return 1
                    return 0
                })
                // Auto-select booked property
                setSelectedPropertyId(bk.property_id)
            }
            setAvailableProperties(properties)
        }
        loadBooking()
    }, [bookingId, session])

    // Update selectedProp when property changes
    useEffect(() => {
        const prop = availableProperties.find(p => p.id === selectedPropertyId)
        setSelectedProp(prop || null)
        if (prop?.min_contract_months && contractMonths < prop.min_contract_months) {
            setContractMonths(prop.min_contract_months)
        }
    }, [selectedPropertyId, availableProperties])

    // Auto-calculate end date
    useEffect(() => {
        if (startDate && contractMonths) {
            const start = new Date(startDate)
            start.setMonth(start.getMonth() + parseInt(contractMonths))
            setEndDate(start.toISOString().split('T')[0])
        }
    }, [startDate, contractMonths])

    const toast = (type, msg) => {
        showToast[type](msg, { duration: 4000, progress: true, position: 'top-center', transition: 'bounceIn' })
    }

    const nextStep = () => {
        if (step === 0) {
            if (!selectedPropertyId) return toast('error', 'Please select a property')
        }
        if (step === 1) {
            if (!startDate) return toast('error', 'Please select a start date')
            if (selectedProp?.min_contract_months && contractMonths < selectedProp.min_contract_months) {
                return toast('error', `Minimum contract duration for this property is ${selectedProp.min_contract_months} months`)
            }
            if (!contractMonths || parseInt(contractMonths) < 1) return toast('error', 'Contract duration must be at least 1 month')
        }
        if (step === 2) {
            // Late payment fee is optional
        }
        setStep(s => s + 1)
    }
    const prevStep = () => { setShowConfirm(false); setStep(s => s - 1) }

    // ── SUBMIT ──
    async function handleSubmit() {

        const amenities = selectedProp?.amenities || []
        const isWaterFree = amenities.includes('Free Water')
        const isElecFree = amenities.includes('Free Electricity')
        const isWifiFree = amenities.includes('Free WiFi')

        // Validate utility due dates if not free
        if (!isWaterFree && (!waterDueDay || parseInt(waterDueDay) < 1 || parseInt(waterDueDay) > 31)) {
            return toast('error', 'Please enter a valid Water Due Day (1-31)')
        }
        if (!isElecFree && (!electricityDueDay || parseInt(electricityDueDay) < 1 || parseInt(electricityDueDay) > 31)) {
            return toast('error', 'Please enter a valid Electricity Due Day (1-31)')
        }
        if (!isWifiFree && (!wifiDueDay || parseInt(wifiDueDay) < 1 || parseInt(wifiDueDay) > 31)) {
            return toast('error', 'Please enter a valid WiFi Due Day (1-31)')
        }

        setSubmitting(true)

        // Upload contract if provided
        let contractUrl = null
        if (contractFile) {
            setUploadingContract(true)
            try {
                const fileExt = contractFile.name.split('.').pop()
                const fileName = `${selectedPropertyId}_${booking.tenant}_${Date.now()}.${fileExt}`
                const filePath = `contracts/${fileName}`
                const { error: uploadError } = await supabase.storage.from('contracts').upload(filePath, contractFile, { cacheControl: '3600', upsert: false })
                if (uploadError) { toast('error', 'Failed to upload contract.'); setSubmitting(false); setUploadingContract(false); return }
                const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(filePath)
                contractUrl = urlData?.publicUrl
            } catch (err) { toast('error', 'Failed to upload contract.'); setSubmitting(false); setUploadingContract(false); return }
            setUploadingContract(false)
        }

        // Calculate amounts from property settings
        const rentAmount = selectedProp.price || 0
        const securityDepositAmount = selectedProp.has_security_deposit !== false ? (selectedProp.security_deposit_amount || rentAmount) : 0
        const advanceAmount = selectedProp.has_advance !== false ? (selectedProp.advance_amount || rentAmount) : 0

        // Insert occupancy
        const { data: newOccupancy, error } = await supabase.from('tenant_occupancies').insert({
            property_id: selectedPropertyId,
            tenant_id: booking.tenant,
            landlord_id: session.user.id,
            status: 'active',
            start_date: new Date(startDate).toISOString(),
            contract_end_date: endDate,
            security_deposit: securityDepositAmount,
            security_deposit_used: 0,
            wifi_due_day: isWifiFree ? null : (wifiDueDay ? parseInt(wifiDueDay) : null),
            electricity_due_day: isElecFree ? null : (electricityDueDay ? parseInt(electricityDueDay) : null),
            late_payment_fee: penaltyDetails ? parseFloat(penaltyDetails) : 0,
            contract_url: contractUrl
        }).select('id').single()

        if (error) { toast('error', 'Failed to assign tenant: ' + error.message); setSubmitting(false); return }

        const occupancyId = newOccupancy?.id
        await supabase.from('properties').update({ status: 'occupied' }).eq('id', selectedPropertyId)
        await supabase.from('bookings').update({ status: 'completed' }).eq('id', booking.id)

        // Notifications
        let message = `You have been assigned to occupy "${selectedProp.title}" from ${new Date(startDate).toLocaleDateString('en-US')} to ${new Date(endDate).toLocaleDateString('en-US')}.`
        if (securityDepositAmount > 0) message += ` Security deposit: ₱${Number(securityDepositAmount).toLocaleString()}.`
        if (penaltyDetails && parseFloat(penaltyDetails) > 0) message += ` Late payment fee: ₱${Number(penaltyDetails).toLocaleString()}`

        await createNotification({ recipient: booking.tenant, actor: session.user.id, type: 'occupancy_assigned', message, link: '/maintenance' })

        if (tenantProfile?.phone) {
            fetch('/api/send-sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: tenantProfile.phone, message }) }).catch(err => console.error('SMS Error:', err))
        }
        fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: booking.id, type: 'assignment', customMessage: message }) }).catch(err => console.error('Email Error:', err))

        // Move-in notification
        fetch('/api/notify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'move_in', recordId: occupancyId,
                tenantName: `${tenantProfile?.first_name || ''} ${tenantProfile?.last_name || ''}`.trim(),
                tenantPhone: tenantProfile?.phone, tenantEmail: null,
                propertyTitle: selectedProp.title, propertyAddress: '',
                startDate, endDate,
                landlordName: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
                landlordPhone: profile?.phone || '',
                securityDeposit: securityDepositAmount, rentAmount
            })
        }).catch(err => console.error('Move-in notification error:', err))

        // Auto-bill if not already paid
        if (!alreadyPaid) {
            const dueDate = new Date(startDate)
            try {
                const { error: billError } = await supabase.from('payment_requests').insert({
                    landlord: session.user.id, tenant: booking.tenant, property_id: selectedPropertyId, occupancy_id: occupancyId,
                    rent_amount: rentAmount, security_deposit_amount: securityDepositAmount, advance_amount: advanceAmount,
                    water_bill: 0, electrical_bill: 0, other_bills: 0,
                    bills_description: 'Move-in Payment (Rent + Advance + Security Deposit)',
                    due_date: dueDate.toISOString(), status: 'pending', is_move_in_payment: true
                })
                if (!billError) {
                    const totalAmount = rentAmount + advanceAmount + securityDepositAmount
                    await createNotification({ recipient: booking.tenant, actor: session.user.id, type: 'payment_request', message: `Move-in payment: ₱${Number(totalAmount).toLocaleString()} Total. Due: ${dueDate.toLocaleDateString('en-US')}`, link: '/payments' })
                }
            } catch (err) { console.error('Auto-bill exception:', err) }
        }

        toast('success', alreadyPaid ? 'Tenant assigned successfully!' : 'Tenant assigned! Move-in payment bill sent.')
        setTimeout(() => router.push('/bookings'), 1500)
    }

    // ── HELPERS ──
    const getDueRange = (day) => {
        if (!day) return ''
        const d = parseInt(day)
        return `${d} to ${Math.min(d + 3, 28)} of each month`
    }

    const todayStr = new Date().toISOString().split('T')[0]

    // ── STEP RENDERS ──
    const renderStep1 = () => (
        <div className="space-y-4">
            {/* Tenant Info */}
            {tenantProfile && (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center text-green-700 font-bold text-sm">
                        {tenantProfile.first_name?.[0]}{tenantProfile.last_name?.[0]}
                    </div>
                    <div>
                        <p className="font-bold text-gray-900 text-sm">{tenantProfile.first_name} {tenantProfile.last_name}</p>
                        <p className="text-xs text-gray-500">Assigning as tenant</p>
                    </div>
                    <svg className="w-5 h-5 text-green-500 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
            )}

            <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 ml-1">Select Property *</label>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {availableProperties.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-8">No available properties found.</p>
                    )}
                    {availableProperties.map(p => (
                        <div
                            key={p.id}
                            onClick={() => setSelectedPropertyId(p.id)}
                            className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedPropertyId === p.id
                                ? 'border-black bg-black/5 shadow-sm'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-sm text-gray-900">{p.title}</p>
                                    <p className="text-xs text-gray-500">₱{Number(p.price).toLocaleString()}/mo</p>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPropertyId === p.id ? 'border-black' : 'border-gray-300'}`}>
                                    {selectedPropertyId === p.id && <div className="w-2.5 h-2.5 rounded-full bg-black" />}
                                </div>
                            </div>
                            {selectedPropertyId === p.id && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {p.has_security_deposit !== false && <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-medium">Deposit: ₱{Number(p.security_deposit_amount || p.price).toLocaleString()}</span>}
                                    {p.has_advance !== false && <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-medium">Advance: ₱{Number(p.advance_amount || p.price).toLocaleString()}</span>}
                                    {p.min_contract_months && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Min {p.min_contract_months} months</span>}
                                    {(p.amenities || []).includes('Free Water') && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Free Water</span>}
                                    {(p.amenities || []).includes('Free Electricity') && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Free Electricity</span>}
                                    {(p.amenities || []).includes('Free WiFi') && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Free WiFi</span>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )

    const renderStep2 = () => (
        <div className="space-y-4">
            <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">Start Date *</label>
                <input type="date" value={startDate} min={todayStr} onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none" />
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">
                    Contract Duration (months) *
                    {selectedProp?.min_contract_months && (
                        <span className="text-yellow-600 font-normal ml-1">— minimum {selectedProp.min_contract_months} months</span>
                    )}
                </label>
                <input type="number" value={contractMonths} min={selectedProp?.min_contract_months || 1}
                    onChange={e => setContractMonths(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none" />
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">End Date (auto-calculated)</label>
                <div className="px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-sm font-medium text-gray-700">
                    {endDate ? new Date(endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                </div>
            </div>

            {/* Summary */}
            {selectedProp && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                    <p className="text-xs font-bold text-gray-700">Move-in Summary</p>
                    <div className="flex justify-between text-xs text-gray-600">
                        <span>Monthly Rent</span><span className="font-bold">₱{Number(selectedProp.price).toLocaleString()}</span>
                    </div>
                    {selectedProp.has_security_deposit !== false && (
                        <div className="flex justify-between text-xs text-gray-600">
                            <span>Security Deposit</span><span className="font-bold">₱{Number(selectedProp.security_deposit_amount || selectedProp.price).toLocaleString()}</span>
                        </div>
                    )}
                    {selectedProp.has_advance !== false && (
                        <div className="flex justify-between text-xs text-gray-600">
                            <span>Advance Payment</span><span className="font-bold">₱{Number(selectedProp.advance_amount || selectedProp.price).toLocaleString()}</span>
                        </div>
                    )}
                    <div className="border-t border-gray-200 pt-1 mt-1 flex justify-between text-xs font-bold text-gray-900">
                        <span>Total Move-in</span>
                        <span>₱{Number(
                            (selectedProp.price || 0) +
                            (selectedProp.has_security_deposit !== false ? (selectedProp.security_deposit_amount || selectedProp.price || 0) : 0) +
                            (selectedProp.has_advance !== false ? (selectedProp.advance_amount || selectedProp.price || 0) : 0)
                        ).toLocaleString()}</span>
                    </div>
                </div>
            )}
        </div>
    )

    const renderStep3 = () => (
        <div className="space-y-4">
            <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">Contract PDF (optional)</label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-gray-400 transition-colors">
                    {contractFile ? (
                        <div className="flex items-center justify-center gap-2">
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className="text-sm font-medium text-gray-700">{contractFile.name}</span>
                            <button type="button" onClick={() => setContractFile(null)} className="text-red-500 text-xs font-bold ml-2 cursor-pointer">Remove</button>
                        </div>
                    ) : (
                        <label className="cursor-pointer">
                            <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                            <p className="text-sm font-medium text-gray-600">Click to upload PDF</p>
                            <p className="text-[10px] text-gray-400 mt-1">PDF files only, max 10MB</p>
                            <input type="file" accept="application/pdf" className="hidden" onChange={e => {
                                const file = e.target.files?.[0]
                                if (file) {
                                    if (file.size > 10 * 1024 * 1024) { toast('error', 'File size must be less than 10MB'); return }
                                    setContractFile(file)
                                }
                            }} />
                        </label>
                    )}
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">Late Payment Fee (₱)</label>
                <input type="number" min="0" value={penaltyDetails} onChange={e => setPenaltyDetails(e.target.value)} placeholder="e.g. 500"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none" />
                <p className="text-[10px] text-gray-400 mt-1 ml-1">Amount charged when rent is paid late.</p>
            </div>
        </div>
    )

    // Calendar day picker as a POPUP MODAL
    const [pickerOpen, setPickerOpen] = useState(null)

    const DayPickerModal = ({ label, icon, selectedDay, onSelect, accentColor, pickerKey }) => {
        const days = Array.from({ length: 31 }, (_, i) => i + 1)
        const rangeStart = selectedDay ? parseInt(selectedDay) : null
        const rangeEnd = rangeStart ? Math.min(rangeStart + 3, 31) : null
        const isInRange = (day) => rangeStart && day >= rangeStart && day <= rangeEnd
        const isSelected = (day) => rangeStart && day === rangeStart
        const colors = {
            blue: { bg: 'bg-blue-500', light: 'bg-blue-50 text-blue-600 border-blue-100', ring: 'ring-blue-300', badge: 'bg-blue-100 text-blue-700', iconBg: 'bg-blue-100 text-blue-600', headerBg: 'from-blue-500 to-blue-600' },
            amber: { bg: 'bg-amber-500', light: 'bg-amber-50 text-amber-600 border-amber-100', ring: 'ring-amber-300', badge: 'bg-amber-100 text-amber-700', iconBg: 'bg-amber-100 text-amber-600', headerBg: 'from-amber-500 to-amber-600' },
            violet: { bg: 'bg-violet-500', light: 'bg-violet-50 text-violet-600 border-violet-100', ring: 'ring-violet-300', badge: 'bg-violet-100 text-violet-700', iconBg: 'bg-violet-100 text-violet-600', headerBg: 'from-violet-500 to-violet-600' },
        }
        const c = colors[accentColor] || colors.blue

        return (
            <>
                {/* Tappable card */}
                <div onClick={() => setPickerOpen(pickerKey)} className="flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-gray-200 cursor-pointer hover:border-gray-300 hover:shadow-md transition-all group">
                    <div className={`w-9 h-9 rounded-xl ${c.iconBg} flex items-center justify-center transition-transform group-hover:scale-110`}>{icon}</div>
                    <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-gray-900">{label}</span>
                        {selectedDay
                            ? <p className="text-[10px] text-gray-500">Due: Day {rangeStart} – {rangeEnd} each month</p>
                            : <p className="text-[10px] text-gray-400">Tap to select due date</p>}
                    </div>
                    {selectedDay && <span className={`text-[10px] font-bold ${c.badge} px-2.5 py-1 rounded-full whitespace-nowrap`}>Day {rangeStart}–{rangeEnd}</span>}
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>

                {/* Modal overlay */}
                {pickerOpen === pickerKey && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={() => setPickerOpen(null)}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} />
                        <div style={{ position: 'relative', backgroundColor: '#ffffff', borderRadius: '20px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: '340px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                            {/* Gradient Header */}
                            <div className={`bg-gradient-to-r ${c.headerBg}`} style={{ padding: '16px 20px' }}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}>{icon}</div>
                                        <div>
                                            <p style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>{label} Due Day</p>
                                            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px' }}>Select a day of the month</p>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => setPickerOpen(null)} className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                                        <svg className="w-4 h-4" style={{ color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            </div>

                            {/* Calendar grid */}
                            <div style={{ padding: '16px 16px 8px', backgroundColor: '#ffffff' }}>
                                <div className="grid grid-cols-7 gap-[6px]">
                                    {days.map(day => {
                                        const selected = isSelected(day); const inRange = isInRange(day)
                                        return (
                                            <button key={day} type="button"
                                                onClick={() => { onSelect(day === rangeStart ? '' : String(day)); if (day !== rangeStart) setPickerOpen(null) }}
                                                className={`w-full aspect-square rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer
                                                    ${selected ? `${c.bg} text-white shadow-lg ring-2 ${c.ring} ring-offset-1 scale-105` : ''}
                                                    ${inRange && !selected ? `${c.light} border font-bold` : ''}
                                                    ${!selected && !inRange ? 'text-gray-600 hover:bg-gray-100 active:scale-90 border border-transparent hover:border-gray-200' : ''}
                                                `}>{day}</button>
                                        )
                                    })}
                                </div>
                                <p style={{ fontSize: '9px', color: '#9ca3af', textAlign: 'center', marginTop: '12px', marginBottom: '4px' }}>For months with fewer days, the last available day is used.</p>
                            </div>

                            {/* Footer */}
                            {selectedDay && (
                                <div className="mx-4 mb-4 px-3 py-2.5 bg-green-50 rounded-xl flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    <p className="text-[11px] text-green-700 font-medium">Reminders on day {rangeStart} – {rangeEnd} each month</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </>
        )
    }

    const waterIcon = <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21c-3.866 0-7-3.134-7-7 0-4.97 7-11 7-11s7 6.03 7 11c0 3.866-3.134 7-7 7z" /></svg>
    const elecIcon = <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    const wifiIcon = <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01M5.636 13.636a9 9 0 0112.728 0M1.393 10.393a14 14 0 0121.213 0" /></svg>

    const renderStep4 = () => {
        const amenities = selectedProp?.amenities || []
        const isWaterFree = amenities.includes('Free Water')
        const isElecFree = amenities.includes('Free Electricity')
        const isWifiFree = amenities.includes('Free WiFi')
        const FreeBadge = ({ label, icon }) => (
            <div className="flex items-center gap-3 p-3.5 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200">
                <div className="w-8 h-8 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">{icon}</div>
                <span className="text-sm font-bold text-green-700">{label}</span>
                <span className="ml-auto text-[10px] font-bold bg-green-200 text-green-800 px-2 py-0.5 rounded-full">Included</span>
            </div>
        )
        return (
            <div className="space-y-3">
                <p className="text-xs text-gray-500 font-medium leading-relaxed">Select a due day for each utility. A 4-day notification window will be highlighted.</p>
                {!isWaterFree ? <DayPickerModal label="Water" icon={waterIcon} selectedDay={waterDueDay} onSelect={setWaterDueDay} accentColor="blue" pickerKey="water" /> : <FreeBadge label="Free Water" icon={waterIcon} />}
                {!isElecFree ? <DayPickerModal label="Electricity" icon={elecIcon} selectedDay={electricityDueDay} onSelect={setElectricityDueDay} accentColor="amber" pickerKey="electricity" /> : <FreeBadge label="Free Electricity" icon={elecIcon} />}
                {!isWifiFree ? <DayPickerModal label="WiFi" icon={wifiIcon} selectedDay={wifiDueDay} onSelect={setWifiDueDay} accentColor="violet" pickerKey="wifi" /> : <FreeBadge label="Free WiFi" icon={wifiIcon} />}

                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-gray-900">Tenant already paid?</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">Skip auto-billing if payment was received offline.</p>
                        </div>
                        <button type="button" onClick={() => setAlreadyPaid(!alreadyPaid)} className={`w-11 h-6 rounded-full transition-all duration-200 cursor-pointer ${alreadyPaid ? 'bg-green-500' : 'bg-gray-300'}`}>
                            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${alreadyPaid ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                    </div>
                    {alreadyPaid && <p className="text-[10px] text-green-600 font-bold mt-2 flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> No move-in bill will be generated</p>}
                </div>

                {/* Confirm assignment modal */}
                {showConfirm && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={() => setShowConfirm(false)}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} />
                        <div style={{ position: 'relative', backgroundColor: '#ffffff', borderRadius: '20px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: '384px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                            {/* Warning icon */}
                            <div className="flex flex-col items-center pt-8 pb-4 px-6">
                                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Confirm Assignment</h3>
                                <p className="text-sm text-gray-500 text-center leading-relaxed">This action cannot be undone. The property status will change to <span className="font-semibold text-gray-700">occupied</span> and the tenant will be notified immediately.</p>
                            </div>
                            {/* Actions */}
                            <div className="flex gap-3 px-6 pb-6">
                                <button type="button" onClick={() => setShowConfirm(false)} className="flex-1 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 font-bold text-sm hover:bg-gray-100 transition-all cursor-pointer">
                                    Cancel
                                </button>
                                <button type="button" onClick={handleSubmit} disabled={submitting} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-500 transition-all cursor-pointer disabled:opacity-50 shadow-lg">
                                    {submitting ? (uploadingContract ? 'Uploading...' : 'Assigning...') : 'Yes, Assign'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-[3px] border-gray-900 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-medium text-gray-400">Loading...</p>
                </div>
            </div>
        )
    }

    const stepDescriptions = ['Select a property', 'Set contract terms', 'Upload documents', 'Configure utilities']

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 font-sans text-black">
            <style jsx>{`
                @keyframes fadeInUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
                @keyframes slideIn { from { opacity:0; transform:translateX(-10px) } to { opacity:1; transform:translateX(0) } }
                .animate-fadeInUp { animation: fadeInUp 0.5s ease-out forwards }
                .animate-slideIn { animation: slideIn 0.4s ease-out forwards }
                .step-enter { animation: fadeInUp 0.35s ease-out }
            `}</style>

            {/* Top bar */}
            <div className={`fixed top-0 left-0 right-0 z-30 bg-white/80 backdrop-blur-xl border-b border-gray-200/60 ${mounted ? 'animate-fadeInUp' : 'opacity-0'}`}>
                <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
                    <button onClick={() => router.push('/bookings')} className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 font-semibold text-sm cursor-pointer transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        Back
                    </button>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Step {step + 1} of {STEPS.length}</span>
                    <div className="w-12" />
                </div>
                {/* Progress bar */}
                <div className="h-[3px] bg-gray-100">
                    <div className="h-full bg-gray-900 transition-all duration-500 ease-out rounded-r-full" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
                </div>
            </div>

            <div className="w-full max-w-lg mx-auto px-4 sm:px-6 pt-24 pb-8">
                <div className={`${mounted ? 'animate-fadeInUp' : 'opacity-0'}`}>
                    {/* Header */}
                    <div className="mb-6">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center shadow-lg">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Assign Tenant</h1>
                                <p className="text-xs text-gray-500 mt-0.5">{stepDescriptions[step]}</p>
                            </div>
                        </div>
                    </div>

                    {/* Stepper pills */}
                    <div className="flex gap-1.5 mb-6">
                        {STEPS.map((s, i) => (
                            <div key={i} className="flex-1">
                                <div className={`h-1.5 rounded-full transition-all duration-500 ${i < step ? 'bg-green-500' : i === step ? 'bg-gray-900' : 'bg-gray-200'}`} />
                                <div className="flex items-center gap-1 mt-1.5">
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all text-[8px] font-black ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'}`}>
                                        {i < step ? <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : i + 1}
                                    </div>
                                    <span className={`text-[10px] font-bold ${i === step ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Content card */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4 step-enter" key={step}>
                        {step === 0 && renderStep1()}
                        {step === 1 && renderStep2()}
                        {step === 2 && renderStep3()}
                        {step === 3 && renderStep4()}
                    </div>

                    {/* Navigation */}
                    <div className="flex gap-3">
                        {step > 0 && (
                            <button type="button" onClick={prevStep}
                                className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all cursor-pointer text-sm shadow-sm">
                                Back
                            </button>
                        )}
                        {step < 3 ? (
                            <button type="button" onClick={nextStep} disabled={submitting}
                                className="flex-1 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 shadow-lg hover:shadow-xl transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 text-sm">
                                Continue
                            </button>
                        ) : (
                            <button type="button" onClick={() => setShowConfirm(true)} disabled={submitting}
                                className="flex-1 py-3 font-bold rounded-xl shadow-lg transition-all cursor-pointer text-sm disabled:opacity-50 transform hover:-translate-y-0.5 active:translate-y-0 bg-gray-900 text-white hover:bg-gray-800">
                                Assign Tenant
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
