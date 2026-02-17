import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { createNotification } from '../lib/notifications'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Footer from './Footer'
import Lottie from "lottie-react"
import loadingAnimation from "../assets/loading.json"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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
    <>{prefix}{Number(count).toFixed(decimals)}{suffix}</>
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
        loadPendingRenewalRequests(),
        loadDashboardTasks(),
        loadMonthlyIncome()
      ]).then(() => {
        setStatsLoaded(true)
      })
    }
    // Check for reminders (only sends at 8:00 AM, once per day)
    fetch('/api/manual-reminders').catch(err => console.error("Reminder check failed", err));
  }, [profile])

  // Reload monthly income when selected month/year changes
  useEffect(() => {
    if (profile) {
      loadMonthlyIncome()
    }
  }, [selectedStatementMonth, selectedStatementYear])

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
        .gte('paid_at', monthStart.toISOString())
        .lte('paid_at', monthEnd.toISOString())

      // Fetch paid payments for the year
      const { data: yearPayments } = await supabase
        .from('payment_requests')
        .select('id, rent_amount, security_deposit_amount, advance_amount, water_bill, electrical_bill, wifi_bill, other_bills, paid_at, property_id, amount_paid')
        .eq('landlord', session.user.id)
        .eq('status', 'paid')
        .gte('paid_at', yearStart.toISOString())
        .lte('paid_at', yearEnd.toISOString())

      // Calculate totals
      const calculateTotal = (payments) => {
        return payments?.reduce((sum, p) => {
          const total = parseFloat(p.amount_paid || 0) || (
            (parseFloat(p.rent_amount) || 0) +
            (parseFloat(p.security_deposit_amount) || 0) +
            (parseFloat(p.advance_amount) || 0) +
            (parseFloat(p.water_bill) || 0) +
            (parseFloat(p.electrical_bill) || 0) +
            (parseFloat(p.wifi_bill) || 0) +
            (parseFloat(p.other_bills) || 0)
          )
          return sum + total
        }, 0) || 0
      }

      // Group by property for breakdown
      const groupByProperty = (payments) => {
        const grouped = {}
        payments?.forEach(p => {
          const propTitle = propMap[p.property_id] || 'Unknown'
          if (!grouped[propTitle]) {
            grouped[propTitle] = { title: propTitle, income: 0, payments: 0 }
          }
          const total = parseFloat(p.amount_paid || 0) || (
            (parseFloat(p.rent_amount) || 0) +
            (parseFloat(p.security_deposit_amount) || 0) +
            (parseFloat(p.advance_amount) || 0) +
            (parseFloat(p.water_bill) || 0) +
            (parseFloat(p.electrical_bill) || 0) +
            (parseFloat(p.wifi_bill) || 0) +
            (parseFloat(p.other_bills) || 0)
          )
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

        const monthTotal = monthPaymentsFiltered.reduce((sum, p) => {
          const total = parseFloat(p.amount_paid || 0) || (
            (parseFloat(p.rent_amount) || 0) +
            (parseFloat(p.security_deposit_amount) || 0) +
            (parseFloat(p.advance_amount) || 0) +
            (parseFloat(p.water_bill) || 0) +
            (parseFloat(p.electrical_bill) || 0) +
            (parseFloat(p.wifi_bill) || 0) +
            (parseFloat(p.other_bills) || 0)
          )
          return sum + total
        }, 0)

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
    const { data } = await supabase.from('tenant_occupancies').select(`*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, middle_name, last_name, phone), property:properties(id, title, images)`).eq('landlord_id', session.user.id).eq('status', 'active')
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
    setContractMonths(12); // Default to 12 months
    // End date will be auto-calculated by useEffect
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

    if (!contractMonths || parseInt(contractMonths) < 3) {
      showToast.error("Minimum contract duration is 3 months", { duration: 4000, transition: "bounceIn" });
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

    // Send dedicated Move-In Welcome notification (Email + SMS with premium templates)
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'move_in',
        recordId: occupancyId,
        tenantName: `${candidate.tenant_profile?.first_name || ''} ${candidate.tenant_profile?.last_name || ''}`.trim(),
        tenantPhone: candidate.tenant_profile?.phone,
        tenantEmail: null,
        propertyTitle: selectedProperty.title,
        propertyAddress: selectedProperty.address || '',
        startDate: startDate,
        endDate: endDate,
        landlordName: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
        landlordPhone: profile?.phone || '',
        securityDeposit: securityDepositAmount,
        rentAmount: selectedProperty.price || 0
      })
    }).catch(err => console.error('Move-in notification error:', err));

    // --- AUTO-SEND MOVE-IN PAYMENT BILL (Rent + Advance + Security Deposit) ---
    // Newly assigned tenants pay Rent + Advance + Security Deposit
    // Total should equal 60,000 (e.g., 20k rent + 20k advance + 20k security deposit)
    const rentAmount = selectedProperty.price || 0;
    const advanceAmount = selectedProperty.price || 0; // Advance is 1 month rent
    const dueDate = new Date(startDate); // Due date is the start date of the contract

    try {
      const { error: billError } = await supabase.from('payment_requests').insert({
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
      });

      if (billError) {
        console.error('Auto-bill creation error:', billError);
        // Don't block assignment, just log the error
      } else {
        // Notify tenant about the bill
        const totalAmount = rentAmount + advanceAmount + securityDepositAmount;
        await createNotification({
          recipient: candidate.tenant,
          actor: session.user.id,
          type: 'payment_request',
          message: `Your move-in payment bill has been sent: ₱${Number(rentAmount).toLocaleString()} (Rent) + ₱${Number(advanceAmount).toLocaleString()} (Advance) + ₱${Number(securityDepositAmount).toLocaleString()} (Security Deposit) = ₱${Number(totalAmount).toLocaleString()} Total. Due: ${dueDate.toLocaleDateString()}`,
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
    <div className="min-h-screen bg-[#F3F4F5] flex flex-col scroll-smooth">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 flex-1 w-full">

        {/* HERO HEADER WITH STATS */}
        <div className="mb-5">
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
            </div>
          </div>
        </div>

        {/* MAIN CONTENT GRID */}
        {/* NEW DASHBOARD LAYOUT - CLEAN & MODERN */}
        <div className="space-y-8 pb-24">

          {/* 1. KEY METRICS ROW */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Properties */}
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:-translate-y-1 transition-transform duration-300">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-900">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </div>
                <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">Total</span>
              </div>
              <div>
                <h3 className="text-3xl font-black text-gray-900 tracking-tight mb-1">
                  <CountUpAnimation target={statsLoaded ? properties.length : 0} />
                </h3>
                <p className="text-sm font-medium text-gray-500">Properties Managed</p>
              </div>
            </div>

            {/* Tenants */}
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:-translate-y-1 transition-transform duration-300">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                </div>
                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                  {properties.length > 0 ? Math.round((occupancies.length / properties.length) * 100) : 0}% Occ
                </span>
              </div>
              <div>
                <h3 className="text-3xl font-black text-gray-900 tracking-tight mb-1">
                  <CountUpAnimation target={statsLoaded ? occupancies.length : 0} />
                </h3>
                <p className="text-sm font-medium text-gray-500">Active Tenants</p>
              </div>
            </div>

            {/* Income */}
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:-translate-y-1 transition-transform duration-300">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">{selectedStatementYear}</span>
              </div>
              <div>
                <h3 className="text-3xl font-black text-gray-900 tracking-tight mb-1">
                  <CountUpAnimation target={statsLoaded ? monthlyIncome.yearTotal / 1000 : 0} decimals={1} prefix="₱" suffix="k" />
                </h3>
                <p className="text-sm font-medium text-gray-500">Total Income</p>
              </div>
            </div>

            {/* Attention */}
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:-translate-y-1 transition-transform duration-300">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                </div>
                <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">Action</span>
              </div>
              <div>
                <h3 className="text-3xl font-black text-gray-900 tracking-tight mb-1">
                  <CountUpAnimation target={statsLoaded ? (pendingEndRequests.length + pendingRenewalRequests.length + dashboardTasks.payments.length + dashboardTasks.maintenance.length) : 0} />
                </h3>
                <p className="text-sm font-medium text-gray-500">Pending Tasks</p>
              </div>
            </div>
          </div>

          {/* 2. MAIN GRID */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">

            {/* LEFT CONTENT (FINANCIALS & BILLING) */}
            <div className="xl:col-span-8 space-y-8">

              {/* Financial Overview */}
              <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Financial Overview Graph</h3>
                    <p className="text-sm text-gray-500 font-medium mt-1">Income Analysis for {selectedStatementYear}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-gray-100 rounded-xl p-1">
                      {[
                        { key: 'all', label: 'All' },
                        { key: 'water', label: 'Water Bill' },
                        { key: 'other', label: 'Other Bill' },
                      ].map(tab => (
                        <button
                          key={tab.key}
                          onClick={() => setChartFilter(tab.key)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${chartFilter === tab.key
                            ? 'bg-black text-white shadow-sm'
                            : 'text-gray-500 hover:text-black'
                            }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <select
                      value={selectedStatementYear}
                      onChange={(e) => setSelectedStatementYear(parseInt(e.target.value))}
                      className="bg-gray-50 border-none text-sm font-bold rounded-xl px-4 py-2 cursor-pointer hover:bg-gray-100 transition-colors focus:ring-0"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyChartData}>
                      <defs>
                        <linearGradient id="colorAll" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1aff00" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#1aff00" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorWater" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorOther" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                        tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '12px', padding: '12px' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(value) => [
                          `₱${value.toLocaleString()}`,
                          chartFilter === 'all' ? 'Total Income' : chartFilter === 'water' ? 'Water Bill' : 'Other Bill'
                        ]}
                        cursor={{ stroke: '#000', strokeWidth: 1, strokeDasharray: '4 4' }}
                      />
                      <Area
                        type="monotone"
                        dataKey={chartFilter === 'all' ? 'income' : chartFilter === 'water' ? 'water' : 'other'}
                        stroke={chartFilter === 'all' ? '#55ed44' : chartFilter === 'water' ? '#3b82f6' : '#f59e0b'}
                        strokeWidth={3}
                        fillOpacity={1}
                        fill={`url(#${chartFilter === 'all' ? 'colorAll' : chartFilter === 'water' ? 'colorWater' : 'colorOther'})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Billing Schedule */}
              <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Billing Schedule</h3>
                    <p className="text-sm text-gray-500 font-medium mt-1">Upcoming automated payments & notifications</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {billingSchedule.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <p className="text-gray-900 font-bold">No upcoming bills</p>
                      <p className="text-sm text-gray-500">Everything is up to date.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="text-xs text-gray-400 uppercase tracking-wider font-bold border-b border-gray-100">
                        <tr>
                          <th className="pb-4 pl-4">Tenant</th>
                          <th className="pb-4">Auto-Send</th>
                          <th className="pb-4">Due Date</th>
                          <th className="pb-4">Status</th>
                          <th className="pb-4 text-right pr-4">Action</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm font-medium divide-y divide-gray-50">
                        {billingSchedule.slice(0, 10).map(item => {
                          // Calculate Auto-Send Date (3 days before due date)
                          const autoSendDate = new Date(item.nextDueDate);
                          autoSendDate.setDate(autoSendDate.getDate() - 3);

                          return (
                            <tr key={item.id} className="group hover:bg-gray-50/50 transition-colors">
                              <td className="py-4 pl-4">
                                <p className="text-gray-900 font-bold">{item.tenantName}</p>
                                <p className="text-xs text-gray-500">{item.propertyTitle}</p>
                              </td>
                              <td className="py-4 text-gray-500 font-mono text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                  {autoSendDate.toLocaleDateString()}
                                </div>
                              </td>
                              <td className="py-4 text-gray-900 font-mono text-xs font-bold">
                                {item.nextDueDate.toLocaleDateString()}
                              </td>
                              <td className="py-4">
                                <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${item.status === 'Overdue' ? 'bg-red-50 text-red-600 border border-red-100' :
                                  item.status === 'Confirming' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                  }`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className="py-4 text-right pr-4">
                                {item.status !== 'Contract Ending' && item.status !== 'Confirming' && (
                                  <button
                                    onClick={() => openAdvanceBillModal(item.tenantId, item.tenantName, item.propertyTitle)}
                                    disabled={sendingBillId === item.tenantId}
                                    className="text-xs bg-black text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors font-bold disabled:opacity-50 shadow-sm cursor-pointer"
                                  >
                                    Send Now
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>

            {/* RIGHT CONTENT (ACTION CENTER & PROPERTIES) */}
            <div className="xl:col-span-4 space-y-8">

              {/* Action Center */}
              <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] h-fit">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Action Center</h3>
                    <p className="text-sm text-gray-500 font-medium mt-1">Pending tasks & requests</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 text-sm font-bold">
                    {pendingEndRequests.length + pendingRenewalRequests.length + dashboardTasks.payments.length + dashboardTasks.maintenance.length}
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Empty State */}
                  {(pendingEndRequests.length + pendingRenewalRequests.length + dashboardTasks.payments.length + dashboardTasks.maintenance.length) === 0 && (
                    <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                      <p className="text-gray-400 text-sm font-medium">No pending tasks</p>
                    </div>
                  )}

                  {/* Tasks List */}
                  {pendingEndRequests.map(req => (
                    <div key={req.id} className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 hover:shadow-md transition-shadow cursor-pointer ">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">Move-Out</span>
                        <button onClick={() => openEndConfirmation('approve', req.id)} className="text-xs font-bold text-gray-900 underline decoration-gray-300 hover:decoration-black">Review</button>
                      </div>
                      <h4 className="font-bold text-gray-900 text-sm">{req.property?.title}</h4>
                      <p className="text-xs text-gray-500 mt-1">Tenant: {req.tenant?.first_name} {req.tenant?.last_name}</p>
                    </div>
                  ))}

                  {pendingRenewalRequests.map(req => (
                    <div key={req.id} className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 hover:shadow-md transition-shadow cursor-pointer">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">Renewal</span>
                        <button onClick={() => openRenewalModal(req, 'approve')} className="text-xs font-bold text-gray-900 underline decoration-gray-300 hover:decoration-black">Review</button>
                      </div>
                      <h4 className="font-bold text-gray-900 text-sm">{req.property?.title}</h4>
                      <p className="text-xs text-gray-500 mt-1">Tenant: {req.tenant?.first_name} {req.tenant?.last_name}</p>
                    </div>
                  ))}

                  {dashboardTasks.maintenance.length > 0 && (
                    <button onClick={() => router.push('/maintenance')} className="w-full p-4 bg-rose-50/50 rounded-2xl border border-rose-100 hover:shadow-md transition-shadow text-left group cursor-pointer">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">Maintenance</span>
                          <h4 className="font-bold text-gray-900 text-sm mt-2">{dashboardTasks.maintenance.length} Active Issues</h4>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-gray-400 group-hover:text-rose-600 transition-colors">→</div>
                      </div>
                    </button>
                  )}

                  {dashboardTasks.payments.length > 0 && (
                    <button onClick={() => router.push('/payments')} className="w-full p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 hover:shadow-md transition-shadow text-left group cursor-pointer">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Payments</span>
                          <h4 className="font-bold text-gray-900 text-sm mt-2">{dashboardTasks.payments.length} Pending Verifications</h4>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-gray-400 group-hover:text-emerald-600 transition-colors">→</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Scheduled Tenants Today */}
              <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Scheduled Tenants Today</h3>
                    <p className="text-sm text-gray-500 font-medium mt-1">Viewings for {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                  </div>
                  <button onClick={() => router.push('/bookings')} className="text-sm font-bold text-gray-500 hover:text-black transition-colors cursor-pointer">View All Bookings</button>
                </div>

                <div className="space-y-3">
                  {(() => {
                    const today = new Date()
                    const todayStr = today.toISOString().split('T')[0]
                    // Filter occupancies/bookings — we'll use a placeholder approach since bookings aren't loaded here
                    // Instead, show tenants with active occupancies scheduled today
                    const scheduledToday = occupancies.filter(o => {
                      if (!o.start_date) return false
                      const startStr = new Date(o.start_date).toISOString().split('T')[0]
                      return startStr === todayStr
                    })

                    if (scheduledToday.length === 0) {
                      return (
                        <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                          <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <p className="text-gray-400 text-sm font-medium">No scheduled tenants for today</p>
                        </div>
                      )
                    }

                    return scheduledToday.map(occ => (
                      <div key={occ.id} className="flex items-center gap-4 p-3 rounded-2xl bg-blue-50/50 border border-blue-100">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                          {occ.tenant?.first_name?.charAt(0)}{occ.tenant?.last_name?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-gray-900 truncate">{occ.tenant?.first_name} {occ.tenant?.last_name}</p>
                          <p className="text-xs text-gray-500 font-medium truncate">{occ.property?.title}</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">Today</span>
                      </div>
                    ))
                  })()}
                </div>
              </div>

              {/* Occupied Properties */}
              <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Occupied Properties</h3>
                    <p className="text-sm text-gray-500 font-medium mt-1">Properties with active tenants</p>
                  </div>
                  <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">{occupancies.filter(o => o.status === 'active').length} Active</span>
                </div>

                <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
                  {occupancies.filter(o => o.status === 'active').length === 0 ? (
                    <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                      <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                      </div>
                      <p className="text-gray-400 text-sm font-medium">No occupied properties</p>
                    </div>
                  ) : (
                    occupancies.filter(o => o.status === 'active').map(occ => (
                      <div key={occ.id} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 transition-colors group">
                        <div className="w-12 h-12 rounded-xl bg-gray-200 overflow-hidden relative">
                          <img src={occ.property?.images?.[0] || '/placeholder-property.jpg'} className="w-full h-full object-cover" alt="" />
                          <div className="absolute inset-0 bg-black/10"></div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-gray-900 truncate">{occ.property?.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-[8px] font-bold">
                              {occ.tenant?.first_name?.charAt(0)}
                            </div>
                            <p className="text-xs text-gray-500 font-medium">{occ.tenant?.first_name} {occ.tenant?.last_name}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openEndContractModal(occ)
                            }}
                            className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors shadow-sm cursor-pointer"
                          >
                            End Contract
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>

        {/* Confirmation Modal */}
        {
          confirmationModal.isOpen && (
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
                    min="3"
                    max="120"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-black"
                    placeholder="e.g. 12"
                    value={contractMonths}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setContractMonths(val < 3 ? 3 : e.target.value);
                    }}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Minimum 3 months. Enter how many months the contract will last.</p>
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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
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
        )
      }
      <footer>
        <Footer />
      </footer>

    </div>
  )
}