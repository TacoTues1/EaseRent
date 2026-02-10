import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Link from 'next/link'
import Lottie from "lottie-react"
import loadingAnimation from "../assets/loading.json"
import StripePaymentForm from '../components/StripePaymentForm'

export default function PaymentsPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [payments, setPayments] = useState([])
  const [paymentRequests, setPaymentRequests] = useState([])
  const [properties, setProperties] = useState([])
  const [approvedApplications, setApprovedApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFormModal, setShowFormModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedBill, setSelectedBill] = useState(null)
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

  function handleModalConfirm() {
    if (!confirmModal.id) return

    if (confirmModal.type === 'confirm_payment') {
      executeConfirmPayment(confirmModal.id)
    } else if (confirmModal.type === 'cancel_bill') {
      executeCancelBill(confirmModal.id)
    } else if (confirmModal.type === 'reject_payment') {
      executeRejectPayment(confirmModal.id)
    }

    closeConfirmModal()
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

    setUserRole(data?.role || 'tenant')
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

      showToast.success(`${billTypeLabel} request sent!`, { duration: 4000, transition: "bounceIn" });

    } catch (error) {
      console.error('Error creating payment request:', error)
      showToast.error('Failed to send request', { duration: 4000, transition: "bounceIn" });
    }
  }

  const [maxPaymentLimit, setMaxPaymentLimit] = useState(null)

  async function handlePayBill(request) {
    setSelectedBill(request)
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
    // 1. Fetch Tenant Credit (filtered by occupancy)
    let credit = 0;
    if (userRole === 'tenant') {
      let query = supabase.from('tenant_balances').select('amount').eq('tenant_id', session.user.id);

      let targetOccupancyId = request.occupancy_id;

      // If bill has no occupancy_id (legacy/unlinked), find the current active occupancy
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
        // If still no occupancy ID found, force a mismatch/empty result to avoid showing legacy global balance
        // or filter for entries where occupancy_id IS NULL (if that's where global credit lives)
        // But users reported seeing OLD contract credit. Old contracts usually have occupancy_ids.
        // So simply NOT filtering was the issue. 
        // We MUST rely on occupancy_id. If none, we assume 0 or "General" credit (null).
        query = query.is('occupancy_id', null);
      }

      const { data } = await query.maybeSingle();
      credit = parseFloat(data?.amount || 0);
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
      // Bill doesn't have occupancy_id, try to find tenant's active occupancy
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

    console.log('Occupancy ID for calculation:', occupancyId);

    if (occupancyId) {
      try {
        const { data: occupancy, error: occError } = await supabase
          .from('tenant_occupancies')
          .select('contract_end_date, start_date')
          .eq('id', occupancyId)
          .single();

        console.log('Occupancy query result - data:', JSON.stringify(occupancy), 'error:', occError);

        if (occupancy) {
          // Use rent from the bill request since occupancy doesn't have rent_amount
          rentPerMonth = parseFloat(request.rent_amount || 0);
          endDate = occupancy.contract_end_date ? new Date(occupancy.contract_end_date) : null;
          startDate = occupancy.start_date ? new Date(occupancy.start_date) : null;

          console.log('Parsed dates - start:', startDate, 'end:', endDate);

          if (endDate && startDate) {
            // SIMPLIFIED: Calculate total months in contract by comparing start and end dates
            // Contract Feb 3 to Apr 3 = 2 months (Feb-Mar, Mar-Apr)
            const startYear = startDate.getFullYear();
            const startMonth = startDate.getMonth();
            const endYear = endDate.getFullYear();
            const endMonth = endDate.getMonth();

            // Total months in the contract period
            const totalContractMonths = (endYear - startYear) * 12 + (endMonth - startMonth);

            // ADJUSTMENT: If Security Deposit covers payment for the last month,
            // we should not allow paying for that last month in advance via cash.
            // Check if there is a security deposit in the request or occupancy
            const depositAmount = parseFloat(request.security_deposit_amount || occupancy?.security_deposit || 0);
            let adjustedTotalKey = totalContractMonths;

            // If deposit is sufficient to cover one month rent, effectively the last month is "pre-paid" by deposit
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
            console.log('Missing dates - startDate or endDate is null');
          }
        } else {
          console.log('No occupancy data returned');
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

    // FIX: For Renewal bills (which have advance_amount), minimum payment should be the full renewal amount (Rent + Advance)
    // Assuming credit can still apply, but we want to default the input to the full amount needed.
    if (request.advance_amount && parseFloat(request.advance_amount) > 0) {
      // For renewal, explicitly require the rent + advance sum if possible, or at least default to it
      // The user wants "minimum need to pay" to be the total. 
      // Actually, if we set minimumPayment to 'total', it forces the user to pay that much. 
      toPay = Math.max(0, total - credit);
    }

    setMinimumPayment(toPay);
    setIsBelowMinimum(false);

    // Ensure default is the FULL amount for renewals, or the calc amount otherwise
    setCustomAmount(Math.min(toPay, limit === Infinity ? toPay : limit).toFixed(2));

    setShowPaymentModal(true)
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

      // One-time charges (security deposit + utilities) - these don't count toward months
      const oneTimeCharges = securityDeposit + utilities;

      // Calculate rent portion only (payment minus one-time charges)
      const rentPortion = Math.max(0, amountNum - oneTimeCharges);

      // How many months of rent does this cover?
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

    // One-time charges (security deposit + utilities) - these don't count toward months
    const oneTimeCharges = securityDeposit + utilities;

    // Calculate rent portion only (payment minus one-time charges)
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

    // Add confirmation for manual payments
    if (paymentMethod === 'cash') {
      if (!window.confirm("Are you sure you want to mark this bill as paid via CASH? This will notify the landlord to confirm your payment.")) {
        return;
      }
    }

    const paymentAmount = parseFloat(customAmount) || 0;

    // Calculate total bill amount
    const totalBillAmount = (
      parseFloat(selectedBill.rent_amount || 0) +
      parseFloat(selectedBill.security_deposit_amount || 0) +
      parseFloat(selectedBill.advance_amount || 0) + // Include Advance in Total
      parseFloat(selectedBill.water_bill || 0) +
      parseFloat(selectedBill.electrical_bill || 0) +
      parseFloat(selectedBill.wifi_bill || 0) +
      parseFloat(selectedBill.other_bills || 0)
    ) - appliedCredit;

    // Block if payment amount is zero or negative
    if (paymentAmount <= 0) {
      showToast.error('Please enter a valid payment amount greater than ₱0.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
      return
    }

    // Block if payment is less than total bill (no partial payments)
    if (paymentAmount < totalBillAmount) {
      showToast.error(`Payment must be at least ₱${totalBillAmount.toLocaleString()}. Partial payments are not allowed.`, {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
      return
    }

    // Block if payment exceeds contract limit (double check)
    if (exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && paymentAmount > maxPaymentLimit)) {
      showToast.error(`Payment exceeds contract period. Maximum allowed is ${maxMonthsAllowed} month${maxMonthsAllowed > 1 ? 's' : ''} (₱${maxPaymentLimit?.toLocaleString() || 0}).`, {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
      return
    }

    // Validate QR payment requirements
    if (paymentMethod === 'qr_code') {
      if (!referenceNumber.trim() && !proofFile) {
        showToast.error('Please enter reference number or upload payment proof', {
          duration: 4000,
          progress: true,
          position: "top-center",
          transition: "bounceIn",
          icon: '',
          sound: true,
        })
        return
      }
    }

    setUploadingProof(true)

    try {
      let proofUrl = null

      // Upload proof if provided (for QR payments)
      if (proofFile) {
        const proofFileName = `proof_${Date.now()}_${proofFile.name}`
        const { data: proofUpload, error: proofError } = await supabase.storage
          .from('payment-files')
          .upload(proofFileName, proofFile)

        if (proofError) throw proofError

        const { data: proofPublic } = supabase.storage
          .from('payment-files')
          .getPublicUrl(proofFileName)
        proofUrl = proofPublic.publicUrl
      }

      // Calculate advance payment amount (rent paid beyond first month)
      // Security deposit and utilities are one-time, not counted as "advance rent"
      const oneTimeCharges = (
        parseFloat(selectedBill.security_deposit_amount || 0) +
        parseFloat(selectedBill.water_bill || 0) +
        parseFloat(selectedBill.electrical_bill || 0) +
        parseFloat(selectedBill.other_bills || 0)
      );
      const firstMonthRent = parseFloat(selectedBill.rent_amount || 0);
      const amountPaid = parseFloat(customAmount) + appliedCredit;

      // Rent portion = total paid minus one-time charges
      const rentPortion = Math.max(0, amountPaid - oneTimeCharges);

      // Advance = rent paid beyond first month
      const advancePaymentAmount = Math.max(0, rentPortion - firstMonthRent);

      console.log('Advance calculation:', { amountPaid, oneTimeCharges, rentPortion, firstMonthRent, advancePaymentAmount });

      // Update payment request status to pending_confirmation
      const { error } = await supabase
        .from('payment_requests')
        .update({
          status: 'pending_confirmation',
          paid_at: new Date().toISOString(),
          payment_method: paymentMethod,
          tenant_proof_url: proofUrl,
          tenant_reference_number: referenceNumber.trim() || null,
          advance_amount: advancePaymentAmount, // Store the advance amount
          amount_paid: amountPaid // Store total amount paid
        })
        .eq('id', selectedBill.id)

      if (error) throw error

      // Notify landlord to confirm payment
      const totalPaid = parseFloat(customAmount);
      const monthsText = monthsCovered > 1 ? ` (${monthsCovered} months advance)` : '';

      await supabase.from('notifications').insert({
        recipient: selectedBill.landlord,
        actor: session.user.id,
        type: 'payment_confirmation_needed',
        message: `Tenant paid ₱${totalPaid.toLocaleString()} for ${selectedBill.properties?.title || 'property'} via ${paymentMethod === 'qr_code' ? 'QR Code' : 'Cash'}${monthsText}. Please confirm payment receipt.`,
        link: '/payments',
        data: { payment_request_id: selectedBill.id }
      })

      // --- NEW: Send SMS and Email notifications to landlord for cash/QR payments ---
      try {
        // Fetch landlord profile for phone and name
        const { data: landlordProfile } = await supabase
          .from('profiles')
          .select('first_name, last_name, phone')
          .eq('id', selectedBill.landlord)
          .single();

        // Fetch tenant profile for name
        const { data: tenantProfile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.user.id)
          .single();

        const landlordName = landlordProfile?.first_name || 'Landlord';
        const tenantName = `${tenantProfile?.first_name || ''} ${tenantProfile?.last_name || ''}`.trim() || 'Tenant';
        const propertyTitle = selectedBill.properties?.title || 'property';

        // Send SMS to landlord
        if (landlordProfile?.phone) {
          const smsMessage = `💰 ${paymentMethod === 'qr_code' ? 'QR' : 'Cash'} Payment: ${tenantName} paid ₱${totalPaid.toLocaleString()} for ${propertyTitle}${monthsText}. Please confirm in your dashboard.`;

          fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phoneNumber: landlordProfile.phone,
              message: smsMessage
            })
          }).catch(err => console.error('SMS to landlord failed:', err));
        }

        // Send Email to landlord
        const { data: landlordEmail } = await supabase.rpc('get_user_email', { user_id: selectedBill.landlord });

        if (landlordEmail) {
          fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'cash_payment',
              landlordEmail,
              landlordName,
              tenantName,
              propertyTitle,
              amount: totalPaid,
              monthsCovered,
              paymentMethod
            })
          }).catch(err => console.error('Email to landlord failed:', err));
        }
      } catch (notifyErr) {
        console.error('Landlord notification error:', notifyErr);
        // Don't block the payment flow for notification errors
      }

      // Reset states
      setShowPaymentModal(false)
      setSelectedBill(null)
      setPaymentMethod('cash')
      setProofFile(null)
      setProofPreview(null)
      setReferenceNumber('')
      loadPaymentRequests()
      showToast.success('Payment submitted! Waiting for landlord confirmation.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    } catch (error) {
      console.error('Payment error:', error)
      showToast.error('Payment failed. Please try again.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    } finally {
      setUploadingProof(false)
    }
  }

  async function handleCreditPayment() {
    try {
      const res = await fetch('/api/payments/pay-with-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentRequestId: selectedBill.id, tenantId: session.user.id })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');

      // Notify landlord
      await supabase.from('notifications').insert({
        recipient: selectedBill.landlord,
        actor: session.user.id,
        type: 'payment_confirmation_needed',
        message: `Tenant paid for ${selectedBill.properties?.title || 'property'} using Credit Balance.`,
        link: '/payments',
        data: { payment_request_id: selectedBill.id }
      })

      showToast.success('Paid successfully using credit balance!', { duration: 4000, transition: "bounceIn" });
      setShowPaymentModal(false);
      loadPaymentRequests();
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
          console.log('Found pending PayMongo session, attempting silent verification:', requestId);

          // Silent check — don't show error toasts, just try to verify
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
              } else if (status === 500 && (data.error || '').includes('not found')) {
                // Stale entry — payment request no longer exists. Clean up silently.
                console.log('Removing stale PayMongo session (payment request not found):', requestId);
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
    // We open it empty first, then redirect it later
    const paymentWindow = window.open('', '_blank');

    if (!paymentWindow) {
      showToast.error("Popup blocked! Please allow popups for this site.", { duration: 4000 });
      setUploadingProof(false);
      return;
    }

    // Show a loading message in the new tab while we fetch the URL
    paymentWindow.document.write(`
      <html><head><title>Secure Payment</title></head>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f9fafb;">
        <div style="text-align:center"><h3>Initializing Secure Payment...</h3><p>Please wait.</p></div>
      </body></html>
    `);

    try {
      showToast.info('Initializing secure payment...', { duration: 2000 });

      const allMethods = ['gcash', 'paymaya', 'card', 'grab_pay', 'dob'];

      // 3. Call API to create checkout session
      const res = await fetch('/api/payments/create-paymongo-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(customAmount),
          description: `Payment for ${selectedBill.properties?.title || 'Property'}`,
          remarks: `Payment Request ID: ${selectedBill.id}`,
          paymentRequestId: selectedBill.id,
          allowedMethods: allMethods
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to connect to payment gateway');

      if (data.checkoutUrl) {
        // 4. CRITICAL: Store session ID in localStorage BEFORE redirecting
        //    This ensures the session persists even if the page reloads or polling stops
        const billId = selectedBill.id;
        const sessionId = data.checkoutSessionId;
        localStorage.setItem(`paymongo_session_${billId}`, sessionId);
        console.log('Stored PayMongo session in localStorage:', `paymongo_session_${billId}`, '=', sessionId);

        // 5. Redirect the new tab to PayMongo
        paymentWindow.location.href = data.checkoutUrl;

        showToast.info('Payment tab opened. Waiting for confirmation...', {
          duration: 5000,
          position: "top-center"
        });

        // 6. START POLLING: Check status every 5 seconds
        let attempts = 0;
        const maxAttempts = 60; // Stop after 5 minutes (60 * 5s)
        let pollingStopped = false; // local flag to prevent stale closure issues

        const pollInterval = setInterval(async () => {
          if (pollingStopped) return;
          attempts++;

          // Check if payment is successful
          const isSuccess = await checkPaymentStatus(billId, sessionId);

          if (isSuccess) {
            // SUCCESS: Stop polling
            pollingStopped = true;
            clearInterval(pollInterval);

            // Clear localStorage since payment is verified
            localStorage.removeItem(`paymongo_session_${billId}`);

            // Close the payment tab automatically
            try { if (paymentWindow && !paymentWindow.closed) paymentWindow.close(); } catch (e) { }

            // Update UI
            showToast.success('Payment verified successfully!', { duration: 5000, icon: '🎉' });
            loadPaymentRequests();
            setShowPaymentModal(false);
            setSelectedBill(null);
            setPaymentMethod('cash');
            setUploadingProof(false);
          }
          else if (attempts >= maxAttempts) {
            // TIMEOUT: Stop polling after 5 mins
            // NOTE: We intentionally do NOT remove the localStorage entry here
            //       so the useEffect on page load can try to verify it later
            pollingStopped = true;
            clearInterval(pollInterval);
            setUploadingProof(false);
            showToast.warning('Automatic verification timed out. The system will retry when you revisit this page, or check "View History".', { duration: 6000 });
          }

          // Safety: Stop polling if user closed the payment window
          try {
            if (paymentWindow && paymentWindow.closed && attempts > 3) {
              // Give a few extra poll cycles after tab close in case payment just completed
              if (attempts > 6) {
                pollingStopped = true;
                clearInterval(pollInterval);
                setUploadingProof(false);
                // Don't remove from localStorage — next page load will retry
              }
            }
          } catch (e) {
            // Cross-origin check may fail, ignore
          }

        }, 5000); // Check every 5 seconds

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
      let extraMonths = 0;
      if (monthlyRent > 0) {
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
              payment_id: payment.id // Link to the same payment record
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

  // Calculate total income including all bills
  const totalIncome = payments.reduce((sum, p) => {
    const rent = parseFloat(p.amount || 0)
    const water = parseFloat(p.water_bill || 0)
    const electrical = parseFloat(p.electrical_bill || 0)
    const other = parseFloat(p.other_bills || 0)
    return sum + rent + water + electrical + other
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
                  { id: 'water', label: 'Water', icon: '' },
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
                  <span className="font-bold">Note:</span> House rent payment bills are sent automatically 3 days before due date. WiFi and electricity only send <strong>reminder notifications</strong> (SMS & email).
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
        <div className="bg-white border-2 border-black overflow-hidden mb-6 rounded-xl shadow-md">
          <div className="px-6 py-4 border-b-2 border-black bg-white flex justify-between items-center">
            <h2 className="text-lg font-bold text-black uppercase tracking-wider">
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
                {paymentRequests.map(request => {
                  const rent = parseFloat(request.rent_amount) || 0
                  const securityDeposit = parseFloat(request.security_deposit_amount) || 0
                  const advance = parseFloat(request.advance_amount) || 0
                  const total = rent + (parseFloat(request.water_bill) || 0) + (parseFloat(request.electrical_bill) || 0) + (parseFloat(request.other_bills) || 0) + securityDeposit + advance
                  const isPastDue = request.due_date && new Date(request.due_date) < new Date() && request.status === 'pending'

                  return (
                    <div key={request.id} className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-bold text-sm">{request.properties?.title || 'Property'}</div>
                          <div className="text-xs font-bold text-blue-600 mt-1">
                            {request.bills_description}
                          </div>
                          <div className="text-xs text-gray-500">
                            {userRole === 'landlord'
                              ? `Tenant: ${request.tenant_profile?.first_name || ''} ${request.tenant_profile?.last_name || ''}`
                              : `Landlord: ${request.landlord_profile?.first_name || ''} ${request.landlord_profile?.last_name || ''}`}
                          </div>
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

                      <div className="flex items-baseline gap-1 mb-3">
                        <span className="text-xs font-bold text-gray-500 uppercase">Total</span>
                        <span className="text-xl font-bold">₱{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>

                      <div className="flex gap-2">
                        {userRole === 'tenant' && request.status === 'pending' && (
                          <button
                            onClick={() => handlePayBill(request)}
                            className="flex-1 px-3 py-2 bg-black text-white text-xs font-bold rounded cursor-pointer"
                          >
                            Pay Bill
                          </button>
                        )}
                        {/* Add other mobile buttons here similar to desktop */}
                        {userRole === 'landlord' && request.status === 'pending' && (
                          <div className="flex gap-2 w-full mt-2">
                            <button
                              onClick={() => confirmPayment(request.id)}
                              className="flex-1 px-3 py-2 bg-green-600 text-white text-xs font-bold rounded cursor-pointer"
                            >
                              Mark Paid
                            </button>

                            <button
                              onClick={() => handleEditBill(request)}
                              className="px-3 py-2 border border-gray-300 text-black text-xs font-bold rounded cursor-pointer"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleCancelBill(request.id)}
                              className="px-3 py-2 text-red-600 bg-red-50 text-xs font-bold rounded cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {/* Add confirm/reject buttons for pending_confirmation status on mobile */}
                        {userRole === 'landlord' && request.status === 'pending_confirmation' && (
                          <div className="flex gap-2 w-full mt-2">
                            <button
                              onClick={() => confirmPayment(request.id)}
                              className="flex-1 px-3 py-2 bg-green-600 text-white text-xs font-bold rounded cursor-pointer"
                            >
                              Confirm Payment
                            </button>
                            <button
                              onClick={() => rejectPayment(request.id)}
                              className="px-3 py-2 bg-red-50 text-red-600 text-xs font-bold rounded cursor-pointer"
                            >
                              Reject
                            </button>
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
                      {/* UPDATED: Reduced padding (px-3 py-3) for all headers to save space */}
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Property</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {userRole === 'landlord' ? 'Tenant' : 'Landlord'}
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Bill Type</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Month</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Message</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Ref No.</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Method</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Due Date</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paymentRequests.map(request => {
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

                      return (
                        <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                          {/* Property - constrained width */}
                          <td className="px-2 py-1.5">
                            <div className="max-w-[150px]">
                              <div className="text-sm font-bold text-black truncate" title={request.properties?.title}>
                                {request.properties?.title || 'N/A'}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-gray-500 truncate" title={`${request.properties?.address}, ${request.properties?.city || ''}`}>
                                <svg className="w-3 h-3 text-gray-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 9a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                <span className="truncate">{request.properties?.address}, {request.properties?.city || ''}</span>
                              </div>
                            </div>
                          </td>

                          {/* Name - constrained width */}
                          <td className="px-2 py-1.5 text-sm text-gray-600">
                            <div className="max-w-[120px] truncate" title={userRole === 'landlord' ? `${request.tenant_profile?.first_name} ${request.tenant_profile?.last_name}` : `${request.landlord_profile?.first_name} ${request.landlord_profile?.last_name}`}>
                              {userRole === 'landlord'
                                ? `${request.tenant_profile?.first_name || ''} ${request.tenant_profile?.last_name || ''}`
                                : `${request.landlord_profile?.first_name || ''} ${request.landlord_profile?.last_name || ''}`}
                            </div>
                          </td>

                          <td className="px-2 py-1.5">
                            <span className="text-xs font-bold text-white-600 bg-[#F2F3F4] px-2 py-1 rounded whitespace-nowrap">
                              {billType}
                            </span>
                          </td>

                          <td className="px-2 py-1.5">
                            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                              {billType === 'House Rent' ? getRentMonth(request.due_date) : '-'}
                            </span>
                          </td>

                          <td className="px-2 py-1.5">
                            <div className="text-xs text-gray-500 whitespace-normal break-words max-w-[200px]" title={request.bills_description}>
                              {request.bills_description || '-'}
                            </div>
                          </td>

                          <td className="px-2 py-1.5">
                            <div className="text-sm font-bold text-black whitespace-nowrap">
                              ₱{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                            {rent > 0 && <div className="text-[10px] text-gray-400 whitespace-nowrap">Rent: ₱{rent.toLocaleString()}</div>}
                          </td>

                          <td className="px-2 py-1.5">
                            <span className="text-xs text-gray-500 font-mono">
                              {request.tenant_reference_number || '-'}
                            </span>
                          </td>

                          <td className="px-2 py-1.5">
                            <span className="text-xs font-bold text-gray-600 uppercase">
                              {request.payment_method === 'paymongo' ? 'E-Wallet/Card' :
                                request.payment_method === 'stripe' ? 'Stripe' :
                                  request.payment_method === 'qr_code' ? 'QR Code' :
                                    request.payment_method === 'cash' ? 'Cash' : '-'}
                            </span>
                          </td>

                          <td className="px-2 py-1.5">
                            <span className={`text-sm whitespace-nowrap ${isPastDue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                              {request.due_date ? new Date(request.due_date).toLocaleDateString() : 'N/A'}
                            </span>
                          </td>

                          <td className="px-2 py-1.5">
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

                          <td className="px-2 py-1.5">
                            <div className="flex gap-2">
                              {userRole === 'tenant' && request.status === 'pending' && (
                                <button
                                  onClick={() => handlePayBill(request)}
                                  className="px-3 py-1.5 bg-black text-white text-xs font-bold rounded hover:bg-gray-800 cursor-pointer shadow-sm whitespace-nowrap"
                                >
                                  Pay Now
                                </button>
                              )}
                              {userRole === 'tenant' && request.status === 'pending_confirmation' && (
                                <span className="text-xs font-bold text-gray-400 whitespace-nowrap">Wait for approval</span>
                              )}
                              {userRole === 'tenant' && request.status === 'rejected' && (
                                <button
                                  onClick={() => handlePayBill(request)}
                                  className="px-3 py-1.5 bg-black text-white text-xs font-bold rounded hover:bg-gray-800 cursor-pointer shadow-sm whitespace-nowrap"
                                >
                                  Resend
                                </button>
                              )}
                              {userRole === 'landlord' && request.status === 'pending' && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => confirmPayment(request.id)}
                                    className="px-2 py-1 bg-green-600 text-white hover:bg-green-700 text-xs font-bold rounded cursor-pointer transition-all shadow-sm flex items-center gap-1"
                                    title="Mark as Paid (Cash)"
                                  >
                                    <span>Paid</span>
                                  </button>
                                  <button
                                    onClick={() => handleEditBill(request)}
                                    className="px-2 py-1 border border-gray-300 hover:border-black text-black text-xs font-bold rounded cursor-pointer transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleCancelBill(request.id)}
                                    className="px-2 py-1 text-red-600 hover:bg-red-50 text-xs font-bold rounded cursor-pointer transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                              {userRole === 'landlord' && request.status === 'pending_confirmation' && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => confirmPayment(request.id)}
                                    className="px-2 py-1 bg-black text-white hover:bg-gray-800 text-[10px] font-bold rounded cursor-pointer transition-all"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => rejectPayment(request.id)}
                                    className="px-2 py-1 border border-black text-black hover:bg-black hover:text-white text-[10px] font-bold rounded cursor-pointer transition-all"
                                  >
                                    ✗
                                  </button>
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

        {/* Payment Modal for Tenants */}
        {showPaymentModal && selectedBill && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white border-2 border-black max-w-md w-full max-h-[90vh] overflow-y-auto p-6 rounded-2xl shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-black">Pay Bill</h3>
                <button
                  onClick={() => {
                    setShowPaymentModal(false)
                    setSelectedBill(null)
                    setPaymentMethod('cash')
                    setProofFile(null)
                    setProofPreview(null)
                    setReferenceNumber('')
                  }}
                  className="text-gray-400 hover:text-black cursor-pointer"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="space-y-6">
                {/* Property Info */}
                <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Property</div>
                  <div className="font-bold text-black">{selectedBill.properties?.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{selectedBill.properties?.address}</div>
                </div>

                {/* View Bill Receipt Button */}
                {selectedBill.bill_receipt_url && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBillReceipt(selectedBill.bill_receipt_url)
                      setShowBillReceiptModal(true)
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-black border-2 border-black rounded-lg hover:bg-gray-50 font-bold cursor-pointer transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    View Original Bill Receipt
                  </button>
                )}

                {/* Bill Breakdown */}
                <div className="border-2 border-black p-4 rounded-xl">
                  <div className="text-sm font-bold text-black mb-3 border-b border-gray-100 pb-2">
                    Amount Details
                    {selectedBill.is_move_in_payment && (
                      <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">Move-in Payment</span>
                    )}
                    {selectedBill.is_renewal_payment && (
                      <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">Renewal Payment</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {parseFloat(selectedBill.rent_amount || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">House Rent</span>
                        <span className="font-bold">₱{parseFloat(selectedBill.rent_amount || 0).toLocaleString()}</span>
                      </div>
                    )}
                    {parseFloat(selectedBill.security_deposit_amount || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Security Deposit</span>
                        <span className="font-bold text-amber-600">₱{parseFloat(selectedBill.security_deposit_amount).toLocaleString()}</span>
                      </div>
                    )}
                    {parseFloat(selectedBill.advance_amount || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Advance Payment</span>
                        <span className="font-bold text-indigo-600">₱{parseFloat(selectedBill.advance_amount).toLocaleString()}</span>
                      </div>
                    )}
                    {parseFloat(selectedBill.water_bill || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Water</span>
                        <span className="font-bold">₱{parseFloat(selectedBill.water_bill).toLocaleString()}</span>
                      </div>
                    )}
                    {parseFloat(selectedBill.electrical_bill || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Electricity</span>
                        <span className="font-bold">₱{parseFloat(selectedBill.electrical_bill).toLocaleString()}</span>
                      </div>
                    )}
                    {parseFloat(selectedBill.other_bills || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Other</span>
                        <span className="font-bold">₱{parseFloat(selectedBill.other_bills).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold pt-3 border-t border-black mt-2">
                      <span>Total</span>
                      <span>
                        ₱{(
                          parseFloat(selectedBill.rent_amount || 0) +
                          parseFloat(selectedBill.security_deposit_amount || 0) +
                          parseFloat(selectedBill.advance_amount || 0) +
                          parseFloat(selectedBill.water_bill || 0) +
                          parseFloat(selectedBill.electrical_bill || 0) +
                          parseFloat(selectedBill.other_bills || 0)
                        ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {appliedCredit > 0 && (
                      <div className="flex justify-between text-sm text-green-600 font-bold mt-1">
                        <span>Less Credit Balance</span>
                        <span>-₱{appliedCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Custom Amount Input */}
                <div className="border-2 border-black p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-black">Amount to Pay</label>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-500">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={customAmount}
                      onChange={(e) => handleCustomAmountChange(e.target.value)}
                      className={`w-full border-2 ${exceedsContract || isBelowMinimum ? 'border-red-500' : 'border-gray-200'} focus:border-black rounded-lg pl-8 pr-3 py-3 font-bold text-lg outline-none transition-colors`}
                    />
                  </div>

                  {/* Minimum Payment Warning */}
                  {isBelowMinimum && (
                    <p className="text-xs font-bold text-red-500 mt-2">
                      Minimum payment is ₱{minimumPayment.toLocaleString()}. Partial payments are not allowed.
                    </p>
                  )}

                  {/* Months Covered Display */}
                  {monthlyRent > 0 && parseFloat(customAmount) > 0 && (
                    <div className={`mt-3 p-3 rounded-lg ${exceedsContract ? 'bg-red-50 border border-red-200' : monthsCovered > 1 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold ${exceedsContract ? 'text-red-700' : monthsCovered > 1 ? 'text-green-700' : 'text-gray-700'}`}>
                          {exceedsContract ? 'Exceeds Contract Period!' : monthsCovered > 1 ? `Covers ${monthsCovered} months` : 'Covers 1 month'}
                        </span>
                        {monthsCovered > 1 && !exceedsContract && contractEndDate && (
                          <span className="text-xs text-gray-500">
                            Until {new Date(new Date(selectedBill.due_date).setMonth(new Date(selectedBill.due_date).getMonth() + monthsCovered - 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                      {exceedsContract && contractEndDate && (
                        <p className="text-xs text-red-600 mt-1">
                          Your contract ends on {contractEndDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
                          Payment covers {monthsCovered} month{monthsCovered > 1 ? 's' : ''} but contract only allows {maxMonthsAllowed} month{maxMonthsAllowed > 1 ? 's' : ''}.
                        </p>
                      )}
                    </div>
                  )}

                  {maxPaymentLimit !== null && parseFloat(customAmount) > maxPaymentLimit && (
                    <p className="text-xs font-bold text-red-500 mt-2">
                      Amount exceeds contract limit (Max: ₱{maxPaymentLimit.toLocaleString()})
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Enter the amount you wish to pay today. Excess amount will be stored as credit.
                  </p>
                </div>

                {/* Check if credit actually covers the bill */}
                {minimumPayment <= 0 && appliedCredit > 0 ? (
                  <div className="mt-6">
                    <div className="bg-green-50 border border-green-200 p-4 rounded-xl mb-4">
                      <p className="text-green-800 font-bold text-center">✨ Your credit balance covers this bill!</p>
                    </div>
                    <button
                      onClick={handleCreditPayment}
                      className="w-full bg-black text-white p-4 rounded-xl font-bold hover:bg-gray-800 transition-colors shadow-lg"
                    >
                      Pay with Credit Balance
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Select Payment Method</label>
                    <div className="grid grid-cols-3 gap-3">
                      {/* 1. Cash Button */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        disabled={isBelowMinimum || exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && parseFloat(customAmount) > maxPaymentLimit)}
                        className={`p-4 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${isBelowMinimum || exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && parseFloat(customAmount) > maxPaymentLimit)
                          ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                          : paymentMethod === 'cash'
                            ? 'border-black bg-black text-white'
                            : 'border-gray-200 bg-white hover:border-gray-400 text-black'
                          }`}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        <span className="font-bold text-sm">Cash</span>
                      </button>

                      {/* 2. Stripe Button */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('stripe')}
                        disabled={isBelowMinimum || exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && parseFloat(customAmount) > maxPaymentLimit)}
                        className={`p-4 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${paymentMethod === 'stripe'
                          ? 'border-[#6772e5] bg-[#6772e5] text-white'
                          : 'border-gray-200 bg-white hover:border-[#6772e5] text-black'
                          } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200`}
                      >
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.768-1.435 1.834-1.435 1.412 0 2.615.696 3.774 1.562l-3.242-4.197C11.83.748 10.155 0 8.528 0 5.093 0 2.502 2.659 2.502 6.52c0 6.641 8.816 6.307 8.816 9.389 0 .884-.79 1.462-1.954 1.462-1.636 0-3.098-.823-4.322-1.859l3.359 4.385c1.464 1.054 3.09 1.558 4.708 1.558 3.596 0 6.138-2.585 6.138-6.425 0-6.738-8.852-6.27-8.852-9.406 0-.825.797-1.412 1.833-1.412 1.348 0 2.559.637 3.66 1.488l1.458-2.146c-1.282-1.1-2.934-1.688-4.664-1.688-2.673 0-4.523 1.36-4.523 3.329 0 2.946 4.09 4.384 4.09 6.685 0 1.583-1.42 2.457-3.031 2.457-1.487 0-2.844-.657-3.924-1.666l-1.378 2.029c1.605 1.636 3.67 2.375 5.765 2.375 2.828 0 4.795-1.418 4.795-3.484 0-3.08-4.09-4.512-4.09-6.792z" />
                        </svg>
                        <span className="font-bold text-sm">Stripe</span>
                      </button>

                      {/* 3. Unified PayMongo Button (GCash/Maya/Cards) */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('paymongo')}
                        disabled={isBelowMinimum || exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && parseFloat(customAmount) > maxPaymentLimit)}
                        className={`p-4 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${paymentMethod === 'paymongo'
                          ? 'border-[#00BFA5] bg-[#00BFA5] text-white'
                          : 'border-gray-200 bg-white hover:border-[#00BFA5] text-black'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <div className="flex -space-x-1 justify-center items-center">
                          <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-[8px] font-bold text-blue-600 border border-gray-200 z-10">G</div>
                          <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-[8px] font-bold text-green-600 border border-gray-200 z-20">M</div>
                          <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center border border-gray-200 z-30">
                            <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                          </div>
                        </div>
                        <span className="font-bold text-xs text-center leading-tight">GCash / Maya<br />Cards</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* PayMongo Unified Flow Display */}
                {(paymentMethod === 'paymongo') && (
                  <div className="space-y-4 p-5 rounded-2xl border bg-teal-50 border-teal-200">
                    {isBelowMinimum ? (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                        <svg className="w-12 h-12 mx-auto text-red-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <p className="font-bold text-red-700 mb-2">Payment Below Minimum</p>
                        <p className="text-sm text-red-600">Minimum payment: ₱{minimumPayment.toLocaleString()}</p>
                      </div>
                    ) : exceedsContract ? (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                        <p className="font-bold text-red-700">Payment Exceeds Contract</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <h4 className="font-bold text-lg text-gray-900 mb-2">Pay securely with PayMongo</h4>

                        <div className="flex justify-center flex-wrap gap-2 mb-2">
                          <div className="bg-white border rounded px-2 py-1 flex items-center gap-1 shadow-sm">
                            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                            <span className="text-[10px] font-bold text-gray-700">GCash</span>
                          </div>
                          <div className="bg-white border rounded px-2 py-1 flex items-center gap-1 shadow-sm">
                            <div className="w-4 h-4 rounded-full bg-green-500"></div>
                            <span className="text-[10px] font-bold text-gray-700">Maya</span>
                          </div>
                          <div className="bg-white border rounded px-2 py-1 flex items-center gap-1 shadow-sm">
                            <div className="w-4 h-4 rounded-full bg-indigo-500"></div>
                            <span className="text-[10px] font-bold text-gray-700">Cards</span>
                          </div>
                          <div className="bg-white border rounded px-2 py-1 flex items-center gap-1 shadow-sm">
                            <div className="w-4 h-4 rounded-full bg-green-600"></div>
                            <span className="text-[10px] font-bold text-gray-700">GrabPay</span>
                          </div>
                        </div>

                        <p className="text-xs text-gray-500">
                          You will be redirected to PayMongo's secure checkout page where you can choose <strong>GCash, Maya, GrabPay, or Credit/Debit Card</strong> to complete your payment.
                        </p>

                        <div className="bg-white/60 rounded-xl p-3 mb-4 inline-block px-6 border border-gray-200 shadow-sm">
                          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Total Amount</p>
                          <p className="text-2xl font-black text-black">₱{parseFloat(customAmount).toLocaleString()}</p>
                        </div>

                        <button
                          onClick={handlePayMongoPayment}
                          disabled={uploadingProof}
                          className="w-full px-4 py-3 bg-[#00BFA5] text-white font-bold rounded-xl hover:bg-[#008f7a] cursor-pointer shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                          {uploadingProof ? 'Redirecting...Please wait...' : `Pay ₱${parseFloat(customAmount).toLocaleString()}`}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* PayMongo / GCash / Maya / Card Flow */}


                <div>
                  {/* Stripe Payment Flow */}
                  {paymentMethod === 'stripe' && (
                    <div className="space-y-4 bg-[#6772e5]/10 border border-[#6772e5]/30 p-4 rounded-xl">
                      {isBelowMinimum ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                          <svg className="w-12 h-12 mx-auto text-red-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          <p className="font-bold text-red-700 mb-2">Payment Below Minimum</p>
                          <p className="text-sm text-red-600">Minimum payment: ₱{minimumPayment.toLocaleString()}</p>
                          <p className="text-xs text-red-500 mt-2">Partial payments are not allowed.</p>
                        </div>
                      ) : exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && parseFloat(customAmount) > maxPaymentLimit) ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                          <svg className="w-12 h-12 mx-auto text-red-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          <p className="font-bold text-red-700 mb-2">Payment Exceeds Contract Period</p>
                          <p className="text-sm text-red-600">Maximum allowed: ₱{maxPaymentLimit?.toLocaleString() || 0} ({maxMonthsAllowed} month{maxMonthsAllowed > 1 ? 's' : ''})</p>
                          <p className="text-xs text-red-500 mt-2">Please reduce the payment amount to proceed.</p>
                        </div>
                      ) : (
                        <>
                          <div className="text-center mb-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Pay with Stripe</p>
                            <p className="text-xs text-gray-500">Secure payment powered by Stripe</p>
                          </div>

                          <StripePaymentForm
                            amount={parseFloat(customAmount || 0).toFixed(2)}
                            description={`EaseRent Payment - ${selectedBill.properties?.title}`}
                            paymentRequestId={selectedBill.id}
                            onSuccess={handleStripeSuccess}
                            onCancel={() => {
                              showToast.error('Payment cancelled', { duration: 4000, transition: "bounceIn" });
                            }}
                          />
                        </>
                      )}
                    </div>
                  )}

                  {/* Buttons */}
                  <div className="flex gap-3 pt-2">
                    {paymentMethod !== 'stripe' && paymentMethod !== 'paymongo' && parseFloat(customAmount) > 0 && (
                      <button
                        onClick={submitPayment}
                        disabled={uploadingProof || isBelowMinimum || (maxPaymentLimit !== null && parseFloat(customAmount) > maxPaymentLimit)}
                        className="flex-1 px-4 py-3 bg-black text-white hover:bg-gray-800 font-bold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all"
                      >
                        {uploadingProof ? 'Submitting...' : 'Submit Payment'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowPaymentModal(false)
                        setSelectedBill(null)
                        setPaymentMethod('cash')
                        setPaypalProcessing(false)
                      }}
                      className={`px-4 py-3 border-2 border-gray-200 text-black font-bold rounded-xl hover:border-black cursor-pointer transition-colors ${paymentMethod === 'stripe' || paymentMethod === 'paymongo' || parseFloat(customAmount) <= 0 ? 'flex-1' : ''}`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                  className={`px-4 py-2 text-sm font-bold text-white rounded-lg shadow-sm cursor-pointer transition-transform active:scale-95 ${confirmModal.confirmColor}`}
                >
                  {confirmModal.confirmText}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}