import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { createNotification } from '../lib/notifications'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Footer from './Footer'
import Lottie from "lottie-react"
import loadingAnimation from "../assets/loading.json"

export default function LandlordDashboard({ session, profile }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState({})

  // Modal States
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [acceptedApplications, setAcceptedApplications] = useState([])
  const [penaltyDetails, setPenaltyDetails] = useState('')
  const [startDate, setStartDate] = useState('') // NEW: Start Date State
  const [endDate, setEndDate] = useState('') // NEW: Contract End Date State
  const [wifiDueDay, setWifiDueDay] = useState('') // NEW: Wifi Due Day
  const [electricityDueDay, setElectricityDueDay] = useState('') // NEW: Electricity Due Day

  const [contractFile, setContractFile] = useState(null) // Contract PDF file
  const [uploadingContract, setUploadingContract] = useState(false)

  // Confirmation Modal State
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    type: null, // 'approve' or 'reject'
    requestId: null
  })

  // End Contract Confirmation Modal State
  const [endContractModal, setEndContractModal] = useState({
    isOpen: false,
    occupancy: null
  })
  const [endContractDate, setEndContractDate] = useState('')
  const [endContractReason, setEndContractReason] = useState('')

  // Renewal Confirmation Modal State
  const [renewalModal, setRenewalModal] = useState({
    isOpen: false,
    occupancy: null,
    action: null // 'approve' or 'reject'
  })
  const [renewalSigningDate, setRenewalSigningDate] = useState('')
  const [renewalEndDate, setRenewalEndDate] = useState('') // NEW: Editable Renewal End Date

  // EMAIL NOTIFICATION MODAL STATE
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [allTenants, setAllTenants] = useState([])
  const [selectedTenants, setSelectedTenants] = useState([])
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailEnding, setEmailEnding] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showTenantDropdown, setShowTenantDropdown] = useState(false)

  // Landlord data states
  const [occupancies, setOccupancies] = useState([])
  const [pendingEndRequests, setPendingEndRequests] = useState([])
  const [pendingRenewalRequests, setPendingRenewalRequests] = useState([])
  const [dashboardTasks, setDashboardTasks] = useState({ maintenance: [], payments: [] })

  // Advance Bill Confirmation Modal State
  const [advanceBillModal, setAdvanceBillModal] = useState({
    isOpen: false,
    tenantId: null,
    tenantName: '',
    propertyTitle: ''
  })

  const router = useRouter()

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

  useEffect(() => {
    if (profile) {
      loadProperties()
      loadOccupancies()
      loadPendingEndRequests()
      loadPendingRenewalRequests()
      loadDashboardTasks()
    }
    // Check for reminders (only sends at 8:00 AM, once per day)
    fetch('/api/manual-reminders').catch(err => console.error("Reminder check failed", err));
  }, [profile])

  async function loadProperties() {
    if (properties.length === 0) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    let query = supabase
      .from('properties')
      .select('*, landlord_profile:profiles!properties_landlord_fkey(id, first_name, middle_name, last_name, role)')
      .eq('landlord', session.user.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) console.error('Error loading properties:', error)
    setProperties(data || [])
    setLoading(false)
    setRefreshing(false)
  }

  async function loadDashboardTasks() {
    const { data: myProps } = await supabase.from('properties').select('id, title').eq('landlord', session.user.id)
    if (!myProps || myProps.length === 0) return

    const propIds = myProps.map(p => p.id)
    const propMap = myProps.reduce((acc, p) => ({ ...acc, [p.id]: p.title }), {})

    const { data: maint } = await supabase
      .from('maintenance_requests')
      .select('id, title, status, created_at, property_id')
      .in('property_id', propIds)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(5)

    const { data: payments } = await supabase
      .from('payment_requests')
      .select('id, rent_amount, security_deposit_amount, advance_amount, water_bill, electrical_bill, wifi_bill, other_bills, status, due_date, property_id')
      .in('property_id', propIds)
      .in('status', ['pending', 'pending_confirmation'])
      .order('due_date', { ascending: true })
      .limit(5)

    setDashboardTasks({
      maintenance: maint?.map(m => ({ ...m, property_title: propMap[m.property_id] })) || [],
      payments: payments?.map(p => {
        const total = (p.rent_amount || 0) +
          (p.security_deposit_amount || 0) +
          (p.advance_amount || 0) +
          (p.water_bill || 0) +
          (p.electrical_bill || 0) +
          (p.wifi_bill || 0) +
          (p.other_bills || 0)
        return { ...p, amount: total, property_title: propMap[p.property_id] }
      }) || []
    })
  }

  // --- NEW: Billing Tracker State & Logic ---
  const [billingSchedule, setBillingSchedule] = useState([])
  const [sendingBillId, setSendingBillId] = useState(null)

  useEffect(() => {
    if (occupancies.length > 0) {
      calculateBillingSchedule()
    }
  }, [occupancies])

  // Open confirmation modal for sending advance bill
  function openAdvanceBillModal(tenantId, tenantName, propertyTitle) {
    setAdvanceBillModal({
      isOpen: true,
      tenantId,
      tenantName,
      propertyTitle
    })
  }

  // Close the advance bill modal
  function closeAdvanceBillModal() {
    setAdvanceBillModal({
      isOpen: false,
      tenantId: null,
      tenantName: '',
      propertyTitle: ''
    })
  }

  // Actually send the advance bill after confirmation
  async function confirmSendAdvanceBill() {
    const tenantId = advanceBillModal.tenantId
    if (!tenantId) return

    closeAdvanceBillModal()
    setSendingBillId(tenantId)
    try {
      const res = await fetch(`/api/test-rent-reminder?tenantId=${tenantId}`)
      const data = await res.json()
      if (res.ok) {
        showToast.success('Advance bill sent successfully!', { duration: 4000, transition: "bounceIn" })
        setTimeout(() => calculateBillingSchedule(), 1000) // Refresh status
      } else {
        showToast.error(data.error || 'Failed to send bill', { duration: 4000, transition: "bounceIn" })
      }
    } catch (err) {
      console.error(err)
      showToast.error('Error sending bill', { duration: 4000, transition: "bounceIn" })
    } finally {
      setSendingBillId(null)
    }
  }

  async function calculateBillingSchedule() {
    // 1. Fetch ALL bills for the landlord to analyze status correctly
    const { data: allBills } = await supabase
      .from('payment_requests')
      .select('occupancy_id, status, due_date, created_at, rent_amount, advance_amount, bills_description')
      .eq('landlord', session.user.id)
      .order('due_date', { ascending: true }) // Order by due date to find earliest pending

    // Group by occupancy
    const billsByOccupancy = {}
    if (allBills) {
      allBills.forEach(bill => {
        if (!billsByOccupancy[bill.occupancy_id]) {
          billsByOccupancy[bill.occupancy_id] = []
        }
        billsByOccupancy[bill.occupancy_id].push(bill)
      })
    }

    // 2. Build schedule based on occupancies
    const schedule = occupancies.map(occ => {
      const bills = billsByOccupancy[occ.id] || []

      // Find earliest pending payment
      const earliestPending = bills.find(b => b.status === 'pending' || b.status === 'pending_confirmation')

      // Find latest bill (by creation) for status display
      const latestBill = bills.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

      let nextDueDate = null
      let status = 'Scheduled'
      let note = ''

      if (earliestPending) {
        // If there is ANY pending bill, the "Next Due" is that bill's date
        nextDueDate = new Date(earliestPending.due_date)

        const today = new Date()
        if (nextDueDate < today) {
          status = 'Overdue'
          note = 'Tenant has unpaid bills'
        } else {
          status = earliestPending.status === 'pending_confirmation' ? 'Confirming' : 'Pending'
        }
      } else {
        // No pending bills - Project next date based on Last Paid or Start Date
        const lastPaid = bills
          .filter(b => b.status === 'paid' && parseFloat(b.rent_amount) > 0)
          .sort((a, b) => new Date(b.due_date) - new Date(a.due_date))[0]

        if (lastPaid) {
          // Calculate months covered including any advance payment
          const rentAmount = parseFloat(lastPaid.rent_amount || 0)
          const advanceAmount = parseFloat(lastPaid.advance_amount || 0)

          let monthsCovered = 1
          if (rentAmount > 0 && advanceAmount > 0) {
            monthsCovered = 1 + Math.floor(advanceAmount / rentAmount)
          }

          // Next due is monthsCovered months after last paid bill
          nextDueDate = new Date(lastPaid.due_date)
          nextDueDate.setMonth(nextDueDate.getMonth() + monthsCovered)
        } else {
          // No history, use Start Date
          // If start date is in past and no bills, it means we missed bills? 
          // Or maybe "Move-in" bill is pending (handled above in earliestPending).
          // If no bills at all, it's Start Date.
          nextDueDate = new Date(occ.start_date)
        }
      }

      // Handle contract end date
      if (occ.contract_end_date && nextDueDate) {
        const endDate = new Date(occ.contract_end_date)
        if (nextDueDate > endDate) {
          status = 'Contract Ending'
          note = 'Contract ends before next expected cycle'
        }
      }

      // Calculate Send Date (3 days before due date)
      const sendDate = new Date(nextDueDate)
      sendDate.setDate(sendDate.getDate() - 3)

      return {
        id: occ.id,
        tenantId: occ.tenant_id,
        tenantName: `${occ.tenant?.first_name} ${occ.tenant?.last_name}`,
        propertyTitle: occ.property?.title,
        nextDueDate: nextDueDate,
        sendDate: sendDate,
        status: status,
        note: note,
        lastBill: latestBill
      }
    })

    setBillingSchedule(schedule)
  }

  async function loadPendingEndRequests() {
    const { data } = await supabase.from('tenant_occupancies').select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone), property:properties(id, title, address)`).eq('landlord_id', session.user.id).eq('end_request_status', 'pending')
    setPendingEndRequests(data || [])
  }

  async function loadPendingRenewalRequests() {
    const { data } = await supabase
      .from('tenant_occupancies')
      .select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone), property:properties(id, title, address, price)`)
      .eq('landlord_id', session.user.id)
      .eq('renewal_requested', true)
      .eq('renewal_status', 'pending')
    setPendingRenewalRequests(data || [])
  }

  // Open renewal confirmation modal
  function openRenewalModal(occupancy, action) {
    setRenewalModal({ isOpen: true, occupancy, action })
    // Default signing date to 3 days from now
    const defaultDate = new Date()
    defaultDate.setDate(defaultDate.getDate() + 3)
    setRenewalSigningDate(defaultDate.toISOString().split('T')[0])

    // Default End Date: Current End + 1 Year
    if (occupancy && occupancy.contract_end_date) {
      const currentEnd = new Date(occupancy.contract_end_date)
      currentEnd.setFullYear(currentEnd.getFullYear() + 1)
      setRenewalEndDate(currentEnd.toISOString().split('T')[0])
    }
  }

  // Close renewal modal
  function closeRenewalModal() {
    setRenewalModal({ isOpen: false, occupancy: null, action: null })
    setRenewalSigningDate('')
    setRenewalEndDate('')
  }

  // Process renewal after modal confirmation
  // Process renewal after modal confirmation
  async function confirmRenewalRequest() {
    const { occupancy, action } = renewalModal
    if (!occupancy) return

    const approved = action === 'approve'

    // For approval, require signing date and end date
    if (approved) {
      if (!renewalSigningDate) {
        showToast.error('Please select a contract signing date', { duration: 4000, transition: "bounceIn" })
        return
      }
      if (!renewalEndDate) {
        showToast.error('Please select a new contract end date', { duration: 4000, transition: "bounceIn" })
        return
      }
    }

    const newEndDateObj = new Date(renewalEndDate) // Use the editable date

    const updateData = {
      renewal_status: approved ? 'approved' : 'rejected',
      renewal_requested: false
    }

    if (approved) {
      updateData.contract_end_date = renewalEndDate
      updateData.renewal_signing_date = renewalSigningDate // Store signing date
    }

    const { error } = await supabase
      .from('tenant_occupancies')
      .update(updateData)
      .eq('id', occupancy.id)

    if (error) {
      showToast.error('Failed to process renewal request')
      return
    }

    // Notify tenant
    let message = ''
    if (approved) {
      message = `Your contract renewal for "${occupancy.property?.title}" has been approved! New contract end date: ${newEndDateObj.toLocaleDateString()}. Please come for contract signing on ${new Date(renewalSigningDate).toLocaleDateString()}.`
    } else {
      message = `Your contract renewal request for "${occupancy.property?.title}" was not approved. Please contact your landlord for more details.`
    }

    await createNotification({
      recipient: occupancy.tenant_id,
      actor: session.user.id,
      type: approved ? 'contract_renewal_approved' : 'contract_renewal_rejected',
      message: message,
      link: '/dashboard'
    })

    // --- AUTO-SEND RENEWAL PAYMENT BILL (Rent + Advance) ---
    // Renewal payment = 1 month rent + 1 month advance = 2 months total
    // After payment, tenant's next due date will advance by 2 months from contract end
    // 
    // Example: Contract ends April 2, 2026
    // - Rent covers: April → May (due May 2)
    // - Advance covers: May → June (due June 2, auto-created when confirmed)
    // - Next bill: June → July (due July 2)
    //
    // Security deposit is NOT required for renewal (it carries forward from original contract)
    if (approved) {
      const rentAmount = occupancy.property?.price || 0
      const advanceAmount = rentAmount // Advance equals one month's rent (total = 2 months)

      // Calculate the due date:
      // Try to find the ACTUAL next due date based on payment history
      // This prevents "skipping" months if there's a gap between last payment and contract end
      // Default to contract end date if no history
      let renewalBillDueDate = new Date(occupancy.contract_end_date);

      try {
        const { data: lastPaidBills } = await supabase
          .from('payment_requests')
          .select('due_date, rent_amount, advance_amount')
          .eq('occupancy_id', occupancy.id)
          .or('status.eq.paid,status.eq.pending_confirmation')
          .gt('rent_amount', 0)
          .order('due_date', { ascending: false })
          .limit(1);

        if (lastPaidBills && lastPaidBills.length > 0) {
          const lastBill = lastPaidBills[0];
          const lastDate = new Date(lastBill.due_date);
          let monthsCovered = 1;
          // Calculate how many months the last bill covered
          if (lastBill.rent_amount > 0 && lastBill.advance_amount > 0) {
            monthsCovered = 1 + Math.floor(lastBill.advance_amount / lastBill.rent_amount);
          } else if (lastBill.rent_amount > 0 && lastBill.advance_amount === 0) {
            // Standard bill covers 1 month
            monthsCovered = 1;
          }

          // Calculate next due date based on history
          const nextDue = new Date(lastDate);
          nextDue.setMonth(nextDue.getMonth() + monthsCovered);

          console.log("Calculated Renewal Bill Date from history:", nextDue.toISOString());

          // Use this as the renewal bill date
          renewalBillDueDate = nextDue;
        } else {
          console.log("No payment history found for renewal, using contract end date");
        }
      } catch (err) {
        console.error("Error calculating renewal date:", err);
      }

      const signingDate = new Date(renewalSigningDate) // When payment should be made

      try {
        const { error: billError } = await supabase.from('payment_requests').insert({
          landlord: session.user.id,
          tenant: occupancy.tenant_id,
          property_id: occupancy.property_id,
          occupancy_id: occupancy.id, // Link to occupancy so it shows in TenantDashboard
          rent_amount: rentAmount,
          advance_amount: advanceAmount, // Renewal = Rent + Advance (2 months total)
          security_deposit_amount: 0, // NO security deposit for renewal - it carries forward
          water_bill: 0,
          electrical_bill: 0,
          other_bills: 0,
          bills_description: 'Contract Renewal Payment (1 Month Rent + 1 Month Advance)',
          due_date: renewalBillDueDate.toISOString(), // Due on the start of renewal (e.g., April 2)
          status: 'pending',
          is_renewal_payment: true // Mark as renewal payment
        });

        if (billError) {
          console.error('Renewal bill creation error:', billError);
        } else {
          // Notify tenant about the bill
          await createNotification({
            recipient: occupancy.tenant_id,
            actor: session.user.id,
            type: 'payment_request',
            message: `Your renewal payment bill has been sent: ₱${Number(rentAmount).toLocaleString()} (Rent) + ₱${Number(advanceAmount).toLocaleString()} (Advance) = ₱${Number(rentAmount + advanceAmount).toLocaleString()} Total. Please pay on signing date: ${signingDate.toLocaleDateString()}. This covers your first 2 months of the renewed contract.`,
            link: '/payments'
          });
        }
      } catch (err) {
        console.error('Renewal bill exception:', err);
      }


      showToast.success('Renewal approved! Payment bill sent automatically.', { duration: 4000, transition: "bounceIn" })
    } else {
      showToast.success('Renewal rejected', { duration: 4000, transition: "bounceIn" })
    }

    closeRenewalModal()
    loadPendingRenewalRequests()
    loadOccupancies()
  }

  async function loadOccupancies() {
    const { data } = await supabase.from('tenant_occupancies').select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone), property:properties(id, title)`).eq('landlord_id', session.user.id).eq('status', 'active')
    setOccupancies(data || [])
  }

  // Load all tenants under landlord's properties for email notifications
  async function loadAllTenants() {
    const { data } = await supabase
      .from('tenant_occupancies')
      .select(`
        id,
        tenant_id,
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone, phone_verified),
        property:properties(id, title)
      `)
      .eq('landlord_id', session.user.id)
      .eq('status', 'active')

    // Format tenants with property info
    const formattedTenants = (data || []).map(occ => ({
      id: occ.tenant_id,
      name: `${occ.tenant?.first_name || ''} ${occ.tenant?.middle_name || ''} ${occ.tenant?.last_name || ''}`.trim(),
      phone: occ.tenant?.phone,
      phone_verified: occ.tenant?.phone_verified,
      property: occ.property?.title || 'Unknown Property'
    }))

    setAllTenants(formattedTenants)
  }

  function openEmailModal() {
    loadAllTenants()
    setSelectedTenants([])
    setEmailSubject('')
    setEmailBody('')
    setEmailEnding('')
    setShowEmailModal(true)
  }

  function toggleTenantSelection(tenantId) {
    setSelectedTenants(prev =>
      prev.includes(tenantId)
        ? prev.filter(id => id !== tenantId)
        : [...prev, tenantId]
    )
  }

  function selectAllTenants() {
    if (selectedTenants.length === allTenants.length) {
      setSelectedTenants([])
    } else {
      setSelectedTenants(allTenants.map(t => t.id))
    }
  }

  async function sendBulkNotification() {
    if (selectedTenants.length === 0) {
      showToast.error('Please select at least one tenant', { duration: 4000, transition: "bounceIn" })
      return
    }
    if (!emailSubject.trim()) {
      showToast.error('Please enter a subject', { duration: 4000, transition: "bounceIn" })
      return
    }
    if (!emailBody.trim()) {
      showToast.error('Please enter a message body', { duration: 4000, transition: "bounceIn" })
      return
    }

    setSendingEmail(true)
    try {
      const response = await fetch('/api/send-bulk-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantIds: selectedTenants,
          subject: emailSubject,
          body: emailBody,
          ending: emailEnding,
          landlordId: session.user.id
        })
      })

      const result = await response.json()

      if (result.success) {
        showToast.success(result.message, { duration: 5000, transition: "bounceIn" })
        setShowEmailModal(false)
      } else {
        showToast.error(result.error || 'Failed to send notifications', { duration: 4000, transition: "bounceIn" })
      }
    } catch (err) {
      console.error('Send notification error:', err)
      showToast.error('Failed to send notifications', { duration: 4000, transition: "bounceIn" })
    } finally {
      setSendingEmail(false)
    }
  }

  function getPropertyOccupancy(propertyId) { return occupancies.find(o => o.property_id === propertyId) }

  const getPropertyImages = (property) => {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) return property.images
    return []
  }

  const handlePropertyAction = (propertyId) => {
    router.push(`/properties/edit/${propertyId}`)
  }

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

  function openAssignModal(property) {
    setSelectedProperty(property);
    loadAcceptedApplicationsForProperty(property.id);
    setPenaltyDetails('');
    setStartDate(new Date().toISOString().split('T')[0]); // Default to today
    // Default end date to 1 year from now
    const defaultEndDate = new Date();
    defaultEndDate.setFullYear(defaultEndDate.getFullYear() + 1);
    setEndDate(defaultEndDate.toISOString().split('T')[0]);
    setWifiDueDay(''); // Reset
    setElectricityDueDay(''); // Reset
    setContractFile(null); // Reset contract file
    setShowAssignModal(true)
  }

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

    // UPDATED: Use selected startDate, endDate, security deposit, and contract URL
    // Note: electricity_due_day is not stored - electricity reminders are always sent for 1st week of month
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

    // UPDATED: Notification message includes start date, end date and security deposit
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

    // --- NEW CODE: Send Email ---
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: candidate.id, // Using the booking ID to look up details
        type: 'assignment',      // New type we will handle in the API
        customMessage: message
      })
    }).catch(err => console.error("Email Error:", err));

    // --- AUTO-SEND MOVE-IN PAYMENT BILL (Rent + Security Deposit) ---
    // Newly assigned tenants only pay Rent + Security Deposit (NO Advance)
    // Advance Payment is only for contract renewals
    const rentAmount = selectedProperty.price || 0;
    const dueDate = new Date(startDate); // Due date is the start date of the contract

    try {
      const { error: billError } = await supabase.from('payment_requests').insert({
        landlord: session.user.id,
        tenant: candidate.tenant,
        property_id: selectedProperty.id,
        occupancy_id: occupancyId, // Link to occupancy so it shows in TenantDashboard
        rent_amount: rentAmount,
        security_deposit_amount: securityDepositAmount, // New assignment = security deposit required
        advance_amount: 0, // NO advance for new assignments (only for renewals)
        water_bill: 0,
        electrical_bill: 0,
        other_bills: 0,
        bills_description: 'Move-in Payment (Rent + Security Deposit)',
        due_date: dueDate.toISOString(),
        status: 'pending',
        is_move_in_payment: true // Mark as move-in payment (new assignment)
      });

      if (billError) {
        console.error('Auto-bill creation error:', billError);
        // Don't block assignment, just log the error
      } else {
        // Notify tenant about the bill
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
    setContractFile(null); // Reset contract file
    loadProperties();
    loadOccupancies();
  }

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

  function openEndContractModal(occupancy) {
    setEndContractModal({ isOpen: true, occupancy })
    setEndContractDate('')
    setEndContractReason('')
  }

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

    // Mark the tenant's booking as completed so they can book new viewings
    await supabase.from('bookings')
      .update({ status: 'completed' })
      .eq('tenant', occupancy.tenant_id)
      .eq('property_id', occupancy.property_id)
      .in('status', ['pending', 'pending_approval', 'approved', 'accepted', 'cancelled'])

    // Also mark the application as completed so 'Ready to Book' disappears
    await supabase.from('applications')
      .update({ status: 'completed' })
      .eq('tenant', occupancy.tenant_id)
      .eq('property_id', occupancy.property_id)
      .eq('status', 'accepted')

    // Notification Message
    const formattedDate = new Date(endContractDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const message = `Your contract for "${occupancy.property?.title}" has been ended by the landlord.\n\nEnd Date: ${formattedDate}\nReason: ${endContractReason}\n\nPlease vacate the premises by the end date.`

    // 1. In-App
    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'occupancy_ended', message: message, link: '/dashboard' })

    // 2. SMS
    if (occupancy.tenant?.phone) {
      fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: occupancy.tenant.phone, message })
      }).catch(err => console.error("SMS Error:", err));
    }

    // 3. Email
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        occupancyId: occupancy.id, // Using occupancyId
        type: 'end_contract',
        customMessage: message
      })
    }).catch(err => console.error("Email Error:", err));

    showToast.success('Contract ended successfully', { duration: 4000, transition: "bounceIn" });
    loadProperties(); loadOccupancies()
  }

  // --- CONFIRMATION HANDLERS ---

  function openEndConfirmation(type, requestId) {
    setConfirmationModal({ isOpen: true, type, requestId })
  }

  function handleConfirmEndAction() {
    if (confirmationModal.type === 'approve') {
      approveEndRequest(confirmationModal.requestId)
    } else if (confirmationModal.type === 'reject') {
      rejectEndRequest(confirmationModal.requestId)
    }
    setConfirmationModal({ isOpen: false, type: null, requestId: null })
  }

  // --- ACTION FUNCTIONS ---

  async function approveEndRequest(occupancyId) {
    const occupancy = pendingEndRequests.find(o => o.id === occupancyId);
    if (!occupancy) return

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({
        status: 'ended',
        end_date: new Date().toISOString(),
        end_request_status: 'approved'
      })
      .eq('id', occupancyId)

    if (error) {
      showToast.error(`Failed: ${error.message}`, { duration: 4000, transition: "bounceIn" });
      return
    }

    await supabase.from('properties').update({ status: 'available' }).eq('id', occupancy.property_id)

    // Mark the tenant's booking as completed so they can book new viewings
    await supabase.from('bookings')
      .update({ status: 'completed' })
      .eq('tenant', occupancy.tenant_id)
      .eq('property_id', occupancy.property_id)
      .in('status', ['pending', 'pending_approval', 'approved', 'accepted', 'cancelled'])

    // Also mark the application as completed so 'Ready to Book' disappears
    await supabase.from('applications')
      .update({ status: 'completed' })
      .eq('tenant', occupancy.tenant_id)
      .eq('property_id', occupancy.property_id)
      .eq('status', 'accepted')

    // Notification Message
    const message = `Your request to move out of "${occupancy.property?.title}" has been APPROVED. The contract is now ended.`

    // 1. In-App
    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'end_request_approved', message: message, link: '/dashboard' })

    // 2. SMS
    if (occupancy.tenant?.phone) {
      fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: occupancy.tenant.phone, message })
      }).catch(err => console.error("SMS Error:", err));
    }

    // 3. Email
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        occupancyId: occupancyId, // Using occupancyId
        type: 'end_contract',
        customMessage: message
      })
    }).catch(err => console.error("Email Error:", err));

    showToast.success('Approved successfully', { duration: 4000, transition: "bounceIn" });
    loadPendingEndRequests(); loadOccupancies(); loadProperties()
  }

  async function rejectEndRequest(occupancyId) {
    const occupancy = pendingEndRequests.find(o => o.id === occupancyId);
    if (!occupancy) return

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({
        status: 'active',
        end_request_status: 'rejected',
        end_requested_at: null,
        end_request_reason: null,
        end_request_date: null
      })
      .eq('id', occupancyId)

    if (error) {
      console.error('Reject End Request Error:', error);
      showToast.error(`Failed to reject: ${error.message}`, { duration: 4000, transition: "bounceIn" });
      return
    }

    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'end_request_rejected', message: `End occupancy request for "${occupancy.property?.title}" rejected.`, link: '/dashboard' })
    showToast.success('Request rejected', { duration: 4000, transition: "bounceIn" });
    loadPendingEndRequests()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex flex-col scroll-smooth">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 flex-1 w-full">

        {/* HERO HEADER WITH STATS */}
        <div className="mb-10">
          <div className="bg-gradient-to-r from-black via-gray-900 to-gray-800 rounded-[2rem] p-6 sm:p-8 text-white relative overflow-hidden shadow-2xl shadow-black/20">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>

            <div className="relative z-10">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <p className="text-white/60 text-sm font-medium mb-1">Welcome back</p>
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{profile?.first_name} {profile?.last_name}</h1>
                  <p className="text-white/70 mt-2 text-sm sm:text-base">Manage your properties, tenants, and finances from one place.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={openEmailModal}
                    className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white rounded-xl text-sm font-bold cursor-pointer transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    Message Tenants
                  </button>
                  <button
                    onClick={() => router.push('/properties/new')}
                    className="flex items-center gap-2 px-5 py-3 bg-white text-black rounded-xl text-sm font-bold cursor-pointer hover:bg-gray-100 transition-all shadow-lg"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add Property
                  </button>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-8">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <p className="text-white/60 text-xs font-medium uppercase tracking-wider">Properties</p>
                  <p className="text-2xl sm:text-3xl font-black mt-1">{properties.length}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <p className="text-white/60 text-xs font-medium uppercase tracking-wider">Active Tenants</p>
                  <p className="text-2xl sm:text-3xl font-black mt-1">{occupancies.length}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <p className="text-white/60 text-xs font-medium uppercase tracking-wider">Pending Actions</p>
                  <p className="text-2xl sm:text-3xl font-black mt-1">{pendingEndRequests.length + pendingRenewalRequests.length + dashboardTasks.payments.length + dashboardTasks.maintenance.length}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <p className="text-white/60 text-xs font-medium uppercase tracking-wider">Available</p>
                  <p className="text-2xl sm:text-3xl font-black mt-1">{properties.filter(p => p.status === 'available').length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT GRID */}
        <div className="flex flex-col gap-8">

          {/* SECTION 1: ACTION CENTER - 2x2 Grid */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1.5 h-8 bg-black rounded-full"></div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Action Center</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Pending Move-Out Requests */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </div>
                    <h4 className="font-bold text-gray-900 text-sm">Move-Out</h4>
                  </div>
                  {pendingEndRequests.length > 0 && <span className="text-xs font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full animate-pulse">{pendingEndRequests.length}</span>}
                </div>
                <div className="p-4 min-h-[120px] flex flex-col">
                  {pendingEndRequests.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-gray-400">No pending requests</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[150px] overflow-y-auto">
                      {pendingEndRequests.slice(0, 2).map(request => (
                        <div key={request.id} className="p-2 bg-orange-50/50 rounded-lg border border-orange-100">
                          <p className="font-bold text-gray-900 text-xs truncate">{request.property?.title}</p>
                          <p className="text-[10px] text-gray-500">{request.tenant?.first_name} {request.tenant?.last_name}</p>
                          <div className="flex gap-1 mt-2">
                            <button onClick={() => openEndConfirmation('approve', request.id)} className="flex-1 py-1 bg-black text-white text-[10px] font-bold rounded cursor-pointer hover:bg-gray-800">Approve</button>
                            <button onClick={() => openEndConfirmation('reject', request.id)} className="flex-1 py-1 bg-gray-100 text-gray-700 text-[10px] font-bold rounded cursor-pointer hover:bg-gray-200">Reject</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Contract Renewal Requests */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </div>
                    <h4 className="font-bold text-gray-900 text-sm">Renewals</h4>
                  </div>
                  {pendingRenewalRequests.length > 0 && <span className="text-xs font-bold bg-indigo-500 text-white px-2 py-0.5 rounded-full animate-pulse">{pendingRenewalRequests.length}</span>}
                </div>
                <div className="p-4 min-h-[120px] flex flex-col">
                  {pendingRenewalRequests.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-gray-400">No renewals pending</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[150px] overflow-y-auto">
                      {pendingRenewalRequests.slice(0, 2).map(request => (
                        <div key={request.id} className="p-2 bg-indigo-50/50 rounded-lg border border-indigo-100">
                          <p className="font-bold text-gray-900 text-xs truncate">{request.property?.title}</p>
                          <p className="text-[10px] text-gray-500">{request.tenant?.first_name} {request.tenant?.last_name}</p>
                          <div className="flex gap-1 mt-2">
                            <button onClick={() => openRenewalModal(request, 'approve')} className="flex-1 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded cursor-pointer hover:bg-indigo-700">Approve</button>
                            <button onClick={() => openRenewalModal(request, 'reject')} className="flex-1 py-1 bg-gray-100 text-gray-700 text-[10px] font-bold rounded cursor-pointer hover:bg-gray-200">Reject</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Pending Payments */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push('/payments')}>
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-white">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <h4 className="font-bold text-gray-900 text-sm">Payments</h4>
                  </div>
                  {dashboardTasks.payments.length > 0 && <span className="text-xs font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">{dashboardTasks.payments.length}</span>}
                </div>
                <div className="p-4 min-h-[120px] flex flex-col">
                  {dashboardTasks.payments.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-gray-400">All caught up!</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dashboardTasks.payments.slice(0, 2).map(pay => (
                        <div key={pay.id} className="p-2 bg-emerald-50/50 rounded-lg border border-emerald-100">
                          <div className="flex justify-between items-center">
                            <p className="font-black text-emerald-700 text-sm">₱{pay.amount?.toLocaleString()}</p>
                            <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold uppercase">{pay.status?.replace('_', ' ')}</span>
                          </div>
                          <p className="text-[10px] text-gray-500 truncate">{pay.property_title}</p>
                        </div>
                      ))}
                      <p className="text-[10px] text-center text-gray-400 mt-1">Click to view all →</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Pending Maintenance */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push('/maintenance')}>
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-rose-50 to-white">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <h4 className="font-bold text-gray-900 text-sm">Maintenance</h4>
                  </div>
                  {dashboardTasks.maintenance.length > 0 && <span className="text-xs font-bold bg-rose-500 text-white px-2 py-0.5 rounded-full">{dashboardTasks.maintenance.length}</span>}
                </div>
                <div className="p-4 min-h-[120px] flex flex-col">
                  {dashboardTasks.maintenance.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-gray-400">All caught up!</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dashboardTasks.maintenance.slice(0, 2).map(task => (
                        <div key={task.id} className="p-2 bg-rose-50/50 rounded-lg border border-rose-100">
                          <p className="font-bold text-gray-900 text-xs truncate">{task.title}</p>
                          <div className="flex justify-between items-center mt-1">
                            <p className="text-[10px] text-gray-500 truncate">{task.property_title}</p>
                            <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold uppercase">{task.status?.replace('_', ' ')}</span>
                          </div>
                        </div>
                      ))}
                      <p className="text-[10px] text-center text-gray-400 mt-1">Click to view all →</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>


          {/* SECTION 2: AUTOMATED BILLING TRACKER */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-8 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full"></div>
                <div>
                  <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Billing Schedule</h2>
                  <p className="text-xs text-gray-500">Bills sent automatically 3 days before due date</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {billingSchedule.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  </div>
                  <p className="text-gray-500 font-medium">No active tenants to bill</p>
                  <p className="text-sm text-gray-400 mt-1">Assign tenants to properties to see billing schedule</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 text-xs uppercase text-gray-500 tracking-wider">
                        <th className="px-6 py-4 font-bold">Tenant / Property</th>
                        <th className="px-6 py-4 font-bold">Next Bill Due</th>
                        <th className="px-6 py-4 font-bold">Auto-Send Date</th>
                        <th className="px-6 py-4 font-bold">Latest Bill Status</th>
                        <th className="px-6 py-4 font-bold text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                      {billingSchedule.map((item) => {
                        const isUpcoming = item.sendDate > new Date()

                        return (
                          <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-bold text-gray-900">{item.tenantName}</p>
                              <p className="text-xs text-gray-500">{item.propertyTitle}</p>
                              {item.note && <span className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded font-bold mt-1 inline-block">{item.note}</span>}
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-mono font-medium text-gray-700">
                                {item.nextDueDate.toLocaleDateString()}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className={`font-bold ${isUpcoming ? 'text-black-600' : 'text-gray-500'}`}>
                                  {item.sendDate.toLocaleDateString()}
                                </span>
                                <span className="text-[10px] text-gray-400 uppercase tracking-wide font-bold">
                                  {isUpcoming ? 'Scheduled' : 'Passed'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-xs font-bold px-2 py-1 rounded capitalize ${item.status === 'Overdue' ? 'bg-red-100 text-red-700' :
                                item.status === 'Confirming' ? 'bg-blue-100 text-blue-700' :
                                  item.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-gray-100 text-gray-600'
                                }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {item.status === 'Contract Ending' ? (
                                <span className="text-xs text-gray-400 font-medium">Unable to Send</span>
                              ) : (
                                <button
                                  onClick={() => openAdvanceBillModal(item.tenantId, item.tenantName, item.propertyTitle)}
                                  disabled={sendingBillId === item.tenantId}
                                  className="text-xs font-bold text-white bg-black hover:bg-gray-800 px-3 py-1.5 rounded-lg transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 mx-auto"
                                >
                                  {sendingBillId === item.tenantId ? (
                                    <>
                                      <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    </>
                                  ) : 'Send Advance'}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: PROPERTIES */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-8 bg-gradient-to-b from-emerald-500 to-teal-600 rounded-full"></div>
                <div>
                  <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Your Properties</h2>
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    Manage listings, assignments, and property details
                    {refreshing && <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full animate-pulse">Updating...</span>}
                  </p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
                {/* Wrapper for animation + text */}
                <div className="flex flex-col items-center">
                  <Lottie
                    animationData={loadingAnimation}
                    loop={true}
                    className="w-64 h-64"
                  />
                  <p className="text-gray-500 font-medium text-lg mt-4">
                    Loading Properties...
                  </p>
                </div>
              </div>
            ) : properties.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-50 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No properties yet</h3>
                <p className="text-gray-500 mb-6 max-w-sm mx-auto">Start by adding your first property to manage</p>
                <button onClick={() => router.push('/properties/new')} className="px-6 py-3 bg-black text-white rounded-xl font-bold cursor-pointer hover:bg-gray-800 transition-all">
                  Add Your First Property
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {properties.map((item) => {
                  const property = item
                  const images = getPropertyImages(property)
                  const currentIndex = currentImageIndex[property.id] || 0
                  const occupancy = getPropertyOccupancy(property.id)

                  return (
                    <div
                      key={property.id}
                      className="group bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer flex flex-col"
                      onClick={() => handlePropertyAction(property.id)}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                        <img src={images[currentIndex]} alt={property.title} className="w-full h-full object-cover" />

                        {images.length > 1 && (
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                            {images.map((_, idx) => (
                              <div key={idx} className={`h-1 rounded-full transition-all duration-300 shadow-sm ${idx === currentIndex ? 'w-4 bg-white' : 'w-1 bg-white/60'}`} />
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
                            <svg
                              className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
                            </svg>{property.bedrooms}
                          </span>
                          <span className="w-px h-3 bg-gray-300"></span>
                          <span className="flex items-center gap-1 font-bold">
                            <svg
                              className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
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
                            </div>                              <button onClick={(e) => { e.stopPropagation(); router.push(`/properties/${property.id}`); }} className="text-[10px] sm:text-xs font-bold text-gray-400 hover:text-black hover:underline cursor-pointer" title="Preview">
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
          </div>

        </div>

      </div>

      {/* Confirmation Modal */}
      {confirmationModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-gray-200">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${confirmationModal.type === 'approve' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {confirmationModal.type === 'approve' ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              )}
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {confirmationModal.type === 'approve' ? 'Approve Move-Out?' : 'Reject Request?'}
            </h3>

            <p className="text-sm text-gray-500 mb-6">
              {confirmationModal.type === 'approve'
                ? 'Are you sure you want to approve this request? The contract will be ended and the property will be marked as available.'
                : 'Are you sure you want to reject this request? The tenant will remain in the property and the contract will continue.'}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmationModal({ isOpen: false, type: null, requestId: null })}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEndAction}
                className={`flex-1 px-4 py-2 text-white font-bold rounded-xl cursor-pointer shadow-lg ${confirmationModal.type === 'approve' ? 'bg-black hover:bg-gray-800' : 'bg-red-600 hover:bg-red-700'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )
      }

      {/* Assign Modal */}
      {
        showAssignModal && selectedProperty && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-gray-200">
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

              {/* Two column layout for dates */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Start Date</label>
                  <input type="date" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">End Date</label>
                  <input type="date" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} />
                </div>
              </div>

              {/* Security Deposit Info - compact */}
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

              {/* Wifi Due Day - Notification Only (No Payment Bills) */}
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
        )
      }

      {/* End Contract Confirmation Modal */}
      {
        endContractModal.isOpen && (
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
        )
      }

      {/* Renewal Confirmation Modal */}
      {
        renewalModal.isOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200">
              {/* Warning Icon */}
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 mx-auto ${renewalModal.action === 'approve' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">
                {renewalModal.action === 'approve' ? '⚠️ Approve Contract Renewal?' : 'Reject Renewal Request?'}
              </h3>

              {renewalModal.action === 'approve' ? (
                <>
                  {/* Warning Message */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                    <p className="text-sm text-amber-800 font-medium mb-2">
                      <strong>Important:</strong> Approving this renewal will:
                    </p>
                    <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
                      <li>Extend the contract end date</li>
                      <li>Send a <strong>payment bill</strong> for Rent + Advance</li>
                      <li>Notify the tenant of the signing schedule</li>
                    </ul>
                  </div>

                  {/* Tenant & Property Info */}
                  <div className="bg-gray-50 rounded-xl p-3 mb-4">
                    <p className="text-sm text-gray-600">
                      <span className="font-bold">Tenant:</span> {renewalModal.occupancy?.tenant?.first_name} {renewalModal.occupancy?.tenant?.last_name}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-bold">Property:</span> {renewalModal.occupancy?.property?.title}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-bold">Monthly Rent:</span> ₱{Number(renewalModal.occupancy?.property?.price || 0).toLocaleString()}
                    </p>
                  </div>

                  {/* Payment Summary */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 mb-4">
                    <p className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2">Renewal Payment Bill</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-indigo-700">Rent:</span>
                      <span className="font-bold text-indigo-900">₱{Number(renewalModal.occupancy?.property?.price || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-indigo-700">Advance (1 Month):</span>
                      <span className="font-bold text-indigo-900">₱{Number(renewalModal.occupancy?.property?.price || 0).toLocaleString()}</span>
                    </div>
                    <div className="border-t border-indigo-200 mt-2 pt-2 flex justify-between text-sm">
                      <span className="font-bold text-indigo-800">Total:</span>
                      <span className="font-black text-indigo-900">₱{Number((renewalModal.occupancy?.property?.price || 0) * 2).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* New Contract End Date */}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      📅 New Contract End Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      className="w-full border-2 border-gray-200 focus:border-indigo-500 rounded-xl px-4 py-3 text-sm font-medium outline-none transition-colors"
                      value={renewalEndDate}
                      onChange={(e) => setRenewalEndDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]} // Min today? Or better min > current end date?
                    />
                  </div>

                  {/* Contract Signing Date */}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      📅 Contract Signing Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      className="w-full border-2 border-gray-200 focus:border-indigo-500 rounded-xl px-4 py-3 text-sm font-medium outline-none transition-colors"
                      value={renewalSigningDate}
                      onChange={(e) => setRenewalSigningDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                    <p className="text-xs text-gray-500 mt-1">The tenant will be notified to come for contract signing on this date.</p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 mb-6 text-center">
                  Are you sure you want to reject the renewal request from <strong>{renewalModal.occupancy?.tenant?.first_name} {renewalModal.occupancy?.tenant?.last_name}</strong> for <strong>{renewalModal.occupancy?.property?.title}</strong>?
                </p>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={closeRenewalModal}
                  className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRenewalRequest}
                  className={`flex-1 px-4 py-3 text-white font-bold rounded-xl cursor-pointer shadow-lg transition-all ${renewalModal.action === 'approve' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200' : 'bg-red-600 hover:bg-red-700 shadow-red-200'}`}
                >
                  {renewalModal.action === 'approve' ? 'Approve & Send Bill' : 'Reject Request'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Email Notification Modal */}
      {
        showEmailModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-gray-200">
              {/* Header */}
              <div className="flex justify-between items-center p-6 border-b border-gray-100">
                <div>
                  <h3 className="font-black text-xl text-gray-900">📬 Send Notification</h3>
                  <p className="text-sm text-gray-500 mt-1">Email & SMS your tenants</p>
                </div>
                <button onClick={() => setShowEmailModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer text-gray-500 hover:text-black transition-colors">✕</button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto flex-1 space-y-5">
                {/* Recipient Selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    To: Recipients
                  </label>
                  <div className="relative">
                    <div
                      onClick={() => setShowTenantDropdown(!showTenantDropdown)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:border-gray-300 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {selectedTenants.length === 0 ? (
                          <span className="text-gray-400">Select tenants...</span>
                        ) : selectedTenants.length === allTenants.length ? (
                          <span className="bg-black text-white px-3 py-1 rounded-full text-xs font-bold">All Tenants ({allTenants.length})</span>
                        ) : (
                          selectedTenants.slice(0, 3).map(id => {
                            const tenant = allTenants.find(t => t.id === id)
                            return tenant ? (
                              <span key={id} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                                {tenant.name}
                                {tenant.phone_verified && <span className="text-green-500">📱</span>}
                              </span>
                            ) : null
                          })
                        )}
                        {selectedTenants.length > 3 && (
                          <span className="text-xs text-gray-500">+{selectedTenants.length - 3} more</span>
                        )}
                      </div>
                      <svg className={`w-5 h-5 text-gray-400 transition-transform ${showTenantDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {/* Dropdown */}
                    {showTenantDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-60 overflow-y-auto">
                        {/* Select All */}
                        <div
                          onClick={selectAllTenants}
                          className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 flex items-center gap-3"
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedTenants.length === allTenants.length ? 'bg-black border-black' : 'border-gray-300'}`}>
                            {selectedTenants.length === allTenants.length && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                          <span className="font-bold text-sm">Select All ({allTenants.length})</span>
                        </div>

                        {allTenants.length === 0 ? (
                          <div className="px-4 py-6 text-center text-gray-400 text-sm">
                            No active tenants found
                          </div>
                        ) : (
                          allTenants.map(tenant => (
                            <div
                              key={tenant.id}
                              onClick={() => toggleTenantSelection(tenant.id)}
                              className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-center gap-3"
                            >
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedTenants.includes(tenant.id) ? 'bg-black border-black' : 'border-gray-300'}`}>
                                {selectedTenants.includes(tenant.id) && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-sm text-gray-900">{tenant.name}</p>
                                <p className="text-xs text-gray-500">{tenant.property}</p>
                              </div>
                              {tenant.phone_verified && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  SMS
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                    <span className="text-green-500">Note:</span> = It will only send SMS to tenants with verified phone numbers.
                  </p>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Subject
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-colors"
                    placeholder="e.g. Important Notice: Scheduled Maintenance"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                </div>

                {/* Body */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Message Body
                  </label>
                  <textarea
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-colors resize-none"
                    rows={6}
                    placeholder="Write your message here..."
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                  />
                </div>

                {/* Ending/Signature */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Closing/Ending (Optional)
                  </label>
                  <textarea
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-colors resize-none"
                    rows={2}
                    placeholder="e.g. Thank you for your understanding. Please contact me if you have any questions."
                    value={emailEnding}
                    onChange={(e) => setEmailEnding(e.target.value)}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-gray-100 flex justify-between items-center">
                <p className="text-xs text-gray-500">
                  {selectedTenants.length} recipient{selectedTenants.length !== 1 ? 's' : ''} selected
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowEmailModal(false)}
                    className="px-6 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendBulkNotification}
                    disabled={sendingEmail || selectedTenants.length === 0}
                    className="px-6 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-800 cursor-pointer shadow-lg shadow-black/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {sendingEmail ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Sending...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                        Send Notification
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Advance Bill Confirmation Modal */}
      {advanceBillModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="bg-amber-50 px-6 py-4 border-b border-amber-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Confirm Send Advance Bill</h3>
                  <p className="text-xs text-gray-500">This action will send a bill immediately</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-gray-700 mb-4">
                Are you sure you want to send an advance bill to <span className="font-bold">{advanceBillModal.tenantName}</span> for property <span className="font-bold">{advanceBillModal.propertyTitle}</span>?
              </p>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-gray-500">
                    This will immediately send a rent payment notification to the tenant. The tenant will receive an email, SMS (if phone is verified), and an in-app notification.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={closeAdvanceBillModal}
                className="px-5 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-100 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSendAdvanceBill}
                className="px-5 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-800 cursor-pointer shadow-lg transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Yes, Send Bill
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div >
  )
}