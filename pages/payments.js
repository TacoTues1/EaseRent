import Lottie from "lottie-react"
import Link from 'next/link'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import loadingAnimation from "../assets/loading.json"
import StripePaymentForm from '../components/StripePaymentForm'
import { supabase } from '../lib/supabaseClient'

export default function PaymentsPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [payments, setPayments] = useState([])
  const [paymentRequests, setPaymentRequests] = useState([])
  const [properties, setProperties] = useState([])
  const [approvedApplications, setApprovedApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFormModal, setShowFormModal] = useState(false)
  const [showCashConfirmModal, setShowCashConfirmModal] = useState(false) // NEW: for cash confirmation
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedBill, setSelectedBill] = useState(null)
  const [showPaymentConfirmation, setShowPaymentConfirmation] = useState(false)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [userRole, setUserRole] = useState(null)
  const [confirmPaymentId, setConfirmPaymentId] = useState(null)
  const [cancelBillId, setCancelBillId] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [proofFile, setProofFile] = useState(null)
  const [proofPreview, setProofPreview] = useState(null)
  const [referenceNumber, setReferenceNumber] = useState('')
  const [uploadingProof, setUploadingProof] = useState(false)
  const [qrCodeFile, setQrCodeFile] = useState(null)
  const [qrCodePreview, setQrCodePreview] = useState(null)
  const [billReceiptFile, setBillReceiptFile] = useState(null)
  const [billReceiptPreview, setBillReceiptPreview] = useState(null)
  const [showBillReceiptModal, setShowBillReceiptModal] = useState(false)
  const [selectedBillReceipt, setSelectedBillReceipt] = useState(null)
  const [processingId, setProcessingId] = useState(null) // For inline actions
  const [isProcessingModal, setIsProcessingModal] = useState(false) // For modal actions
  const [paypalProcessing, setPaypalProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState('water') // Default to water since rent is automatic, wifi/electric notify tenants automatically
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingBill, setEditingBill] = useState(null)
  const [editFormData, setEditFormData] = useState({
    rent_amount: '',
    water_bill: '',
    electrical_bill: '',
    other_bills: '',
    bills_description: '',
    due_date: ''
  })
  const [customAmount, setCustomAmount] = useState('')
  const [appliedCredit, setAppliedCredit] = useState(0)
  const [monthsCovered, setMonthsCovered] = useState(1)
  const [contractEndDate, setContractEndDate] = useState(null)
  const [contractStartDate, setContractStartDate] = useState(null)
  const [monthlyRent, setMonthlyRent] = useState(0)
  const [exceedsContract, setExceedsContract] = useState(false)
  const [maxMonthsAllowed, setMaxMonthsAllowed] = useState(12)
  const [isBelowMinimum, setIsBelowMinimum] = useState(false)
  const [minimumPayment, setMinimumPayment] = useState(0)
  const [landlordAcceptedPayments, setLandlordAcceptedPayments] = useState(null) // Landlord's accepted payment methods
  const [selectedDetailBill, setSelectedDetailBill] = useState(null) // Bill selected for detail side panel
  const [chartFilter, setChartFilter] = useState('all')
  const [isFamilyMember, setIsFamilyMember] = useState(false) // Track if user is a family member
  const [primaryTenantId, setPrimaryTenantId] = useState(null) // Primary tenant ID for family members
  const [parentOccupancyId, setParentOccupancyId] = useState(null) // Parent occupancy ID for family members
  const [chartYear, setChartYear] = useState(new Date().getFullYear())
  const [formData, setFormData] = useState({
    property_id: '',
    application_id: '',
    occupancy_id: '', // NEW: Track current occupancy
    tenant: '',
    amount: '', // Rent Amount
    water_bill: '',
    electrical_bill: '',
    wifi_bill: '', // Added
    other_bills: '',
    bills_description: '',
    due_date: '', // General/Rent due date
    electrical_due_date: '',
    water_due_date: '',
    wifi_due_date: '',
    other_due_date: '',

    method: 'bank_transfer'
  })

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: null, // 'confirm_payment', 'cancel_bill', 'reject_payment'
    id: null,
    title: '',
    message: '',
    confirmText: 'Confirm',
    confirmColor: 'bg-black'
  })

  function closeConfirmModal() {
    setConfirmModal({ ...confirmModal, isOpen: false })
  }

  async function handleModalConfirm() {
    if (!confirmModal.id) return

    setIsProcessingModal(true)
    try {
      if (confirmModal.type === 'confirm_payment') {
        await executeConfirmPayment(confirmModal.id)
      } else if (confirmModal.type === 'cancel_bill') {
        await executeCancelBill(confirmModal.id)
      } else if (confirmModal.type === 'reject_payment') {
        await executeRejectPayment(confirmModal.id)
      }
      closeConfirmModal()
    } catch (e) {
      console.error(e)
    } finally {
      setIsProcessingModal(false)
    }
  }

  // Trigger functions
  function confirmPayment(requestId) {
    setConfirmModal({
      isOpen: true,
      type: 'confirm_payment',
      id: requestId,
      title: 'Confirm Payment',
      message: 'Are you sure you want to confirm this payment? This action cannot be undone and will record the payment in the system.',
      confirmText: 'Yes, Confirm',
      confirmColor: 'bg-green-600'
    })
  }

  function handleCancelBill(requestId) {
    setConfirmModal({
      isOpen: true,
      type: 'cancel_bill',
      id: requestId,
      title: 'Cancel Bill',
      message: 'Are you sure you want to cancel this bill? This action cannot be undone.',
      confirmText: 'Yes, Cancel',
      confirmColor: 'bg-red-600'
    })
  }

  function rejectPayment(requestId) {
    setConfirmModal({
      isOpen: true,
      type: 'reject_payment',
      id: requestId,
      title: 'Reject Payment',
      message: 'Are you sure you want to REJECT this payment? The tenant will be notified.',
      confirmText: 'Yes, Reject',
      confirmColor: 'bg-red-600'
    })
  }

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadUserRole(result.data.session.user.id)
      } else {
        router.push('/auth')
      }
    })
  }, [])

  function getRentMonth(dueDateString) {
    if (!dueDateString) return '-';
    const due = new Date(dueDateString);
    // Return month name and year (e.g., "February 2026")
    return due.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  async function loadUserRole(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    const role = data?.role || 'tenant'

    // If tenant, check if they are a family member (not the primary tenant)
    // IMPORTANT: We must resolve this BEFORE setting userRole, because
    // the useEffect that triggers loadPayments/loadPaymentRequests depends on userRole.
    // If we set userRole first, those functions would run before primaryTenantId is available.
    if (role === 'tenant') {
      try {
        const fmRes = await fetch(`/api/family-members?member_id=${userId}`, { cache: 'no-store' })
        const fmData = await fmRes.json()
        if (fmData?.occupancy) {
          // User is a family member — use the primary tenant's ID for payment queries
          setIsFamilyMember(true)
          setPrimaryTenantId(fmData.occupancy.tenant_id)
          setParentOccupancyId(fmData.occupancy.id)
          // Pre-load payment data from API (bypasses RLS)
          if (fmData.fullPaymentRequests) setPaymentRequests(fmData.fullPaymentRequests)
          if (fmData.paymentsHistory) setPayments(fmData.paymentsHistory)
          setLoading(false)
        }
      } catch (err) {
        console.error('Family member check on payments page:', err)
      }
    }

    // Set userRole LAST so the useEffect fires after primaryTenantId is set
    setUserRole(role)
  }

  // UPDATED: Added Realtime Subscriptions
  useEffect(() => {
    if (session && userRole) {
      // Initial Load
      loadPayments()
      loadPaymentRequests()
      if (userRole === 'landlord') {
        loadProperties()
        loadApprovedApplications()
      }

      // Realtime Subscriptions
      const channel = supabase
        .channel('payments_page_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payment_requests' },
          (payload) => {
            // Reload requests when a new bill is sent or status updates
            loadPaymentRequests()
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments' },
          (payload) => {
            // Reload stats/history when a payment is fully confirmed/recorded
            loadPayments()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [session, userRole])

  const [selectedTenantId, setSelectedTenantId] = useState('') // Matches occupancy ID or list ID

  async function loadApprovedApplications() {
    // UPDATED: Fetch from tenant_occupancies to get ALL active tenants (including manual ones)
    const { data, error } = await supabase
      .from('tenant_occupancies')
      .select(`
        *,
        property:properties(title, price),
        tenant_profile:profiles!tenant_occupancies_tenant_id_fkey(first_name, middle_name, last_name)
      `)
      .eq('landlord_id', session.user.id)
      .eq('status', 'active')

    if (error) {
      console.error('Error loading tenants:', error)
      return
    }

    // Map to a consistent structure
    const mapped = (data || []).map(occ => ({
      id: occ.id, // Occupancy ID (Unique for UI list)
      application_id: occ.application_id, // Actual Application ID (Nullable)
      property_id: occ.property_id,
      tenant: occ.tenant_id,
      property: occ.property,
      tenant_profile: occ.tenant_profile,
      price: occ.rent_amount || occ.property?.price // Prefer occupancy rent, fallback to property price
    }))

    setApprovedApplications(mapped)
  }

  async function loadPayments() {
    // Family members: use API to bypass RLS
    if (isFamilyMember && primaryTenantId) {
      try {
        const fmRes = await fetch(`/api/family-members?member_id=${session.user.id}`)
        const fmData = await fmRes.json()
        if (fmData?.paymentsHistory) {
          setPayments(fmData.paymentsHistory)
        }
      } catch (err) {
        console.error('Error loading family member payments:', err)
      }
      setLoading(false)
      return
    }

    let query = supabase
      .from('payments')
      .select('*, properties(title), profiles!payments_tenant_fkey(first_name, middle_name, last_name)')
      .order('paid_at', { ascending: false })

    if (userRole === 'tenant') {
      query = query.eq('tenant', session.user.id)
    } else if (userRole === 'landlord') {
      query = query.eq('landlord', session.user.id)
    }

    const { data } = await query
    setPayments(data || [])
    setLoading(false)
  }

  async function loadPaymentRequests() {
    // Family members: use API to bypass RLS
    if (isFamilyMember && primaryTenantId) {
      try {
        const fmRes = await fetch(`/api/family-members?member_id=${session.user.id}`)
        const fmData = await fmRes.json()
        if (fmData?.fullPaymentRequests) {
          setPaymentRequests(fmData.fullPaymentRequests)
        }
      } catch (err) {
        console.error('Error loading family member payment requests:', err)
      }
      return
    }

    let query = supabase
      .from('payment_requests')
      .select(`
        *,
        properties(title, address),
        tenant_profile:profiles!payment_requests_tenant_fkey(first_name, middle_name, last_name, phone),
        landlord_profile:profiles!payment_requests_landlord_fkey(first_name, middle_name, last_name, phone)
      `)
      .order('created_at', { ascending: false })

    if (userRole === 'tenant') {
      query = query.eq('tenant', session.user.id)
    } else if (userRole === 'landlord') {
      query = query.eq('landlord', session.user.id)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error loading payment requests:', error)
    }
    setPaymentRequests(data || [])
  }

  async function loadProperties() {
    const { data } = await supabase
      .from('properties')
      .select('id, title')
      .eq('landlord', session.user.id)

    setProperties(data || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()

    // Validate receipt
    if (!billReceiptFile) {
      showToast.warning("Please upload the bill receipt/screenshot", { duration: 4000, transition: "bounceIn" });
      return
    }

    // Determine values based on Active Tab
    // Note: Electric and Wifi bills are now sent automatically 3 days before due date
    let rent = 0, water = 0, electrical = 0, wifi = 0, other = 0;
    let finalDueDate = null;
    let billTypeLabel = '';

    // We set the specific amount and the specific due date based on the tab
    // We also set the general 'due_date' for sorting/display compatibility
    if (activeTab === 'rent') {
      rent = parseFloat(formData.amount) || 0;
      finalDueDate = formData.due_date;
      billTypeLabel = 'Rent';
    } else if (activeTab === 'water') {
      water = parseFloat(formData.water_bill) || 0;
      finalDueDate = formData.water_due_date;
      billTypeLabel = 'Water Bill';
    } else if (activeTab === 'other') {
      other = parseFloat(formData.other_bills) || 0;
      finalDueDate = formData.other_due_date;
      billTypeLabel = 'Other Bill';
    }

    const total = rent + water + other;

    try {
      // ... (Keep existing QR code upload logic here) ...
      let qrCodeUrl = null
      if (qrCodeFile) {
        // ... existing QR logic ...
        const qrFileName = `qr_${Date.now()}_${qrCodeFile.name}`
        await supabase.storage.from('payment-files').upload(qrFileName, qrCodeFile)
        const { data: qrPublic } = supabase.storage.from('payment-files').getPublicUrl(qrFileName)
        qrCodeUrl = qrPublic.publicUrl
      }

      // ... (Keep existing Receipt upload logic here) ...
      const receiptFileName = `receipt_${Date.now()}_${billReceiptFile.name}`
      await supabase.storage.from('payment-files').upload(receiptFileName, billReceiptFile)
      const { data: receiptPublic } = supabase.storage.from('payment-files').getPublicUrl(receiptFileName)
      const billReceiptUrl = receiptPublic.publicUrl

      // Insert Logic
      const { data: paymentRequest, error } = await supabase
        .from('payment_requests')
        .insert({
          property_id: formData.property_id,
          application_id: formData.application_id || null,
          occupancy_id: formData.occupancy_id || null, // Link to current occupancy
          tenant: formData.tenant,
          landlord: session.user.id,

          // Amounts
          rent_amount: rent,
          water_bill: water,
          electrical_bill: electrical,
          wifi_bill: wifi, // Make sure this column exists in your DB
          other_bills: other,

          bills_description: formData.bills_description || `No Message`,

          // Specific Due Dates
          due_date: finalDueDate ? new Date(finalDueDate).toISOString() : null, // Main sort column
          electrical_due_date: formData.electrical_due_date ? new Date(formData.electrical_due_date).toISOString() : null,
          water_due_date: formData.water_due_date ? new Date(formData.water_due_date).toISOString() : null,
          wifi_due_date: formData.wifi_due_date ? new Date(formData.wifi_due_date).toISOString() : null,
          other_due_date: formData.other_due_date ? new Date(formData.other_due_date).toISOString() : null,

          status: 'pending',
          qr_code_url: qrCodeUrl,
          bill_receipt_url: billReceiptUrl
        })
        .select()
        .single()

      if (error) throw error

      // Notification Logic
      const { data: property } = await supabase.from('properties').select('title').eq('id', formData.property_id).maybeSingle()

      await supabase.from('notifications').insert({
        recipient: formData.tenant,
        actor: session.user.id,
        type: 'payment_request',
        message: `New ${billTypeLabel} request for ${property?.title || 'property'}: ₱${total.toLocaleString()}`,
        link: '/payments',
        data: { payment_request_id: paymentRequest.id }
      })

      // Send SMS and Email notification
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment_bill',
          recordId: paymentRequest.id,
          actorId: session.user.id
        })
      }).catch(err => console.error("Notify API Error:", err))


      // Reset Form
      setFormData({
        property_id: '', application_id: '', occupancy_id: '', tenant: '',
        amount: '', water_bill: '', electrical_bill: '', wifi_bill: '', other_bills: '',
        bills_description: '',
        due_date: '', electrical_due_date: '', water_due_date: '', wifi_due_date: '', other_due_date: '',
        method: 'bank_transfer'
      })
      setQrCodeFile(null); setQrCodePreview(null);
      setBillReceiptFile(null); setBillReceiptPreview(null);
      setShowFormModal(false);
      loadPaymentRequests();

      showToast.success(`${billTypeLabel} request sent!`,{ 
        duration: 4000, 
        progress: true,
        position: "top-center",
        transition: "bounceInDown" 
      });

    } catch (error) {
      console.error('Error creating payment request:', error)
      showToast.error('Failed to send request', { 
        duration: 4000, progress: true,
        position: "top-center",
        transition: "bounceInDown" 
      });
    }
  }

  const [maxPaymentLimit, setMaxPaymentLimit] = useState(null)
  const [loadingPayBtn, setLoadingPayBtn] = useState(null)

  async function handlePayBill(request) {
    setLoadingPayBtn(request.id)
    try {
      setSelectedBill(request)

      // Fetch landlord's accepted payment methods
      try {
        const { data: landlordProfile } = await supabase
          .from('profiles')
          .select('accepted_payments')
          .eq('id', request.landlord)
          .single()
        setLandlordAcceptedPayments(landlordProfile?.accepted_payments || { cash: true })
      } catch (e) {
        console.error('Failed to fetch landlord payment methods:', e)
        setLandlordAcceptedPayments({ cash: true })
      }
      const total = (
        parseFloat(request.rent_amount || 0) +
        parseFloat(request.security_deposit_amount || 0) +
        parseFloat(request.advance_amount || 0) + // Include Advance in Total
        parseFloat(request.water_bill || 0) +
        parseFloat(request.electrical_bill || 0) +
        parseFloat(request.wifi_bill || 0) +
        parseFloat(request.other_bills || 0)
      )

      // 1. Fetch Tenant Credit (filtered by occupancy)
      let credit = 0;
      if (userRole === 'tenant') {
        if (isFamilyMember && primaryTenantId) {
          // Family members: use API to bypass RLS
          try {
            const fmRes = await fetch(`/api/family-members?member_id=${session.user.id}`, { cache: 'no-store' })
            const fmData = await fmRes.json()
            credit = parseFloat(fmData?.tenantBalance || 0)
          } catch (err) {
            console.error('Error fetching family member credit:', err)
          }
        } else {
          // Primary tenant: use direct Supabase query
          let query = supabase.from('tenant_balances').select('amount').eq('tenant_id', session.user.id);

          let targetOccupancyId = request.occupancy_id;

          if (!targetOccupancyId) {
            const { data: activeOcc } = await supabase
              .from('tenant_occupancies')
              .select('id')
              .eq('tenant_id', session.user.id)
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (activeOcc) targetOccupancyId = activeOcc.id;
          }

          if (targetOccupancyId) {
            query = query.eq('occupancy_id', targetOccupancyId);
          } else {
            query = query.is('occupancy_id', null);
          }

          const { data } = await query.maybeSingle();
          credit = parseFloat(data?.amount || 0);
        }
      }
      setAppliedCredit(credit);

      // 2. Calculate Max Payment Limit based on Contract
      let limit = Infinity;
      let rentPerMonth = parseFloat(request.rent_amount || 0);
      let endDate = null;
      let startDate = null;
      let maxMonths = 1; // Default to 1 month only

      // Try to get occupancy_id from bill, or find active occupancy for tenant
      let occupancyId = request.occupancy_id;

      if (!occupancyId && userRole === 'tenant') {
        // For family members, use parentOccupancyId; otherwise lookup from tenant_occupancies
        if (parentOccupancyId) {
          occupancyId = parentOccupancyId;
          console.log('Using parent occupancy for family member:', occupancyId);
        } else {
          const { data: activeOcc } = await supabase
            .from('tenant_occupancies')
            .select('id')
            .eq('tenant_id', session.user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activeOcc) {
            occupancyId = activeOcc.id;
            console.log('Found active occupancy:', occupancyId);
          }
        }
      }
      if (occupancyId) {
        try {
          let occupancy = null;

          if (isFamilyMember) {
            // Family members: use API to bypass RLS
            const fmRes = await fetch(`/api/family-members?member_id=${session.user.id}`)
            const fmData = await fmRes.json()
            if (fmData?.occupancy) {
              occupancy = {
                contract_end_date: fmData.occupancy.contract_end_date,
                start_date: fmData.occupancy.start_date,
                security_deposit: fmData.occupancy.security_deposit
              }
            }
          } else {
            // Primary tenant: use direct Supabase query
            const { data: occData, error: occError } = await supabase
              .from('tenant_occupancies')
              .select('contract_end_date, start_date')
              .eq('id', occupancyId)
              .single();
            occupancy = occData;
          }

          if (occupancy) {
            // Use rent from the bill request since occupancy doesn't have rent_amount
            rentPerMonth = parseFloat(request.rent_amount || 0);
            endDate = occupancy.contract_end_date ? new Date(occupancy.contract_end_date) : null;
            startDate = occupancy.start_date ? new Date(occupancy.start_date) : null;

            if (endDate && startDate) {
              const startYear = startDate.getFullYear();
              const startMonth = startDate.getMonth();
              const endYear = endDate.getFullYear();
              const endMonth = endDate.getMonth();

              const totalContractMonths = (endYear - startYear) * 12 + (endMonth - startMonth);

              const depositAmount = parseFloat(request.security_deposit_amount || occupancy?.security_deposit || 0);
              let adjustedTotalKey = totalContractMonths;

              if (rentPerMonth > 0 && depositAmount >= (rentPerMonth * 0.9)) { // Allow small difference
                adjustedTotalKey = Math.max(1, totalContractMonths - 1);
              }

              // Minimum 1 month
              maxMonths = Math.max(1, adjustedTotalKey);

              console.log('Contract calculation:', {
                startYear, startMonth, endYear, endMonth,
                totalContractMonths,
                maxMonths
              });

              // Limit cannot be negative (contract ended)
              if (endDate < new Date()) {
                maxMonths = 1;
                limit = total + parseFloat(request.security_deposit_amount || 0);
              } else {
                // Max rent payments = months * rent per month
                const maxContractValue = maxMonths * rentPerMonth;
                // Add security deposit to the limit (it's separate from rent)
                const securityDeposit = parseFloat(request.security_deposit_amount || 0);
                const utilities = (
                  parseFloat(request.water_bill || 0) +
                  parseFloat(request.electrical_bill || 0) +
                  parseFloat(request.wifi_bill || 0) +
                  parseFloat(request.other_bills || 0)
                );
                const advance = parseFloat(request.advance_amount || 0); // Include Advance
                limit = Math.max(0, maxContractValue + securityDeposit + utilities + advance - credit);
              }
            } else {
              console.error('Missing date - startDate or endDate is null',err);
            }
          } else {
            console.error('No occupancy data returned',err);
          }
        } catch (err) {
          console.error('Error fetching occupancy:', err);
        }
      }

      setMonthlyRent(rentPerMonth);
      setContractEndDate(endDate);
      setContractStartDate(startDate);
      setMaxMonthsAllowed(maxMonths);
      setMaxPaymentLimit(limit);
      setMonthsCovered(1);
      setExceedsContract(false);

      // Set minimum payment (total bill minus credit)
      let toPay = Math.max(0, total - credit);

      if (request.advance_amount && parseFloat(request.advance_amount) > 0) { 
        toPay = Math.max(0, total - credit);
      }

      setMinimumPayment(toPay);
      setIsBelowMinimum(false);

      setCustomAmount(Math.min(toPay, limit === Infinity ? toPay : limit).toFixed(2));

      setShowPaymentModal(true)
    } finally {
      setLoadingPayBtn(null)
    }
  }

  // Recalculate months covered when key values change (fixes React state timing issues)
  useEffect(() => {
    if (showPaymentModal && selectedBill && customAmount && monthlyRent > 0 && maxMonthsAllowed > 0) {
      const amountNum = parseFloat(customAmount) || 0;
      const currentBillRent = parseFloat(selectedBill.rent_amount || 0);
      const securityDeposit = parseFloat(selectedBill.security_deposit_amount || 0);
      const utilities = (
        parseFloat(selectedBill.water_bill || 0) +
        parseFloat(selectedBill.electrical_bill || 0) +
        parseFloat(selectedBill.wifi_bill || 0) +
        parseFloat(selectedBill.other_bills || 0)
      );

      const oneTimeCharges = securityDeposit + utilities;

      const rentPortion = Math.max(0, amountNum - oneTimeCharges);


      const rentForCalc = currentBillRent > 0 ? currentBillRent : monthlyRent;
      const monthsCoveredByRent = rentForCalc > 0 ? Math.ceil(rentPortion / rentForCalc) : 1;

      // Minimum 1 month if paying anything
      const totalMonths = Math.max(1, monthsCoveredByRent);

      // Check if rent portion exceeds what contract allows
      const maxRentAllowed = maxMonthsAllowed * rentForCalc;
      const exceeds = rentPortion > maxRentAllowed;

      console.log('useEffect calculation:', {
        amountNum,
        oneTimeCharges,
        rentPortion,
        rentForCalc,
        monthsCoveredByRent,
        totalMonths,
        maxMonthsAllowed,
        maxRentAllowed,
        exceeds
      });

      setExceedsContract(exceeds);
      setMonthsCovered(totalMonths);
    }
  }, [showPaymentModal, maxMonthsAllowed, monthlyRent, customAmount, selectedBill, appliedCredit]);

  // Calculate how many months an amount covers
  function calculateMonthsCovered(amount) {
    if (!selectedBill || monthlyRent <= 0) {
      setMonthsCovered(1);
      setExceedsContract(false);
      setIsBelowMinimum(false);
      return 1;
    }

    const amountNum = parseFloat(amount) || 0;

    const currentBillRent = parseFloat(selectedBill.rent_amount || 0);
    const securityDeposit = parseFloat(selectedBill.security_deposit_amount || 0);
    const utilities = (
      parseFloat(selectedBill.water_bill || 0) +
      parseFloat(selectedBill.electrical_bill || 0) +
      parseFloat(selectedBill.wifi_bill || 0) +
      parseFloat(selectedBill.other_bills || 0)
    );

    // Total bill = rent + deposit + utilities + advance
    const currentBillTotal = (
      currentBillRent +
      securityDeposit +
      utilities +
      parseFloat(selectedBill.advance_amount || 0)
    );

    // Calculate minimum payment (bill total minus applied credit)
    const minPayment = Math.max(0, currentBillTotal - appliedCredit);
    setMinimumPayment(minPayment);

    // Check if payment is below minimum
    if (amountNum < minPayment || (amountNum === 0 && minPayment > 0)) {
      setIsBelowMinimum(true);
      setMonthsCovered(1);
      setExceedsContract(false);
      return 1;
    }
    setIsBelowMinimum(false);

    const oneTimeCharges = securityDeposit + utilities;

    const rentPortion = Math.max(0, amountNum - oneTimeCharges);

    // How many months of rent does this cover?
    const rentForCalc = currentBillRent > 0 ? currentBillRent : monthlyRent;
    const monthsCoveredByRent = rentForCalc > 0 ? Math.ceil(rentPortion / rentForCalc) : 1;
    const totalMonths = Math.max(1, monthsCoveredByRent);

    // Check if rent portion exceeds what contract allows
    const maxRentAllowed = maxMonthsAllowed * rentForCalc;
    const exceeds = rentPortion > maxRentAllowed;

    setExceedsContract(exceeds);
    setMonthsCovered(totalMonths);

    return totalMonths;
  }

  // Handle custom amount change
  function handleCustomAmountChange(value) {
    setCustomAmount(value);
    calculateMonthsCovered(value);
  }

  async function submitPayment() {
    if (!selectedBill) return

    // Pre-validation
    const paymentAmount = parseFloat(customAmount) || 0;
    const totalBillAmount = (
      parseFloat(selectedBill.rent_amount || 0) +
      parseFloat(selectedBill.security_deposit_amount || 0) +
      parseFloat(selectedBill.advance_amount || 0) +
      parseFloat(selectedBill.water_bill || 0) +
      parseFloat(selectedBill.electrical_bill || 0) +
      parseFloat(selectedBill.wifi_bill || 0) +
      parseFloat(selectedBill.other_bills || 0)
    ) - appliedCredit;

    if (paymentAmount <= 0) {
      showToast.error('Please enter a valid payment amount greater than ₱0.', { duration: 4000 });
      return;
    }

    if (paymentAmount < totalBillAmount) {
      showToast.error(`Payment must be at least ₱${totalBillAmount.toLocaleString()}. Partial payments are not allowed.`, { duration: 4000 });
      return;
    }

    if (exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && paymentAmount > maxPaymentLimit)) {
      showToast.error(`Payment exceeds contract period. Maximum allowed is ${maxMonthsAllowed} month${maxMonthsAllowed > 1 ? 's' : ''} (₱${maxPaymentLimit?.toLocaleString() || 0}).`, { duration: 4000 });
      return;
    }

    if (paymentMethod === 'qr_code') {
      if (!referenceNumber.trim() && !proofFile) {
        showToast.error('Please enter reference number or upload payment proof', { duration: 4000 });
        return;
      }
    }

    // Decision: Modal for Cash, Direct for other methods (QR is manual but usually considered direct submission + proof)
    if (paymentMethod === 'cash') {
      setShowCashConfirmModal(true); // Open modal
    } else {
      executePaymentSubmission(); // Proceed immediately
    }
  }

  // Extracted helper for actual submission
  async function executePaymentSubmission() {
    setShowCashConfirmModal(false); // Close if open
    setUploadingProof(true);

    try {
      let proofUrl = null;

      if (proofFile) {
        const proofFileName = `proof_${Date.now()}_${proofFile.name}`;
        const { data: proofUpload, error: proofError } = await supabase.storage
          .from('payment-files')
          .upload(proofFileName, proofFile);

        if (proofError) throw proofError;

        const { data: proofPublic } = supabase.storage
          .from('payment-files')
          .getPublicUrl(proofFileName);
        proofUrl = proofPublic.publicUrl;
      }

      const isMoveIn = selectedBill.is_move_in_payment;
      const oneTimeCharges = (
        parseFloat(selectedBill.security_deposit_amount || 0) +
        parseFloat(selectedBill.water_bill || 0) +
        parseFloat(selectedBill.electrical_bill || 0) +
        parseFloat(selectedBill.other_bills || 0) +
        (isMoveIn ? parseFloat(selectedBill.advance_amount || 0) : 0)
      );
      const firstMonthRent = parseFloat(selectedBill.rent_amount || 0);
      const amountPaid = parseFloat(customAmount) + appliedCredit;
      const rentPortion = Math.max(0, amountPaid - oneTimeCharges);
      const advancePaymentAmount = isMoveIn ? parseFloat(selectedBill.advance_amount || 0) : Math.max(0, rentPortion - firstMonthRent);

      // Update payment request status
      if (isFamilyMember) {
        // Family members: use API to bypass RLS
        const fmPayRes = await fetch('/api/payments/family-pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberId: session.user.id,
            paymentRequestId: selectedBill.id,
            status: 'pending_confirmation',
            paymentMethod,
            proofUrl,
            referenceNumber: referenceNumber.trim() || null,
            advanceAmount: advancePaymentAmount,
            amountPaid,
            paidAt: new Date().toISOString()
          })
        });
        const fmPayData = await fmPayRes.json();
        if (!fmPayRes.ok) throw new Error(fmPayData.error || 'Payment submission failed');
      } else {
        // Primary tenant: use direct Supabase query
        const { error } = await supabase
          .from('payment_requests')
          .update({
            status: 'pending_confirmation',
            paid_at: new Date().toISOString(),
            payment_method: paymentMethod,
            tenant_proof_url: proofUrl,
            tenant_reference_number: referenceNumber.trim() || null,
            advance_amount: advancePaymentAmount,
            amount_paid: amountPaid
          })
          .eq('id', selectedBill.id);

        if (error) throw error;
      }

      // Notify Landlord
      const totalPaid = parseFloat(customAmount);
      const monthsText = monthsCovered > 1 ? ` (${monthsCovered} months advance)` : '';

      // Get the payer's name for notifications
      const { data: payerProfile } = await supabase.from('profiles').select('first_name, last_name').eq('id', session.user.id).single();
      const payerName = `${payerProfile?.first_name || ''} ${payerProfile?.last_name || ''}`.trim() || 'Tenant';
      const payerLabel = isFamilyMember ? `Family member ${payerName}` : 'Tenant';

      await supabase.from('notifications').insert({
        recipient: selectedBill.landlord,
        actor: session.user.id,
        type: 'payment_confirmation_needed',
        message: `${payerLabel} paid ₱${totalPaid.toLocaleString()} for ${selectedBill.properties?.title || 'property'} via ${paymentMethod === 'qr_code' ? 'QR Code' : 'Cash'}${monthsText}. Please confirm payment receipt.`,
        link: '/payments',
        data: { payment_request_id: selectedBill.id }
      });

      // Notify Primary Tenant (mother) if a family member paid
      if (isFamilyMember && primaryTenantId) {
        await supabase.from('notifications').insert({
          recipient: primaryTenantId,
          actor: session.user.id,
          type: 'family_payment',
          message: `Your family member ${payerName} paid ₱${totalPaid.toLocaleString()} for ${selectedBill.properties?.title || 'property'} via ${paymentMethod === 'qr_code' ? 'QR Code' : 'Cash'}${monthsText}.`,
          link: '/payments',
          data: { payment_request_id: selectedBill.id }
        });
      }

      // API Notification (Email/SMS)
      try {
        const { data: landlordProfile } = await supabase.from('profiles').select('first_name, last_name, phone').eq('id', selectedBill.landlord).single();
        const { data: landlordEmail } = await supabase.rpc('get_user_email', { user_id: selectedBill.landlord });

        if (landlordEmail || landlordProfile?.phone) {
          fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'cash_payment',
              landlordEmail,
              landlordPhone: landlordProfile?.phone,
              landlordName: landlordProfile?.first_name || 'Landlord',
              tenantName: payerLabel,
              propertyTitle: selectedBill.properties?.title || 'property',
              amount: totalPaid,
              monthsCovered,
              paymentMethod
            })
          }).catch(err => console.error('Notification failed:', err));
        }

        // Email/SMS to mother if family member paid
        if (isFamilyMember && primaryTenantId) {
          const { data: motherProfile } = await supabase.from('profiles').select('first_name, last_name, phone').eq('id', primaryTenantId).single();
          const { data: motherEmail } = await supabase.rpc('get_user_email', { user_id: primaryTenantId });

          if (motherEmail || motherProfile?.phone) {
            fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'family_payment',
                recipientEmail: motherEmail,
                recipientPhone: motherProfile?.phone,
                recipientName: motherProfile?.first_name || 'Tenant',
                familyMemberName: payerName,
                propertyTitle: selectedBill.properties?.title || 'property',
                amount: totalPaid,
                paymentMethod
              })
            }).catch(err => console.error('Mother notification failed:', err));
          }
        }
      } catch (notifyErr) { console.error('Notify Error:', notifyErr); }

      // Show confirmation animation
      setShowPaymentConfirmation(true);
      setPaymentConfirmed(false);
      // After 3 seconds, mark confirmed
      setTimeout(() => {
        setPaymentConfirmed(true);
      }, 3000);
      // After 5.5 seconds total, close everything
      setTimeout(() => {
        setShowPaymentConfirmation(false);
        setPaymentConfirmed(false);
        setShowPaymentModal(false);
        setSelectedBill(null);
        setPaymentMethod('cash');
        setProofFile(null);
        setProofPreview(null);
        setReferenceNumber('');
        loadPaymentRequests();
        showToast.success('Payment submitted! Waiting for landlord confirmation.', { duration: 4000, progress: true, position: "top-center", transition: "bounceIn", icon: '', sound: true });
      }, 5500);

    } catch (error) {
      console.error('Payment error:', error);
      showToast.error('Payment failed. Please try again.', { duration: 4000 });
    } finally {
      setUploadingProof(false);
    }
  }

  async function handleCreditPayment() {
    try {
      const res = await fetch('/api/payments/pay-with-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentRequestId: selectedBill.id, tenantId: primaryTenantId || session.user.id })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');

      // Get payer's name for notifications
      const { data: payerProfile } = await supabase.from('profiles').select('first_name, last_name').eq('id', session.user.id).single();
      const payerName = `${payerProfile?.first_name || ''} ${payerProfile?.last_name || ''}`.trim() || 'Tenant';
      const payerLabel = isFamilyMember ? `Family member ${payerName}` : 'Tenant';

      // Notify landlord
      await supabase.from('notifications').insert({
        recipient: selectedBill.landlord,
        actor: session.user.id,
        type: 'payment_confirmation_needed',
        message: `${payerLabel} paid for ${selectedBill.properties?.title || 'property'} using Credit Balance.`,
        link: '/payments',
        data: { payment_request_id: selectedBill.id }
      })

      // Notify Primary Tenant (mother) if a family member paid
      if (isFamilyMember && primaryTenantId) {
        await supabase.from('notifications').insert({
          recipient: primaryTenantId,
          actor: session.user.id,
          type: 'family_payment',
          message: `Your family member ${payerName} paid for ${selectedBill.properties?.title || 'property'} using Credit Balance.`,
          link: '/payments',
          data: { payment_request_id: selectedBill.id }
        })
      }

      // Show confirmation animation
      setShowPaymentConfirmation(true);
      setPaymentConfirmed(false);
      setTimeout(() => {
        setPaymentConfirmed(true);
      }, 3000);
      setTimeout(() => {
        setShowPaymentConfirmation(false);
        setPaymentConfirmed(false);
        setShowPaymentModal(false);
        setSelectedBill(null);
        loadPaymentRequests();
        showToast.success('Paid successfully using credit balance!', { duration: 4000, transition: "bounceIn" });
      }, 5500);
    } catch (err) {
      console.error(err);
      showToast.error(err.message, { duration: 4000 });
    }
  }

  // (PayMongo and Stripe success handlers defined below after useEffect)

  // Handle PayMongo Success Return (page reload / redirect recovery)
  useEffect(() => {
    // 1. Check if URL has paymongo_success param (redirect-based)
    const query = new URLSearchParams(window.location.search);
    if (query.get('paymongo_success') === 'true') {
      const requestId = query.get('payment_request_id');
      const storedSessionId = localStorage.getItem(`paymongo_session_${requestId}`);

      if (requestId && storedSessionId) {
        // Clear URL params to prevent re-triggering
        window.history.replaceState({}, document.title, window.location.pathname);
        localStorage.removeItem(`paymongo_session_${requestId}`);

        handlePayMongoSuccess(requestId, storedSessionId);
      }
      return;
    }

    // 2. Check if there are any pending PayMongo sessions stored in localStorage
    //    (recovery after the user closed the tab or navigated away while polling)
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('paymongo_session_'));
      for (const key of keys) {
        const requestId = key.replace('paymongo_session_', '');
        const storedSessionId = localStorage.getItem(key);
        if (requestId && storedSessionId) {
          fetch('/api/payments/process-paymongo-success', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentRequestId: requestId, sessionId: storedSessionId })
          })
            .then(r => r.json().then(d => ({ ok: r.ok, status: r.status, data: d })))
            .then(({ ok, status, data }) => {
              if (ok) {
                // Payment was verified — clean up and notify
                localStorage.removeItem(key);
                showToast.success('A pending PayMongo payment was verified!', { duration: 5000, icon: '🎉' });
                loadPaymentRequests();
              } else if (data.expired || (data.error || '').includes('expired') || (data.error || '').includes('No such link') || (data.error || '').includes('not found')) {
                localStorage.removeItem(key);
              } else {
                // Payment not yet completed (400) — leave in localStorage for next visit
                console.log('PayMongo session not yet paid, will retry later:', requestId);
              }
            })
            .catch(err => {
              console.error('Silent PayMongo verification error:', err);
            });
        }
      }
    } catch (e) {
      console.error('Error checking pending PayMongo sessions:', e);
    }
  }, []);

  async function handlePayMongoSuccess(requestId, sessionId) {
    showToast.info('Verifying PayMongo payment...', { duration: 3000 });
    try {
      const res = await fetch('/api/payments/process-paymongo-success', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentRequestId: requestId, sessionId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');

      // Clean up localStorage on success
      localStorage.removeItem(`paymongo_session_${requestId}`);

      showToast.success('Payment verified and processed!', { duration: 5000, icon: '🎉' });
      loadPaymentRequests();

    } catch (error) {
      console.error('PayMongo verification error:', error);
      showToast.error('Payment verification failed: ' + error.message);
      throw error; // Re-throw so callers can handle
    }
  }

  async function handleStripeSuccess(paymentIntent) {
    try {
      // Call backend to process payment and handle balances
      const res = await fetch('/api/payments/process-stripe-success', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentRequestId: selectedBill.id,
          paymentIntentId: paymentIntent.id
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to process payment')
      }

      // Notify landlord
      const amountPaid = paymentIntent.amount / 100;

      await supabase.from('notifications').insert({
        recipient: selectedBill.landlord,
        actor: session.user.id,
        type: 'payment_confirmation_needed',
        message: `Tenant paid ₱${amountPaid.toLocaleString()} for ${selectedBill.properties?.title || 'property'} via Stripe (Transaction: ${paymentIntent.id}). Please confirm payment receipt.`,
        link: '/payments',
        data: { payment_request_id: selectedBill.id }
      })

      setShowPaymentModal(false)
      setSelectedBill(null)
      setPaymentMethod('cash')
      loadPaymentRequests()

      let successMsg = 'Stripe payment successful!';
      let successMsg2 = 'Waiting for landlord confirmation.';
      if (data.excessAmount > 0) {
        successMsg += ` Excess of ₱${data.excessAmount.toLocaleString()} added to your credit.`;
      }

      showToast.success(successMsg, {
        duration: 5000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
      showToast.success(successMsg2, {
        duration: 5000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    } catch (error) {
      console.error('Stripe Success Handler Error:', error)
      showToast.error('Payment processed but updating status failed. Please contact support.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    }
  }

  // Helper to silently check status during polling
  async function checkPaymentStatus(requestId, sessionId) {
    try {
      const res = await fetch('/api/payments/process-paymongo-success', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentRequestId: requestId, sessionId })
      });
      // If the API returns OK (200), it means payment is verified/processed
      if (res.ok) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  async function handlePayMongoPayment() {
    // 1. Basic validation
    if (!selectedBill || !customAmount) {
      showToast.error("Invalid bill or amount.", { duration: 3000 });
      return;
    }

    setUploadingProof(true);

    // 2. Open a NEW TAB immediately to avoid popup blockers
    const paymentWindow = window.open('', '_blank');

    if (!paymentWindow) {
      showToast.error("Popup blocked! Please allow popups for this site.", { duration: 4000 });
      setUploadingProof(false);
      return;
    }

    // Show loading in the new tab
    paymentWindow.document.write(`
      <html><head><title>Secure Payment</title></head>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f9fafb;">
        <div style="text-align:center"><h3>Initializing Secure Payment...</h3><p>Please wait.</p></div>
      </body></html>
    `);

    try {
      showToast.info('Initializing secure payment...', { duration: 2000 });

      // Build allowed methods based on landlord's accepted payment methods
      const allowedMethods = ['card', 'qrph', 'grab_pay']; // Always available
      if (landlordAcceptedPayments?.gcash) allowedMethods.push('gcash');
      if (landlordAcceptedPayments?.maya) allowedMethods.push('paymaya');

      // 3. Call API to create checkout session
      const res = await fetch('/api/payments/create-paymongo-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(customAmount),
          description: `Payment for ${selectedBill.properties?.title || 'Property'}`,
          remarks: `Payment Request ID: ${selectedBill.id}`,
          paymentRequestId: selectedBill.id,
          allowedMethods,
          landlordId: selectedBill.landlord,
          payerId: session.user.id
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to connect to payment gateway');

      if (data.checkoutUrl) {
        const billId = selectedBill.id;
        const sessionId = data.checkoutSessionId;
        localStorage.setItem(`paymongo_session_${billId}`, sessionId);
        console.log('Stored PayMongo session:', `paymongo_session_${billId}`, '=', sessionId);

        // Redirect the new tab to PayMongo
        paymentWindow.location.href = data.checkoutUrl;

        showToast.info('Payment tab opened. Waiting for confirmation...', { duration: 5000, position: "top-center" });

        // START POLLING: Check status every 5 seconds
        let attempts = 0;
        const maxAttempts = 60;
        let pollingStopped = false;

        const pollInterval = setInterval(async () => {
          if (pollingStopped) return;
          attempts++;

          const isSuccess = await checkPaymentStatus(billId, sessionId);

          if (isSuccess) {
            pollingStopped = true;
            clearInterval(pollInterval);
            localStorage.removeItem(`paymongo_session_${billId}`);
            try { if (paymentWindow && !paymentWindow.closed) paymentWindow.close(); } catch (e) { }
            showToast.success('Payment verified! Funds will be sent to landlord automatically.', { duration: 5000, icon: '🎉' });
            loadPaymentRequests();
            setShowPaymentModal(false);
            setSelectedBill(null);
            setPaymentMethod('cash');
            setUploadingProof(false);
            return;
          }
          else if (attempts >= maxAttempts) {
            pollingStopped = true;
            clearInterval(pollInterval);
            setUploadingProof(false);
            showToast.warning('Automatic verification timed out. The system will retry when you revisit this page, or check "View History".', { duration: 6000 });
            return;
          }

          try {
            if (paymentWindow && paymentWindow.closed && attempts > 2) {
              // User closed the payment tab — cancel the redirecting state
              pollingStopped = true;
              clearInterval(pollInterval);
              setUploadingProof(false);
              showToast.warning('Payment tab was closed. Payment cancelled.', { duration: 4000 });
            }
          } catch (e) { }

        }, 5000);

      } else {
        paymentWindow.close();
        throw new Error("Payment server did not return a valid URL.");
      }

    } catch (error) {
      if (paymentWindow) try { paymentWindow.close(); } catch (e) { }
      console.error('PayMongo Error:', error);
      showToast.error(error.message || 'Payment initiation failed', { duration: 4000 });
      setUploadingProof(false);
    }
  }

  async function executeConfirmPayment(requestId) {
    setConfirmPaymentId(null)
    const request = paymentRequests.find(r => r.id === requestId)
    if (!request) return

    showToast.info("Confirming payment...", {
      duration: 2000,
      progress: true,
      position: "top-center",
      transition: "bounceIn",
      icon: '',
      sound: true,
    });

    try {
      // Get occupancy info for advance payment calculation
      let monthlyRent = parseFloat(request.rent_amount || 0);
      let contractEndDate = null;

      if (request.occupancy_id) {
        const { data: occupancy } = await supabase
          .from('tenant_occupancies')
          .select('contract_end_date, rent_amount, start_date')
          .eq('id', request.occupancy_id)
          .single();

        if (occupancy) {
          monthlyRent = parseFloat(occupancy.rent_amount || request.rent_amount || 0);
          contractEndDate = occupancy.contract_end_date ? new Date(occupancy.contract_end_date) : null;
        }
      }

      // Calculate total amount paid by tenant
      const billTotal = (
        parseFloat(request.rent_amount || 0) +
        parseFloat(request.security_deposit_amount || 0) +
        parseFloat(request.advance_amount || 0) +
        parseFloat(request.water_bill || 0) +
        parseFloat(request.electrical_bill || 0) +
        parseFloat(request.other_bills || 0)
      );

      // Calculate how many months this payment covers
      // For renewal payments: rent_amount (1 month) + advance_amount (1 month) = 2 months total
      // The original bill covers month 1, extraMonths creates additional "paid" bills for month 2+
      // IMPORTANT: Skip for move-in payments! Move-in advance is a deposit, not a prepayment for future months.
      let extraMonths = 0;
      if (monthlyRent > 0 && !request.is_move_in_payment) {
        // If there's an advance_amount field, calculate additional months from that
        // For renewals: advance_amount = 1 month rent, so extraMonths = 1
        const advanceAmount = parseFloat(request.advance_amount || 0);
        if (advanceAmount > 0) {
          extraMonths = Math.floor(advanceAmount / monthlyRent);
        }
      }

      // Create payment record for the original bill
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          property_id: request.property_id,
          application_id: request.application_id,
          tenant: request.tenant,
          landlord: session.user.id,
          amount: billTotal, // Record the TOTAL amount paid (Rent + Advance + Utilities + etc)
          water_bill: request.water_bill,
          electrical_bill: request.electrical_bill,
          other_bills: request.other_bills,
          bills_description: request.bills_description,
          method: request.payment_method || 'cash',
          status: 'recorded',
          due_date: request.due_date,
          currency: 'PHP'
        })
        .select()
        .single()

      if (paymentError) throw paymentError

      // For renewal payments, calculate and update the correct due_date (next due date, not contract end date)
      let actualNextDueDate = request.due_date;

      if (request.is_renewal_payment && request.occupancy_id) {
        // Find the actual next due date from the last paid bill (excluding this renewal payment)
        // We need to find bills that were paid BEFORE this renewal
        const { data: lastPaidBill } = await supabase
          .from('payment_requests')
          .select('due_date, rent_amount, advance_amount')
          .eq('tenant', request.tenant)
          .eq('occupancy_id', request.occupancy_id)
          .in('status', ['paid', 'pending_confirmation'])
          .neq('id', requestId) // Exclude the current renewal payment
          .gt('rent_amount', 0)
          .order('due_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastPaidBill && lastPaidBill.due_date) {
          // Calculate next due date from last paid bill
          const lastDue = new Date(lastPaidBill.due_date);
          const rentAmount = parseFloat(lastPaidBill.rent_amount || 0);
          const advanceAmount = parseFloat(lastPaidBill.advance_amount || 0);

          let monthsFromLast = 1;
          if (rentAmount > 0 && advanceAmount > 0) {
            monthsFromLast = 1 + Math.floor(advanceAmount / rentAmount);
          }

          // Calculate the actual next due date
          const currentMonth = lastDue.getMonth();
          const currentYear = lastDue.getFullYear();
          const currentDay = lastDue.getDate();

          const targetMonth = currentMonth + monthsFromLast;
          const targetYear = currentYear + Math.floor(targetMonth / 12);
          let finalMonth = targetMonth % 12;
          if (finalMonth < 0) finalMonth += 12;

          actualNextDueDate = new Date(targetYear, finalMonth, currentDay).toISOString();

          console.log('Renewal payment: Calculated actual next due date:', {
            lastPaidBillDue: lastPaidBill.due_date,
            monthsFromLast,
            calculatedNextDue: actualNextDueDate,
            renewalBillOriginalDue: request.due_date
          });
        } else {
          // If no previous paid bills, calculate from occupancy start_date + 1 month
          // This ensures we don't use the contract end date
          const { data: occupancy } = await supabase
            .from('tenant_occupancies')
            .select('start_date')
            .eq('id', request.occupancy_id)
            .single();

          if (occupancy && occupancy.start_date) {
            // Calculate next due date from start_date (add 1 month)
            const startDate = new Date(occupancy.start_date);
            const currentMonth = startDate.getMonth();
            const currentYear = startDate.getFullYear();
            const currentDay = startDate.getDate();

            const targetMonth = currentMonth + 1;
            const targetYear = currentYear + Math.floor(targetMonth / 12);
            let finalMonth = targetMonth % 12;
            if (finalMonth < 0) finalMonth += 12;

            actualNextDueDate = new Date(targetYear, finalMonth, currentDay).toISOString();
            console.log('Renewal payment: Calculated from occupancy start_date + 1 month:', actualNextDueDate);
          } else {
            // Fallback: if renewal bill's due_date looks like contract end date, calculate from it backwards
            // But this shouldn't happen in normal flow
            console.warn('Renewal payment: No last paid bill and no start_date, using renewal bill due_date as-is');
          }
        }
      }

      // Update payment request status to paid and correct due_date if needed
      // CRITICAL: For renewal payments, update due_date to actual next due date (not contract end date)
      const updateData = {
        status: 'paid',
        payment_id: payment.id
      };

      // Only update due_date if it's different (for renewal payments)
      if (request.is_renewal_payment && actualNextDueDate !== request.due_date) {
        updateData.due_date = actualNextDueDate;
        console.log(`🔄 Updating renewal payment due_date from ${request.due_date} to ${actualNextDueDate}`);
      }

      const { error: updateError } = await supabase
        .from('payment_requests')
        .update(updateData)
        .eq('id', requestId);

      if (updateError) {
        console.error('Error updating payment request:', updateError);
      } else if (request.is_renewal_payment && actualNextDueDate !== request.due_date) {
        console.log('✅ Successfully updated renewal payment due_date');
      }

      // Handle advance payment - create and mark future months as paid
      // Use the actualNextDueDate we calculated above (for renewals) or request.due_date (for regular payments)
      if (extraMonths > 0 && request.occupancy_id && actualNextDueDate) {
        const baseDueDate = new Date(actualNextDueDate);

        for (let i = 1; i <= extraMonths; i++) {
          const futureDueDate = new Date(baseDueDate);
          const currentMonth = futureDueDate.getMonth();
          const currentYear = futureDueDate.getFullYear();
          const currentDay = futureDueDate.getDate();

          // Calculate target month and year
          const targetMonth = currentMonth + i;
          const targetYear = currentYear + Math.floor(targetMonth / 12);
          let finalMonth = targetMonth % 12;
          if (finalMonth < 0) finalMonth += 12;

          // Set the new date
          futureDueDate.setFullYear(targetYear);
          futureDueDate.setMonth(finalMonth);
          futureDueDate.setDate(currentDay);

          // Check if this would exceed contract end date
          if (contractEndDate && futureDueDate > contractEndDate) {
            break; // Don't create bills beyond contract end
          }

          // Create a new payment_request for this advance month - status is PAID
          const { error: advanceBillError } = await supabase
            .from('payment_requests')
            .insert({
              landlord: session.user.id,
              tenant: request.tenant,
              property_id: request.property_id,
              occupancy_id: request.occupancy_id,
              rent_amount: monthlyRent,
              water_bill: 0,
              electrical_bill: 0,
              other_bills: 0,
              bills_description: `Advance Payment (Month ${i + 1} of ${extraMonths + 1})`,
              due_date: futureDueDate.toISOString(),
              status: 'paid', // Mark as PAID immediately since it's covered by the advance payment
              paid_at: new Date().toISOString(),
              payment_method: request.payment_method || 'cash',
              is_advance_payment: true, // Mark as advance payment
              payment_id: payment.id, // Link to the same payment record
              tenant_reference_number: request.tenant_reference_number // Pass down reference number
            })
            .select()
            .single();

          if (advanceBillError) {
            console.error('Advance bill creation error:', advanceBillError);
          }
        }
      }

      // Calculate remaining credit
      // For renewal payments with advance_amount: the advance is consumed immediately to create paid bills
      // The advance amount should NEVER go to credit balance - it's already used for future months
      const totalPaidByTenant = parseFloat(request.amount_paid || 0);

      if (totalPaidByTenant > 0) {
        const billOwed = (
          parseFloat(request.rent_amount || 0) +
          parseFloat(request.security_deposit_amount || 0) +
          parseFloat(request.advance_amount || 0) + // Advance is part of the bill owed and consumed immediately
          parseFloat(request.water_bill || 0) +
          parseFloat(request.electrical_bill || 0) +
          parseFloat(request.wifi_bill || 0) +
          parseFloat(request.other_bills || 0)
        );

        // Calculate remaining credit (excess payment beyond what was billed)
        const remainingCredit = totalPaidByTenant - billOwed;

        // For renewal payments: advance_amount is consumed to create paid bills for future months
        // Do NOT add ANY amount to credit balance for renewal payments, even if there's excess
        // The advance is meant to be fully consumed, not stored as credit
        if (request.is_renewal_payment) {
          // For renewal payments, the advance_amount is already consumed by creating paid bills above
          // Do not add to credit balance - the advance covers future months and is fully consumed

          // CRITICAL: Also REMOVE any credit that might have been incorrectly added for this renewal
          // This fixes cases where credit was added before this fix was applied
          if (request.occupancy_id) {
            const { data: existingBalance } = await supabase
              .from('tenant_balances')
              .select('amount')
              .eq('tenant_id', request.tenant)
              .eq('occupancy_id', request.occupancy_id)
              .maybeSingle();

            if (existingBalance && existingBalance.amount > 0) {
              // Check if the credit amount matches the advance amount (likely incorrectly added)
              const advanceAmount = parseFloat(request.advance_amount || 0);
              if (Math.abs(existingBalance.amount - advanceAmount) < 1) {
                // Credit matches advance amount - remove it
                console.log(`⚠️ Removing incorrectly added credit (₱${existingBalance.amount.toLocaleString()}) for renewal payment`);
                await supabase
                  .from('tenant_balances')
                  .update({
                    amount: 0,
                    last_updated: new Date().toISOString()
                  })
                  .eq('tenant_id', request.tenant)
                  .eq('occupancy_id', request.occupancy_id);
              } else {
                // Credit doesn't match - might be from other payments, reduce by advance amount
                const newBalance = Math.max(0, existingBalance.amount - advanceAmount);
                console.log(`⚠️ Reducing credit balance by advance amount: ₱${existingBalance.amount.toLocaleString()} - ₱${advanceAmount.toLocaleString()} = ₱${newBalance.toLocaleString()}`);
                await supabase
                  .from('tenant_balances')
                  .update({
                    amount: newBalance,
                    last_updated: new Date().toISOString()
                  })
                  .eq('tenant_id', request.tenant)
                  .eq('occupancy_id', request.occupancy_id);
              }
            }
          }

          if (remainingCredit > 0) {
            console.log(`Renewal payment: ₱${remainingCredit.toLocaleString()} excess will not be added to credit. Advance amount (₱${parseFloat(request.advance_amount || 0).toLocaleString()}) is consumed for future months.`);
          } else {
            console.log(`Renewal payment: Advance amount (₱${parseFloat(request.advance_amount || 0).toLocaleString()}) consumed for future months, no credit added.`);
          }
        } else if (remainingCredit > 0 && request.occupancy_id) {
          // For non-renewal payments, only add excess to credit balance
          // (Regular payments don't have advance_amount, so this is just excess payment)
          const { data: existingBalance } = await supabase
            .from('tenant_balances')
            .select('amount')
            .eq('tenant_id', request.tenant)
            .eq('occupancy_id', request.occupancy_id)
            .maybeSingle();

          const newBalance = (existingBalance?.amount || 0) + remainingCredit;

          await supabase
            .from('tenant_balances')
            .upsert({
              tenant_id: request.tenant,
              occupancy_id: request.occupancy_id,
              amount: newBalance,
              last_updated: new Date().toISOString()
            }, { onConflict: 'tenant_id,occupancy_id' });

          console.log(`Added ₱${remainingCredit.toLocaleString()} to tenant credit balance`);
        }
      }

      // Reset renewal_status after renewal payment is confirmed
      // This allows tenant to request renewal again for the NEXT contract end
      // And allows security deposit to be consumed at the actual final month
      if (request.is_renewal_payment && request.occupancy_id) {
        await supabase
          .from('tenant_occupancies')
          .update({
            renewal_status: null,  // Reset so deposit logic works for next contract end
            renewal_requested: false
          })
          .eq('id', request.occupancy_id);

        console.log('Renewal status reset after renewal payment confirmation');
      }

      // Notify tenant that payment is confirmed
      let notificationMessage = `Your payment for ${request.properties?.title || 'property'} has been confirmed by your landlord.`;
      if (request.is_renewal_payment && extraMonths > 0) {
        notificationMessage = `Your renewal payment for ${request.properties?.title || 'property'} has been confirmed! This covers ${extraMonths + 1} months - your next due date has been advanced accordingly.`;
      } else if (extraMonths > 0) {
        notificationMessage += ` This includes ${extraMonths} advance month(s).`;
      }

      await supabase.from('notifications').insert({
        recipient: request.tenant,
        actor: session.user.id,
        type: 'payment_confirmed',
        message: notificationMessage,
        link: '/payments'
      })

      // Send SMS/Email to Tenant
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'payment_confirmed',
            recordId: request.id // This will fetch details in the API
          })
        });
      } catch (err) {
        console.error('Failed to notify tenant of confirmation:', err);
      }

      loadPaymentRequests()
      loadPayments()

      let successMsg = 'Payment confirmed and recorded!';
      if (request.is_renewal_payment) {
        successMsg = `Renewal payment confirmed! Covers ${extraMonths + 1} months. Next due date advanced.`;
      } else if (extraMonths > 0) {
        successMsg = `Payment confirmed! ${extraMonths} advance month(s) created.`;
      }
      showToast.success(successMsg, {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
    } catch (error) {
      console.error('Payment record error:', error)
      showToast.error('Failed to confirm payment. Please try again.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
    }
  }

  async function executeCancelBill(requestId) {
    setCancelBillId(null)
    const { error } = await supabase
      .from('payment_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)

    if (!error) {
      loadPaymentRequests()
      showToast.success('Payment request cancelled.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    } else {
      console.error('Error cancelling:', error)
      showToast.error('Failed to cancel payment request.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    }
  }

  // Reject payment request (landlord)
  async function executeRejectPayment(requestId) {

    const request = paymentRequests.find(r => r.id === requestId)
    if (!request) return

    const rejectPromise = new Promise(async (resolve, reject) => {
      try {
        // Update payment request status to rejected
        const { error } = await supabase
          .from('payment_requests')
          .update({ status: 'rejected' })
          .eq('id', requestId)

        if (error) throw error

        // Notify tenant about rejection
        await supabase.from('notifications').insert({
          recipient: request.tenant,
          actor: session.user.id,
          type: 'payment_rejected',
          message: `Your payment of ₱${(
            parseFloat(request.rent_amount || 0) +
            parseFloat(request.security_deposit_amount || 0) +
            parseFloat(request.advance_amount || 0) +
            parseFloat(request.water_bill || 0) +
            parseFloat(request.electrical_bill || 0) +
            parseFloat(request.other_bills || 0)
          ).toLocaleString()} for ${request.properties?.title || 'property'} was rejected by the landlord. Please contact your landlord for details.`,
          link: '/payments'
        })

        await loadPaymentRequests()
        resolve('Payment rejected')
      } catch (err) {
        reject(err)
      }
    })

    showToast.promise(
      rejectPromise,
      {
        pending: 'Rejecting payment...',
        success: 'Payment rejected successfully',
        error: 'Failed to reject payment'
      },
      {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      }
    )
  }

  // Open edit modal with bill data
  function handleEditBill(request) {
    setEditingBill(request)
    setEditFormData({
      rent_amount: request.rent_amount || '',
      water_bill: request.water_bill || '',
      electrical_bill: request.electrical_bill || '',
      other_bills: request.other_bills || '',
      bills_description: request.bills_description || '',
      due_date: request.due_date ? request.due_date.split('T')[0] : ''
    })
    setShowEditModal(true)
  }

  // Update bill
  async function handleUpdateBill(e) {
    e.preventDefault()

    const { error } = await supabase
      .from('payment_requests')
      .update({
        rent_amount: parseFloat(editFormData.rent_amount) || 0,
        water_bill: parseFloat(editFormData.water_bill) || 0,
        electrical_bill: parseFloat(editFormData.electrical_bill) || 0,
        other_bills: parseFloat(editFormData.other_bills) || 0,
        bills_description: editFormData.bills_description,
        due_date: editFormData.due_date
      })
      .eq('id', editingBill.id)

    if (!error) {
      setShowEditModal(false)
      setEditingBill(null)
      loadPaymentRequests()
      showToast.success('Bill updated successfully!', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    } else {
      console.error('Error updating bill:', error)
      showToast.error('Failed to update bill.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    }
  }



  if (!session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  // Calculate total income from payment_requests (same as dashboard)
  const totalIncome = paymentRequests
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => {
      const t = parseFloat(p.amount_paid || 0) || (
        parseFloat(p.rent_amount || 0) +
        parseFloat(p.security_deposit_amount || 0) +
        parseFloat(p.advance_amount || 0) +
        parseFloat(p.water_bill || 0) +
        parseFloat(p.electrical_bill || 0) +
        parseFloat(p.wifi_bill || 0) +
        parseFloat(p.other_bills || 0)
      )
      return sum + t
    }, 0)

  return (
    <div className="min-h-screen bg-[#F3F4F5] p-3 sm:p-6">
      <div className="max-w-[95%] mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
            <p className="text-sm text-gray-500 mt-1">Manage bills and income</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Link
              href="/payment-history"
              className="px-4 py-2 border-2 border-black text-black font-bold rounded-lg hover:bg-gray-50 text-center flex-1 sm:flex-none cursor-pointer"
            >
              View History
            </Link>
            {userRole === 'landlord' && (
              <button
                onClick={() => setShowFormModal(true)}
                className="flex-1 sm:flex-none px-4 py-2 bg-black text-white hover:bg-gray-800 font-bold cursor-pointer rounded-lg border-2 border-black"
              >
                Send Bill
              </button>
            )}
          </div>
        </div>

        {/* Stats & Graph Section for Landlord */}
        {userRole === 'landlord' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Total Income */}
            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
              <div className="text-sm font-medium text-gray-500 mb-2">Total Income</div>
              <div className="text-3xl font-black text-gray-900">₱{totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>

            {/* Total Payments */}
            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
              <div className="text-sm font-medium text-gray-500 mb-2">Total Payments</div>
              <div className="text-3xl font-black text-gray-900">{payments.length}</div>
            </div>
          </div>
        )}

        {/* Send Bill Modal */}
        {showFormModal && userRole === 'landlord' && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white border-2 border-black max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 rounded-2xl shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Send Bill</h2>
                <button onClick={() => setShowFormModal(false)} className="text-gray-400 hover:text-black">✕</button>
              </div>

              {/* Tabs for Bill Type - Rent/Wifi/Electric are automatic, only Water and Other remain */}
              <div className="flex gap-2 flex-wrap pb-2 mb-4 scrollbar-hide">
                {[
                  { id: 'other', label: 'Other', icon: '' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${activeTab === tab.id
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                  >
                    <span>{tab.icon}</span> {tab.label}
                  </button>
                ))}
              </div>

              {/* Info about automatic billing */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-600">
                  <span className="font-bold">Note:</span> House rent payment bills are sent automatically 3 days before due date. WiFi, electricity, and water only send <strong>reminder notifications</strong> (SMS & email).
                </p>
              </div>

              {approvedApplications.length === 0 ? (
                <div className="text-black text-sm bg-gray-50 border border-gray-200 p-4 rounded-lg">
                  <p className="font-bold">No active tenants found.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Select Tenant - Always Visible */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1">Select Tenant *</label>
                    <div className="relative">
                      <select
                        required
                        className="w-full border-2 border-black px-3 py-2 rounded-lg bg-white appearance-none cursor-pointer font-medium focus:outline-none"
                        value={selectedTenantId}
                        onChange={e => {
                          const listId = e.target.value
                          setSelectedTenantId(listId)
                          const selectedApp = approvedApplications.find(app => app.id === listId)

                          if (selectedApp) {

                            // --- START AUTOMATIC DATE CALCULATION ---
                            let nextDueDate = '';

                            // 1. Find the latest RENT bill for this specific tenant
                            const lastRentBill = paymentRequests
                              .filter(p => p.tenant === selectedApp.tenant && parseFloat(p.rent_amount) > 0)
                              .sort((a, b) => new Date(b.due_date) - new Date(a.due_date))[0]; // Get the newest one

                            if (lastRentBill && lastRentBill.due_date) {
                              // 2. If history exists: Take last due date + 30 Days
                              const d = new Date(lastRentBill.due_date);
                              d.setDate(d.getDate() + 30);
                              nextDueDate = d.toISOString().split('T')[0]; // Format YYYY-MM-DD for input
                            } else {
                              // 3. If no history (First Bill): Default to Today's Date
                              nextDueDate = new Date().toISOString().split('T')[0];
                            }
                            // --- END AUTOMATIC DATE CALCULATION ---

                            setFormData({
                              ...formData,
                              application_id: selectedApp.application_id || '', // Use real app ID or empty for manual
                              occupancy_id: selectedApp.id, // Store the occupancy ID
                              property_id: selectedApp.property_id,
                              tenant: selectedApp.tenant,
                              amount: selectedApp.price || '',
                              due_date: nextDueDate
                            })
                          } else {
                            // Reset if empty selection
                            setFormData({ ...formData, application_id: '', occupancy_id: '', property_id: '', tenant: '', amount: '' })
                          }
                        }}
                      >
                        <option value="">Select Tenant</option>
                        {approvedApplications.map(app => (
                          <option key={app.id} value={app.id}>
                            {app.property?.title} - {app.tenant_profile?.first_name} {app.tenant_profile?.last_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4">

                    {/* Dynamic Fields based on Tab */}
                    {activeTab === 'rent' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Rent Amount *</label>
                          <input type="text" required readOnly min="0" step="0.01" className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 outline-none bg-gray-100 text-gray-500 cursor-not-allowed" placeholder="0.00"
                            value={formData.amount ? parseFloat(formData.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Rent Due Date *</label>
                          <input
                            type="date"
                            required
                            readOnly // <--- Disables manual editing
                            className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 outline-none bg-gray-100 text-gray-500 cursor-not-allowed" // <--- Visual styling for disabled state
                            value={formData.due_date}
                          // onChange handler is removed since it's read-only
                          />
                        </div>
                      </div>
                    )}

                    {activeTab === 'water' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Water Amount *</label>
                          <input type="number" required min="0" step="0.01" className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 outline-none" placeholder="0.00"
                            value={formData.water_bill} onChange={e => setFormData({ ...formData, water_bill: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Due Date *</label>
                          <input type="date" required className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 outline-none"
                            value={formData.water_due_date} onChange={e => setFormData({ ...formData, water_due_date: e.target.value })} />
                        </div>
                      </div>
                    )}

                    {activeTab === 'other' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Other Amount *</label>
                          <input type="number" required min="0" step="0.01" className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 outline-none" placeholder="0.00"
                            value={formData.other_bills} onChange={e => setFormData({ ...formData, other_bills: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Due Date *</label>
                          <input type="date" required className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 outline-none"
                            value={formData.other_due_date} onChange={e => setFormData({ ...formData, other_due_date: e.target.value })} />
                        </div>
                      </div>
                    )}

                    {/* Common Fields */}
                    <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-500 mb-1">Message (Optional)</label>
                      <textarea
                        className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 font-medium outline-none resize-none"
                        rows="2"
                        placeholder={`Details about ${activeTab}...`}
                        value={formData.bills_description}
                        onChange={e => setFormData({ ...formData, bills_description: e.target.value })}
                      />
                    </div>

                    {/* File Uploads (Bill Receipt & QR) - Keep as is from your original code */}
                    <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-500 mb-1">Bill Receipt *</label>
                      {/* ... (Your existing Bill Receipt upload UI code) ... */}
                      <div className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${billReceiptPreview ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'}`}>
                        {billReceiptPreview ? (
                          <div className="relative inline-block">
                            <img src={billReceiptPreview} alt="Bill Receipt" className="max-h-40 rounded shadow-sm border border-gray-200" />
                            <button type="button" onClick={() => { setBillReceiptFile(null); setBillReceiptPreview(null) }} className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-full shadow-md cursor-pointer hover:bg-gray-800">✕</button>
                          </div>
                        ) : (
                          <label className="cursor-pointer block w-full h-full">
                            <span className="text-sm font-bold text-black">Upload Receipt</span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files[0]; if (file) { setBillReceiptFile(file); setBillReceiptPreview(URL.createObjectURL(file)) } }} />
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-500 mb-1">Payment QR Code (Optional)</label>
                      {/* ... (Your existing QR upload UI code) ... */}
                      <div className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${qrCodePreview ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'}`}>
                        {qrCodePreview ? (
                          <div className="relative inline-block">
                            <img src={qrCodePreview} alt="QR Code" className="max-h-40 rounded shadow-sm border border-gray-200" />
                            <button type="button" onClick={() => { setQrCodeFile(null); setQrCodePreview(null) }} className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-full shadow-md cursor-pointer hover:bg-gray-800">✕</button>
                          </div>
                        ) : (
                          <label className="cursor-pointer block w-full h-full">
                            <span className="text-sm font-bold text-black">Upload QR</span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files[0]; if (file) { setQrCodeFile(file); setQrCodePreview(URL.createObjectURL(file)) } }} />
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 bg-black text-white p-4 rounded-lg flex justify-between items-center">
                      <span className="text-sm font-bold uppercase tracking-wider">Total</span>
                      <span className="text-xl font-bold">
                        ₱{((activeTab === 'rent' ? parseFloat(formData.amount) : 0) +
                          (activeTab === 'water' ? parseFloat(formData.water_bill) : 0) +
                          (activeTab === 'other' ? parseFloat(formData.other_bills) : 0) || 0
                        ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="submit" className="flex-1 px-6 py-3 bg-black text-white hover:bg-gray-800 font-bold rounded-lg cursor-pointer">
                      Send {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Bill
                    </button>
                    <button type="button" onClick={() => setShowFormModal(false)} className="px-6 py-3 border-2 border-black text-black font-bold rounded-lg hover:bg-gray-50 cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}



        {/* Payment Requests / Bills Section */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-black text-gray-900">
              {userRole === 'landlord' ? 'Sent Bills' : 'Your Bills'}
            </h2>
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
                  Loading Payment...
                </p>
              </div>
            </div>
          ) : paymentRequests.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </div>
              <p className="text-black font-bold">No bills found</p>
              <p className="text-sm text-gray-500 mt-1">
                {userRole === 'landlord' ? "Sent payment requests will appear here." : "You're all caught up! No pending bills."}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden divide-y divide-gray-100">
                {paymentRequests.filter(req => !req.is_advance_payment).map(request => {
                  const rent = parseFloat(request.rent_amount) || 0
                  const securityDeposit = parseFloat(request.security_deposit_amount) || 0
                  const advance = parseFloat(request.advance_amount) || 0
                  const total = rent + (parseFloat(request.water_bill) || 0) + (parseFloat(request.electrical_bill) || 0) + (parseFloat(request.other_bills) || 0) + securityDeposit + advance
                  const isPastDue = request.due_date && new Date(request.due_date) < new Date() && request.status === 'pending'
                  let billType = 'Other Bill';
                  if (rent > 0) billType = 'House Rent';
                  else if ((parseFloat(request.electrical_bill) || 0) > 0) billType = 'Electric Bill';
                  else if ((parseFloat(request.water_bill) || 0) > 0) billType = 'Water Bill';
                  const refNum = request.tenant_reference_number || ''
                  const maskedRef = refNum.length > 5 ? '•••••' + refNum.slice(-5) : refNum

                  return (
                    <div key={request.id} className="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setSelectedDetailBill(request)}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-sm">{request.properties?.title || 'Property'}</div>
                          <div className="text-xs text-gray-500">
                            {userRole === 'landlord'
                              ? `Tenant: ${request.tenant_profile?.first_name || ''} ${request.tenant_profile?.last_name || ''}`
                              : `Landlord: ${request.landlord_profile?.first_name || ''} ${request.landlord_profile?.last_name || ''}`}
                          </div>
                          <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded mt-1 inline-block">{billType}</span>
                        </div>
                        <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded border ${request.status === 'paid' ? 'bg-black text-white border-black' :
                          request.status === 'pending_confirmation' ? 'bg-white text-black border-black border-dashed' :
                            request.status === 'cancelled' ? 'bg-gray-100 text-gray-500 border-gray-200' :
                              request.status === 'rejected' ? 'bg-gray-100 text-black border-gray-400' :
                                isPastDue ? 'bg-red-50 text-red-600 border-red-200' :
                                  'bg-yellow-50 text-yellow-700 border-yellow-100'
                          }`}>
                          {request.status === 'pending_confirmation' ? 'Reviewing' :
                            request.status === 'rejected' ? 'Rejected' :
                              isPastDue ? 'Overdue' : request.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-bold">₱{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        {maskedRef && <span className="text-xs font-mono text-gray-400">{maskedRef}</span>}
                      </div>

                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        {userRole === 'tenant' && request.status === 'pending' && (
                          <button onClick={() => handlePayBill(request)} className="flex-1 px-3 py-2 bg-black text-white text-xs font-bold rounded cursor-pointer">Pay Bill</button>
                        )}
                        {userRole === 'tenant' && request.status === 'pending_confirmation' && (
                          <span className="text-xs font-bold text-gray-400">Waiting for approval</span>
                        )}
                        {userRole === 'tenant' && request.status === 'rejected' && (
                          <button onClick={() => handlePayBill(request)} className="flex-1 px-3 py-2 bg-black text-white text-xs font-bold rounded cursor-pointer">Resend</button>
                        )}
                        {userRole === 'landlord' && request.status === 'pending' && (
                          <div className="flex gap-2 w-full">
                            <button onClick={() => confirmPayment(request.id)} className="flex-1 px-3 py-2 bg-green-600 text-white text-xs font-bold rounded cursor-pointer">Mark Paid</button>
                            <button onClick={() => handleEditBill(request)} className="px-3 py-2 border border-gray-300 text-black text-xs font-bold rounded cursor-pointer">Edit</button>
                            <button onClick={() => handleCancelBill(request.id)} className="px-3 py-2 text-red-600 bg-red-50 text-xs font-bold rounded cursor-pointer">Cancel</button>
                          </div>
                        )}
                        {userRole === 'landlord' && request.status === 'pending_confirmation' && (
                          <div className="flex gap-2 w-full">
                            <button onClick={() => confirmPayment(request.id)} className="flex-1 px-3 py-2 bg-green-600 text-white text-xs font-bold rounded cursor-pointer">Confirm</button>
                            <button onClick={() => rejectPayment(request.id)} className="px-3 py-2 bg-red-50 text-red-600 text-xs font-bold rounded cursor-pointer">Reject</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Property</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {userRole === 'landlord' ? 'Tenant' : 'Landlord'}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Bill Type</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Reference</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Due Date</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paymentRequests.filter(req => !req.is_advance_payment).map(request => {
                      const rent = parseFloat(request.rent_amount) || 0
                      const water = parseFloat(request.water_bill) || 0
                      const electric = parseFloat(request.electrical_bill) || 0
                      const wifi = parseFloat(request.wifi_bill) || 0
                      const other = parseFloat(request.other_bills) || 0
                      const securityDeposit = parseFloat(request.security_deposit_amount) || 0
                      const advance = parseFloat(request.advance_amount) || 0
                      const total = rent + water + electric + wifi + other + securityDeposit + advance
                      const isPastDue = request.due_date && new Date(request.due_date) < new Date() && request.status === 'pending'
                      let billType = 'Other Bill';
                      if (rent > 0) billType = 'House Rent';
                      else if (electric > 0) billType = 'Electric Bill';
                      else if (water > 0) billType = 'Water Bill';
                      else if (wifi > 0) billType = 'Wifi Bill';
                      const refNum = request.tenant_reference_number || ''
                      const maskedRef = refNum.length > 5 ? '•••••' + refNum.slice(-5) : refNum

                      return (
                        <tr key={request.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedDetailBill(request)}>
                          {/* Property */}
                          <td className="px-3 py-2.5">
                            <div className="max-w-[160px]">
                              <div className="text-sm font-bold text-black truncate" title={request.properties?.title}>
                                {request.properties?.title || 'N/A'}
                              </div>
                            </div>
                          </td>

                          {/* Landlord/Tenant Name */}
                          <td className="px-3 py-2.5 text-sm text-gray-600">
                            <div className="max-w-[120px] truncate">
                              {userRole === 'landlord'
                                ? `${request.tenant_profile?.first_name || ''} ${request.tenant_profile?.last_name || ''}`
                                : `${request.landlord_profile?.first_name || ''} ${request.landlord_profile?.last_name || ''}`}
                            </div>
                          </td>

                          {/* Bill Type */}
                          <td className="px-3 py-2.5">
                            <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded whitespace-nowrap">{billType}</span>
                          </td>

                          {/* Amount */}
                          <td className="px-3 py-2.5">
                            <span className="text-sm font-bold text-black whitespace-nowrap">₱{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </td>

                          {/* Reference (masked) */}
                          <td className="px-3 py-2.5">
                            <span className="text-xs text-gray-500 font-mono">{maskedRef || '-'}</span>
                          </td>

                          {/* Due Date */}
                          <td className="px-3 py-2.5">
                            <span className={`text-sm whitespace-nowrap ${isPastDue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                              {request.due_date ? new Date(request.due_date).toLocaleDateString() : 'N/A'}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border whitespace-nowrap ${request.status === 'paid' ? 'bg-green-50 text-green-700 border-green-100' :
                              request.status === 'pending_confirmation' ? 'bg-yellow-50 text-yellow-700 border-yellow-100 border-dashed' :
                                request.status === 'cancelled' ? 'bg-red-50 text-red-700 border-red-100' :
                                  request.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' :
                                    isPastDue ? 'bg-red-50 text-red-600 border-red-200' :
                                      'bg-yellow-50 text-yellow-700 border-yellow-100'
                              }`}>
                              {request.status === 'paid' ? 'Paid' :
                                request.status === 'pending_confirmation' ? 'Confirming' :
                                  request.status === 'cancelled' ? 'Cancelled' :
                                    request.status === 'rejected' ? 'Rejected' :
                                      isPastDue ? 'Overdue' : 'Pending'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                            <div className="flex gap-2">
                              {userRole === 'tenant' && request.status === 'pending' && (
                                <button onClick={() => handlePayBill(request)} disabled={loadingPayBtn === request.id} className="relative px-3 py-1.5 bg-black text-white text-xs font-bold rounded hover:bg-gray-800 cursor-pointer shadow-sm whitespace-nowrap disabled:opacity-75 disabled:cursor-wait min-w-[65px] flex justify-center items-center">
                                  {loadingPayBtn === request.id ? (
                                    <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                  ) : "Pay Now"}
                                </button>
                              )}
                              {userRole === 'tenant' && request.status === 'pending_confirmation' && (
                                <span className="text-xs font-bold text-gray-400 whitespace-nowrap">Wait for approval</span>
                              )}
                              {userRole === 'tenant' && request.status === 'rejected' && (
                                <button onClick={() => handlePayBill(request)} disabled={loadingPayBtn === request.id} className="relative px-3 py-1.5 bg-black text-white text-xs font-bold rounded hover:bg-gray-800 cursor-pointer shadow-sm whitespace-nowrap disabled:opacity-75 disabled:cursor-wait min-w-[65px] flex justify-center items-center">
                                  {loadingPayBtn === request.id ? (
                                    <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                  ) : "Resend"}
                                </button>
                              )}
                              {userRole === 'landlord' && request.status === 'pending' && (
                                <div className="flex gap-1">
                                  <button onClick={() => confirmPayment(request.id)} className="px-2 py-1 bg-green-600 text-white hover:bg-green-700 text-xs font-bold rounded cursor-pointer">Paid</button>
                                  <button onClick={() => handleEditBill(request)} className="px-2 py-1 border border-gray-300 hover:border-black text-xs font-bold rounded cursor-pointer">Edit</button>
                                  <button onClick={() => handleCancelBill(request.id)} className="px-2 py-1 text-red-600 hover:bg-red-50 text-xs font-bold rounded cursor-pointer">Cancel</button>
                                </div>
                              )}
                              {userRole === 'landlord' && request.status === 'pending_confirmation' && (
                                <div className="flex gap-1">
                                  <button onClick={() => confirmPayment(request.id)} className="px-2 py-1 bg-black text-white hover:bg-gray-800 text-[10px] font-bold rounded cursor-pointer">Confirm</button>
                                  <button onClick={() => rejectPayment(request.id)} className="px-2 py-1 border border-black text-black hover:bg-black hover:text-white text-[10px] font-bold rounded cursor-pointer">✗</button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Bill Detail Slide Panel */}
        {selectedDetailBill && (() => {
          const r = selectedDetailBill
          const rent = parseFloat(r.rent_amount) || 0
          const water = parseFloat(r.water_bill) || 0
          const electric = parseFloat(r.electrical_bill) || 0
          const wifi = parseFloat(r.wifi_bill) || 0
          const other = parseFloat(r.other_bills) || 0
          const securityDeposit = parseFloat(r.security_deposit_amount) || 0
          const advance = parseFloat(r.advance_amount) || 0
          const total = rent + water + electric + wifi + other + securityDeposit + advance
          const isPastDue = r.due_date && new Date(r.due_date) < new Date() && r.status === 'pending'
          let billType = 'Other Bill';
          if (rent > 0) billType = 'House Rent';
          else if (electric > 0) billType = 'Electric Bill';
          else if (water > 0) billType = 'Water Bill';
          else if (wifi > 0) billType = 'Wifi Bill';

          return (
            <div className="fixed inset-0 z-50 flex justify-end">
              <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSelectedDetailBill(null)} />
              <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="text-lg font-black">Bill Details</h3>
                  <button onClick={() => setSelectedDetailBill(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  {/* Status Badge */}
                  <div className="flex items-center justify-between">
                    <span className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full border ${r.status === 'paid' ? 'bg-green-50 text-green-700 border-green-200' :
                      r.status === 'pending_confirmation' ? 'bg-yellow-50 text-yellow-700 border-yellow-200 border-dashed' :
                        r.status === 'cancelled' ? 'bg-red-50 text-red-700 border-red-200' :
                          r.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                            isPastDue ? 'bg-red-50 text-red-600 border-red-200' :
                              'bg-yellow-50 text-yellow-700 border-yellow-200'
                      }`}>
                      {r.status === 'paid' ? 'Paid' : r.status === 'pending_confirmation' ? 'Confirming' : r.status === 'cancelled' ? 'Cancelled' : r.status === 'rejected' ? 'Rejected' : isPastDue ? 'Overdue' : 'Pending'}
                    </span>
                    <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded">{billType}</span>
                  </div>

                  {/* Property */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Property</label>
                    <p className="font-bold text-gray-900 mt-0.5">{r.properties?.title || 'N/A'}</p>
                    {r.properties?.address && <p className="text-xs text-gray-500 mt-0.5">{r.properties?.address}, {r.properties?.city || ''}</p>}
                  </div>

                  {/* People */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Landlord</label>
                      <p className="font-bold text-sm mt-0.5">{r.landlord_profile?.first_name || ''} {r.landlord_profile?.last_name || ''}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tenant</label>
                      <p className="font-bold text-sm mt-0.5">{r.tenant_profile?.first_name || ''} {r.tenant_profile?.last_name || ''}</p>
                    </div>
                  </div>

                  {/* Amount Breakdown */}
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Amount Breakdown</label>
                    </div>
                    <div className="p-4 space-y-2">
                      {rent > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Rent</span><span className="font-bold">₱{rent.toLocaleString()}</span></div>}
                      {securityDeposit > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Security Deposit</span><span className="font-bold">₱{securityDeposit.toLocaleString()}</span></div>}
                      {advance > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Advance</span><span className="font-bold">₱{advance.toLocaleString()}</span></div>}
                      {water > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Water Bill</span><span className="font-bold">₱{water.toLocaleString()}</span></div>}
                      {electric > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Electric Bill</span><span className="font-bold">₱{electric.toLocaleString()}</span></div>}
                      {wifi > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Wifi Bill</span><span className="font-bold">₱{wifi.toLocaleString()}</span></div>}
                      {other > 0 && <div className="flex justify-between text-sm"><span className="text-gray-600">Other Charges</span><span className="font-bold">₱{other.toLocaleString()}</span></div>}
                      <div className="border-t border-gray-100 pt-2 flex justify-between font-bold">
                        <span>Total</span>
                        <span className="text-lg">₱{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-xs font-bold text-gray-400 uppercase">Due Date</span>
                      <span className={`text-sm font-bold ${isPastDue ? 'text-red-600' : 'text-gray-900'}`}>{r.due_date ? new Date(r.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}</span>
                    </div>
                    {billType === 'House Rent' && r.due_date && (
                      <div className="flex justify-between items-center py-2 border-b border-gray-50">
                        <span className="text-xs font-bold text-gray-400 uppercase">Rent Month</span>
                        <span className="text-sm font-bold text-gray-900">{getRentMonth(r.due_date)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-xs font-bold text-gray-400 uppercase">Payment Method</span>
                      <span className="text-sm font-bold text-gray-900">
                        {r.payment_method === 'paymongo' ? 'E-Wallet / Cards' : r.payment_method === 'stripe' ? 'Stripe' : r.payment_method === 'qr_code' ? 'QR Code' : r.payment_method === 'cash' ? 'Cash' : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-xs font-bold text-gray-400 uppercase">Reference No.</span>
                      <span className="text-sm font-bold font-mono text-gray-900">{r.tenant_reference_number || '-'}</span>
                    </div>
                    {r.bills_description && (
                      <div className="py-2 border-b border-gray-50">
                        <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Message / Description</span>
                        <p className="text-sm text-gray-700">{r.bills_description}</p>
                      </div>
                    )}
                    {r.receipt_url && (
                      <div className="py-2 border-b border-gray-50">
                        <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Attachment</span>
                        <a href={r.receipt_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 font-bold hover:underline">View File →</a>
                      </div>
                    )}
                    {r.proof_url && (
                      <div className="py-2">
                        <span className="text-xs font-bold text-gray-400 uppercase block mb-2">Payment Proof</span>
                        <img src={r.proof_url} alt="Payment Proof" className="w-full max-h-48 object-cover rounded-xl border border-gray-100" />
                      </div>
                    )}
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-xs font-bold text-gray-400 uppercase">Created</span>
                      <span className="text-sm text-gray-600">{r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Payment Full Page for Tenants */}
        {showPaymentModal && selectedBill && (
          <>
            <style>{`
              @keyframes confirmProgressBar {
                0% { width: 0%; }
                100% { width: 100%; }
              }
              @keyframes checkmarkPop {
                0% { transform: scale(0) rotate(-45deg); opacity: 0; }
                50% { transform: scale(1.2) rotate(0deg); opacity: 1; }
                100% { transform: scale(1) rotate(0deg); opacity: 1; }
              }
              @keyframes checkmarkCircle {
                0% { stroke-dashoffset: 166; }
                100% { stroke-dashoffset: 0; }
              }
              @keyframes checkmarkCheck {
                0% { stroke-dashoffset: 48; }
                100% { stroke-dashoffset: 0; }
              }
              @keyframes fadeInUp {
                0% { opacity: 0; transform: translateY(16px); }
                100% { opacity: 1; transform: translateY(0); }
              }
              @keyframes pulseGlow {
                0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
                50% { box-shadow: 0 0 0 12px rgba(34, 197, 94, 0); }
              }
              .confirm-progress-bar {
                animation: confirmProgressBar 3s ease-in-out forwards;
              }
              .checkmark-pop {
                animation: checkmarkPop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
              }
              .checkmark-circle {
                stroke-dasharray: 166;
                stroke-dashoffset: 166;
                animation: checkmarkCircle 0.6s ease-in-out forwards;
              }
              .checkmark-check {
                stroke-dasharray: 48;
                stroke-dashoffset: 48;
                animation: checkmarkCheck 0.4s 0.3s ease-in-out forwards;
              }
              .fade-in-up {
                animation: fadeInUp 0.5s 0.4s ease-out forwards;
                opacity: 0;
              }
              .pulse-glow {
                animation: pulseGlow 2s infinite;
              }
            `}</style>

            {/* Confirmation Animation Overlay */}
            {showPaymentConfirmation && (
              <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center">
                <div className="w-full max-w-md px-8 flex flex-col items-center">
                  {/* Checkmark (appears after bar fills) */}
                  {paymentConfirmed && (
                    <div className="mb-8 checkmark-pop">
                      <div className="w-24 h-24 rounded-full bg-green-50 flex items-center justify-center pulse-glow">
                        <svg className="w-24 h-24" viewBox="0 0 52 52">
                          <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" stroke="#22c55e" strokeWidth="2" />
                          <path className="checkmark-check" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Progress Bar */}
                  <div className="w-full mb-6">
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${paymentConfirmed ? 'bg-green-500 w-full' : 'bg-black confirm-progress-bar'}`}
                        style={paymentConfirmed ? { width: '100%' } : {}}
                      />
                    </div>
                  </div>

                  {/* Text */}
                  <div className={`text-center ${paymentConfirmed ? 'fade-in-up' : ''}`}>
                    {paymentConfirmed ? (
                      <>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Payment Submitted!</h3>
                        <p className="text-sm text-gray-500">Your landlord has been notified.</p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">We're confirming your payment</h3>
                        <p className="text-sm text-gray-400">Please be patient, as this could take a moment</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Full-page Pay Bill View */}
            {!showPaymentConfirmation && (
              <div className="fixed inset-0 z-50 bg-[#F5F5F5] overflow-y-auto">
                <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10 min-h-screen flex flex-col">

                  {/* Back Button */}
                  <button
                    onClick={() => {
                      setShowPaymentModal(false)
                      setSelectedBill(null)
                      setPaymentMethod('cash')
                      setProofFile(null)
                      setProofPreview(null)
                      setReferenceNumber('')
                    }}
                    className="flex items-center gap-2 text-gray-400 hover:text-black font-bold text-sm mb-8 group cursor-pointer transition-colors self-start"
                  >
                    <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    Back to Bills
                  </button>

                  {/* Two Column Layout */}
                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 pb-24">

                    {/* LEFT COLUMN — Title, Payment Method, Amount */}
                    <div className="flex flex-col">
                      {/* Page Title */}
                      <div className="mb-8">
                        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">Pay Bill</h1>
                        <p className="text-sm text-gray-400 mt-1 font-medium">
                          {selectedBill.properties?.title}
                          {selectedBill.properties?.address && <> • {selectedBill.properties?.address}</>}
                        </p>
                      </div>

                      {/* View Bill Receipt */}
                      {selectedBill.bill_receipt_url && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBillReceipt(selectedBill.bill_receipt_url)
                            setShowBillReceiptModal(true)
                          }}
                          className="flex items-center gap-2 text-gray-500 hover:text-black text-sm font-semibold mb-6 cursor-pointer transition-colors group"
                        >
                          <svg className="w-4 h-4 group-hover:text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          View Bill Receipt
                        </button>
                      )}

                      {/* Payment Method Selection */}
                      {minimumPayment <= 0 && appliedCredit > 0 ? (
                        <div className="bg-green-50 border border-green-200 p-6 rounded-2xl text-center space-y-3 mb-8">
                          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </div>
                          <h4 className="font-bold text-green-800">Fully Covered by Credit!</h4>
                          <p className="text-sm text-green-700">Your credit balance is sufficient to pay this bill.</p>
                          <button
                            onClick={handleCreditPayment}
                            className="w-full bg-black text-white py-3.5 rounded-full font-bold hover:bg-gray-800 transition-colors shadow-lg cursor-pointer"
                          >
                            Pay with Credit Balance
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="mb-8">
                            <h2 className="text-lg font-bold text-gray-900 mb-4">Payment Method</h2>
                            <div className="flex flex-col gap-3">
                              {[
                                { id: 'cash', label: 'Cash', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>, show: landlordAcceptedPayments?.cash },
                                { id: 'paymongo', label: 'E-Wallet', sublabel: [landlordAcceptedPayments?.gcash && 'GCash', landlordAcceptedPayments?.maya && 'Maya'].filter(Boolean).join(' / ') + '\nCards', icon: <div className="flex items-center gap-0.5"><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#007DFE" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">G</text></svg><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#00B274" /><text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">M</text></svg><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="3" fill="#374151" /><rect x="2" y="8" width="20" height="3" fill="#1F2937" /><rect x="4" y="14" width="5" height="2" rx="1" fill="#9CA3AF" /><rect x="11" y="14" width="3" height="2" rx="1" fill="#9CA3AF" /></svg></div>, show: landlordAcceptedPayments?.gcash || landlordAcceptedPayments?.maya },
                              ].filter(m => m.show).map(method => (
                                <button
                                  key={method.id}
                                  type="button"
                                  onClick={() => setPaymentMethod(method.id)}
                                  disabled={isBelowMinimum || exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && parseFloat(customAmount) > maxPaymentLimit)}
                                  className={`relative w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all text-left font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
                                    ${paymentMethod === method.id
                                      ? 'border-green-500 bg-green-50/40 shadow-sm'
                                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                                >
                                  <div className={`h-10 shrink-0 rounded-full flex items-center justify-center transition-all ${paymentMethod === method.id ? 'w-10 bg-green-100 text-green-600' : method.id === 'cash' ? 'w-10 bg-gray-100 text-gray-400' : 'w-auto px-1.5 bg-gray-100 text-gray-400'}`}>
                                    {paymentMethod === method.id ? (
                                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    ) : method.icon}
                                  </div>
                                  <div className="flex-1">
                                    <span className="text-sm font-bold text-gray-900">{method.label}</span>
                                    {method.id === 'paymongo' && (
                                      <span className="block text-[11px] text-gray-400 font-medium leading-tight mt-0.5">
                                        {[landlordAcceptedPayments?.gcash && 'GCash', landlordAcceptedPayments?.maya && 'Maya'].filter(Boolean).join(' / ')} • Cards
                                      </span>
                                    )}
                                  </div>
                                  {paymentMethod === method.id && (
                                    <svg className="w-5 h-5 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Amount to Pay */}
                      {!(minimumPayment <= 0 && appliedCredit > 0) && (
                        <div className="mb-8">
                          <div className="flex justify-between items-center mb-3">
                            <h2 className="text-lg font-bold text-gray-900">Amount to Pay</h2>
                            {isFamilyMember && (
                              <span className="text-[10px] text-purple-700 font-bold bg-purple-100 px-2.5 py-1 rounded-full border border-purple-200">Expected amount only</span>
                            )}
                          </div>
                          <div className="relative group">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 text-lg group-focus-within:text-black transition-colors">₱</span>
                            <input
                              type="number"
                              step="0.01"
                              min="1"
                              value={customAmount}
                              onChange={(e) => handleCustomAmountChange(e.target.value)}
                              disabled={isFamilyMember}
                              className={`w-full sm:w-48 bg-white border-2 ${exceedsContract || isBelowMinimum ? 'border-red-500 bg-red-50/50' : 'border-gray-200 hover:border-gray-300 focus:border-black'} ${isFamilyMember ? 'bg-gray-50 text-gray-500 cursor-not-allowed border-gray-100' : ''} rounded-2xl pl-10 pr-4 py-3 font-bold text-xl outline-none transition-all placeholder:text-gray-300`}
                              placeholder="0.00"
                            />
                          </div>

                          {/* Validation */}
                          {isBelowMinimum && (
                            <div className="flex items-center gap-2 text-xs font-bold text-red-500 bg-red-50 p-3 rounded-lg border border-red-100 mt-3">
                              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              Minimum payment is ₱{minimumPayment.toLocaleString()} (No partials).
                            </div>
                          )}

                          {maxPaymentLimit !== null && parseFloat(customAmount) > maxPaymentLimit && (
                            <p className="text-xs font-bold text-red-500 mt-2 pl-1">
                              Max allowed: ₱{maxPaymentLimit.toLocaleString()}
                            </p>
                          )}
                        </div>
                      )}



                      {paymentMethod === 'stripe' && !isBelowMinimum && !exceedsContract && (
                        <div className="bg-[#f0f2fc] border border-[#e3e8fc] rounded-2xl p-4 mb-6">
                          <StripePaymentForm
                            amount={parseFloat(customAmount || 0).toFixed(2)}
                            description={`Payment - ${selectedBill.properties?.title}`}
                            paymentRequestId={selectedBill.id}
                            onSuccess={handleStripeSuccess}
                            onCancel={() => showToast.error('Cancelled')}
                          />
                        </div>
                      )}
                    </div>

                    {/* RIGHT COLUMN — Bill Details */}
                    <div className="flex flex-col h-full relative">
                      <div className="sticky top-8 flex flex-col gap-6">
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-lg shadow-gray-200/50">
                          {/* Header */}
                          <div className="pb-4 mb-4 border-b border-gray-100">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Bill Details</span>
                            <div className="flex gap-2 mt-2">
                              {selectedBill.is_move_in_payment && (
                                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold border border-green-200">Move-in</span>
                              )}
                              {selectedBill.is_renewal_payment && (
                                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold border border-indigo-200">Renewal</span>
                              )}
                            </div>
                          </div>

                          {/* Items */}
                          <div className="space-y-3 mb-6">
                            {[
                              { label: 'House Rent', value: selectedBill.rent_amount },
                              { label: 'Security Deposit', value: selectedBill.security_deposit_amount },
                              { label: 'Advance Payment', value: selectedBill.advance_amount },
                              { label: 'Water', value: selectedBill.water_bill },
                              { label: 'Electricity', value: selectedBill.electrical_bill },
                              { label: 'Late Payment', value: selectedBill.other_bills }
                            ].map((item, idx) => (
                              parseFloat(item.value || 0) > 0 && (
                                <div key={idx} className="flex justify-between items-center">
                                  <span className="text-base text-gray-600">{item.label}</span>
                                  <span className="text-base font-bold text-gray-900">₱{parseFloat(item.value).toLocaleString()}</span>
                                </div>
                              )
                            ))}

                            {(() => {
                              const baseTotal = (
                                parseFloat(selectedBill.rent_amount || 0) +
                                parseFloat(selectedBill.security_deposit_amount || 0) +
                                parseFloat(selectedBill.advance_amount || 0) +
                                parseFloat(selectedBill.water_bill || 0) +
                                parseFloat(selectedBill.electrical_bill || 0) +
                                parseFloat(selectedBill.other_bills || 0)
                              );
                              const amountTyped = parseFloat(customAmount) || 0;
                              const excess = amountTyped - (baseTotal - appliedCredit);

                              return excess > 0 ? (
                                <div className="flex justify-between items-center text-blue-600 pt-1">
                                  <span className="text-base font-semibold">Additional Advance Payment</span>
                                  <span className="text-base font-bold">₱{excess.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </div>
                              ) : null;
                            })()}

                            {appliedCredit > 0 && (
                              <div className="flex justify-between text-base text-green-600 font-bold pt-1">
                                <span className="flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  Credit Applied
                                </span>
                                <span>-₱{appliedCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}
                          </div>

                          {/* Total */}
                          <div className="flex justify-between items-end pt-4 border-t border-gray-100">
                            <span className="text-sm font-medium text-gray-500">Total Due</span>
                            <span className="text-3xl font-black text-gray-900">
                              ₱{(() => {
                                const baseTotal = (
                                  parseFloat(selectedBill.rent_amount || 0) +
                                  parseFloat(selectedBill.security_deposit_amount || 0) +
                                  parseFloat(selectedBill.advance_amount || 0) +
                                  parseFloat(selectedBill.water_bill || 0) +
                                  parseFloat(selectedBill.electrical_bill || 0) +
                                  parseFloat(selectedBill.other_bills || 0)
                                );
                                const amountTyped = parseFloat(customAmount) || 0;
                                return Math.max(baseTotal - appliedCredit, amountTyped).toLocaleString('en-US', { minimumFractionDigits: 2 });
                              })()}
                            </span>
                          </div>

                          {/* Billing Period Info */}
                          {monthlyRent > 0 && parseFloat(customAmount) > 0 && (
                            <div className={`mt-5 p-4 rounded-2xl border flex items-start gap-3 ${exceedsContract
                              ? 'bg-red-50 border-red-200'
                              : 'bg-[#F8F9FA] border-gray-100'
                              }`}>
                              <svg className={`w-5 h-5 shrink-0 mt-0.5 ${exceedsContract ? 'text-red-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              <div>
                                <p className={`font-bold text-sm ${exceedsContract ? 'text-red-700' : 'text-gray-900'}`}>
                                  {exceedsContract ? 'Exceeds Contract Period' : `Billing Period`}
                                </p>
                                <p className={`text-xs mt-0.5 ${exceedsContract ? 'text-red-600' : 'text-gray-500'}`}>
                                  {exceedsContract
                                    ? `Contract ends ${contractEndDate?.toLocaleDateString()}. Limit: ${maxMonthsAllowed} months.`
                                    : `Covers ${monthsCovered} Month${monthsCovered > 1 ? 's' : ''}`}
                                </p>
                                {monthsCovered > 1 && !exceedsContract && contractEndDate && (
                                  <p className="text-[11px] text-gray-400 mt-0.5">
                                    Paid until {new Date(new Date(selectedBill.due_date).setMonth(new Date(selectedBill.due_date).getMonth() + monthsCovered - 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* PayMongo E-Wallet Section */}
                        {paymentMethod === 'paymongo' && !isBelowMinimum && !exceedsContract && (
                          <div className="bg-teal-50 border border-teal-100 rounded-2xl p-5">
                            {!uploadingProof ? (
                              <>
                                <h4 className="font-bold text-teal-900 mb-3 text-center">Secure Payment via E-Wallets</h4>
                                <div className="flex justify-center gap-3 mb-3 flex-wrap">
                                  {landlordAcceptedPayments?.gcash && (
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-teal-100 shadow-sm">
                                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#007DFE" /><path d="M7.5 15.5c0-2.5 1.5-4.5 4-5.5 1.5-.6 3-.4 4 .5.5.5.8 1 .8 1.8 0 1-.5 1.8-1.3 2.3-.8.4-1.7.3-2.5-.2-.5-.3-.7-.8-.5-1.3.2-.4.5-.6 1-.6" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>
                                      <span className="text-xs font-bold text-gray-700">GCash</span>
                                    </div>
                                  )}
                                  {landlordAcceptedPayments?.maya && (
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-teal-100 shadow-sm">
                                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#00B274" /><path d="M6 12.5l2.5-4h2l-2.5 4h2l-2.5 4h-2l2.5-4H6zm5 0l2.5-4h2l-2.5 4h2l-2.5 4h-2l2.5-4H11z" fill="white" /></svg>
                                      <span className="text-xs font-bold text-gray-700">Maya</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-teal-100 shadow-sm">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><rect x="1" y="5" width="22" height="14" rx="3" fill="#6B7280" /><rect x="1" y="8" width="22" height="3" fill="#4B5563" /><rect x="3" y="14" width="6" height="2" rx="1" fill="#D1D5DB" /><rect x="11" y="14" width="3" height="2" rx="1" fill="#D1D5DB" /></svg>
                                    <span className="text-xs font-bold text-gray-700">Cards</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-teal-100 shadow-sm">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="18" rx="3" fill="#1a1a2e" /><rect x="5" y="7" width="14" height="3" rx="1" fill="#e94560" /><rect x="5" y="12" width="6" height="2" rx="0.5" fill="#4B5563" /><rect x="5" y="15" width="10" height="1" rx="0.5" fill="#4B5563" /></svg>
                                    <span className="text-xs font-bold text-gray-700">QR PH</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-teal-100 shadow-sm">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#00B14F" /><path d="M7 10h10l-2 7H9L7 10z" fill="white" opacity="0.9" /><path d="M9 8h6l1 2H8l1-2z" fill="white" /></svg>
                                    <span className="text-xs font-bold text-gray-700">GrabPay</span>
                                  </div>
                                </div>
                                <p className="text-[10px] text-teal-600 text-center mb-3">Landlord receives ₱{(Math.round(parseFloat(customAmount || 0) * 0.99 * 100) / 100).toLocaleString()} to their e-wallet.</p>
                                <button
                                  onClick={handlePayMongoPayment}
                                  disabled={uploadingProof}
                                  className="w-full py-3 bg-[#00BFA5] text-white font-bold rounded-xl hover:bg-[#008f7a] shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                  Pay ₱{parseFloat(customAmount).toLocaleString()}
                                </button>
                              </>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-5">
                                <h4 className="font-bold text-teal-900 mb-4 text-center text-lg">
                                  Please wait a moment...
                                </h4>
                                <style>{`
                                @keyframes indeterminateSlide {
                                  0% { transform: translateX(-100%); }
                                  100% { transform: translateX(200%); }
                                }
                                .animate-line-slide {
                                  animation: indeterminateSlide 1.5s infinite linear;
                                }
                              `}</style>
                                <div className="w-full max-w-xs mx-auto h-2 bg-teal-200 rounded-full overflow-hidden relative mb-4">
                                  <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-[#00BFA5] rounded-full animate-line-slide"></div>
                                </div>
                                <p className="text-xs font-medium text-teal-700 text-center">
                                  Do not close this window while we verify your payment.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Buttons — Fixed */}
                  <div className="sticky bottom-0 bg-gradient-to-t from-[#F5F5F5] via-[#F5F5F5] to-[#F5F5F5]/80 pt-4 pb-6 mt-8 z-10 pointer-events-none">
                    <div className="pointer-events-auto">
                      {paymentMethod === 'cash' && !isBelowMinimum && !exceedsContract && minimumPayment > 0 && (
                        <button
                          onClick={submitPayment}
                          disabled={uploadingProof}
                          className="w-full max-w-lg mx-auto mb-3 block py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 shadow-lg hover:shadow-xl transition-all cursor-pointer active:scale-[0.98] text-base disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
                        >
                          {uploadingProof ? (
                            <>
                              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Processing...
                            </>
                          ) : (
                            <>Pay ₱{parseFloat(customAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</>
                          )}
                        </button>
                      )}
                      <div className="text-center">
                        <button
                          onClick={() => {
                            setShowPaymentModal(false)
                            setSelectedBill(null)
                            setPaymentMethod('cash')
                          }}
                          className="text-gray-400 hover:text-gray-900 text-sm font-semibold cursor-pointer transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </>
        )}

        {/* Bill Receipt Modal */}
        {showBillReceiptModal && selectedBillReceipt && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white max-w-2xl w-full max-h-[90vh] overflow-y-auto p-2 rounded-xl relative">
              <button
                onClick={() => {
                  setShowBillReceiptModal(false)
                  setSelectedBillReceipt(null)
                }}
                className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <img src={selectedBillReceipt} alt="Bill Receipt" className="w-full rounded-lg" />
            </div>
          </div>
        )}

        {/* CASH CONFIRMATION MODAL */}
        {showCashConfirmModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowCashConfirmModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Cash Payment?</h3>
                <p className="text-gray-500 text-sm mb-6">
                  Are you sure you want to mark this bill as paid via CASH?
                  <br /><br />
                  This will notify the landlord to confirm your payment receipt.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCashConfirmModal(false)}
                    disabled={uploadingProof}
                    className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executePaymentSubmission}
                    disabled={uploadingProof}
                    className="flex-1 py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 shadow-lg hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {uploadingProof ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : 'Yes, Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Bill Modal */}
        {showEditModal && editingBill && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 rounded-xl shadow-2xl">
              <h3 className="text-xl font-bold mb-4">Edit House Rent Bill</h3>

              <form onSubmit={handleUpdateBill} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">House Rent Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full border-2 border-gray-200 focus:border-black px-3 py-2 rounded-lg font-medium outline-none"
                      value={editFormData.rent_amount}
                      onChange={e => setEditFormData({ ...editFormData, rent_amount: e.target.value })}
                    />
                  </div>
                  {/* ... (Other inputs follow same style) ... */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Due Date</label>
                    <input
                      type="date"
                      className="w-full border-2 border-gray-200 focus:border-black px-3 py-2 rounded-lg font-medium outline-none"
                      value={editFormData.due_date}
                      onChange={e => setEditFormData({ ...editFormData, due_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-black text-white font-bold rounded-xl cursor-pointer hover:bg-gray-800"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false)
                      setEditingBill(null)
                    }}
                    className="px-6 py-3 border-2 border-gray-200 text-black font-bold rounded-xl cursor-pointer hover:border-black"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Generic Confirmation Modal */}
        {confirmModal.isOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white border-2 border-black max-w-sm w-full p-6 rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200">
              <h3 className="text-xl font-bold text-black mb-2">{confirmModal.title}</h3>
              <p className="text-gray-600 mb-6">{confirmModal.message}</p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={closeConfirmModal}
                  className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleModalConfirm}
                  disabled={isProcessingModal}
                  className={`px-4 py-2 text-sm font-bold text-white rounded-lg shadow-sm transition-transform active:scale-95 flex items-center gap-2 ${confirmModal.confirmColor} ${isProcessingModal ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {isProcessingModal ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Processing...
                    </>
                  ) : confirmModal.confirmText}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}