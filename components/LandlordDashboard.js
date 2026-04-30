import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createNotification } from '../lib/notifications'
import { NON_ADVANCE_PAYMENT_REQUEST_FILTER, getRecordedPaymentRequestAmount, sumRecordedPaymentRequestAmounts } from '../lib/paymentTotals'
import { supabase } from '../lib/supabaseClient'
import Footer from './Footer'

const CountUpAnimation = ({ target, duration = 1000, prefix = '', suffix = '', decimals = 0 }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);

      // easeOutExpo
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

      setCount(easeProgress * target);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [target, duration]);

  return (
    <>{prefix}{Number(count).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>
  );
};

export default function LandlordDashboard({ session, profile }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState({})

  // Modal States
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [acceptedApplications, setAcceptedApplications] = useState([])
  const [penaltyDetails, setPenaltyDetails] = useState('')
  const [startDate, setStartDate] = useState('') // NEW: Start Date State
  const [contractMonths, setContractMonths] = useState(12) // NEW: Contract duration in months
  const [endDate, setEndDate] = useState('') // NEW: Contract End Date State (auto-calculated)
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

  // Family Modal State
  const [familyModal, setFamilyModal] = useState({
    isOpen: false,
    occupancy: null,
    members: [],
    paymentHistory: [],
    loading: false,
    loadingPaymentHistory: false,
    internetDueDate: '',
    waterDueDate: '',
    electricityDueDate: '',
    internetAvailable: false,
    internetIsFree: false,
    savingDueDates: false
  })

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
  const [incomingEnds, setIncomingEnds] = useState([])
  const [pendingCancelEndRequests, setPendingCancelEndRequests] = useState([])
  const [pendingRenewalRequests, setPendingRenewalRequests] = useState([])
  const [dashboardTasks, setDashboardTasks] = useState({ maintenance: [], payments: [] })
  const [scheduledTodayBookings, setScheduledTodayBookings] = useState([])
  const [availabilityScheduleCount, setAvailabilityScheduleCount] = useState(0)

  // Property Slot System State
  const [propertySlotPlan, setPropertySlotPlan] = useState(null)
  const [loadingSlotPlan, setLoadingSlotPlan] = useState(false)
  const [showSlotPurchaseModal, setShowSlotPurchaseModal] = useState(false)
  const [purchasingSlot, setPurchasingSlot] = useState(false)

  // Advance Bill Confirmation Modal State
  const [advanceBillModal, setAdvanceBillModal] = useState({
    isOpen: false,
    tenantId: null,
    tenantName: '',
    propertyTitle: '',
    propertyPrice: 0,
    billType: 'rent',
    billLabel: 'Rent'
  })

  // Monthly Income Statements State
  const [monthlyIncome, setMonthlyIncome] = useState({
    currentMonth: { total: 0, payments: [], byProperty: [] },
    previousMonth: { total: 0, payments: [], byProperty: [] },
    yearTotal: 0
  })
  const [selectedStatementMonth, setSelectedStatementMonth] = useState(new Date().getMonth())
  const [selectedStatementYear, setSelectedStatementYear] = useState(new Date().getFullYear())
  const [monthlyChartData, setMonthlyChartData] = useState([])
  const [sendingStatement, setSendingStatement] = useState(false)
  const [chartFilter, setChartFilter] = useState('all') // 'all', 'water', 'other'
  const [totalIncome, setTotalIncome] = useState(0)
  const [activePanel, setActivePanel] = useState('metrics')
  const [cancelOccupancyModal, setCancelOccupancyModal] = useState({
    isOpen: false,
    occupancy: null
  })
  const [processingCancelOccupancy, setProcessingCancelOccupancy] = useState(false)

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
      Promise.all([
        loadProperties(),
        loadOccupancies(),
        loadPendingEndRequests(),
        loadIncomingEnds(),
        loadPendingCancelEndRequests(),
        loadDashboardTasks(),
        loadScheduledTodayBookings(),
        loadAvailabilityScheduleCount(),
        loadMonthlyIncome(),
        loadTotalIncome(),
        loadPropertySlotPlan()
      ]).then(() => {
        setStatsLoaded(true)

        // Handle slot purchase success/cancel from URL params
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          if (params.get('slot_purchase_success') === 'true') {
            const paymentId = params.get('payment_id')
            if (paymentId) {
              fetch('/api/payments/landlord-subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'confirm-payment', payment_id: paymentId, payment_method: 'paymongo' })
              }).then(() => loadPropertySlotPlan())
            }
            showToast.success('Property slot purchased successfully!', { duration: 4000, transition: 'bounceIn' })
            window.history.replaceState({}, '', '/dashboard')
          } else if (params.get('slot_purchase_cancelled') === 'true') {
            showToast.warning('Property slot purchase was cancelled.', { duration: 3000, transition: 'bounceIn' })
            window.history.replaceState({}, '', '/dashboard')
          }
        }
      })
    }
    // Reminders are now handled automatically by Supabase pg_cron
  }, [profile])

  // Reload monthly income when selected month/year changes
  useEffect(() => {
    if (profile) {
      loadMonthlyIncome()
    }
  }, [selectedStatementMonth, selectedStatementYear])

  // Load total income from 'payment_requests' table (status = paid)
  async function loadTotalIncome() {
    try {
      const { data } = await supabase
        .from('payment_requests')
        .select('amount_paid, rent_amount, security_deposit_amount, advance_amount, water_bill, electrical_bill, wifi_bill, other_bills')
        .eq('landlord', session.user.id)
        .eq('status', 'paid')
        .or(NON_ADVANCE_PAYMENT_REQUEST_FILTER)

      const total = sumRecordedPaymentRequestAmounts(data || [])

      setTotalIncome(total)
    } catch (err) {
      console.error('Error loading total income:', err)
    }
  }
  // Auto-calculate end date when start date or contract months change
  useEffect(() => {
    if (startDate && contractMonths) {
      const start = new Date(startDate);
      const end = new Date(start);
      end.setMonth(end.getMonth() + parseInt(contractMonths));
      setEndDate(end.toISOString().split('T')[0]);
    }
  }, [startDate, contractMonths])

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

  async function loadPropertySlotPlan() {
    try {
      setLoadingSlotPlan(true)
      const res = await fetch(`/api/payments/landlord-subscriptions?landlord_id=${session.user.id}`)
      const data = await res.json()
      if (data.plan) {
        setPropertySlotPlan(data.plan)
      }
    } catch (err) {
      console.error('Error loading property slot plan:', err)
    } finally {
      setLoadingSlotPlan(false)
    }
  }

  async function handlePurchasePropertySlot() {
    setPurchasingSlot(true)
    try {
      const res = await fetch('/api/payments/landlord-slot-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landlord_id: session.user.id })
      })
      const data = await res.json()
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        showToast.error(data.error || 'Failed to start checkout', { duration: 4000, transition: 'bounceIn' })
      }
    } catch (err) {
      console.error('Error purchasing property slot:', err)
      showToast.error('Something went wrong. Please try again.', { duration: 4000, transition: 'bounceIn' })
    } finally {
      setPurchasingSlot(false)
    }
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

  // --- Monthly Income Statements Logic ---
  async function loadMonthlyIncome() {
    try {
      // Get all properties for this landlord
      const { data: myProps } = await supabase
        .from('properties')
        .select('id, title')
        .eq('landlord', session.user.id)

      if (!myProps || myProps.length === 0) return

      const propIds = myProps.map(p => p.id)
      const propMap = myProps.reduce((acc, p) => ({ ...acc, [p.id]: p.title }), {})

      // Calculate date ranges
      const now = new Date()
      const selectedMonth = selectedStatementMonth
      const selectedYear = selectedStatementYear

      // Start and end of selected month
      const monthStart = new Date(selectedYear, selectedMonth, 1)
      const monthEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59)

      // Start of year for yearly total
      const yearStart = new Date(selectedYear, 0, 1)
      const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59)

      // Fetch paid payments for the selected month
      const { data: monthPayments } = await supabase
        .from('payment_requests')
        .select('id, rent_amount, security_deposit_amount, advance_amount, water_bill, electrical_bill, wifi_bill, other_bills, paid_at, property_id, amount_paid')
        .eq('landlord', session.user.id)
        .eq('status', 'paid')
        .or(NON_ADVANCE_PAYMENT_REQUEST_FILTER)
        .gte('paid_at', monthStart.toISOString())
        .lte('paid_at', monthEnd.toISOString())

      // Fetch paid payments for the year
      const { data: yearPayments } = await supabase
        .from('payment_requests')
        .select('id, rent_amount, security_deposit_amount, advance_amount, water_bill, electrical_bill, wifi_bill, other_bills, paid_at, property_id, amount_paid')
        .eq('landlord', session.user.id)
        .eq('status', 'paid')
        .or(NON_ADVANCE_PAYMENT_REQUEST_FILTER)
        .gte('paid_at', yearStart.toISOString())
        .lte('paid_at', yearEnd.toISOString())

      // Calculate totals
      const calculateTotal = (payments) => sumRecordedPaymentRequestAmounts(payments || [])

      // Group by property for breakdown
      const groupByProperty = (payments) => {
        const grouped = {}
        payments?.forEach(p => {
          const propTitle = propMap[p.property_id] || 'Unknown'
          if (!grouped[propTitle]) {
            grouped[propTitle] = { title: propTitle, income: 0, payments: 0 }
          }
          const total = getRecordedPaymentRequestAmount(p)
          grouped[propTitle].income += total
          grouped[propTitle].payments += 1
        })
        return Object.values(grouped)
      }

      setMonthlyIncome({
        currentMonth: {
          total: calculateTotal(monthPayments),
          payments: monthPayments || [],
          byProperty: groupByProperty(monthPayments)
        },
        previousMonth: { total: 0, payments: [], byProperty: [] }, // Can be expanded later
        yearTotal: calculateTotal(yearPayments)
      })

      // Generate chart data for the year (monthly breakdown)
      const chartData = []
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

      for (let month = 0; month < 12; month++) {
        const mStart = new Date(selectedYear, month, 1)
        const mEnd = new Date(selectedYear, month + 1, 0, 23, 59, 59)

        const monthPaymentsFiltered = yearPayments?.filter(p => {
          const paidDate = new Date(p.paid_at)
          return paidDate >= mStart && paidDate <= mEnd
        }) || []

        const monthTotal = sumRecordedPaymentRequestAmounts(monthPaymentsFiltered)

        const waterTotal = monthPaymentsFiltered.reduce((sum, p) => {
          return sum + (parseFloat(p.water_bill) || 0)
        }, 0)

        const otherTotal = monthPaymentsFiltered.reduce((sum, p) => {
          return sum + (parseFloat(p.other_bills) || 0)
        }, 0)

        chartData.push({
          name: monthNames[month],
          income: monthTotal,
          water: waterTotal,
          other: otherTotal
        })
      }

      setMonthlyChartData(chartData)
    } catch (err) {
      console.error('Error loading monthly income:', err)
    }
  }

  // Send Monthly Statement Email
  async function sendMonthlyStatement() {
    setSendingStatement(true)
    try {
      // Get landlord email
      const { data: landlordEmail } = await supabase.rpc('get_user_email', { user_id: session.user.id })

      if (!landlordEmail) {
        showToast.error('Unable to find your email address.', { duration: 3000, position: 'top-center' })
        return
      }

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

      // Send the statement via API
      const response = await fetch('/api/send-landlord-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landlordId: session.user.id,
          landlordEmail,
          landlordName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Landlord',
          month: selectedStatementMonth,
          year: selectedStatementYear,
          monthName: monthNames[selectedStatementMonth],
          totalIncome: monthlyIncome.currentMonth.total,
          propertySummary: monthlyIncome.currentMonth.byProperty
        })
      })

      if (response.ok) {
        showToast.success(`Statement for ${monthNames[selectedStatementMonth]} ${selectedStatementYear} sent to your email!`, {
          duration: 4000,
          position: 'top-center'
        })
      } else {
        throw new Error('Failed to send statement')
      }
    } catch (err) {
      console.error('Error sending statement:', err)
      showToast.error('Failed to send statement. Please try again.', { duration: 3000, position: 'top-center' })
    } finally {
      setSendingStatement(false)
    }
  }

  // --- NEW: Billing Tracker State & Logic ---
  const [billingSchedule, setBillingSchedule] = useState([])
  const [sendingBillId, setSendingBillId] = useState(null)
  const [editingDueDateItemId, setEditingDueDateItemId] = useState(null)
  const [editingDueDateValue, setEditingDueDateValue] = useState('')
  const [savingDueDateItemId, setSavingDueDateItemId] = useState(null)
  const [billingTenantFilter, setBillingTenantFilter] = useState('')
  const [billingDateFilter, setBillingDateFilter] = useState('')
  const [autoBillingEnabled, setAutoBillingEnabled] = useState(true)
  const [togglingAutoBilling, setTogglingAutoBilling] = useState(false)
  const [utilityReminderSettings, setUtilityReminderSettings] = useState({ internet: true, water: true, electricity: true })
  const [togglingUtilityKey, setTogglingUtilityKey] = useState(null)

  useEffect(() => {
    if (occupancies.length > 0) {
      calculateBillingSchedule()
    }
  }, [occupancies])

  useEffect(() => {
    loadAutoBillingSetting()
  }, [session?.user?.id])

  async function loadAutoBillingSetting() {
    if (!session?.user?.id) return
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('accepted_payments')
        .eq('id', session.user.id)
        .maybeSingle()

      if (error) {
        console.error('Failed to load auto billing setting:', error)
        setAutoBillingEnabled(true)
        return
      }

      const accepted = data?.accepted_payments || {}
      const enabled = accepted.auto_billing_enabled
      setAutoBillingEnabled(enabled === undefined ? true : !!enabled)

      const utilitySettings = accepted.utility_reminders || {}
      setUtilityReminderSettings({
        internet: utilitySettings.internet !== false,
        water: utilitySettings.water !== false,
        electricity: utilitySettings.electricity !== false
      })
    } catch (err) {
      console.error('Auto billing setting exception:', err)
      setAutoBillingEnabled(true)
      setUtilityReminderSettings({ internet: true, water: true, electricity: true })
    }
  }

  async function toggleAutoBilling() {
    if (!session?.user?.id || togglingAutoBilling) return
    setTogglingAutoBilling(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('accepted_payments')
        .eq('id', session.user.id)
        .maybeSingle()

      if (error) {
        showToast.error('Failed to update auto billing setting.', { duration: 3500, transition: 'bounceIn' })
        return
      }

      const accepted = data?.accepted_payments || {}
      const nextState = !autoBillingEnabled
      const updated = { ...accepted, auto_billing_enabled: nextState }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ accepted_payments: updated })
        .eq('id', session.user.id)

      if (updateError) {
        showToast.error('Failed to update auto billing setting.', { duration: 3500, transition: 'bounceIn' })
        return
      }

      setAutoBillingEnabled(nextState)
      showToast.success(`Automated billing ${nextState ? 'enabled' : 'disabled'}.`, { duration: 3000, transition: 'bounceIn' })
    } catch (err) {
      console.error('Toggle auto billing error:', err)
      showToast.error('Failed to update auto billing setting.', { duration: 3500, transition: 'bounceIn' })
    } finally {
      setTogglingAutoBilling(false)
    }
  }

  async function toggleUtilityReminder(utilityKey) {
    if (!session?.user?.id || !utilityKey || togglingUtilityKey) return
    setTogglingUtilityKey(utilityKey)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('accepted_payments')
        .eq('id', session.user.id)
        .maybeSingle()

      if (error) {
        showToast.error('Failed to update utility reminder setting.', { duration: 3500, transition: 'bounceIn' })
        return
      }

      const accepted = data?.accepted_payments || {}
      const utilitySettings = accepted.utility_reminders || {}
      const nextValue = !(utilitySettings[utilityKey] !== false)

      const updated = {
        ...accepted,
        utility_reminders: {
          ...utilitySettings,
          [utilityKey]: nextValue
        }
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ accepted_payments: updated })
        .eq('id', session.user.id)

      if (updateError) {
        showToast.error('Failed to update utility reminder setting.', { duration: 3500, transition: 'bounceIn' })
        return
      }

      setUtilityReminderSettings(prev => ({ ...prev, [utilityKey]: nextValue }))
      showToast.success(`${utilityKey.charAt(0).toUpperCase() + utilityKey.slice(1)} reminders ${nextValue ? 'enabled' : 'disabled'}.`, { duration: 3000, transition: 'bounceIn' })
    } catch (err) {
      console.error('Toggle utility reminder error:', err)
      showToast.error('Failed to update utility reminder setting.', { duration: 3500, transition: 'bounceIn' })
    } finally {
      setTogglingUtilityKey(null)
    }
  }

  // Open confirmation modal for sending advance bill
  function openAdvanceBillModal(tenantId, tenantName, propertyTitle, propertyPrice, billType = 'rent', billLabel = 'Rent') {
    setAdvanceBillModal({
      isOpen: true,
      tenantId,
      tenantName,
      propertyTitle,
      propertyPrice: propertyPrice || 0,
      billType,
      billLabel
    })
  }

  // Close the advance bill modal
  function closeAdvanceBillModal() {
    setAdvanceBillModal({
      isOpen: false,
      tenantId: null,
      tenantName: '',
      propertyTitle: '',
      propertyPrice: 0,
      billType: 'rent',
      billLabel: 'Rent'
    })
  }

  // Actually send the advance bill after confirmation
  async function confirmSendAdvanceBill() {
    if (!autoBillingEnabled) {
      showToast.error('Automated billing is disabled. Enable it to send now.', { duration: 3500, transition: 'bounceIn' })
      return
    }

    const tenantId = advanceBillModal.tenantId
    const billType = advanceBillModal.billType || 'rent'
    if (!tenantId) return

    closeAdvanceBillModal()
    setSendingBillId(`${tenantId}-${billType}`)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const params = new URLSearchParams({ tenantId, billType })
      const headers = currentSession?.access_token
        ? { Authorization: `Bearer ${currentSession.access_token}` }
        : undefined
      const res = await fetch(`/api/test-rent-reminder?${params.toString()}`, {
        headers
      })
      const data = await res.json()
      if (res.ok) {
        showToast.success(data?.message || `${advanceBillModal.billLabel} sent successfully!`, { duration: 4000, transition: "bounceIn" })
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
    const getUpcomingDateForDay = (dayOfMonth) => {
      const safeDay = Math.max(1, Math.min(31, parseInt(dayOfMonth || 1, 10)))
      const today = new Date()
      const candidate = new Date(today.getFullYear(), today.getMonth(), safeDay)
      if (candidate < today) {
        candidate.setMonth(candidate.getMonth() + 1)
      }
      return candidate
    }

    const getFirstDueDateFromStart = (startDateValue) => {
      const base = new Date(startDateValue)
      if (Number.isNaN(base.getTime())) return new Date()

      const today = new Date()
      const baseDateOnly = new Date(base)
      baseDateOnly.setHours(0, 0, 0, 0)
      const todayDateOnly = new Date(today)
      todayDateOnly.setHours(0, 0, 0, 0)

      if (baseDateOnly <= todayDateOnly) {
        const shifted = new Date(base)
        shifted.setMonth(shifted.getMonth() + 1)
        return shifted
      }

      return base
    }

    // 1. Fetch ALL bills for the landlord to analyze status correctly
    const { data: allBills } = await supabase
      .from('payment_requests')
      .select('id, occupancy_id, status, due_date, created_at, rent_amount, advance_amount, bills_description')
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
    const schedule = occupancies.flatMap(occ => {
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
          // No history: if tenancy already started, first due is next month.
          // This aligns with "tenant already paid" assignments that intentionally create no move-in bill.
          nextDueDate = getFirstDueDateFromStart(occ.start_date)
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

      const rentScheduleItem = {
        id: occ.id,
        tenantId: occ.tenant_id,
        tenantName: `${occ.tenant?.first_name} ${occ.tenant?.last_name}`,
        propertyTitle: occ.property?.title,
        propertyPrice: occ.property?.price || 0,
        billType: 'rent',
        billLabel: 'Rent',
        paymentRequestId: earliestPending?.id || null,
        canEditDueDate: !!earliestPending && nextDueDate >= new Date(),
        nextDueDate: nextDueDate,
        sendDate: sendDate,
        status: status,
        note: note,
        lastBill: latestBill,
        startDate: occ.start_date
      }

      // Utility reminders: these are reminder schedule entries (SMS/Email) shown in billing schedule.
      const utilityRows = [
        {
          id: `${occ.id}-internet`,
          occupancyId: occ.id,
          tenantId: occ.tenant_id,
          tenantName: `${occ.tenant?.first_name} ${occ.tenant?.last_name}`,
          propertyTitle: occ.property?.title,
          propertyPrice: occ.property?.price || 0,
          billType: 'internet',
          billLabel: 'Internet',
          paymentRequestId: null,
          canEditDueDate: true,
          isEnabled: utilityReminderSettings.internet,
          nextDueDate: getUpcomingDateForDay(occ.wifi_due_day || 10),
          sendDate: null,
          status: 'Reminder Scheduled',
          note: 'SMS & email reminder 3 days before due date',
          lastBill: null,
          startDate: occ.start_date
        },
        {
          id: `${occ.id}-water`,
          occupancyId: occ.id,
          tenantId: occ.tenant_id,
          tenantName: `${occ.tenant?.first_name} ${occ.tenant?.last_name}`,
          propertyTitle: occ.property?.title,
          propertyPrice: occ.property?.price || 0,
          billType: 'water',
          billLabel: 'Water',
          paymentRequestId: null,
          canEditDueDate: true,
          isEnabled: utilityReminderSettings.water,
          nextDueDate: getUpcomingDateForDay(occ.water_due_day || 7),
          sendDate: null,
          status: 'Reminder Scheduled',
          note: 'SMS & email reminder 3 days before due date',
          lastBill: null,
          startDate: occ.start_date
        },
        {
          id: `${occ.id}-electricity`,
          occupancyId: occ.id,
          tenantId: occ.tenant_id,
          tenantName: `${occ.tenant?.first_name} ${occ.tenant?.last_name}`,
          propertyTitle: occ.property?.title,
          propertyPrice: occ.property?.price || 0,
          billType: 'electricity',
          billLabel: 'Electricity',
          paymentRequestId: null,
          canEditDueDate: true,
          isEnabled: utilityReminderSettings.electricity,
          nextDueDate: getUpcomingDateForDay(occ.electricity_due_day || 7),
          sendDate: null,
          status: 'Reminder Scheduled',
          note: 'SMS & email reminder 3 days before due date',
          lastBill: null,
          startDate: occ.start_date
        }
      ]

      return [rentScheduleItem, ...utilityRows]
    })

    schedule.sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate))
    setBillingSchedule(schedule)
  }

  function startEditIncomingDueDate(item) {
    if (!autoBillingEnabled) {
      showToast.error('Automated billing is disabled. Enable it to edit schedule due dates.', { duration: 3500, transition: 'bounceIn' })
      return
    }

    if (!item?.canEditDueDate) return
    if (item.billType !== 'rent' && item.isEnabled === false) {
      showToast.error(`${item.billLabel} reminders are disabled.`, { duration: 3000, transition: 'bounceIn' })
      return
    }
    setEditingDueDateItemId(item.id)
    setEditingDueDateValue(new Date(item.nextDueDate).toISOString().split('T')[0])
  }

  function cancelEditIncomingDueDate() {
    setEditingDueDateItemId(null)
    setEditingDueDateValue('')
  }

  async function saveIncomingDueDate(item) {
    if (!item || !editingDueDateValue) return

    const selectedDate = new Date(editingDueDateValue)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (selectedDate < today) {
      showToast.error('You can only edit incoming (today/future) due dates.', { duration: 3500, transition: 'bounceIn' })
      return
    }

    setSavingDueDateItemId(item.id)
    try {
      let error = null

      if (item.billType === 'rent') {
        if (!item.paymentRequestId) {
          showToast.error('No pending rent bill found to edit.', { duration: 3500, transition: 'bounceIn' })
          return
        }

        const dueDateIso = selectedDate.toISOString()
        const { error: rentUpdateError } = await supabase
          .from('payment_requests')
          .update({ due_date: dueDateIso })
          .eq('id', item.paymentRequestId)
        error = rentUpdateError
      } else {
        if (!item.occupancyId) {
          showToast.error('No occupancy found for this utility row.', { duration: 3500, transition: 'bounceIn' })
          return
        }

        const utilityDueDay = selectedDate.getDate()
        const occupancyUpdate = {}

        if (item.billType === 'internet') occupancyUpdate.wifi_due_day = utilityDueDay
        if (item.billType === 'water') occupancyUpdate.water_due_day = utilityDueDay
        if (item.billType === 'electricity') occupancyUpdate.electricity_due_day = utilityDueDay

        const { error: occUpdateError } = await supabase
          .from('tenant_occupancies')
          .update(occupancyUpdate)
          .eq('id', item.occupancyId)

        error = occUpdateError
      }

      if (error) {
        showToast.error('Failed to update due date.', { duration: 3500, transition: 'bounceIn' })
        return
      }

      showToast.success('Incoming due date updated.', { duration: 3000, transition: 'bounceIn' })
      cancelEditIncomingDueDate()
      await Promise.all([calculateBillingSchedule(), loadDashboardTasks()])
    } catch (err) {
      console.error('Due date update failed:', err)
      showToast.error('Failed to update due date.', { duration: 3500, transition: 'bounceIn' })
    } finally {
      setSavingDueDateItemId(null)
    }
  }

  async function loadPendingEndRequests() {
    const { data } = await supabase.from('tenant_occupancies').select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone), property:properties(id, title, address)`).eq('landlord_id', session.user.id).in('end_request_status', ['pending', 'approved'])
    setPendingEndRequests(data || [])
  }

  async function loadPendingCancelEndRequests() {
    const { data } = await supabase.from('tenant_occupancies').select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone), property:properties(id, title, address)`).eq('landlord_id', session.user.id).eq('end_request_status', 'cancel_pending')
    setPendingCancelEndRequests(data || [])
  }

  async function loadIncomingEnds() {
    const { data, error } = await supabase
      .from('tenant_occupancies')
      .select(`
        *,
        tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone, avatar_url),
        property:properties(id, title, images, price, address, city)
      `)
      .eq('landlord_id', session.user.id)
      .in('status', ['active', 'pending_end'])

    if (error) {
      console.error('Error loading incoming ends:', error)
      return
    }

    if (data) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

      const filtered = data.filter(item => {
        // Case 1: Approved or Pending move-out
        if ((item.end_request_status === 'approved' || item.end_request_status === 'pending' || item.end_request_status === 'cancel_pending') && item.end_request_date) {
          return true // Show all approved/pending move-outs until they are processed/archived
        }

        // Case 2: Contract ending soon OR already ended but still active status
        if (!item.end_request_status && item.contract_end_date) {
          const endDate = new Date(item.contract_end_date)
          // Show if it ends within the next 30 days OR if it's already past the end date but still marked as active
          return endDate <= thirtyDaysFromNow
        }

        return false
      })

      // Sort by end date
      filtered.sort((a, b) => {
        const dateA = new Date(a.end_request_date || a.contract_end_date)
        const dateB = new Date(b.end_request_date || b.contract_end_date)
        return dateA - dateB
      })

      setIncomingEnds(filtered)
    }
  }

  async function loadPendingRenewalRequests() {
    setPendingRenewalRequests([])
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

  const [processingRenewal, setProcessingRenewal] = useState(false)
  const [processingBookingId, setProcessingBookingId] = useState(null)
  const [processingEndRequest, setProcessingEndRequest] = useState(false) // For modal actions
  const [processingEndRequestId, setProcessingEndRequestId] = useState(null) // For inline actions (if any)

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

    setProcessingRenewal(true)
    try {
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

      // Notify tenant via Email & SMS
      const landlordName = profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : `${session?.user?.user_metadata?.first_name || ''} ${session?.user?.user_metadata?.last_name || ''}`.trim();

      try {
        const notifyRes = await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'renewal_status',
            recordId: occupancy.id, // REQUIRED by notify.js
            tenantId: occupancy.tenant_id,
            tenantName: `${occupancy.tenant?.first_name || ''} ${occupancy.tenant?.last_name || ''}`.trim(),
            tenantPhone: occupancy.tenant?.phone,
            propertyTitle: occupancy.property?.title,
            status: approved ? 'approved' : 'rejected',
            newEndDate: renewalEndDate,
            signingDate: renewalSigningDate,
            landlordName: landlordName || 'Landlord'
          })
        })
        if (!notifyRes.ok) {
          console.error('Notify API failed:', await notifyRes.text())
        }
      } catch (error) {
        console.error('Failed to send renewal notification:', error)
      }

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
          const { data: newBill, error: billError } = await supabase.from('payment_requests').insert({
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
          }).select().single();

          if (billError) {
            console.error('Renewal bill creation error:', billError);
          } else if (newBill) {
            // Notify tenant about the bill (Internal)
            await createNotification({
              recipient: occupancy.tenant_id,
              actor: session.user.id,
              type: 'payment_request',
              message: `Your renewal payment bill has been sent: ₱${Number(rentAmount).toLocaleString()} (Rent) + ₱${Number(advanceAmount).toLocaleString()} (Advance) = ₱${Number(rentAmount + advanceAmount).toLocaleString()} Total. Please pay on signing date: ${signingDate.toLocaleDateString()}. This covers your first 2 months of the renewed contract.`,
              link: '/payments'
            });

            // Notify tenant (SMS & Email)
            try {
              await fetch('/api/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'payment_bill',
                  recordId: newBill.id, // Use the new bill ID
                  actorId: session.user.id
                })
              })
            } catch (notifyErr) {
              console.error('Failed to send renewal bill notification:', notifyErr)
            }
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
      loadScheduledTodayBookings()
    } catch (err) { console.error(err) } finally { setProcessingRenewal(false) }
  }

  async function loadOccupancies() {
    if (!session?.user?.id) return

    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    // 1. Proactive Cancellation: Check for move-outs tomorrow with pending bills
    const { data: risky } = await supabase
      .from('tenant_occupancies')
      .select('id, property_id, tenant_id, property:properties(title)')
      .eq('landlord_id', session.user.id)
      .eq('status', 'active')
      .eq('end_request_status', 'approved')
      .eq('end_request_date', tomorrowStr)

    if (risky && risky.length > 0) {
      for (const occ of risky) {
        const { data: bills } = await supabase
          .from('payment_requests')
          .select('id')
          .eq('occupancy_id', occ.id)
          .in('status', ['pending', 'pending_confirmation'])
          .limit(1)

        if (bills && bills.length > 0) {
          // Auto-cancel request due to unpaid bills
          await supabase.from('tenant_occupancies').update({
            end_request_status: null, // Reset status
          }).eq('id', occ.id)

          await createNotification({
            recipient: occ.tenant_id,
            actor: session.user.id,
            type: 'end_request_cancelled',
            message: `Your move-out request for "${occ.property?.title}" tomorrow has been automatically cancelled because you have pending payments. Please settle all bills to request a new move-out date.`,
            link: '/dashboard'
          })
        }
      }
    }

    // 2. Proactive Cleanup: Check for any approved move-outs whose scheduled date has passed
    const { data: toEnd } = await supabase
      .from('tenant_occupancies')
      .select('id, property_id, tenant_id')
      .eq('landlord_id', session.user.id)
      .eq('status', 'active')
      .eq('end_request_status', 'approved')
      .lte('end_request_date', today)

    if (toEnd && toEnd.length > 0) {
      for (const occ of toEnd) {
        // Double check for bills one last time before ending
        const { data: finalBills } = await supabase.from('payment_requests').select('id').eq('occupancy_id', occ.id).in('status', ['pending', 'pending_confirmation']).limit(1)
        
        if (finalBills && finalBills.length > 0) {
           await supabase.from('tenant_occupancies').update({ end_request_status: null }).eq('id', occ.id)
           continue; // Skip ending this one
        }

        // Silently end the tenancy and make property available
        await supabase.from('tenant_occupancies').update({ status: 'ended' }).eq('id', occ.id)
        await supabase.from('properties').update({ status: 'available' }).eq('id', occ.property_id)
        
        // Finalize bookings and applications
        await supabase.from('bookings').update({ status: 'completed' }).eq('tenant', occ.tenant_id).eq('property_id', occ.property_id).in('status', ['pending', 'pending_approval', 'approved', 'accepted'])
        await supabase.from('applications').update({ status: 'completed' }).eq('tenant', occ.tenant_id).eq('property_id', occ.property_id).eq('status', 'accepted')
      }
      loadProperties()
      loadDashboardTasks()
    }

    const { data } = await supabase.from('tenant_occupancies').select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, email, phone, avatar_url), property:properties(id, title, images, price, amenities)`).eq('landlord_id', session.user.id).in('status', ['active', 'pending_end'])
    setOccupancies(data || [])
  }

  async function loadScheduledTodayBookings() {
    if (!session?.user?.id) {
      setScheduledTodayBookings([])
      return
    }

    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    const { data: bookingRows, error: bookingError } = await supabase
      .from('bookings')
      .select('id, tenant, property_id, booking_date, status')
      .eq('landlord', session.user.id)
      .in('status', ['pending', 'pending_approval', 'approved', 'accepted'])
      .gte('booking_date', startOfDay.toISOString())
      .lte('booking_date', endOfDay.toISOString())
      .order('booking_date', { ascending: true })

    if (bookingError) {
      console.error('Error loading today bookings:', bookingError)
      setScheduledTodayBookings([])
      return
    }

    if (!bookingRows || bookingRows.length === 0) {
      setScheduledTodayBookings([])
      return
    }

    const tenantIds = [...new Set(bookingRows.map((booking) => booking.tenant).filter(Boolean))]
    const propertyIds = [...new Set(bookingRows.map((booking) => booking.property_id).filter(Boolean))]

    const [{ data: tenantProfiles }, { data: propertyRows }] = await Promise.all([
      tenantIds.length > 0
        ? supabase.from('profiles').select('id, first_name, last_name').in('id', tenantIds)
        : Promise.resolve({ data: [] }),
      propertyIds.length > 0
        ? supabase.from('properties').select('id, title, address, city').in('id', propertyIds)
        : Promise.resolve({ data: [] })
    ])

    const tenantMap = {}
    ;(tenantProfiles || []).forEach((tenant) => {
      tenantMap[tenant.id] = tenant
    })

    const propertyMap = {}
    ;(propertyRows || []).forEach((property) => {
      propertyMap[property.id] = property
    })

    const enrichedBookings = bookingRows.map((booking) => ({
      ...booking,
      tenant_profile: tenantMap[booking.tenant] || null,
      property: propertyMap[booking.property_id] || null
    }))

    setScheduledTodayBookings(enrichedBookings)
  }

  async function loadAvailabilityScheduleCount() {
    if (!session?.user?.id) {
      setAvailabilityScheduleCount(0)
      return
    }

    const { count, error } = await supabase
      .from('available_time_slots')
      .select('id', { count: 'exact', head: true })
      .eq('landlord_id', session.user.id)
      .gte('start_time', new Date().toISOString())

    if (error) {
      console.error('Error loading availability schedule count:', error)
      setAvailabilityScheduleCount(0)
      return
    }

    setAvailabilityScheduleCount(count || 0)
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
    setEndDate('');
    setWifiDueDay(''); // Reset
    setElectricityDueDay(''); // Reset
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

    if (!wifiDueDay || parseInt(wifiDueDay) <= 0 || parseInt(wifiDueDay) > 31) {
      showToast.error("Please enter a valid Wifi Due Day (1-31)", { duration: 4000, transition: "bounceIn" });
      return
    }

    if (!penaltyDetails || parseFloat(penaltyDetails) <= 0) {
      showToast.error("Please enter a Late Payment Fee", { duration: 4000, transition: "bounceIn" });
      return
    }

    // Security deposit equals one month's rent
    const securityDepositAmount = selectedProperty.price || 0;

    // Use selected startDate and move-in billing details.
    // Note: electricity_due_day is not stored - electricity reminders are always sent for 1st week of month
    const { data: newOccupancy, error } = await supabase.from('tenant_occupancies').insert({
      property_id: selectedProperty.id,
      tenant_id: candidate.tenant,
      landlord_id: session.user.id,
      status: 'active',
      start_date: new Date(startDate).toISOString(),
      security_deposit: securityDepositAmount,
      security_deposit_used: 0,
      wifi_due_day: wifiDueDay ? parseInt(wifiDueDay) : null,
      late_payment_fee: penaltyDetails ? parseFloat(penaltyDetails) : 0
    }).select('id').single()

    if (error) {
      console.error('Assign Tenant Error:', error);
      showToast.error('Failed to assign tenant. Check console.', { duration: 4000, transition: "bounceIn" });
      return
    }

    const occupancyId = newOccupancy?.id

    await supabase.from('properties').update({ status: 'occupied' }).eq('id', selectedProperty.id)

    // Updated: Uses exclusively /api/notify for move-in and payment notifications

    // 1. Send Move-In Notification (Email + SMS)
    // This handles both the "Welcome Home" email and SMS via the centralized API
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'move_in',
          recordId: occupancyId,
          tenantName: `${candidate.tenant_profile?.first_name || ''} ${candidate.tenant_profile?.last_name || ''}`.trim(),
          tenantPhone: candidate.tenant_profile?.phone,
          tenantEmail: null, // API works better if it looks this up itself via recordId, but we can rely on recordId lookup logic in notify.js
          propertyTitle: selectedProperty.title,
          propertyAddress: selectedProperty.address || '',
          startDate: startDate,
          landlordName: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
          landlordPhone: profile?.phone || '',
          securityDeposit: securityDepositAmount,
          rentAmount: selectedProperty.price || 0
        })
      })
    } catch (err) {
      console.error('Move-in notification error:', err);
    }

    // --- AUTO-SEND MOVE-IN PAYMENT BILL (Rent + Advance + Security Deposit) ---
    // Newly assigned tenants pay Rent + Advance + Security Deposit
    const rentAmount = selectedProperty.price || 0;
    const advanceAmount = selectedProperty.price || 0; // Advance is 1 month rent
    const dueDate = new Date(startDate); // Due date is the start date of the contract

    try {
      const { data: newBill, error: billError } = await supabase.from('payment_requests').insert({
        landlord: session.user.id,
        tenant: candidate.tenant,
        property_id: selectedProperty.id,
        occupancy_id: occupancyId, // Link to occupancy so it shows in TenantDashboard
        rent_amount: rentAmount,
        security_deposit_amount: securityDepositAmount, // New assignment = security deposit required
        advance_amount: advanceAmount, // Advance payment for new assignments
        water_bill: 0,
        electrical_bill: 0,
        other_bills: 0,
        bills_description: 'Move-in Payment (Rent + Advance + Security Deposit)',
        due_date: dueDate.toISOString(),
        status: 'pending',
        is_move_in_payment: true // Mark as move-in payment (new assignment)
      }).select().single();

      if (billError) {
        console.error('Auto-bill creation error:', billError);
        // Don't block assignment, just log the error
      } else if (newBill) {
        // Notify tenant about the bill (Internal)
        const totalAmount = rentAmount + advanceAmount + securityDepositAmount;
        await createNotification({
          recipient: candidate.tenant,
          actor: session.user.id,
          type: 'payment_request',
          message: `Your move-in payment bill has been sent: ₱${Number(rentAmount).toLocaleString()} (Rent) + ₱${Number(advanceAmount).toLocaleString()} (Advance) + ₱${Number(securityDepositAmount).toLocaleString()} (Security Deposit) = ₱${Number(totalAmount).toLocaleString()} Total. Due: ${dueDate.toLocaleDateString()}`,
          link: '/payments'
        });

        // Notify tenant (SMS & Email) about the BILL
        try {
          await fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'payment_bill',
              recordId: newBill.id, // Use the new bill ID
              actorId: session.user.id
            })
          })
        } catch (notifyErr) {
          console.error('Failed to send move-in bill notification:', notifyErr)
        }
      }
    } catch (err) {
      console.error('Auto-bill exception:', err);
    }

    showToast.success('Tenant assigned! Move-in payment bill sent automatically.', { duration: 4000, transition: "bounceIn" });
    setShowAssignModal(false);
    loadProperties();
    loadOccupancies();
    loadScheduledTodayBookings();
  }

  async function cancelAssignment(booking) {
    if (!confirm(`Cancel assignment for ${booking.tenant_profile?.first_name}?`)) return

    setProcessingBookingId(booking.id)
    try {
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
      loadScheduledTodayBookings()
    } finally {
      setProcessingBookingId(null)
    }
  }

  function openEndContractModal(occupancy) {
    setEndContractModal({ isOpen: true, occupancy })
    setEndContractDate('')
    setEndContractReason('')
  }

  function formatDateInputValue(dateObj) {
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function buildDateFromDueDay(dayValue, fallbackDay = null) {
    if (dayValue === null || dayValue === undefined || dayValue === '') {
      if (fallbackDay === null || fallbackDay === undefined) return ''
      dayValue = fallbackDay
    }

    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
    const parsedDay = Number(dayValue)
    if (Number.isNaN(parsedDay)) return ''
    const clampedDay = Math.min(Math.max(parsedDay, 1), lastDayOfMonth)
    return formatDateInputValue(new Date(year, month, clampedDay))
  }

  function extractDayFromDateInput(dateValue) {
    if (!dateValue) return NaN
    const date = new Date(dateValue)
    return Number.isNaN(date.getTime()) ? NaN : date.getDate()
  }

  async function openFamilyModal(occupancy) {
    const amenities = Array.isArray(occupancy?.property?.amenities) ? occupancy.property.amenities : []
    const isWifiAvailable = amenities.includes('Wifi') || amenities.includes('WiFi') || amenities.includes('Free WiFi')
    const isWifiFree = amenities.includes('Free WiFi')

    setFamilyModal({
      isOpen: true,
      occupancy,
      members: [],
      paymentHistory: [],
      loading: true,
      loadingPaymentHistory: true,
      internetDueDate: buildDateFromDueDay(occupancy?.wifi_due_day),
      waterDueDate: buildDateFromDueDay(occupancy?.water_due_day),
      electricityDueDate: buildDateFromDueDay(occupancy?.electricity_due_day),
      internetAvailable: isWifiAvailable,
      internetIsFree: isWifiFree,
      savingDueDates: false
    })

    const membersPromise = fetch(`/api/family-members?occupancy_id=${occupancy.id}`).then(async (res) => {
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load family members')
      }
      return data.members || []
    })

    const paymentHistoryPromise = supabase
      .from('payment_requests')
      .select('*')
      .eq('occupancy_id', occupancy.id)
      .eq('status', 'paid')
      .order('due_date', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          throw error
        }
        return data || []
      })

    const [membersResult, paymentHistoryResult] = await Promise.allSettled([membersPromise, paymentHistoryPromise])

    let members = []
    let paymentHistory = []

    if (membersResult.status === 'fulfilled') {
      members = membersResult.value
    } else {
      console.error(membersResult.reason)
      showToast.error('An error occurred fetching family members', { duration: 3000, transition: "bounceIn" })
    }

    if (paymentHistoryResult.status === 'fulfilled') {
      paymentHistory = paymentHistoryResult.value
    } else {
      console.error(paymentHistoryResult.reason)
      showToast.error('An error occurred fetching payment history', { duration: 3000, transition: "bounceIn" })
    }

    setFamilyModal(prev => ({
      ...prev,
      members,
      paymentHistory,
      loading: false,
      loadingPaymentHistory: false
    }))
  }

  function closeFamilyModal() {
    setFamilyModal({
      isOpen: false,
      occupancy: null,
      members: [],
      paymentHistory: [],
      loading: false,
      loadingPaymentHistory: false,
      internetDueDate: '',
      waterDueDate: '',
      electricityDueDate: '',
      internetAvailable: false,
      internetIsFree: false,
      savingDueDates: false
    })
  }

  async function updateTenantDueDatesForFamilyModal() {
    if (!autoBillingEnabled) {
      showToast.error('Automated billing is disabled. Enable it to edit schedule due dates.', { duration: 3500, transition: 'bounceIn' })
      return
    }

    const occupancy = familyModal.occupancy
    if (!occupancy?.id) return

    const currentAmenities = Array.isArray(occupancy?.property?.amenities) ? occupancy.property.amenities : []
    const normalizedAmenities = [...new Set(currentAmenities.map(a => (a === 'WiFi' ? 'Wifi' : a)))]
    const isWaterFree = normalizedAmenities.includes('Free Water')
    const isElectricityFree = normalizedAmenities.includes('Free Electricity')

    const internetDueDay = familyModal.internetAvailable && !familyModal.internetIsFree
      ? extractDayFromDateInput(familyModal.internetDueDate)
      : null
    const waterDueDay = isWaterFree ? null : extractDayFromDateInput(familyModal.waterDueDate)
    const electricityDueDay = isElectricityFree ? null : extractDayFromDateInput(familyModal.electricityDueDate)

    if (familyModal.internetAvailable && !familyModal.internetIsFree && (Number.isNaN(internetDueDay) || internetDueDay < 1 || internetDueDay > 31)) {
      showToast.error('Internet is available. Please set a valid due date (1-31).', { duration: 3500, transition: 'bounceIn' })
      return
    }

    if (!isWaterFree && (Number.isNaN(waterDueDay) || waterDueDay < 1 || waterDueDay > 31)) {
      showToast.error('Please set a valid water due date (1-31).', { duration: 3500, transition: 'bounceIn' })
      return
    }

    if (!isElectricityFree && (Number.isNaN(electricityDueDay) || electricityDueDay < 1 || electricityDueDay > 31)) {
      showToast.error('Please set a valid electricity due date (1-31).', { duration: 3500, transition: 'bounceIn' })
      return
    }

    setFamilyModal(prev => ({ ...prev, savingDueDates: true }))
    try {
      let nextAmenities = [...normalizedAmenities]
      const currentlyWifiAvailable = nextAmenities.includes('Wifi') || nextAmenities.includes('Free WiFi')

      if (familyModal.internetAvailable && !currentlyWifiAvailable) {
        nextAmenities.push('Wifi')
      }
      if (!familyModal.internetAvailable) {
        nextAmenities = nextAmenities.filter(a => a !== 'Wifi' && a !== 'Free WiFi')
      }

      const amenitiesChanged = JSON.stringify(nextAmenities) !== JSON.stringify(normalizedAmenities)
      if (amenitiesChanged && occupancy?.property_id) {
        const { error: propertyError } = await supabase
          .from('properties')
          .update({ amenities: nextAmenities })
          .eq('id', occupancy.property_id)

        if (propertyError) {
          showToast.error('Failed to update internet availability.', { duration: 3500, transition: 'bounceIn' })
          return
        }
      }

      const { error: occError } = await supabase
        .from('tenant_occupancies')
        .update({
          wifi_due_day: familyModal.internetAvailable && !familyModal.internetIsFree ? internetDueDay : null,
          water_due_day: waterDueDay,
          electricity_due_day: electricityDueDay
        })
        .eq('id', occupancy.id)

      if (occError) {
        showToast.error('Failed to update utility due dates.', { duration: 3500, transition: 'bounceIn' })
        return
      }

      showToast.success('Utility due dates updated.', { duration: 3000, transition: 'bounceIn' })
      setFamilyModal(prev => ({
        ...prev,
        occupancy: prev.occupancy
          ? {
            ...prev.occupancy,
            wifi_due_day: familyModal.internetAvailable && !familyModal.internetIsFree ? internetDueDay : null,
            water_due_day: waterDueDay,
            electricity_due_day: electricityDueDay,
            property: {
              ...prev.occupancy.property,
              amenities: nextAmenities
            }
          }
          : prev.occupancy
      }))
      await Promise.all([calculateBillingSchedule(), loadDashboardTasks(), loadOccupancies(), loadScheduledTodayBookings()])
    } catch (err) {
      console.error('Due date update failed:', err)
      showToast.error('Failed to update due date.', { duration: 3500, transition: 'bounceIn' })
    } finally {
      setFamilyModal(prev => ({ ...prev, savingDueDates: false }))
    }
  }

  async function confirmEndContract() {
    const occupancy = endContractModal.occupancy
    if (!occupancy) return

    async function cancelOpenMaintenanceRequests(propertyId) {
      if (!propertyId) return
      const { error: maintenanceCancelError } = await supabase
        .from('maintenance_requests')
        .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
        .eq('property_id', propertyId)
        .in('status', ['pending', 'scheduled', 'in_progress'])

      if (maintenanceCancelError) {
        console.error('Error auto-cancelling maintenance requests:', maintenanceCancelError)
      }
    }

    if (!endContractDate) {
      showToast.error('Please select an end date', { duration: 3000, transition: "bounceIn" })
      return
    }
    if (!endContractReason) {
      showToast.error('Please enter a reason', { duration: 3000, transition: "bounceIn" })
      return
    }

    // Check for pending payments before allowing contract end
    const { data: pendingBills, error: pendingError } = await supabase
      .from('payment_requests')
      .select('id')
      .eq('occupancy_id', occupancy.id)
      .in('status', ['pending', 'pending_confirmation'])
      .limit(1)

    if (pendingError) {
      console.error('Error checking pending payments:', pendingError)
    }

    if (pendingBills && pendingBills.length > 0) {
      showToast.error("Cannot end contract: This tenant has pending payments. All bills must be settled first.", { duration: 6000, progress: true, position: 'top-center', transition: 'bounceIn' })
      return
    }

    setEndContractModal({ isOpen: false, occupancy: null })

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({ status: 'ended' })
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

    await cancelOpenMaintenanceRequests(occupancy.property_id)

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

    // Clean up family members — end their occupancies + delete records
    try {
      await fetch('/api/family-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanup', occupancy_id: occupancy.id })
      })
    } catch (err) {
      console.error('Family cleanup error:', err)
    }

    showToast.success('Contract ended successfully', { duration: 4000, transition: "bounceIn" });
    loadProperties(); loadOccupancies(); loadScheduledTodayBookings()
  }

  async function cancelOccupancy() {
    const occupancy = cancelOccupancyModal.occupancy
    if (!occupancy) return

    setProcessingCancelOccupancy(true)
    try {
      // 1. Delete associated payment requests that are still pending
      await supabase.from('payment_requests')
        .delete()
        .eq('occupancy_id', occupancy.id)
        .in('status', ['pending', 'pending_confirmation'])

      // 2. Delete the occupancy record
      const { error: occError } = await supabase
        .from('tenant_occupancies')
        .delete()
        .eq('id', occupancy.id)

      if (occError) throw occError

      // 3. Update property status back to 'available'
      const { error: propError } = await supabase
        .from('properties')
        .update({ status: 'available' })
        .eq('id', occupancy.property_id)

      if (propError) throw propError

      // 4. Mark the booking as 'accepted' again so it can be re-assigned
      await supabase.from('bookings')
        .update({ status: 'accepted' })
        .eq('tenant', occupancy.tenant_id)
        .eq('property_id', occupancy.property_id)
        .eq('status', 'completed')

      // 5. Create notification for tenant
      const message = `Your upcoming occupancy for "${occupancy.property?.title || 'your property'}" has been cancelled by the landlord.`
      await createNotification({ 
        recipient: occupancy.tenant_id, 
        actor: session.user.id, 
        type: 'occupancy_cancelled', 
        message, 
        link: '/dashboard' 
      })

      showToast.success('Occupancy cancelled successfully. Property is now available.', { duration: 4000, transition: "bounceIn" })
      setCancelOccupancyModal({ isOpen: false, occupancy: null })
      loadOccupancies()
      loadProperties()
    } catch (err) {
      console.error('Cancel occupancy error:', err)
      showToast.error(`Failed: ${err.message}`, { duration: 4000, transition: "bounceIn" })
    } finally {
      setProcessingCancelOccupancy(false)
    }
  }

  // --- CONFIRMATION HANDLERS ---

  function openEndConfirmation(type, requestId) {
    setConfirmationModal({ isOpen: true, type, requestId })
  }

  async function handleConfirmEndAction() {
    setProcessingEndRequest(true)
    try {
      if (confirmationModal.type === 'approve') {
        await approveEndRequest(confirmationModal.requestId)
      } else if (confirmationModal.type === 'reject') {
        await rejectEndRequest(confirmationModal.requestId)
      } else if (confirmationModal.type === 'cancel_end') {
        await cancelEndStay(confirmationModal.requestId)
      } else if (confirmationModal.type === 'approve_cancel_end') {
        await approveCancelEndRequest(confirmationModal.requestId)
      }
      setConfirmationModal({ isOpen: false, type: null, requestId: null })
    } finally {
      setProcessingEndRequest(false)
    }
  }

  // --- ACTION FUNCTIONS ---

  async function approveEndRequest(occupancyId) {
    const occupancy = pendingEndRequests.find(o => o.id === occupancyId);
    if (!occupancy) return

    // Check for pending payments before allowing approval
    const { data: pendingBills, error: pendingError } = await supabase
      .from('payment_requests')
      .select('id')
      .eq('occupancy_id', occupancyId)
      .in('status', ['pending', 'pending_confirmation'])
      .limit(1)

    if (pendingError) {
      console.error('Error checking pending payments:', pendingError)
    }

    if (pendingBills && pendingBills.length > 0) {
      showToast.error("Cannot approve: This tenant has pending payments. All bills must be settled before ending the contract.", { duration: 6000, progress: true, position: 'top-center', transition: 'bounceIn' })
      return
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endRequestDateValue = occupancy.end_request_date ? new Date(occupancy.end_request_date) : today;
    endRequestDateValue.setHours(0, 0, 0, 0);

    const isFutureDate = endRequestDateValue > today;

    const updates = {
      end_request_status: 'approved'
    };

    if (!isFutureDate) {
      updates.status = 'ended';
    } else {
      // For future dates, update the status back to active
      // (effectively "scheduling" the end). The date is already in end_request_date.
      updates.status = 'active'; 
    }

    const { error } = await supabase
      .from('tenant_occupancies')
      .update(updates)
      .eq('id', occupancyId)

    if (error) {
      showToast.error(`Failed: ${error.message}`, { duration: 4000, transition: "bounceIn" });
      return
    }

    // Only finalize move-out actions if the date is NOT in the future
    if (!isFutureDate) {
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

      // Cancel pending maintenance
      await supabase.from('maintenance_requests')
        .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
        .eq('property_id', occupancy.property_id)
        .in('status', ['pending', 'scheduled', 'in_progress'])
    }

    showToast.success(isFutureDate 
      ? `Request approved. Move-out scheduled for ${endRequestDateValue.toLocaleDateString()}.` 
      : "Move-out approved. Contract ended and property is now available.", 
      { duration: 5000, transition: "bounceIn" }
    )

    // Notification Message
    const message = `Your request to move out of "${occupancy.property?.title}" has been APPROVED. The contract is now ${isFutureDate ? 'scheduled to end on ' + endRequestDateValue.toLocaleDateString() : 'ended'}.`

    // 1. In-App
    await createNotification({ recipient: occupancy.tenant_id, actor: session.user.id, type: 'end_request_approved', message: message, link: '/dashboard' })

    // 3. Notification (Email & SMS via centralized API)
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'end_contract',
          recordId: occupancyId,
          reason: message // Pass the constructed message as the reason/customMessage
        })
      })
    } catch (err) {
      console.error('End contract notification error:', err)
    }

    // Clean up family members — end their occupancies + delete records
    try {
      await fetch('/api/family-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanup', occupancy_id: occupancyId })
      })
    } catch (err) {
      console.error('Family cleanup error:', err)
    }

    loadPendingEndRequests()
    loadOccupancies()
    loadProperties()
    loadIncomingEnds()
    loadPendingCancelEndRequests()
    loadScheduledTodayBookings()
  }

  async function cancelEndStay(occupancyId) {
    const { error } = await supabase
      .from('tenant_occupancies')
      .update({
        end_request_status: null,
        end_request_date: null,
        end_request_reason: null,
        status: 'active'
      })
      .eq('id', occupancyId)

    if (error) {
      showToast.error(`Failed to cancel: ${error.message}`)
      return
    }

    showToast.success('End-of-stay request cancelled. Tenant stay is back to normal.')
    loadPendingEndRequests()
    loadOccupancies()
    loadIncomingEnds()
    loadPendingCancelEndRequests()
  }

  async function approveCancelEndRequest(occupancyId) {
    const { error } = await supabase
      .from('tenant_occupancies')
      .update({
        end_request_status: null,
        end_request_date: null,
        end_request_reason: null,
        status: 'active'
      })
      .eq('id', occupancyId)

    if (error) {
      showToast.error(`Failed to approve cancellation: ${error.message}`)
      return
    }

    showToast.success('Cancellation approved. Tenant stay is now active again.')
    loadPendingCancelEndRequests()
    loadOccupancies()
    loadIncomingEnds()
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

  const getDateFilterKey = (dateValue) => {
    const dateObj = new Date(dateValue)
    if (Number.isNaN(dateObj.getTime())) return ''
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const normalizedBillingTenantFilter = billingTenantFilter.trim().toLowerCase()
  const hasBillingFilters = Boolean(billingDateFilter || normalizedBillingTenantFilter)

  const filteredBillingSchedule = billingSchedule.filter((item) => {
    const dateMatches = !billingDateFilter || getDateFilterKey(item.nextDueDate) === billingDateFilter
    const tenantMatches = !normalizedBillingTenantFilter || (item.tenantName || '').toLowerCase().includes(normalizedBillingTenantFilter)
    return dateMatches && tenantMatches
  })

  const isBillingRowsScrollable = filteredBillingSchedule.length > 10
  const nonOccupiedProperties = properties.filter((property) => property.status !== 'occupied')
  const activeOccupancies = occupancies.filter((occupancy) => ['active', 'pending_end'].includes(occupancy.status))
  const metricsToolCount = properties.length
  const billingToolCount = billingSchedule.length
  const propertiesToolCount = activeOccupancies.length
  const terminationsToolCount = incomingEnds.length + pendingCancelEndRequests.length
  const actionsToolCount = pendingEndRequests.filter(r => r.end_request_status === 'pending').length + pendingRenewalRequests.length + pendingCancelEndRequests.length + dashboardTasks.payments.length + dashboardTasks.maintenance.length
  const scheduledToolCount = scheduledTodayBookings.length
  const hasNoAvailabilitySchedule = availabilityScheduleCount === 0

  if (loading && !statsLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col scroll-smooth">
        <div className="max-w-[1800px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 relative z-10 flex-1 w-full">
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8 pb-24 items-start">
            <div className="lg:w-72 flex-shrink-0 w-full flex flex-col gap-4 sm:gap-6 lg:sticky lg:top-8 z-10">
              <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-7 shadow-sm border border-gray-200">
                <div className="space-y-4">
                  <div className="h-3 w-20 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-7 w-40 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-11 w-full rounded-xl bg-slate-200 skeleton-shimmer" />
                </div>
              </div>

              <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200/60 shadow-sm p-3 sm:p-5">
                <div className="h-3 w-28 rounded bg-slate-200 skeleton-shimmer mb-4" />
                <div className="flex flex-row flex-wrap lg:flex-col lg:flex-nowrap gap-2">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div key={`nav-skeleton-${idx}`} className="h-11 w-32 sm:w-40 lg:w-full rounded-xl bg-slate-200 skeleton-shimmer" />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0 w-full space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={`metric-skeleton-${idx}`} className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 border border-gray-200/60 shadow-sm">
                    <div className="h-10 w-10 rounded-xl bg-slate-200 skeleton-shimmer mb-4" />
                    <div className="h-8 w-20 rounded bg-slate-200 skeleton-shimmer mb-2" />
                    <div className="h-3 w-28 rounded bg-slate-200 skeleton-shimmer" />
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200/60 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                  <div className="space-y-2">
                    <div className="h-6 w-40 rounded bg-slate-200 skeleton-shimmer" />
                    <div className="h-4 w-56 rounded bg-slate-200 skeleton-shimmer" />
                  </div>
                  <div className="h-10 w-full sm:w-44 rounded-xl bg-slate-200 skeleton-shimmer" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div key={`property-skeleton-${idx}`} className="rounded-xl sm:rounded-2xl border border-gray-200/70 overflow-hidden bg-white">
                      <div className="aspect-[4/3] bg-slate-200 skeleton-shimmer" />
                      <div className="p-3 sm:p-5 space-y-3">
                        <div className="h-5 w-3/4 rounded bg-slate-200 skeleton-shimmer" />
                        <div className="h-4 w-2/3 rounded bg-slate-200 skeleton-shimmer" />
                        <div className="h-4 w-1/2 rounded bg-slate-200 skeleton-shimmer" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer>
          <Footer />
        </footer>
      </div>
    )
  }


  return (
    <>
      <div className="min-h-screen bg-gray-50 flex flex-col scroll-smooth">
      <div className="max-w-[1800px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 relative z-10 flex-1 w-full">

        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8 pb-24 items-start">

          {/* LEFT COLUMN */}
          <div className="lg:w-72 flex-shrink-0 w-full flex flex-col gap-4 sm:gap-6 lg:sticky lg:top-8 z-10">

            {/* HEADER */}
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-7 text-black relative overflow-hidden shadow-sm border border-gray-200">
              {/* Decorative background shapes */}
              <div className="absolute top-0 right-0 w-40 sm:w-64 h-40 sm:h-64 bg-gray-50 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
              <div className="absolute bottom-0 left-10 w-32 sm:w-48 h-32 sm:h-48 bg-gray-50 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl"></div>

              <div className="relative z-10 flex flex-col gap-3 sm:gap-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-gray-500 text-xs sm:text-sm font-medium">Welcome,</p>
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider border border-blue-100">Landlord</span>
                  </div>
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-gray-900 leading-tight">{profile?.first_name} {profile?.last_name}</h1>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={openEmailModal} className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-black backdrop-blur-md rounded-xl text-xs sm:text-sm font-bold cursor-pointer transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    Email Tenant
                  </button>
                  {/* <button onClick={() => router.push('/properties/new')} className="flex items-center justify-center gap-2 px-5 py-3 bg-black text-white hover:bg-gray-800 rounded-xl text-sm font-bold cursor-pointer transition-all shadow-md">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add Rent
                  </button> */}
                </div>
              </div>
            </div>

            {/* LEFT PANEL: Navigation Sidebar */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200/60 shadow-sm p-3 sm:p-5 relative">
              <h3 className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-wider mb-3 sm:mb-5 px-2">Landlord Tools</h3>
              <div className="flex flex-row flex-wrap lg:flex-col lg:flex-nowrap gap-1.5 sm:gap-2.5">
              <button onClick={() => setActivePanel('metrics')} className={`w-auto lg:w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 sm:gap-3 cursor-pointer ${activePanel === 'metrics' ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                <span className="hidden sm:inline">Manage your Properties</span>
                <span className="sm:hidden">Manage</span>
                <span className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black border inline-flex items-center justify-center ${activePanel === 'metrics' ? 'bg-white/15 text-white border-white/25' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{metricsToolCount}</span>
              </button>
              <button onClick={() => setActivePanel('billing')} className={`w-auto lg:w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 sm:gap-3 cursor-pointer ${activePanel === 'billing' ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="hidden sm:inline">Billing Schedule</span>
                <span className="sm:hidden">Billing</span>
                <span className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black border inline-flex items-center justify-center ${activePanel === 'billing' ? 'bg-white/15 text-white border-white/25' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{billingToolCount}</span>
              </button>
              <button onClick={() => setActivePanel('properties')} className={`w-auto lg:w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 sm:gap-3 cursor-pointer ${activePanel === 'properties' ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                <span className="hidden sm:inline">Active Properties</span>
                <span className="sm:hidden">Active</span>
                <span className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black border inline-flex items-center justify-center ${activePanel === 'properties' ? 'bg-white/15 text-white border-white/25' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{propertiesToolCount}</span>
              </button>
              <button onClick={() => setActivePanel('actions')} className={`w-auto lg:w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 sm:gap-3 cursor-pointer ${activePanel === 'actions' ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                <span className="hidden sm:inline">Pending Tasks</span>
                <span className="sm:hidden">Actions</span>
                <span className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black border inline-flex items-center justify-center ${activePanel === 'actions' ? 'bg-white/15 text-white border-white/25' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{actionsToolCount}</span>
              </button>
              <button onClick={() => setActivePanel('terminations')} className={`w-auto lg:w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 sm:gap-3 cursor-pointer ${activePanel === 'terminations' ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                <span className="hidden sm:inline">Approved Property Leave Request</span>
                <span className="sm:hidden">Ends</span>
                <span className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black border inline-flex items-center justify-center ${activePanel === 'terminations' ? 'bg-white/15 text-white border-white/25' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{terminationsToolCount}</span>
              </button>
              <button onClick={() => setActivePanel('scheduled')} className={`w-auto lg:w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 sm:gap-3 cursor-pointer ${activePanel === 'scheduled' ? 'bg-black text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2v2m-6 0h6" /></svg>
                <span className="hidden sm:inline">Scheduled Viewing Today</span>
                <span className="sm:hidden">Scheduled</span>
                <span className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black border inline-flex items-center justify-center ${activePanel === 'scheduled' ? 'bg-white/15 text-white border-white/25' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{scheduledToolCount}</span>
              </button>
            </div>
          </div>
        </div>

          {/* RIGHT PANEL: Dynamic Content */}
          <div key={activePanel} className="flex-1 min-w-0 w-full animate-in fade-in slide-in-from-right-8 duration-500">

            {hasNoAvailabilitySchedule && (
              <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-900">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-xs sm:text-sm font-medium">
                      Warning: You have not set any viewing availability schedule yet. Add schedule slots so tenants can book viewings.
                    </p>
                  </div>
                  <button
                    onClick={() => router.push('/schedule')}
                    className="self-start sm:self-auto px-3 py-1.5 text-xs font-bold rounded-lg border border-yellow-300 bg-white text-yellow-800 hover:bg-yellow-100 transition-all cursor-pointer"
                  >
                    Open Schedule
                  </button>
                </div>
              </div>
            )}

            {/* MANAGE YOUR APARTMENT / METRICS */}
            {activePanel === 'metrics' && (
              <div className="space-y-6 mb-8">
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6">
                <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 border border-gray-200/60 shadow-sm hover:-translate-y-1 transition-transform duration-300">
                  <div className="flex items-center justify-between mb-2 sm:mb-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-xl sm:rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                  </div>
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 tracking-tight"><CountUpAnimation target={statsLoaded ? properties.length : 0} /></h3>
                  <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-500 mt-0.5 sm:mt-1">Properties Managed</p>
                </div>

                <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 border border-gray-200/60 shadow-sm hover:-translate-y-1 transition-transform duration-300">
                  <div className="flex items-center justify-between mb-2 sm:mb-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-xl sm:rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <span className="bg-emerald-50 text-emerald-700 text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg">
                      {properties.length > 0 ? Math.round((occupancies.length / properties.length) * 100) : 0}% Occ
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 tracking-tight"><CountUpAnimation target={statsLoaded ? occupancies.length : 0} /></h3>
                  <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-500 mt-0.5 sm:mt-1">Active Tenants</p>
                </div>

                <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 border border-gray-200/60 shadow-sm hover:-translate-y-1 transition-transform duration-300">
                  <div className="flex items-center justify-between mb-2 sm:mb-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-xl sm:rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                  </div>
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 tracking-tight truncate"><CountUpAnimation target={statsLoaded ? totalIncome : 0} decimals={2} prefix="₱" /></h3>
                  <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-500 mt-0.5 sm:mt-1">Total Income</p>
                </div>


                <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 border border-gray-200/60 shadow-sm hover:-translate-y-1 transition-transform duration-300">
                  <div className="flex items-center justify-between mb-2 sm:mb-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-xl sm:rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    </div>
                  </div>
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 tracking-tight"><CountUpAnimation target={statsLoaded ? actionsToolCount : 0} /></h3>
                  <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-500 mt-0.5 sm:mt-1">Pending Tasks</p>
                </div>
              </div>  

                {/* PROPERTIES GRID */}
                <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200/60 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-gray-900 tracking-tight">Your Properties</h3>
                      <p className="text-xs sm:text-sm font-medium text-gray-500 mt-0.5">Manage all your uploaded properties here</p>
                      {propertySlotPlan && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-gray-200 text-black-200 border border-gray-900">
                            {propertySlotPlan.used_slots}/{propertySlotPlan.total_slots} slots used
                          </span>
                        </div>
                      )}
                    </div>
                    {propertySlotPlan && propertySlotPlan.used_slots >= propertySlotPlan.total_slots ? (
                      propertySlotPlan.total_slots >= propertySlotPlan.max_slots ? (
                        <div className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-gray-100 text-gray-500 text-xs sm:text-sm font-bold rounded-xl text-center border border-gray-200">
                          Maximum {propertySlotPlan.max_slots} slots reached
                        </div>
                      ) : (
                        <button
                            onClick={() => setShowSlotPurchaseModal(true)}
                            className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-black text-white text-xs sm:text-sm font-bold rounded-xl cursor-pointer hover:bg-gray-800 transition-all shadow-sm flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Buy Property Slot (₱{propertySlotPlan.slot_price})
                        </button>
                      )
                    ) : (
                      <button
                          onClick={() => router.push('/properties/new')}
                          className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-black text-white text-xs sm:text-sm font-bold rounded-xl cursor-pointer hover:bg-gray-800 transition-all shadow-sm"
                      >
                          + Add New Properties
                      </button>
                    )}
                  </div>
 
                  {properties.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50/50 border border-dashed border-gray-200 rounded-2xl">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm text-gray-400">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </div>
                      <p className="text-gray-900 font-bold text-sm">No apartments found</p>
                      <p className="text-gray-500 text-sm mt-1">Start by adding your first property to the platform.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                      {properties.map(property => {
                        const imgs = (property.images && Array.isArray(property.images) && property.images.length > 0) ? property.images : ['/placeholder-property.jpg']
                        const currentIndex = currentImageIndex[property.id] || 0
                        return (
                          <div key={property.id} onClick={() => router.push(`/properties/${property.id}`)} className="group bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer flex flex-col hover:shadow-lg transition-all">
                            <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 rounded-xl sm:rounded-2xl">
                                <img src={imgs[currentIndex]} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="" />
                                <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 items-start">
                                    <span className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded-lg shadow-sm backdrop-blur-md ${property.status === 'available' ? 'bg-white text-black' : property.status === 'occupied' ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}`}>
                                        {property.status}
                                    </span>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                                    <p className="text-white font-black text-base sm:text-xl leading-none">₱{Number(property.price).toLocaleString()}</p>
                                    <p className="text-white/80 text-[10px] font-bold uppercase tracking-wider mt-1">per month</p>
                                </div>
                                {imgs.length > 1 && (
                                    <div className="absolute bottom-4 right-4 flex gap-1 z-10">
                                        {imgs.map((_, idx) => (
                                            <div key={idx} className={`h-1.5 rounded-full shadow-sm transition-all ${idx === currentIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`} />
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="p-3 sm:p-5 flex-1 flex flex-col">
                                <h3 className="text-sm sm:text-base font-black text-gray-900 truncate mb-1 sm:mb-1.5">{property.title}</h3>
                                <div className="flex items-center gap-1.5 text-gray-500 mb-4">
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    <p className="text-xs font-medium truncate">{property.city}, {property.address}</p>
                                </div>
                                <div className="flex items-center gap-4 mt-auto pt-4 border-t border-gray-100/80 text-gray-400">
                                    <div className="flex items-center gap-1.5"><svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" /></svg> <span className="text-sm font-bold text-gray-700">{property.bedrooms}</span></div>
                                    <div className="flex items-center gap-1.5"><svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" /></svg> <span className="text-sm font-bold text-gray-700">{property.bathrooms}</span></div>
                                    <div className="flex items-center gap-1.5 ml-auto"><span className="text-xs font-bold text-gray-500">{property.area_sqft} sqm</span></div>
                                </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* MAIN GRID */}
            <div className="flex flex-col gap-6 xl:gap-8">
              {/* BILLING SCHEDULE */}
              {activePanel === 'billing' && (
                <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 border border-gray-200/60 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-gray-900 tracking-tight">Billing Schedule</h3>
                      <p className="text-xs sm:text-sm font-medium text-gray-500">Upcoming automated payments & reminders</p>
                    </div>
                    <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-2.5">
                      <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={billingTenantFilter}
                          onChange={(e) => setBillingTenantFilter(e.target.value)}
                          placeholder="Search tenant"
                          className="w-full sm:w-[180px] border border-gray-300 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white"
                        />
                        <input
                          type="date"
                          value={billingDateFilter}
                          onChange={(e) => setBillingDateFilter(e.target.value)}
                          className="w-full sm:w-[170px] border border-gray-300 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleAutoBilling}
                          disabled={togglingAutoBilling}
                          className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl border transition-all cursor-pointer whitespace-nowrap ${autoBillingEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'} disabled:opacity-50`}
                        >
                          {togglingAutoBilling ? 'Updating...' : autoBillingEnabled ? 'Auto Billing: ON' : 'Auto Billing: OFF'}
                        </button>
                        {hasBillingFilters && (
                          <button
                            onClick={() => {
                              setBillingDateFilter('')
                              setBillingTenantFilter('')
                            }}
                            className="px-3 py-2 text-xs font-bold border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer transition-all"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {!autoBillingEnabled && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-800 font-medium">
                      Automated billing is disabled. Schedule edits and Send Now actions are blocked until you enable it.
                    </div>
                  )}

                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {[
                      { key: 'internet', label: 'Internet' },
                      { key: 'water', label: 'Water' },
                      { key: 'electricity', label: 'Electricity' }
                    ].map((util) => {
                      const enabled = utilityReminderSettings[util.key] !== false
                      const isBusy = togglingUtilityKey === util.key
                      return (
                        <button
                          key={util.key}
                          onClick={() => toggleUtilityReminder(util.key)}
                          disabled={isBusy}
                          className={`px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg border transition-all cursor-pointer ${enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'} disabled:opacity-50`}
                        >
                          {isBusy ? 'Updating...' : `${util.label}: ${enabled ? 'ON' : 'OFF'}`}
                        </button>
                      )
                    })}
                    <span className="ml-auto text-xs font-semibold text-gray-500">
                      {filteredBillingSchedule.length} row{filteredBillingSchedule.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {filteredBillingSchedule.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-2xl bg-gray-50/50 border border-dashed border-gray-200">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm text-gray-400">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <p className="text-gray-900 font-bold text-sm">{hasBillingFilters ? 'No bills match your search' : 'No upcoming bills'}</p>
                      <p className="text-gray-500 text-sm mt-1">{hasBillingFilters ? 'Try another tenant/date or clear the filters.' : 'Everything is up to date.'}</p>
                    </div>
                  ) : (
                    <>
                      <div className={`sm:hidden space-y-3 ${isBillingRowsScrollable ? 'max-h-[720px] overflow-y-auto pr-1 my-scrollbar' : ''}`}>
                        {filteredBillingSchedule.map(item => {
                          const autoSendDate = new Date(item.nextDueDate)
                          autoSendDate.setDate(autoSendDate.getDate() - 3)
                          const isEditing = editingDueDateItemId === item.id
                          const sendNowKey = `${item.tenantId}-${item.billType}`
                          const isSendingNow = sendingBillId === sendNowKey
                          const hasBillAlreadySent = item.billType === 'rent' && !!item.paymentRequestId
                          const disableSendNow = !autoBillingEnabled || (item.billType !== 'rent' && item.isEnabled === false) || isSendingNow || hasBillAlreadySent
                          return (
                            <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-gray-900 truncate">{item.tenantName}</p>
                                  <p className="text-xs text-gray-500 truncate">{item.propertyTitle}</p>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-200">
                                  {item.billLabel}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <p className="text-gray-400 uppercase tracking-wider">Auto-Send</p>
                                  <p className="font-semibold text-gray-700">{autoSendDate.toLocaleDateString()}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400 uppercase tracking-wider">Due Date</p>
                                  {isEditing ? (
                                    <input
                                      type="date"
                                      className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1 text-xs"
                                      value={editingDueDateValue}
                                      min={new Date().toISOString().split('T')[0]}
                                      onChange={(e) => setEditingDueDateValue(e.target.value)}
                                    />
                                  ) : (
                                    <p className="font-semibold text-gray-900">{new Date(item.nextDueDate).toLocaleDateString()}</p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${item.status === 'Overdue' ? 'bg-red-50 text-red-600 border border-red-100' : item.status === 'Confirming' ? 'bg-blue-50 text-blue-600 border border-blue-100' : item.status === 'Reminder Scheduled' ? 'bg-violet-50 text-violet-700 border border-violet-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                  {item.status}
                                </span>
                                {item.billType !== 'rent' && item.isEnabled === false && (
                                  <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider bg-gray-100 text-gray-500 border border-gray-200">
                                    Disabled
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => cancelEditIncomingDueDate()}
                                      className="text-[11px] font-bold border border-gray-300 text-gray-700 px-3 py-2 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => saveIncomingDueDate(item)}
                                      disabled={savingDueDateItemId === item.id}
                                      className="text-[11px] font-bold bg-black text-white px-3 py-2 rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                                    >
                                      {savingDueDateItemId === item.id ? 'Saving...' : 'Save'}
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {item.canEditDueDate && (
                                      <button
                                        onClick={() => startEditIncomingDueDate(item)}
                                        disabled={!autoBillingEnabled || (item.billType !== 'rent' && item.isEnabled === false)}
                                        className="text-[11px] font-bold border border-gray-300 text-gray-700 px-3 py-2 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
                                      >
                                        Edit Due Date
                                      </button>
                                    )}
                                    {item.status !== 'Contract Ending' && item.status !== 'Confirming' && (
                                      (() => {
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        const start = item.startDate ? new Date(item.startDate) : null;
                                        if (start) start.setHours(0, 0, 0, 0);

                                        if (start && start > today) {
                                          return (
                                            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                                              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                                                Start on {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                                              </span>
                                            </div>
                                          );
                                        }

                                        return (
                                          <button
                                            onClick={() => openAdvanceBillModal(item.tenantId, item.tenantName, item.propertyTitle, item.propertyPrice, item.billType, item.billLabel)}
                                            disabled={disableSendNow}
                                            className="text-[11px] font-bold bg-black text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                                          >
                                            {isSendingNow ? 'Sending...' : hasBillAlreadySent ? 'Already Sent' : 'Send Now'}
                                          </button>
                                        );
                                      })()
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="hidden sm:block overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
                        <div className={isBillingRowsScrollable ? 'max-h-[780px] overflow-y-auto pr-1 my-scrollbar' : ''}>
                          <table className="w-full text-left">
                            <thead className="text-[11px] text-gray-400 uppercase tracking-widest font-bold border-b border-gray-100">
                              <tr>
                                <th className="py-4 pl-2 sticky top-0 bg-white">Tenant & Property</th>
                                <th className="py-4 sticky top-0 bg-white">Bill Type</th>
                                <th className="py-4 sticky top-0 bg-white">Auto-Send</th>
                                <th className="py-4 sticky top-0 bg-white">Due Date</th>
                                <th className="py-4 sticky top-0 bg-white">Status</th>
                                <th className="py-4 text-right pr-2 sticky top-0 bg-white">Action</th>
                              </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-gray-50">
                              {filteredBillingSchedule.map(item => {
                                const autoSendDate = new Date(item.nextDueDate)
                                autoSendDate.setDate(autoSendDate.getDate() - 3)
                                const isEditing = editingDueDateItemId === item.id
                                const sendNowKey = `${item.tenantId}-${item.billType}`
                                const isSendingNow = sendingBillId === sendNowKey
                                const hasBillAlreadySent = item.billType === 'rent' && !!item.paymentRequestId
                                const disableSendNow = !autoBillingEnabled || (item.billType !== 'rent' && item.isEnabled === false) || isSendingNow || hasBillAlreadySent
                                return (
                                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="py-4 pl-2">
                                      <p className="font-bold text-gray-900 group-hover:text-black transition-colors">{item.tenantName}</p>
                                      <p className="text-xs font-medium text-gray-500 mt-0.5">{item.propertyTitle}</p>
                                    </td>
                                    <td className="py-4 text-gray-800 text-xs font-bold">{item.billLabel}</td>
                                    <td className="py-4 text-gray-500 font-medium text-xs">
                                      <span className="inline-flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                        {autoSendDate.toLocaleDateString()}
                                      </span>
                                    </td>
                                    <td className="py-4 text-gray-900 text-xs font-bold">
                                      {isEditing ? (
                                        <input
                                          type="date"
                                          className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                                          value={editingDueDateValue}
                                          min={new Date().toISOString().split('T')[0]}
                                          onChange={(e) => setEditingDueDateValue(e.target.value)}
                                        />
                                      ) : (
                                        item.nextDueDate.toLocaleDateString()
                                      )}
                                    </td>
                                    <td className="py-4">
                                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${item.status === 'Overdue' ? 'bg-red-50 text-red-600 border border-red-100' : item.status === 'Confirming' ? 'bg-blue-50 text-blue-600 border border-blue-100' : item.status === 'Reminder Scheduled' ? 'bg-violet-50 text-violet-700 border border-violet-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                        {item.status}
                                      </span>
                                      {item.billType !== 'rent' && item.isEnabled === false && (
                                        <span className="ml-2 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider bg-gray-100 text-gray-500 border border-gray-200">
                                          Disabled
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-4 text-right pr-2">
                                      {isEditing ? (
                                        <div className="flex items-center justify-end gap-2">
                                          <button
                                            onClick={() => cancelEditIncomingDueDate()}
                                            className="text-[11px] font-bold border border-gray-300 text-gray-700 px-3 py-2 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            onClick={() => saveIncomingDueDate(item)}
                                            disabled={savingDueDateItemId === item.id}
                                            className="text-[11px] font-bold bg-black text-white px-3 py-2 rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                                          >
                                            {savingDueDateItemId === item.id ? 'Saving...' : 'Save'}
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-end gap-2">
                                          {item.canEditDueDate && (
                                            <button
                                              onClick={() => startEditIncomingDueDate(item)}
                                              disabled={!autoBillingEnabled || (item.billType !== 'rent' && item.isEnabled === false)}
                                              className="text-[11px] font-bold border border-gray-300 text-gray-700 px-3 py-2 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
                                            >
                                              Edit Due Date
                                            </button>
                                          )}
                                          {item.status !== 'Contract Ending' && item.status !== 'Confirming' && (
                                            (() => {
                                              const today = new Date();
                                              today.setHours(0, 0, 0, 0);
                                              const start = item.startDate ? new Date(item.startDate) : null;
                                              if (start) start.setHours(0, 0, 0, 0);

                                              if (start && start > today) {
                                                return (
                                                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                                                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                                                      Start on {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                                                    </span>
                                                  </div>
                                                );
                                              }

                                              return (
                                                <button onClick={() => openAdvanceBillModal(item.tenantId, item.tenantName, item.propertyTitle, item.propertyPrice, item.billType, item.billLabel)} disabled={disableSendNow}
                                                  className="text-[11px] font-bold bg-black text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 cursor-pointer shadow-sm">
                                                  {isSendingNow ? 'Sending...' : hasBillAlreadySent ? 'Already Sent' : 'Send Now'}
                                                </button>
                                              );
                                            })()
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ACTIVE PROPERTIES */}
              {activePanel === 'properties' && (
                <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 border border-gray-200/60 shadow-sm">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-gray-900 tracking-tight">Active Properties</h3>
                      <p className="text-xs sm:text-sm font-medium text-gray-500 mt-0.5">{activeOccupancies.length} occupied units</p>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 -mr-2 my-scrollbar">
                    {activeOccupancies.length === 0 ? (
                      <div className="py-8 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                        <p className="text-gray-400 text-sm font-medium">No occupied properties</p>
                      </div>
                    ) : (
                      activeOccupancies.map(occ => {
                        const occStartDate = occ.start_date ? new Date(occ.start_date) : null;
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        if (occStartDate) occStartDate.setHours(0, 0, 0, 0);
                        const hasStarted = !occStartDate || today >= occStartDate;

                        return (
                          <div key={occ.id} className="flex items-center gap-4 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all group bg-white">
                            <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0 shadow-inner">
                              <img src={occ.property?.images?.[0] || '/placeholder-property.jpg'} className="w-full h-full object-cover" alt="" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-gray-900 truncate group-hover:text-black transition-colors">{occ.property?.title}</p>
                              <p className="text-xs font-medium text-gray-500 mt-0.5 truncate">{occ.tenant?.first_name} {occ.tenant?.last_name}</p>
                            </div>
                            {hasStarted ? (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); openFamilyModal(occ) }}
                                  className="text-xs text-white font-bold text-blue-600 bg-blue-600 px-3 py-1.5 rounded-lg transition-all cursor-pointer">
                                  Show Details
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); openEndContractModal(occ) }}
                                  className="text-xs text-white font-bold text-red-600 bg-red-600 px-3 py-1.5 rounded-lg transition-all cursor-pointer">
                                  End
                                </button>
                              </>
                            ) : (
                              <div className="flex flex-col items-end gap-2">
                                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
                                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                                    Start on {new Date(occ.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                                  </span>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); setCancelOccupancyModal({ isOpen: true, occupancy: occ }) }}
                                  className="text-[10px] text-red-600 font-bold hover:text-red-700 cursor-pointer transition-colors px-1">
                                  Cancel Occupancy
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ACTION CENTER */}
              {activePanel === 'actions' && (
                <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 border border-gray-200/60 shadow-sm">
                  <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                        Pending Tasks
                        {(pendingEndRequests.filter(r => r.end_request_status === 'pending').length + pendingRenewalRequests.length + dashboardTasks.payments.length + dashboardTasks.maintenance.length) > 0 && (
                          <span className="flex h-2.5 w-2.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                          </span>
                        )}
                      </h3>
                    </div>
                  </div>

                  {(pendingEndRequests.filter(r => r.end_request_status === 'pending').length + pendingRenewalRequests.length + pendingCancelEndRequests.length + dashboardTasks.payments.length + dashboardTasks.maintenance.length) > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                      {pendingCancelEndRequests.map(req => (
                        <div key={req.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group" onClick={() => openEndConfirmation('approve_cancel_end', req.id)}>
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-md cursor-pointer">Cancel Move-Out</span>
                                <span className="text-[10px] text-gray-400 font-medium">Tenant Request</span>
                              </div>
                              <h4 className="font-bold text-sm text-gray-900 group-hover:text-emerald-700 transition-colors truncate">{req.property?.title}</h4>
                              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                {req.tenant?.first_name} {req.tenant?.last_name}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}

                      {pendingEndRequests.filter(req => req.end_request_status === 'pending').map(req => {
                        const isApproved = req.end_request_status === 'approved';
                        return (
                          <div key={req.id} className={`p-4 bg-gray-50 rounded-2xl border transition-all cursor-pointer group ${isApproved ? 'border-emerald-200 hover:border-emerald-300' : 'border-gray-200 hover:border-orange-300'} hover:shadow-md`} onClick={() => isApproved ? setActivePanel('terminations') : openEndConfirmation('approve', req.id)}>
                            <div className="flex items-start gap-4">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isApproved ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                                {isApproved ? (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3M13 19H7a2 2 0 01-2-2V7a2 2 0 012-2h6" /></svg>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md ${isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {isApproved ? 'Scheduled Move-Out' : 'Move-Out'}
                                  </span>
                                  <span className="text-[10px] text-gray-400 font-medium">{isApproved ? 'Already Approved' : 'Request Pending'}</span>
                                </div>
                                <h4 className={`font-bold text-sm text-gray-900 transition-colors truncate ${isApproved ? 'group-hover:text-emerald-700' : 'group-hover:text-orange-700'}`}>{req.property?.title}</h4>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    {req.tenant?.first_name} {req.tenant?.last_name}
                                  </p>
                                  {req.end_request_date && (
                                    <p className={`text-xs font-bold flex items-center gap-1.5 ${isApproved ? 'text-emerald-600' : 'text-orange-600'}`}>
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                      Leaves: {new Date(req.end_request_date).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {pendingRenewalRequests.map(req => (
                        <div key={req.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group" onClick={() => openRenewalModal(req, 'approve')}>
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded-md">Renewal</span>
                                <span className="text-[10px] text-gray-400 font-medium">Action Required</span>
                              </div>
                              <h4 className="font-bold text-sm text-gray-900 group-hover:text-blue-700 transition-colors truncate">{req.property?.title}</h4>
                              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                {req.tenant?.first_name} {req.tenant?.last_name}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* ... rest of actions ... */}

                      {dashboardTasks.maintenance.length > 0 && (
                        <div onClick={() => router.push('/maintenance')} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 hover:border-rose-300 hover:shadow-md transition-all cursor-pointer group">
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                              <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-bold uppercase tracking-wider rounded-md">Maintenance</span>
                                <span className="text-[10px] text-gray-400 font-medium">To Review</span>
                              </div>
                              <h4 className="font-bold text-sm text-gray-900 group-hover:text-rose-700 transition-colors">{dashboardTasks.maintenance.length} Pending Reports</h4>
                              <p className="text-xs text-gray-500 mt-1">Review and assign maintenance tasks.</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {dashboardTasks.payments.length > 0 && (
                        <div onClick={() => router.push('/payments')} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group">
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2a10 10 0 100 20 10 10 0 000-20zM12 20V4M12 20V4" /></svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-md">Payments</span>
                                <span className="text-[10px] text-gray-400 font-medium">Check Receipts</span>
                              </div>
                              <h4 className="font-bold text-sm text-gray-900 group-hover:text-emerald-700 transition-colors">{dashboardTasks.payments.length} Pending Confirmations</h4>
                              <p className="text-xs text-gray-500 mt-1">Verify tenant payment submissions.</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                      <p className="text-gray-400 text-sm font-medium">All caught up! No pending tasks.</p>
                    </div>
                  )}
                </div>
              )}

              {/* PROPERTY TERMINATIONS / ENDS */}
              {activePanel === 'terminations' && (
                <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 border border-gray-200/60 shadow-sm">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-gray-900 tracking-tight">Property Ends</h3>
                      <p className="text-xs sm:text-sm font-medium text-gray-500 mt-0.5">Pending terminations</p>
                    </div>
                  </div>

                  <div className="space-y-6">

                    {/* INCOMING / SCHEDULED ENDS */}
                    <div>
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3 px-1">Upcoming End of List ({incomingEnds.length})</h4>
                      {incomingEnds.length === 0 ? (
                        <div className="py-4 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                          <p className="text-gray-400 text-xs font-medium">No upcoming terminations</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3">
                          {incomingEnds.map(req => {
                            const isApprovedMoveOut = req.end_request_status === 'approved'
                            const rawEndDate = isApprovedMoveOut ? req.end_request_date : req.contract_end_date
                            const endDateObj = new Date(rawEndDate)
                            const isOverdue = endDateObj < new Date().setHours(0,0,0,0)
                            
                            return (
                              <div key={req.id} className="p-3 bg-white rounded-xl border border-gray-200 hover:border-blue-200 hover:shadow-sm transition-all group">
                                <div className="flex items-start gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isApprovedMoveOut ? 'bg-emerald-100 text-emerald-600' : (isOverdue ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600')}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      {isApprovedMoveOut ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      )}
                                    </svg>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2 mb-0.5">
                                      <span className={`px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded ${isApprovedMoveOut ? 'bg-emerald-50 text-emerald-700' : (isOverdue ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700')}`}>
                                        {isApprovedMoveOut ? 'Scheduled Move-Out' : (isOverdue ? 'Contract Expired' : 'Expiring Soon')}
                                      </span>
                                      <span className="text-[9px] text-gray-400 font-medium">Incoming</span>
                                    </div>
                                    <h4 className="font-bold text-xs text-gray-900 group-hover:text-blue-700 transition-colors truncate">{req.property?.title}</h4>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                      <p className="text-[10px] text-gray-500 flex items-center gap-1">
                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        {req.tenant?.first_name} {req.tenant?.last_name}
                                      </p>
                                      <p className={`text-[10px] font-bold flex items-center gap-1 ${isOverdue && !isApprovedMoveOut ? 'text-rose-600' : 'text-gray-700'}`}>
                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        Ends: {new Date(rawEndDate).toLocaleDateString()}
                                      </p>
                                    </div>
                                    <div className="mt-2 flex justify-end">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); openEndConfirmation('cancel_end', req.id); }}
                                        className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-[9px] font-black uppercase hover:bg-rose-600 hover:text-white hover:border-rose-600 hover:shadow-md hover:shadow-rose-100 active:scale-95 transition-all shadow-sm cursor-pointer"
                                      >
                                        Cancel Move-Out
                                      </button>
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
              )}

              {/* SCHEDULED TODAY */}
              {activePanel === 'scheduled' && (
                <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 text-gray-900 shadow-md shadow-black/10 border border-gray-200">
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div>
                      <h3 className="font-black text-gray-900 text-base sm:text-lg">Booking Scheduled Today</h3>
                      <p className="text-gray-500 text-sm mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                    </div>
                    <button onClick={() => router.push('/bookings')} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>

                  {scheduledTodayBookings.length === 0 ? (
                    <div className="py-6 text-center bg-gray-50 rounded-xl border border-gray-200">
                      <p className="text-gray-500 text-sm font-medium">No Booking scheduled today.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scheduledTodayBookings.map((booking) => {
                        const bookingTime = booking.booking_date ? new Date(booking.booking_date) : null
                        const firstName = booking.tenant_profile?.first_name || ''
                        const lastName = booking.tenant_profile?.last_name || ''

                        return (
                          <div key={booking.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
                            <div className="w-10 h-10 rounded-full bg-white text-blue-700 font-bold flex items-center justify-center text-sm shadow-sm">
                              {firstName.charAt(0)}{lastName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-gray-900 truncate">{`${firstName} ${lastName}`.trim() || 'Tenant'}</p>
                              <p className="text-xs text-gray-500 mt-0.5 truncate">{booking.property?.title || 'Property'}</p>
                              {bookingTime && !Number.isNaN(bookingTime.getTime()) && (
                                <p className="text-[11px] text-gray-400 mt-0.5">{bookingTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Confirmation Modal */}
        {
          typeof window !== 'undefined' && confirmationModal.isOpen && createPortal(
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[120] p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-gray-200 relative">
                <button 
                  onClick={() => setConfirmationModal({ isOpen: false, type: null, requestId: null })}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto ${confirmationModal.type === 'approve' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                  {confirmationModal.type === 'approve' ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  )}
                </div>

                <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">
                  {confirmationModal.type === 'approve' ? 'Approve Move-Out?' : 
                   confirmationModal.type === 'approve_cancel_end' ? 'Approve Cancellation?' :
                   confirmationModal.type === 'cancel_end' ? 'Cancel Stay Termination?' : 'Reject Request?'}
                </h3>

                <p className="text-sm text-gray-500 mb-4 text-center">
                  {confirmationModal.type === 'approve'
                    ? 'Are you sure you want to approve this request? The contract will be ended and the property will be marked as available.'
                    : confirmationModal.type === 'approve_cancel_end'
                    ? 'The tenant has requested to cancel their move-out. Approving this will keep the lease active.'
                    : confirmationModal.type === 'cancel_end'
                    ? 'Are you sure you want to cancel this termination? The tenant will stay and the lease will remain active.'
                    : 'Are you sure you want to reject this request? The tenant will remain in the property and the contract will continue.'}
                </p>

                {/* Shared logic for displaying dates ... */}
                {(confirmationModal.type === 'approve' || confirmationModal.type === 'cancel_end' || confirmationModal.type === 'approve_cancel_end') && (() => {
                  const req = pendingEndRequests.find(r => r.id === confirmationModal.requestId) || 
                              pendingCancelEndRequests.find(r => r.id === confirmationModal.requestId) ||
                              incomingEnds.find(r => r.id === confirmationModal.requestId)
                  if (!req) return null
                  return (
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 mb-6 space-y-2 text-xs">
                      <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                        <span className="text-gray-400 font-bold uppercase tracking-wider">Target Stay End</span>
                        <span className="text-gray-900 font-black">
                          {req.end_request_date || req.contract_end_date ? new Date(req.end_request_date || req.contract_end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not Specified'}
                        </span>
                      </div>
                    </div>
                  )
                })()}

                <div className="flex gap-3">
                  {confirmationModal.type === 'approve' ? (
                    <>
                      <button
                        onClick={async () => {
                          setProcessingEndRequest(true)
                          try {
                            await rejectEndRequest(confirmationModal.requestId)
                            setConfirmationModal({ isOpen: false, type: null, requestId: null })
                          } finally {
                            setProcessingEndRequest(false)
                          }
                        }}
                        disabled={processingEndRequest}
                        className="flex-1 px-4 py-2 border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-50 cursor-pointer disabled:opacity-50 transition-all font-bold"
                      >
                        {processingEndRequest ? '...' : 'Reject Request'}
                      </button>
                      <button
                        onClick={handleConfirmEndAction}
                        disabled={processingEndRequest}
                        className="flex-1 px-4 py-2 text-white font-bold rounded-xl shadow-lg bg-black hover:bg-gray-800 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                      >
                        {processingEndRequest ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            Wait...
                          </>
                        ) : 'Approve Move-Out'}
                      </button>
                    </>
                  ) : confirmationModal.type === 'approve_cancel_end' ? (
                    <>
                      <button
                        onClick={() => setConfirmationModal({ isOpen: false, type: null, requestId: null })}
                        className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 cursor-pointer"
                      >
                        Close
                      </button>
                      <button
                        onClick={handleConfirmEndAction}
                        disabled={processingEndRequest}
                        className="flex-1 px-4 py-2 text-white font-bold rounded-xl shadow-lg bg-emerald-600 hover:bg-emerald-700 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                      >
                        {processingEndRequest ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            Wait...
                          </>
                        ) : 'Approve Stay'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setConfirmationModal({ isOpen: false, type: null, requestId: null })}
                        className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 cursor-pointer"
                      >
                        {confirmationModal.type === 'reject' ? 'Cancel' : 'No, Keep'}
                      </button>
                      <button
                        onClick={handleConfirmEndAction}
                        disabled={processingEndRequest}
                        className={`flex-1 px-4 py-2 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 ${processingEndRequest ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'} ${confirmationModal.type === 'cancel_end' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-red-600 hover:bg-red-700'}`}
                      >
                        {processingEndRequest ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            Wait...
                          </>
                        ) : (confirmationModal.type === 'cancel_end' ? 'Yes, Cancel Move-Out' : 'Confirm Rejection')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body
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
                          <button
                            onClick={() => cancelAssignment(app)}
                            disabled={uploadingContract || processingBookingId === app.id}
                            className={`text-xs bg-white text-red-600 border border-red-100 px-2 py-1.5 rounded-lg transition-colors font-bold disabled:opacity-50 flex items-center gap-1 ${processingBookingId === app.id ? 'opacity-70 cursor-not-allowed' : 'hover:bg-red-50 cursor-pointer'}`}
                          >
                            {processingBookingId === app.id ? (
                              <>
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                <span>...</span>
                              </>
                            ) : <span>Cancel</span>}
                          </button>
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
                  <input type="date" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black" value={startDate} min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]} onChange={(e) => setStartDate(e.target.value)} />
                </div>

                {/* Move-in Payment Summary */}
                <div className="mb-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Move-in Payment Summary</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-emerald-700">Rent (1 Month):</span>
                      <span className="font-bold text-emerald-900">₱{Number(selectedProperty?.price || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-700">Advance (1 Month):</span>
                      <span className="font-bold text-emerald-900">₱{Number(selectedProperty?.price || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-700">Security Deposit:</span>
                      <span className="font-bold text-emerald-900">₱{Number(selectedProperty?.price || 0).toLocaleString()}</span>
                    </div>
                    <div className="border-t border-emerald-200 mt-2 pt-2 flex justify-between">
                      <span className="font-bold text-emerald-800">Total Move-in:</span>
                      <span className="font-black text-emerald-900">₱{Number((selectedProperty?.price || 0) * 3).toLocaleString()}</span>
                    </div>
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
                    Note: Electricity and Water reminders are sent automatically (due date is always 1st week of the month).
                  </p>
                </div>
              </div>
            </div>
          )
        }

      </div>
      {/* ^^^ Close z-10 container before modals so they can overlay navbar ^^^ */}

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
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-3xl w-full p-4 sm:p-6 md:p-8 border border-gray-100 relative max-h-[90vh] overflow-y-auto">
              <button onClick={closeRenewalModal} className="absolute top-3 right-3 sm:top-6 sm:right-6 text-gray-400 hover:text-gray-900 transition-colors w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div className="flex flex-col items-start gap-4 sm:gap-6">
                <div className="flex items-center gap-3 sm:gap-4 w-full pr-8 sm:pr-0">
                  <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex-shrink-0 flex items-center justify-center ${renewalModal.action === 'approve' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                    <svg className="w-5 h-5 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {renewalModal.action === 'approve' ?
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /> :
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      }
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg sm:text-xl md:text-2xl font-black text-gray-900 tracking-tight">
                      {renewalModal.action === 'approve' ? 'Approve Contract Renewal' : 'Reject Renewal Request'}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium">Review pending renewal requests</p>
                  </div>
                </div>

                {renewalModal.action === 'approve' ? (
                  <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-6">
                      {/* Info Block */}
                      <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Property</p>
                            <p className="font-bold text-gray-900 text-lg">{renewalModal.occupancy?.property?.title}</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tenant</p>
                            <p className="font-bold text-gray-900">{renewalModal.occupancy?.tenant?.first_name} {renewalModal.occupancy?.tenant?.last_name}</p>
                          </div>
                        </div>
                      </div>

                      {/* Payment Summary */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                          Payment Summary (Bill to be sent)
                        </p>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600 font-medium">Monthly Rent</span>
                            <span className="font-bold text-gray-900">₱{Number(renewalModal.occupancy?.property?.price || 0).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600 font-medium">Advance Rent (1mo)</span>
                            <span className="font-bold text-gray-900">₱{Number(renewalModal.occupancy?.property?.price || 0).toLocaleString()}</span>
                          </div>
                          <div className="h-px bg-gray-100 my-2"></div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-900 font-bold">Total Due</span>
                            <span className="font-black text-indigo-600 text-lg">₱{Number((renewalModal.occupancy?.property?.price || 0) * 2).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      {/* Important Note */}
                      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                        <p className="text-sm text-amber-900 font-bold mb-2">⚠ Approving this renewal will:</p>
                        <ul className="space-y-2">
                          {['Extend the contract end date', 'Send a payment bill for Rent + Advance', 'Notify tenant of signing schedule'].map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-amber-800 font-medium">
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Dates */}
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                            New Contract End Date <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            required
                            className="w-full bg-white border border-gray-200 focus:border-black focus:ring-0 rounded-xl px-4 py-3.5 text-sm font-bold outline-none transition-all shadow-sm"
                            value={renewalEndDate}
                            onChange={(e) => setRenewalEndDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                            Contract Signing Date <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            required
                            className="w-full bg-white border border-gray-200 focus:border-black focus:ring-0 rounded-xl px-4 py-3.5 text-sm font-bold outline-none transition-all shadow-sm"
                            value={renewalSigningDate}
                            onChange={(e) => setRenewalSigningDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                          />
                          <p className="text-xs text-gray-400 mt-2 font-medium">Tenant will be notified to come on this date.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full py-8 text-center">
                    <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h4 className="text-xl font-bold text-gray-900 mb-2">Confirm Rejection</h4>
                    <p className="text-gray-500 max-w-sm mx-auto leading-relaxed">
                      Are you sure you want to reject this renewal request? The contract will typically end at its current expiry date.
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4 border-t border-gray-100 w-full mt-2">
                  <button
                    onClick={() => {
                      if (renewalModal.action === 'approve') {
                        setRenewalModal(prev => ({ ...prev, action: 'reject' }));
                      } else {
                        setRenewalModal(prev => ({ ...prev, action: 'approve' }));
                      }
                    }}
                    className={`sm:flex-1 px-4 sm:px-6 py-3 sm:py-4 text-sm font-bold rounded-xl cursor-pointer transition-all border-2 ${renewalModal.action === 'approve'
                      ? 'border-transparent text-red-600 bg-red-50 hover:bg-red-100'
                      : 'border-gray-100 text-gray-700 hover:border-gray-300 bg-white'
                      }`}
                  >
                    {renewalModal.action === 'approve' ? 'Switch to Reject' : 'Back to Verify'}
                  </button>
                  <button
                    onClick={confirmRenewalRequest}
                    disabled={processingRenewal}
                    className={`sm:flex-[2] px-4 sm:px-6 py-3 sm:py-4 text-sm text-white font-bold rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 sm:gap-3 transform active:scale-95 ${processingRenewal ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:-translate-y-1'} ${renewalModal.action === 'approve' ? 'bg-black hover:bg-gray-800' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                    {processingRenewal ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Processing...
                      </>
                    ) : (renewalModal.action === 'approve' ? 'Approve & Create Bill' : 'Confirm Rejection')}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )
      }

      {/* Email Notification Modal */}
      {
        showEmailModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-gray-200">
              {/* Header */}
              <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-100">
                <div>
                  <h3 className="font-black text-base sm:text-xl text-gray-900">📬 Send Notification</h3>
                  <p className="text-xs sm:text-sm text-gray-500 mt-1">Email & SMS your tenants</p>
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
      {
        advanceBillModal.isOpen && (
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
                    <h3 className="text-lg font-bold text-gray-900">Confirm Send {advanceBillModal.billLabel}</h3>
                    <p className="text-xs text-gray-500">This action will send immediately</p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-6">
                <p className="text-gray-700 mb-4">
                  Are you sure you want to send {advanceBillModal.billLabel.toLowerCase()} now to <span className="font-bold">{advanceBillModal.tenantName}</span> for property <span className="font-bold">{advanceBillModal.propertyTitle}</span>?
                </p>
                {advanceBillModal.billType === 'rent' && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700 font-semibold">Rent Amount</p>
                      <p className="text-lg font-bold text-emerald-800">₱{Number(advanceBillModal.propertyPrice || 0).toLocaleString()}</p>
                    </div>
                  </div>
                )}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-gray-500">
                      This will immediately send a {advanceBillModal.billLabel.toLowerCase()} notification to the tenant. The tenant will receive an email, SMS (if phone is verified), and an in-app notification.
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
                  Yes, Send Now
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Family Modal Side Panel */}
      {
        familyModal.isOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity duration-300">
            {/* Clickable overlay to close */}
            <div className="absolute inset-0 cursor-pointer" onClick={closeFamilyModal}></div>

            {/* Slide-over panel */}
            <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-300 overflow-hidden animate-in slide-in-from-right">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex flex-col items-center justify-center text-gray-600 shadow-sm border border-gray-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Tenant Details</h2>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{familyModal.occupancy?.property?.title}</p>
                  </div>
                </div>
                <button onClick={closeFamilyModal} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-white rounded-full transition-all cursor-pointer shadow-sm border border-transparent hover:border-gray-200">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 bg-white my-scrollbar space-y-6">

                {/* Tenant Details + Due Dates */}
                <div>
                  <div className="flex items-center justify-between mb-3 pl-1 gap-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Rented Tenant</h3>
                  </div>

                  <div className="rounded-2xl border border-gray-300 bg-gray-50 shadow-sm overflow-hidden">
                    <div className="px-4 py-4 border-b border-gray-200 bg-gray-100">
                      <div className="flex items-start gap-3">
                        <img
                          src={familyModal.occupancy?.tenant?.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                          alt="Tenant"
                          className="w-12 h-12 rounded-xl border border-gray-300 object-cover flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">Current Tenant</p>
                          <p className="text-[19px] leading-tight font-black text-gray-900 truncate mt-0.5">
                            {familyModal.occupancy?.tenant?.first_name} {familyModal.occupancy?.tenant?.last_name}
                          </p>
                          <p className="text-xs text-gray-700 truncate mt-1">{familyModal.occupancy?.tenant?.email || 'No email provided'}</p>
                          <p className="text-xs text-gray-500 truncate">{familyModal.occupancy?.tenant?.phone || 'No phone provided'}</p>
                        </div>
                        <div className="text-right rounded-xl px-3 py-2 min-w-[112px] border border-gray-800 bg-gray-900 text-white">
                          <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/70">Property Price</p>
                          <p className="text-base font-black leading-tight">₱{Number(familyModal.occupancy?.property?.price || 0).toLocaleString()}</p>
                          <p className="text-[10px] text-white/70">monthly</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-2 border-t border-gray-200 flex items-start justify-between gap-3">
                        <p className="text-xs font-semibold text-gray-600">Rented Unit</p>
                        <p className="text-xs font-bold text-gray-900 text-right">{familyModal.occupancy?.property?.title || 'Untitled Property'}</p>
                      </div>
                    </div>

                    <div className="p-4 bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-gray-500 font-bold">Utility Due Date Schedule</p>
                        <span className="text-[10px] text-gray-400">Choose a date</span>
                      </div>

                      <div className="space-y-2.5">
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
                          <div>
                            <p className="text-sm font-bold text-gray-900">Internet</p>
                            <p className="text-[11px] text-gray-600">Wifi reminder due date</p>
                          </div>
                          {(() => {
                            if (!familyModal.internetAvailable) {
                              return (
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-300">N/A - Not Available</span>
                                  <button
                                    type="button"
                                    onClick={() => setFamilyModal(prev => ({ ...prev, internetAvailable: true, internetIsFree: false }))}
                                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-black text-white hover:bg-gray-800 transition-all cursor-pointer"
                                  >
                                    Set Available
                                  </button>
                                </div>
                              )
                            }

                            if (familyModal.internetIsFree) {
                              return <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Free</span>
                            }

                            return (
                              <div className="flex items-center gap-1">
                                <input
                                  type="date"
                                  className="w-40 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                                  value={familyModal.internetDueDate}
                                  onChange={(e) => setFamilyModal(prev => ({ ...prev, internetDueDate: e.target.value }))}
                                />
                              </div>
                            )
                          })()}
                        </div>

                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
                          <div>
                            <p className="text-sm font-bold text-gray-900">Water</p>
                            <p className="text-[11px] text-gray-600">Water reminder due date</p>
                          </div>
                          {(Array.isArray(familyModal.occupancy?.property?.amenities) && familyModal.occupancy.property.amenities.includes('Free Water')) ? (
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Free</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <input
                                type="date"
                                className="w-40 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                                value={familyModal.waterDueDate}
                                onChange={(e) => setFamilyModal(prev => ({ ...prev, waterDueDate: e.target.value }))}
                              />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
                          <div>
                            <p className="text-sm font-bold text-gray-900">Electricity</p>
                            <p className="text-[11px] text-gray-600">Electric reminder due date</p>
                          </div>
                          {(Array.isArray(familyModal.occupancy?.property?.amenities) && familyModal.occupancy.property.amenities.includes('Free Electricity')) ? (
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Free</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <input
                                type="date"
                                className="w-40 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                                value={familyModal.electricityDueDate}
                                onChange={(e) => setFamilyModal(prev => ({ ...prev, electricityDueDate: e.target.value }))}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={updateTenantDueDatesForFamilyModal}
                        disabled={familyModal.savingDueDates}
                        className="mt-3 text-xs font-bold px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black transition-all cursor-pointer disabled:opacity-50"
                      >
                        {familyModal.savingDueDates ? 'Saving...' : 'Save'}
                      </button>

                      <p className="text-[11px] text-gray-500 mt-2">
                        Internet due date is required when Internet is available. Water and Electricity show Free when included in rent.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Rent Payment History (Visual Tracker) */}
                <div>
                  <div className="flex items-center justify-between mb-3 pl-1">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Rent Payment History ({new Date().getFullYear()})</h3>
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-5 border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-white text-slate-600 rounded-lg shadow-sm">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <p className="font-bold text-slate-900 text-sm">Monthly Tracker</p>
                      </div>
                    </div>

                    {familyModal.loadingPaymentHistory ? (
                      <div className="flex items-center justify-center py-8">
                        <svg className="w-6 h-6 text-gray-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-2">
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => {
                          const currentYear = new Date().getFullYear()
                          const isPaid = familyModal.paymentHistory.some(p => {
                            if (!p.due_date || parseFloat(p.rent_amount) <= 0) return false

                            const d = new Date(p.due_date)
                            const pMonth = d.getMonth()
                            const pYear = d.getFullYear()

                            const advance = parseFloat(p.advance_amount || 0)
                            const rent = parseFloat(p.rent_amount || 0)
                            let monthsCovered = 1

                            // Any rent bill with advance (including move-in) covers extra months.
                            if (advance > 0 && rent > 0) {
                              monthsCovered += Math.floor(advance / rent)
                            }

                            const targetAbsoluteMonth = currentYear * 12 + index
                            const paymentStartAbsoluteMonth = pYear * 12 + pMonth
                            const paymentEndAbsoluteMonth = paymentStartAbsoluteMonth + monthsCovered - 1

                            return targetAbsoluteMonth >= paymentStartAbsoluteMonth && targetAbsoluteMonth <= paymentEndAbsoluteMonth
                          })

                          const isActiveMonth = new Date().getMonth() === index

                          return (
                            <div key={month} className="flex flex-col items-center justify-center p-2">
                              <span className={`text-[10px] font-bold uppercase mb-1.5 ${isPaid ? 'text-black' : 'text-gray-400'}`}>
                                {month}
                              </span>

                              {isPaid ? (
                                <div className="w-5 h-5 rounded-full bg-green-300 text-black flex items-center justify-center shadow-sm">
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : isActiveMonth ? (
                                <div className="w-5 h-5 rounded-full border-2 border-black flex items-center justify-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full border border-gray-200"></div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Family Members List */}
                <div>
                  <div className="flex items-center justify-between mb-3 pl-1">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Family Members ({familyModal.members.length})</h3>
                  </div>

                  {familyModal.loading ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 rounded-2xl bg-gray-50 border border-dashed border-gray-200">
                      <svg className="w-8 h-8 text-gray-500 animate-spin mb-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      <p className="text-sm font-bold text-gray-500">Loading members...</p>
                    </div>
                  ) : familyModal.members.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 rounded-2xl bg-gray-50 border border-dashed border-gray-200">
                      <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-gray-400 mb-3">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                      </div>
                      <p className="text-sm font-bold text-gray-900 pb-1">No family members</p>
                      <p className="text-xs text-gray-500 text-center max-w-[200px]">The primary tenant hasn't added anyone yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {familyModal.members.map((member) => (
                        <div key={member.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:border-gray-300 hover:shadow-md transition-all group">
                          <img
                            src={member.member_profile?.avatar_url || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                            alt={member.member_profile?.first_name}
                            className="w-12 h-12 rounded-full border border-gray-100 bg-gray-50 object-cover flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-gray-900 tracking-tight truncate transition-colors">
                              {member.member_profile?.first_name} {member.member_profile?.last_name}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500 font-medium">
                              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              <span className="truncate">{member.member_profile?.email || 'No email provided'}</span>
                            </div>
                            {member.member_profile?.phone && (
                              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-500 font-medium">
                                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                <span className="truncate">{member.member_profile?.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }
      <footer>
        <Footer />
      </footer>

      {/* Cancel Occupancy Confirmation Modal */}
      {cancelOccupancyModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-red-50 px-6 py-4 border-b border-red-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Cancel Upcoming Occupancy</h3>
                  <p className="text-xs text-gray-500">This action cannot be undone</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
                <p className="text-xs font-bold text-red-800 uppercase tracking-wider mb-2">Warning</p>
                <p className="text-sm text-red-700 leading-relaxed">
                  You are about to cancel the upcoming occupancy for <strong>{cancelOccupancyModal.occupancy?.tenant?.first_name} {cancelOccupancyModal.occupancy?.tenant?.last_name}</strong>.
                </p>
              </div>
              
              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span>The property will become <strong>Available</strong> again.</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span>All pending bills for this occupancy will be deleted.</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-green-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span>The tenant's booking will be reset to <strong>Accepted</strong> status.</span>
                </li>
              </ul>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setCancelOccupancyModal({ isOpen: false, occupancy: null })}
                disabled={processingCancelOccupancy}
                className="px-5 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-100 cursor-pointer transition-colors disabled:opacity-50"
              >
                No, Keep it
              </button>
              <button
                onClick={cancelOccupancy}
                disabled={processingCancelOccupancy}
                className="px-5 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 cursor-pointer shadow-lg shadow-red-200 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {processingCancelOccupancy ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Cancelling...
                  </>
                ) : (
                  'Yes, Cancel Occupancy'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {showSlotPurchaseModal && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200" onClick={() => !purchasingSlot && setShowSlotPurchaseModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">Buy Property Slot</h3>
                  <p className="text-xs text-gray-500 font-medium">Add another property listing slot</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="bg-black border border-white rounded-xl p-4 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-white">Current Plan</span>
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-black uppercase tracking-wider">{propertySlotPlan?.type}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xl font-black text-white">{propertySlotPlan?.used_slots}</p>
                    <p className="text-[10px] font-bold text-white uppercase tracking-wider">Used</p>
                  </div>
                  <div>
                    <p className="text-xl font-black text-white">{propertySlotPlan?.total_slots}</p>
                    <p className="text-[10px] font-bold text-white uppercase tracking-wider">Total</p>
                  </div>
                  <div>
                    <p className="text-xl font-black text-white">{propertySlotPlan?.max_slots}</p>
                    <p className="text-[10px] font-bold text-white uppercase tracking-wider">Max</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">+1 Property Slot</p>
                    <p className="text-xs text-gray-500 mt-0.5">Permanent addition to your account</p>
                  </div>
                  <p className="text-2xl font-black text-gray-900">{'\u20b1'}50</p>
                </div>
              </div>

              <p className="text-[11px] text-gray-400 mt-3 text-center">
                After purchase, your total slots will be <strong>{(propertySlotPlan?.total_slots || 3) + 1}</strong>. Payment via GCash, Maya, or Card.
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setShowSlotPurchaseModal(false)}
                disabled={purchasingSlot}
                className="px-5 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-100 cursor-pointer transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePurchasePropertySlot}
                disabled={purchasingSlot}
                className="px-5 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-900 cursor-pointer shadow-lg shadow-blue-200 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {purchasingSlot ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Processing...
                  </>
                ) : (
                  'Proceed to Payment'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
    </>
  )
}
