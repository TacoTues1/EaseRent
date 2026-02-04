import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Link from 'next/link'
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
              limit = Math.max(0, maxContractValue + securityDeposit - credit);
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
    const toPay = Math.max(0, total - credit);
    setMinimumPayment(toPay);
    setIsBelowMinimum(false);

    // Ensure default doesn't exceed limit
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

    // Total bill = rent + deposit + utilities
    const currentBillTotal = currentBillRent + securityDeposit + utilities;

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

    const paymentAmount = parseFloat(customAmount) || 0;

    // Calculate total bill amount
    const totalBillAmount = (
      parseFloat(selectedBill.rent_amount || 0) +
      parseFloat(selectedBill.security_deposit_amount || 0) +
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

  async function confirmPayment(requestId) {
    setConfirmPaymentId(null)
    const request = paymentRequests.find(r => r.id === requestId)
    if (!request) return

    const confirmPromise = new Promise(async (resolve, reject) => {
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
        let extraMonths = 0;
        if (monthlyRent > 0) {
          const excessAmount = billTotal - parseFloat(request.rent_amount || 0) - parseFloat(request.security_deposit_amount || 0) - parseFloat(request.water_bill || 0) - parseFloat(request.electrical_bill || 0) - parseFloat(request.other_bills || 0);
          // If there's an advance_amount field, calculate months from that
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

        // Update payment request status to paid
        await supabase
          .from('payment_requests')
          .update({
            status: 'paid',
            payment_id: payment.id
          })
          .eq('id', requestId)

        // Handle advance payment - create and mark future months as paid
        if (extraMonths > 0 && request.due_date && request.occupancy_id) {
          const baseDueDate = new Date(request.due_date);

          for (let i = 1; i <= extraMonths; i++) {
            const futureDueDate = new Date(baseDueDate);
            futureDueDate.setMonth(futureDueDate.getMonth() + i);

            // Check if this would exceed contract end date
            if (contractEndDate && futureDueDate > contractEndDate) {
              break; // Don't create bills beyond contract end
            }

            // Create a new payment_request for this advance month - status is PENDING for landlord to confirm
            const { data: advanceBill, error: advanceBillError } = await supabase
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
            // NOTE: Payment record will be created when landlord confirms the advance payment
          }
        }

        // Calculate remaining credit after advance months
        // Total paid amount from the request
        const totalPaidByTenant = parseFloat(request.amount_paid || 0);

        // If amount_paid is stored, calculate actual excess
        if (totalPaidByTenant > 0) {
          // Bill amount (what was owed)
          const billOwed = (
            parseFloat(request.rent_amount || 0) +
            parseFloat(request.security_deposit_amount || 0) +
            parseFloat(request.water_bill || 0) +
            parseFloat(request.electrical_bill || 0) +
            parseFloat(request.wifi_bill || 0) +
            parseFloat(request.other_bills || 0)
          );

          // Amount used for advance months (full months only)
          const usedForAdvance = extraMonths * monthlyRent;

          // Remaining credit = Total Paid - Bill Owed - Advance Used
          const remainingCredit = totalPaidByTenant - billOwed - usedForAdvance;

          if (remainingCredit > 0 && request.occupancy_id) {
            // Save excess to tenant_balances
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

        // Notify tenant that payment is confirmed
        const monthsText = extraMonths > 0 ? ` (${extraMonths + 1} months - advance payments pending confirmation)` : '';
        await supabase.from('notifications').insert({
          recipient: request.tenant,
          actor: session.user.id,
          type: 'payment_confirmed',
          message: `Your payment for ${request.properties?.title || 'property'} has been confirmed by your landlord${monthsText}.`,
          link: '/payments'
        })

        loadPaymentRequests()
        loadPayments()
        resolve(extraMonths > 0 ? `Payment confirmed! ${extraMonths} advance month(s) created for your review.` : 'Payment confirmed and recorded!')
      } catch (error) {
        console.error('Payment record error:', error)
        reject('Failed to confirm payment')
      }
    })
    showToast.info("Confirming payment...", {
      duration: 4000,
      progress: true,
      position: "top-center",
      transition: "topBounce",
      icon: '',
      sound: true,
    });
  }

  async function handleCancelBill(requestId) {
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
  async function rejectPayment(requestId) {
    setConfirmPaymentId(null)
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

  // Calculate chart data breakdown
  const getMonthlyData = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const data = [];

    // Get last 12 months (whole year view)
    for (let i = 11; i >= 0; i--) {
      const monthIndex = (currentMonth - i + 12) % 12;
      data.push({
        label: months[monthIndex],
        rent: 0,
        water: 0,
        electric: 0,
        other: 0,
        total: 0
      });
    }

    payments.forEach(payment => {
      const paymentDate = new Date(payment.paid_at);
      const monthIndex = paymentDate.getMonth();
      const monthLabel = months[monthIndex];
      const dataPoint = data.find(d => d.label === monthLabel);

      if (dataPoint) {
        const rent = parseFloat(payment.amount || 0);
        const water = parseFloat(payment.water_bill || 0);
        const electric = parseFloat(payment.electrical_bill || 0);
        const other = parseFloat(payment.other_bills || 0);

        dataPoint.rent += rent;
        dataPoint.water += water;
        dataPoint.electric += electric;
        dataPoint.other += other;
        dataPoint.total += (rent + water + electric + other);
      }
    });

    return data;
  }

  const chartData = getMonthlyData();
  const maxChartValue = Math.max(...chartData.map(d => d.total), 1000); // Prevent division by zero

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
    <div className="min-h-screen bg-white p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Stats Cards */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white border-2 border-black p-6 rounded-xl ">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Total Income</div>
                <div className="text-3xl font-bold">₱{totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-white border-2 border-black p-6 rounded-xl ">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Total Payments</div>
                <div className="text-3xl font-bold">{payments.length}</div>
              </div>
            </div>

            {/* Income Breakdown Graph */}
            <div className="lg:col-span-2 bg-white border-2 border-black p-6 rounded-xl  flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Monthly Expenses Breakdown</h3>
                <div className="flex gap-2 text-[10px] font-bold uppercase">
                  <div className="flex items-center gap-1"><div className="w-2 h-2 bg-black"></div>Rent</div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 bg-gray-600"></div>Water</div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 bg-gray-400"></div>Electric</div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 bg-gray-200"></div>Other</div>
                </div>
              </div>

              <div className="flex-1 flex items-end gap-2 sm:gap-3 h-48">
                {chartData.map((data, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2 group cursor-pointer h-full justify-end">
                    <div className="relative w-full flex flex-col-reverse h-full justify-start items-center">
                      {/* Tooltip */}
                      <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap z-20 pointer-events-none">
                        Total: ₱{data.total.toLocaleString()}
                      </div>

                      {/* Stacked Bars */}
                      <div className="w-full flex flex-col-reverse justify-start items-center h-full relative">
                        {/* Rent */}
                        <div
                          className="w-full bg-black transition-all"
                          style={{ height: `${(data.rent / maxChartValue) * 100}%` }}
                          title={`Rent: ₱${data.rent.toLocaleString()}`}
                        ></div>
                        {/* Water */}
                        <div
                          className="w-full bg-gray-600 transition-all"
                          style={{ height: `${(data.water / maxChartValue) * 100}%` }}
                          title={`Water: ₱${data.water.toLocaleString()}`}
                        ></div>
                        {/* Electric */}
                        <div
                          className="w-full bg-gray-400 transition-all"
                          style={{ height: `${(data.electric / maxChartValue) * 100}%` }}
                          title={`Electric: ₱${data.electric.toLocaleString()}`}
                        ></div>
                        {/* Other */}
                        <div
                          className="w-full bg-gray-200 rounded-t-sm transition-all"
                          style={{ height: `${(data.other / maxChartValue) * 100}%` }}
                          title={`Other: ₱${data.other.toLocaleString()}`}
                        ></div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 mt-1">{data.label}</span>
                  </div>
                ))}
              </div>
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
            <div className="p-8 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-black"></div>
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
                                  'bg-white text-black border-black'
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
                            {confirmPaymentId === request.id ? (
                              <div className="flex gap-2 flex-1">
                                <button onClick={() => confirmPayment(request.id)} className="flex-1 px-3 py-2 bg-green-600 text-white text-xs font-bold rounded cursor-pointer">Confirm</button>
                                <button onClick={() => setConfirmPaymentId(null)} className="px-3 py-2 bg-gray-200 text-black text-xs font-bold rounded cursor-pointer">Cancel</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmPaymentId(request.id)}
                                className="flex-1 px-3 py-2 bg-green-600 text-white text-xs font-bold rounded cursor-pointer"
                              >
                                Mark Paid
                              </button>
                            )}

                            <button
                              onClick={() => handleEditBill(request)}
                              className="px-3 py-2 border border-gray-300 text-black text-xs font-bold rounded cursor-pointer"
                            >
                              Edit
                            </button>

                            {cancelBillId === request.id ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleCancelBill(request.id)} className="px-3 py-2 bg-red-600 text-white text-xs font-bold rounded">Confirm Cancel</button>
                                <button onClick={() => setCancelBillId(null)} className="px-3 py-2 bg-gray-200 text-black text-xs font-bold rounded">Back</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setCancelBillId(request.id)}
                                className="px-3 py-2 text-red-600 bg-red-50 text-xs font-bold rounded cursor-pointer"
                              >
                                Cancel
                              </button>
                            )}
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
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Property</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {userRole === 'landlord' ? 'Tenant' : 'Landlord'}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Bill Type</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Month</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Message</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Due Date</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
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
                          <td className="px-3 py-3">
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
                          <td className="px-3 py-3 text-sm text-gray-600">
                            <div className="max-w-[120px] truncate" title={userRole === 'landlord' ? `${request.tenant_profile?.first_name} ${request.tenant_profile?.last_name}` : `${request.landlord_profile?.first_name} ${request.landlord_profile?.last_name}`}>
                              {userRole === 'landlord'
                                ? `${request.tenant_profile?.first_name || ''} ${request.tenant_profile?.last_name || ''}`
                                : `${request.landlord_profile?.first_name || ''} ${request.landlord_profile?.last_name || ''}`}
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <span className="text-xs font-bold text-white-600 bg-[#F2F3F4] px-2 py-1 rounded whitespace-nowrap">
                              {billType}
                            </span>
                          </td>

                          <td className="px-3 py-3">
                            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                              {billType === 'House Rent' ? getRentMonth(request.due_date) : '-'}
                            </span>
                          </td>

                          <td className="px-3 py-3">
                            <div className="text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]" title={request.bills_description}>
                              {request.bills_description || '-'}
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <div className="text-sm font-bold text-black whitespace-nowrap">
                              ₱{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                            {rent > 0 && <div className="text-[10px] text-gray-400 whitespace-nowrap">Rent: ₱{rent.toLocaleString()}</div>}
                          </td>

                          <td className="px-3 py-3">
                            <span className={`text-sm whitespace-nowrap ${isPastDue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                              {request.due_date ? new Date(request.due_date).toLocaleDateString() : 'N/A'}
                            </span>
                          </td>

                          <td className="px-3 py-3">
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border whitespace-nowrap ${request.status === 'paid' ? 'bg-black text-white border-black' :
                              request.status === 'pending_confirmation' ? 'bg-white text-black border-black border-dashed' :
                                request.status === 'cancelled' ? 'bg-gray-100 text-gray-500 border-gray-200' :
                                  request.status === 'rejected' ? 'bg-gray-100 text-black border-gray-400' :
                                    isPastDue ? 'bg-red-50 text-red-600 border-red-200' :
                                      'bg-white text-black border-black'
                              }`}>
                              {request.status === 'paid' ? 'Paid' :
                                request.status === 'pending_confirmation' ? 'Confirming' :
                                  request.status === 'cancelled' ? 'Cancelled' :
                                    request.status === 'rejected' ? 'Rejected' :
                                      isPastDue ? 'Overdue' : 'Pending'}
                            </span>
                          </td>

                          <td className="px-3 py-3">
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
                                  {confirmPaymentId === request.id ? (
                                    <div className="flex gap-1 items-center mr-1">
                                      <button onClick={() => confirmPayment(request.id)} className="px-1.5 py-1 bg-green-600 text-white text-[10px] font-bold rounded cursor-pointer shadow-sm">Confirm</button>
                                      <button onClick={() => setConfirmPaymentId(null)} className="px-1.5 py-1 bg-gray-200 text-black text-[10px] font-bold rounded cursor-pointer shadow-sm">✕</button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmPaymentId(request.id)}
                                      className="px-2 py-1 bg-green-600 text-white hover:bg-green-700 text-xs font-bold rounded cursor-pointer transition-all shadow-sm flex items-center gap-1"
                                      title="Mark as Paid (Cash)"
                                    >
                                      <span>✓</span>
                                      <span className="hidden xl:inline">Paid</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleEditBill(request)}
                                    className="px-2 py-1 border border-gray-300 hover:border-black text-black text-xs font-bold rounded cursor-pointer transition-colors"
                                  >
                                    Edit
                                  </button>
                                  {cancelBillId === request.id ? (
                                    <div className="flex gap-1">
                                      <button onClick={() => handleCancelBill(request.id)} className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded cursor-pointer">Yes</button>
                                      <button onClick={() => setCancelBillId(null)} className="px-2 py-1 bg-gray-200 text-black text-xs font-bold rounded cursor-pointer">No</button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setCancelBillId(request.id)}
                                      className="px-2 py-1 text-red-600 hover:bg-red-50 text-xs font-bold rounded cursor-pointer transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  )}
                                </div>
                              )}
                              {userRole === 'landlord' && request.status === 'pending_confirmation' && (
                                confirmPaymentId === request.id ? (
                                  <div className="flex gap-1 items-center">
                                    <button onClick={() => confirmPayment(request.id)} className="px-1.5 py-0.5 bg-black text-white text-[10px] font-bold rounded cursor-pointer">Yes</button>
                                    <button onClick={() => setConfirmPaymentId(null)} className="px-1.5 py-0.5 border border-gray-300 text-black text-[10px] font-bold rounded cursor-pointer">No</button>
                                  </div>
                                ) : (
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => setConfirmPaymentId(request.id)}
                                      className="px-2 py-1 bg-black text-white hover:bg-gray-800 text-[10px] font-bold rounded cursor-pointer transition-all"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      onClick={() => rejectPayment(request.id)}
                                      className="px-2 py-1 border border-black text-black hover:bg-black hover:text-white text-[10px] font-bold rounded cursor-pointer transition-all"
                                    >
                                      ✗
                                    </button>
                                  </div>
                                )
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
                    {/* {maxPaymentLimit !== null && maxPaymentLimit !== Infinity && (
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">
                        Max: ₱{maxPaymentLimit.toLocaleString()} ({maxMonthsAllowed} mo)
                      </span>
                    )} */}
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

                {/* Check if credit actually covers the bill (minimumPayment is 0 means credit >= bill total) */}
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
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        disabled={isBelowMinimum || exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && parseFloat(customAmount) > maxPaymentLimit)}
                        className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all cursor-pointer ${isBelowMinimum || exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && parseFloat(customAmount) > maxPaymentLimit)
                          ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                          : paymentMethod === 'cash'
                            ? 'border-black bg-black text-white'
                            : 'border-gray-200 bg-white hover:border-gray-400 text-black'
                          }`}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        <span className="font-bold text-sm">Cash</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (selectedBill.qr_code_url) {
                            setPaymentMethod('qr_code')
                          } else {
                            showToast.error('Landlord has not provided a QR code', {
                              duration: 4000,
                              progress: true,
                              position: "top-center",
                              transition: "bounceIn",
                              icon: '',
                              sound: true,
                            })
                          }
                        }}
                        disabled={!selectedBill.qr_code_url || isBelowMinimum || exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && parseFloat(customAmount) > maxPaymentLimit)}
                        className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all cursor-pointer ${!selectedBill.qr_code_url || isBelowMinimum || exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && parseFloat(customAmount) > maxPaymentLimit)
                          ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                          : paymentMethod === 'qr_code'
                            ? 'border-black bg-black text-white'
                            : 'border-gray-200 bg-white hover:border-gray-400 text-black'
                          }`}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                        <span className="font-bold text-sm">QR Code</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('stripe')}
                        disabled={isBelowMinimum || exceedsContract || (maxPaymentLimit !== null && maxPaymentLimit !== Infinity && parseFloat(customAmount) > maxPaymentLimit)}
                        className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all cursor-pointer ${paymentMethod === 'stripe'
                          ? 'border-[#6772e5] bg-[#6772e5] text-white'
                          : 'border-gray-200 bg-white hover:border-[#6772e5] text-black'
                          } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200`}
                      >
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.768-1.435 1.834-1.435 1.412 0 2.615.696 3.774 1.562l-3.242-4.197C11.83.748 10.155 0 8.528 0 5.093 0 2.502 2.659 2.502 6.52c0 6.641 8.816 6.307 8.816 9.389 0 .884-.79 1.462-1.954 1.462-1.636 0-3.098-.823-4.322-1.859l3.359 4.385c1.464 1.054 3.09 1.558 4.708 1.558 3.596 0 6.138-2.585 6.138-6.425 0-6.738-8.852-6.27-8.852-9.406 0-.825.797-1.412 1.833-1.412 1.348 0 2.559.637 3.66 1.488l1.458-2.146c-1.282-1.1-2.934-1.688-4.664-1.688-2.673 0-4.523 1.36-4.523 3.329 0 2.946 4.09 4.384 4.09 6.685 0 1.583-1.42 2.457-3.031 2.457-1.487 0-2.844-.657-3.924-1.666l-1.378 2.029c1.605 1.636 3.67 2.375 5.765 2.375 2.828 0 4.795-1.418 4.795-3.484 0-3.08-4.09-4.512-4.09-6.792z" />
                        </svg>
                        <span className="font-bold text-sm">Stripe</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* QR Code Payment Flow */}
                {paymentMethod === 'qr_code' && (
                  <div className="space-y-4 bg-gray-50 border border-gray-200 p-4 rounded-xl">
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
                    ) : selectedBill.qr_code_url ? (
                      <>
                        <div className="text-center">
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Scan to Pay</p>
                          <img
                            src={selectedBill.qr_code_url}
                            alt="Payment QR Code"
                            className="max-h-48 mx-auto rounded-lg shadow-sm border border-white"
                          />
                        </div>

                        <div className="border-t border-gray-200 pt-4">
                          <p className="text-sm font-bold text-black mb-3">Payment Proof (Required)</p>

                          <div className="mb-3">
                            <input
                              type="text"
                              value={referenceNumber}
                              onChange={e => setReferenceNumber(e.target.value)}
                              placeholder="Enter Ref/Transaction No."
                              className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 font-medium outline-none transition-colors"
                            />
                          </div>

                          <div>
                            <div className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer bg-white transition-colors ${proofPreview ? 'border-black' : 'border-gray-300 hover:border-gray-400'}`}>
                              {proofPreview ? (
                                <div className="relative inline-block">
                                  <img src={proofPreview} alt="Payment Proof" className="max-h-32 rounded shadow-sm" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setProofFile(null)
                                      setProofPreview(null)
                                    }}
                                    className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-full hover:bg-gray-800"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                              ) : (
                                <label className="cursor-pointer block w-full h-full">
                                  <span className="text-xs font-bold text-black">Upload Screenshot</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => {
                                      const file = e.target.files[0]
                                      if (file) {
                                        setProofFile(file)
                                        setProofPreview(URL.createObjectURL(file))
                                      }
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center text-gray-500 py-4">
                        <p className="text-sm">No QR code available from landlord</p>
                      </div>
                    )}
                  </div>
                )}

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
                  {paymentMethod !== 'stripe' && parseFloat(customAmount) > 0 && (
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
                    className={`px-4 py-3 border-2 border-gray-200 text-black font-bold rounded-xl hover:border-black cursor-pointer transition-colors ${paymentMethod === 'stripe' || parseFloat(customAmount) <= 0 ? 'flex-1' : ''}`}
                  >
                    Cancel
                  </button>
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
              <h3 className="text-xl font-bold mb-4">Edit Bill</h3>

              <form onSubmit={handleUpdateBill} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Rent Amount</label>
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
      </div>
    </div >
  )
}