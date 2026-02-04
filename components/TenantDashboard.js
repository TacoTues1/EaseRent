import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { createNotification } from '../lib/notifications'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Footer from './Footer'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from './ui/carousel'

// Helper Component for Bill Rows inside Active Property
function BillRow({ label, icon, value, compact = false }) {
  const icons = {
    lightning: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />,
    water: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />,
    wifi: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />,
    home: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  }

  return (
    <div className={`flex items-center justify-between text-sm ${compact ? 'py-0' : 'py-1'}`}>
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center rounded-lg ${compact ? 'w-6 h-6 bg-gray-50 text-gray-400' : 'w-8 h-8 bg-slate-50 text-slate-500'}`}>
          <svg className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {icons[icon]}
          </svg>
        </div>
        <span className="font-medium text-slate-500">{label}</span>
      </div>
      <span className={`font-bold ${value.includes('Pending') ? 'text-slate-400 italic font-normal' : 'text-slate-700'}`}>
        {value}
      </span>
    </div>
  )
}

export default function TenantDashboard({ session, profile }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentImageIndex, setCurrentImageIndex] = useState({})
  const [activePropertyImageIndex, setActivePropertyImageIndex] = useState(0)
  const [tenantOccupancy, setTenantOccupancy] = useState(null)
  const [lastPayment, setLastPayment] = useState(null)
  const [tenantBalance, setTenantBalance] = useState(0)
  const [pendingPayments, setPendingPayments] = useState([])
  const [paymentHistory, setPaymentHistory] = useState([]) // NEW: Payment History State
  const [showEndRequestModal, setShowEndRequestModal] = useState(false)
  const [endRequestDate, setEndRequestDate] = useState('')
  const [endRequestReason, setEndRequestReason] = useState('')
  const [submittingEndRequest, setSubmittingEndRequest] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewTarget, setReviewTarget] = useState(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [cleanlinessRating, setCleanlinessRating] = useState(5)
  const [communicationRating, setCommunicationRating] = useState(5)
  const [locationRating, setLocationRating] = useState(5)
  const [comparisonList, setComparisonList] = useState([])
  const [favorites, setFavorites] = useState([])
  const [propertyStats, setPropertyStats] = useState({})
  const [guestFavorites, setGuestFavorites] = useState([])
  const [topRated, setTopRated] = useState([])
  const [nextPaymentDate, setNextPaymentDate] = useState(null)
  const [lastRentPeriod, setLastRentPeriod] = useState(null)
  const [showRenewalModal, setShowRenewalModal] = useState(false)
  const [renewalRequested, setRenewalRequested] = useState(false)
  const [daysUntilContractEnd, setDaysUntilContractEnd] = useState(null)
  const [canRenew, setCanRenew] = useState(false)
  const [securityDepositPaid, setSecurityDepositPaid] = useState(false)
  const maxDisplayItems = 8
  const router = useRouter()

  // Mount animation trigger
  const [mounted, setMounted] = useState(false)

  function getNextBillDate(startDate) {
    if (!startDate) return 'Pending First Payment'
    const start = new Date(startDate)
    const today = new Date()
    let nextDate = new Date(start)
    while (nextDate <= today) {
      nextDate.setDate(nextDate.getDate() + 31)
    }
    return nextDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  // Mount animation trigger
  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-slide images for property cards (3 seconds interval - adjust as needed)
  useEffect(() => {
    const allProperties = [...properties, ...guestFavorites, ...topRated]
    if (allProperties.length === 0) return

    const interval = setInterval(() => {
      setCurrentImageIndex(prev => {
        const newIndex = { ...prev }
        allProperties.forEach(property => {
          if (property.images && Array.isArray(property.images) && property.images.length > 1) {
            const currentIdx = prev[property.id] || 0
            newIndex[property.id] = (currentIdx + 1) % property.images.length
          }
        })
        return newIndex
      })
    }, 1450) // Change image every 3 seconds

    return () => clearInterval(interval)
  }, [properties, guestFavorites, topRated])

  useEffect(() => {
    if (profile) {
      loadInitialData()
      // Check for reminders (only sends at 8:00 AM, once per day)
      fetch('/api/manual-reminders').catch(err => console.error("Reminder check failed", err));
    }
  }, [profile])

  async function loadInitialData() {
    // setLoading(true)
    // We await these in order/parallel, but we need pendingPayments populated for the calc
    await loadProperties()
    await loadPropertyStats()
    const occupancy = await loadTenantOccupancy() // Modified to return occupancy
    await loadTenantBalance(occupancy?.id) // Pass occupancy id
    await loadPendingPayments(occupancy?.id) // Pass occupancy id
    await loadPaymentHistory(occupancy?.id) // Pass occupancy id
    await checkPendingReviews(session.user.id)
    await loadUserFavorites()
    await loadFeaturedSections()

    // SCRIPT: Check Last Month Security Deposit Logic (Auto-run)
    if (occupancy) {
      await checkLastMonthDepositLogic(occupancy)
      calculateNextPayment(occupancy.id, occupancy)
    }
    setLoading(false)
  }

  async function checkLastMonthDepositLogic(occupancy) {
    if (!occupancy.contract_end_date) return;

    const endDate = new Date(occupancy.contract_end_date);
    const today = new Date();
    // Normalize to start of day
    endDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = endDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // LOGIC: Only affect when "exceed the date (28 days before end)" => implies <= 28 days remaining.
    // And Renewal NOT requested.
    if (diffDays <= 28 && diffDays > 0 && !occupancy.renewal_requested) {

      // Check if a "Last Month" bill already exists to prevent duplicate processing
      // We look for a bill with due_date within the last 45 days of contract? 
      // Or explicitly check for a payment request covering this period.
      // Let's look for any bill generated recently for this property context.

      // Define a window for "Last Month Bill". E.g. Due date is between (EndDate - 35 days) and (EndDate).
      const windowStart = new Date(endDate);
      windowStart.setDate(windowStart.getDate() - 40);

      const { data: existingBills } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('occupancy_id', occupancy.id)
        .gte('due_date', windowStart.toISOString().split('T')[0])
        // We assume last month bill would be Rent.
        .gt('rent_amount', 0);

      // If we find a bill in this window, we assume the system (or this script previously) handled it.
      if (existingBills && existingBills.length > 0) {
        return;
      }

      // NO BILL FOUND. EXECUTE DEPOSIT LOGIC.
      console.log('Executing Last Month Deposit Logic...');

      const rentAmount = Number(occupancy.property?.price || 0);
      const depositTotal = Number(occupancy.security_deposit || 0);
      const depositUsed = Number(occupancy.security_deposit_used || 0);
      const availableDeposit = depositTotal - depositUsed;

      if (availableDeposit >= rentAmount) {
        // CASE 1: Deposit covers full rent.
        // 1. Mark as "Paid" immediately via Deposit
        await supabase.from('payment_requests').insert({
          tenant: session.user.id,
          property_id: occupancy.property_id,
          occupancy_id: occupancy.id,
          rent_amount: rentAmount,
          status: 'paid', // Directly Paid
          due_date: new Date().toISOString(), // Due now/today
          bills_description: 'Last Month Rent (Paid via Security Deposit)',
          is_move_in_payment: false
        });

        // 2. Update Deposit Used
        await supabase.from('tenant_occupancies')
          .update({ security_deposit_used: depositUsed + rentAmount })
          .eq('id', occupancy.id);

        // 3. Notify
        showToast.success("Last month rent paid using Security Deposit");
        await createNotification({
          recipient: session.user.id,
          actor: session.user.id, // System action really
          type: 'payment_paid',
          message: 'Your last month rent has been automatically paid using your Security Deposit.',
          link: '/payments'
        });

      } else {
        // CASE 2: Deposit is INSUFFICIENT (or 0).
        // 1. Consume remaining deposit (if any)
        if (availableDeposit > 0) {
          // Record the partial usage? 
          // The prompt says "send the exact amount of the lack only".
          // So we just bill the difference. We implicitly "use" the deposit.
          await supabase.from('tenant_occupancies')
            .update({ security_deposit_used: depositUsed + availableDeposit }) // Use it all
            .eq('id', occupancy.id);
        }

        const lackAmount = rentAmount - availableDeposit;

        // 2. Create "Emergency Bill" for the Lack Amount
        await supabase.from('payment_requests').insert({
          tenant: session.user.id,
          property_id: occupancy.property_id,
          occupancy_id: occupancy.id,
          rent_amount: lackAmount, // The "Lack"
          status: 'pending',
          due_date: new Date().toISOString(), // Due immediately
          bills_description: `Emergency Bill: Last Month Balance (Deposit Insufficient)`,
          is_move_in_payment: false
        });

        showToast.error(`Emergency Bill generated: ₱${lackAmount.toLocaleString()}`);
        await createNotification({
          recipient: session.user.id,
          actor: session.user.id,
          type: 'payment_pending',
          message: `An emergency bill for ₱${lackAmount.toLocaleString()} has been generated for your last month (Security Deposit was insufficient).`,
          link: '/payments'
        });
      }

      // Refresh data
      loadPendingPayments(occupancy.id);
      loadTenantOccupancy();
    }
  }

  async function loadPendingPayments(occupancyId) {
    // Load pending payments for this tenant
    let query = supabase
      .from('payment_requests')
      .select('*')
      .eq('tenant', session.user.id)
      .neq('status', 'paid')
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true })

    if (occupancyId) {
      // Allow specific occupancy match OR null (legacy/general)
      query = query.or(`occupancy_id.eq.${occupancyId},occupancy_id.is.null`)
    }

    const { data, error } = await query

    if (error) console.error("Error fetching pending payments:", error)
    if (data) setPendingPayments(data)
  }

  async function loadPaymentHistory(occupancyId) {
    // Fetch PAID bills for Rent History
    let query = supabase
      .from('payment_requests')
      .select('*')
      .eq('tenant', session.user.id)
      .eq('status', 'paid')
      .order('due_date', { ascending: true })

    if (occupancyId) {
      query = query.eq('occupancy_id', occupancyId)
    }

    const { data } = await query
    if (data) setPaymentHistory(data)
  }

  async function calculateNextPayment(occupancyId, occupancy = null) {
    // Use passed occupancy or fall back to state
    const currentOccupancy = occupancy || tenantOccupancy;

    // 1. Check for strict "pending" (unpaid) RENT bills first (exclude move-in payments)
    let pendingQuery = supabase
      .from('payment_requests')
      .select('due_date, is_move_in_payment')
      .eq('tenant', session.user.id)
      .eq('status', 'pending')
      .gt('rent_amount', 0) // Only rent bills
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (occupancyId) {
      pendingQuery = pendingQuery.or(`occupancy_id.eq.${occupancyId},occupancy_id.is.null`)
    }

    const { data: pendingBill } = await pendingQuery

    // If there's a pending bill that is NOT a move-in payment, use its due date
    if (pendingBill && pendingBill.due_date && !pendingBill.is_move_in_payment) {
      setNextPaymentDate(new Date(pendingBill.due_date).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
      }))
      return
    }

    // 2. If no pending bill, use LEASE START DATE and LAST PAID BILL to project next due
    const { data: lastBill } = await supabase
      .from('payment_requests')
      .select('due_date, rent_amount, advance_amount')
      .eq('tenant', session.user.id)
      .eq('occupancy_id', occupancyId) // Filter by current occupancy
      .in('status', ['paid', 'pending_confirmation'])
      .gt('rent_amount', 0) // Only look at RENT bills
      .order('due_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    console.log('Last paid bill for next due calc:', lastBill);

    const baseDateString = currentOccupancy?.start_date;

    if (baseDateString) {
      const startDate = new Date(baseDateString); // This is usually UTC YYYY-MM-DD
      const startDay = startDate.getUTCDate(); // e.g. 4

      // Determine the reference date to project FROM.
      // If we have a last paid bill, we project forward from it.
      // If no last paid bill, we project from Start Date.
      let nextDue;

      if (lastBill && lastBill.due_date) {
        // Calculate how many months the last payment covered
        const rentAmount = parseFloat(lastBill.rent_amount || 0);
        const advanceAmount = parseFloat(lastBill.advance_amount || 0);

        // Months covered = 1 (current month) + advance months (full months only)
        let monthsCovered = 1;
        if (rentAmount > 0 && advanceAmount > 0) {
          // Only count FULL months of advance (partial goes to credit, not months)
          monthsCovered = 1 + Math.floor(advanceAmount / rentAmount);
        }

        console.log('Next due calculation:', { rentAmount, advanceAmount, monthsCovered, billDueDate: lastBill.due_date });

        // Next Due is last bill's date + months covered
        nextDue = new Date(lastBill.due_date);
        nextDue.setMonth(nextDue.getMonth() + monthsCovered);
      } else {
        // No payment history - Next Due is the START DATE (the date tenant begins occupancy)
        // This is when the tenant's first payment is due
        nextDue = new Date(startDate);
      }

      // Force Day Alignment to match START DAY (e.g. 4th)
      // Careful with shorter months (Feb 30 -> Feb 28/29)
      // But if startDay is 4, it is safe in all months.
      // We assume start day is valid.
      nextDue.setUTCDate(startDay);

      // Check if next payment date is PAST the contract end date
      if (currentOccupancy.contract_end_date) {
        // contract_end_date is usually YYYY-MM-DD
        const endDate = new Date(currentOccupancy.contract_end_date);

        // Ensure accurate comparison
        // If nextDue >= endDate, then no more payments are due (unless we extend)
        if (nextDue >= endDate) {
          setNextPaymentDate("All Paid - Contract Ending");
          setLastRentPeriod(lastBill ? new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : "N/A");
          return;
        }
      }

      setNextPaymentDate(nextDue.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
      }))

      if (lastBill) {
        const lastDate = new Date(lastBill.due_date);
        setLastRentPeriod(lastDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
      } else {
        setLastRentPeriod("N/A");
      }

    } else {
      // Fallback if NO start_date (legacy data?)
      if (lastBill && lastBill.due_date) {
        const d = new Date(lastBill.due_date);
        d.setMonth(d.getMonth() + 1);

        // Also check legacy contract end if possible (though we used occupancy above)
        if (currentOccupancy?.contract_end_date) {
          const endDate = new Date(currentOccupancy.contract_end_date);
          if (d > endDate) {
            setNextPaymentDate("All Paid - Contract Ending");
            return;
          }
        }

        setNextPaymentDate(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }));
      } else {
        setNextPaymentDate("N/A");
      }
    }
  }

  useEffect(() => {
    if (tenantOccupancy) calculateNextPayment(tenantOccupancy.id, tenantOccupancy)
  }, [pendingPayments, tenantOccupancy])

  async function checkPendingReviews(userId) {
    const { data: endedOccupancies } = await supabase.from('tenant_occupancies').select('*, property:properties(id, title)').eq('tenant_id', userId).eq('status', 'ended')
    if (!endedOccupancies || endedOccupancies.length === 0) return
    const { data: existingReviews } = await supabase.from('reviews').select('occupancy_id').eq('user_id', userId)
    const reviewedOccupancyIds = existingReviews?.map(r => r.occupancy_id) || []
    const unreviewed = endedOccupancies.find(o => !reviewedOccupancyIds.includes(o.id))
    if (unreviewed) { setReviewTarget(unreviewed); setShowReviewModal(true) }
  }

  async function submitReview() {
    if (!reviewTarget) return
    setSubmittingReview(true)
    // Calculate overall rating as average of 3 categories
    const overallRating = Math.round((cleanlinessRating + communicationRating + locationRating) / 3)
    const { error } = await supabase.from('reviews').insert({
      property_id: reviewTarget.property_id,
      user_id: session.user.id,
      tenant_id: session.user.id,
      occupancy_id: reviewTarget.id,
      rating: overallRating,
      cleanliness_rating: cleanlinessRating,
      communication_rating: communicationRating,
      location_rating: locationRating,
      comment: reviewComment,
      created_at: new Date().toISOString()
    })
    if (error) {
      showToast.error("Failed to submit review")
      console.error(error)
    }
    else {
      showToast.success("Review submitted successfully!")
      setShowReviewModal(false)
      // Reset all ratings
      setCleanlinessRating(5)
      setCommunicationRating(5)
      setLocationRating(5)
      setReviewComment('')
      checkPendingReviews(session.user.id)
    }
    setSubmittingReview(false)
  }

  const toggleComparison = (e, property) => {
    e.stopPropagation()
    setComparisonList(prev => {
      const isSelected = prev.some(p => p.id === property.id)
      if (isSelected) return prev.filter(p => p.id !== property.id)
      if (prev.length >= 3) {
        showToast.error("You can only compare up to 3 properties.")
        return prev
      }
      return [...prev, property]
    })
  }

  const handleCompareClick = () => { const ids = comparisonList.map(p => p.id).join(','); router.push(`/compare?ids=${ids}`) }

  async function loadProperties() {
    let query = supabase.from('properties').select('*, landlord_profile:profiles!properties_landlord_fkey(id, first_name, middle_name, last_name, role)')
    const { data, error } = await query
    if (error) console.error('Error loading properties:', error)
    setProperties(data || [])
  }

  const handleSeeMore = () => { router.push('/properties/allProperties') }

  async function loadTenantOccupancy() {
    const { data: occupancy, error } = await supabase
      .from('tenant_occupancies')
      .select(`*, property:properties(id, title, address, city, images, price), landlord:profiles!tenant_occupancies_landlord_id_fkey(id, first_name, middle_name, last_name)`)
      .eq('tenant_id', session.user.id)
      .in('status', ['active', 'pending_end'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error("Error fetching occupancy:", error)
      return null
    }

    setTenantOccupancy(occupancy)

    if (occupancy) {
      // Calculate days until contract end for renewal
      if (occupancy.contract_end_date) {
        const endDate = new Date(occupancy.contract_end_date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        endDate.setHours(0, 0, 0, 0)
        const diffTime = endDate - today
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        setDaysUntilContractEnd(diffDays)
        // Can only renew if:
        // 1. More than 29 days remaining (not in the last month block)
        // 2. Not already requested
        setCanRenew(diffDays > 29 && !occupancy.renewal_requested)
        setRenewalRequested(occupancy.renewal_requested || false)
      }

      // Fetch the LAST PAID BILL from payment_requests for proper due_date display
      const { data: lastPaidBill } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('tenant', session.user.id)
        .eq('occupancy_id', occupancy.id)
        .eq('status', 'paid')
        .gt('rent_amount', 0) // Only rent bills
        .order('due_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      setLastPayment(lastPaidBill)

      // Check if security deposit was actually paid (look for any paid payment with security_deposit_amount > 0)
      const { data: paidSecurityDeposit } = await supabase
        .from('payment_requests')
        .select('security_deposit_amount')
        .eq('tenant', session.user.id)
        .eq('occupancy_id', occupancy.id)
        .eq('status', 'paid')
        .gt('security_deposit_amount', 0)
        .limit(1)
        .maybeSingle()

      setSecurityDepositPaid(!!paidSecurityDeposit)
    }

    return occupancy
  }

  // --- RENEWAL MEETING DATE STATE ---
  const [renewalMeetingDate, setRenewalMeetingDate] = useState('')

  async function requestContractRenewal() {
    if (!tenantOccupancy || !canRenew) return

    if (!renewalMeetingDate) {
      showToast.error("Please select a date to meet the landlord");
      return;
    }

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({
        renewal_requested: true,
        renewal_requested_at: new Date().toISOString(),
        renewal_status: 'pending',
        // renewal_meeting_date: renewalMeetingDate // Try to save to DB (if column exists)
      })
      .eq('id', tenantOccupancy.id)

    if (error) {
      showToast.error('Failed to request renewal')
      return
    }

    // Notify landlord
    await createNotification({
      recipient: tenantOccupancy.landlord_id,
      actor: session.user.id,
      type: 'contract_renewal_request',
      message: `${profile.first_name} ${profile.last_name} has requested to renew contract. PROPOSED SIGNING DATE: ${new Date(renewalMeetingDate).toLocaleDateString()}.`,
      link: '/dashboard'
    })

    showToast.success('Renewal request submitted!')
    setRenewalRequested(true)
    setCanRenew(false)
    setShowRenewalModal(false)
    loadTenantOccupancy()
  }

  async function loadTenantBalance(occupancyId) {
    if (!session || !occupancyId) {
      setTenantBalance(0)
      return
    }
    // Try to get balance for current occupancy first
    const { data } = await supabase.from('tenant_balances').select('amount').eq('tenant_id', session.user.id).eq('occupancy_id', occupancyId).maybeSingle()
    if (data) {
      setTenantBalance(data.amount || 0)
    } else {
      // Fallback: no occupancy-specific balance, start fresh
      setTenantBalance(0)
    }
  }

  async function loadUserFavorites() {
    if (!session) return
    const { data } = await supabase.from('favorites').select('property_id').eq('user_id', session.user.id)
    if (data) setFavorites(data.map(f => f.property_id))
  }

  async function loadPropertyStats() {
    const { data } = await supabase.from('property_stats').select('*')
    if (data) {
      const statsMap = {}
      data.forEach(stat => { statsMap[stat.property_id] = { favorite_count: stat.favorite_count || 0, avg_rating: stat.avg_rating || 0, review_count: stat.review_count || 0 } })
      setPropertyStats(statsMap)
    }
  }

  async function loadFeaturedSections() {
    const { data: allProps } = await supabase.from('properties').select('*, landlord_profile:profiles!properties_landlord_fkey(first_name, last_name)').eq('is_deleted', false)
    const { data: stats } = await supabase.from('property_stats').select('*')

    if (allProps && stats) {
      const statsMap = {}
      stats.forEach(s => {
        statsMap[s.property_id] = { favorite_count: s.favorite_count || 0, avg_rating: s.avg_rating || 0, review_count: s.review_count || 0 }
      })
      setPropertyStats(statsMap)

      const favs = allProps.filter(p => (statsMap[p.id]?.favorite_count || 0) >= 1).sort((a, b) => (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0)).slice(0, maxDisplayItems)
      setGuestFavorites(favs)

      const rated = allProps.filter(p => (statsMap[p.id]?.review_count || 0) > 0).sort((a, b) => (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0)).slice(0, maxDisplayItems)
      setTopRated(rated)
    }
  }

  async function toggleFavorite(e, propertyId) {
    e.stopPropagation()
    if (!session) {
      showToast.error('Please login to save favorites')
      return
    }
    const isFavorite = favorites.includes(propertyId)
    if (isFavorite) {
      await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('property_id', propertyId)
      setFavorites(favorites.filter(id => id !== propertyId))
      showToast.success('Removed from favorites')
    } else {
      await supabase.from('favorites').insert({ user_id: session.user.id, property_id: propertyId })
      setFavorites([...favorites, propertyId])
      showToast.success("Added to favorites")
    }
    loadPropertyStats(); loadFeaturedSections()
  }

  async function requestEndOccupancy() {
    if (!tenantOccupancy || !endRequestDate || !endRequestReason) {
      showToast.error("Please fill in both Date and Reason");
      return;
    }
    setSubmittingEndRequest(true)
    const { error } = await supabase.from('tenant_occupancies').update({ status: 'pending_end', end_requested_at: new Date().toISOString(), end_request_reason: endRequestReason.trim(), end_request_date: endRequestDate, end_request_status: 'pending' }).eq('id', tenantOccupancy.id)

    if (error) {
      showToast.error(`Failed to submit: ${error.message}`)
      setSubmittingEndRequest(false); return
    }

    await createNotification({ recipient: tenantOccupancy.landlord_id, actor: session.user.id, type: 'end_occupancy_request', message: `${profile.first_name} ${profile.last_name} requested to end occupancy on ${endRequestDate}.`, link: '/dashboard' })
    showToast.success("Request submitted")
    setShowEndRequestModal(false); setEndRequestReason(''); setEndRequestDate(''); setSubmittingEndRequest(false); loadTenantOccupancy()
  }

  const getPropertyImages = (property) => {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) return property.images
    return []
  }

  const PropertyCard = ({ property, images, currentIndex, isSelectedForCompare, isFavorite, stats }) => (
    <div
      className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer flex flex-col transition-all duration-300 h-full hover:shadow-xl hover:shadow-gray-300/50 ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100 hover:border-gray-200'}`}
      onClick={() => router.push(`/properties/${property.id}`)}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        <img src={images[currentIndex]} alt={property.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 md:top-3 md:right-3 z-20 flex items-center gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={(e) => toggleFavorite(e, property.id)} className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all cursor-pointer ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:bg-white hover:text-red-500'}`}>
            <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
          </button>
          <label className="flex items-center cursor-pointer">
            <input type="checkbox" className="hidden" checked={isSelectedForCompare} onChange={(e) => toggleComparison(e, property)} />
            <div className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all ${isSelectedForCompare ? 'bg-black text-white' : 'bg-white/90 text-gray-400 hover:bg-white'}`}>
              {isSelectedForCompare ? (<svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>) : (<svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>)}
            </div>
          </label>
        </div>
        {images.length > 1 && (
          <div className="absolute bottom-1.5 sm:bottom-2 md:bottom-3 left-1/2 -translate-x-1/2 flex gap-0.5 sm:gap-1 z-10">
            {images.map((_, idx) => (
              <div key={idx} className={`h-0.5 sm:h-1 rounded-full transition-all duration-300 shadow-sm ${idx === currentIndex ? 'w-3 sm:w-4 bg-white' : 'w-0.5 sm:w-1 bg-white/60'}`} />
            ))}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>
        <div className="absolute top-1.5 sm:top-2 md:top-3 left-1.5 sm:left-2 md:left-3 z-10 flex flex-col gap-0.5 sm:gap-1 items-start">
          <span
            className={`px-1 py-0.5
                text-[7px] sm:text-[8px] uppercase font-bold tracking-wider
                rounded shadow-sm backdrop-blur-md
                ${property.status === 'available'
                ? 'bg-white text-black'
                : 'bg-black/80 text-white'
              }`}
          >
            {property.status === 'available'
              ? 'Available'
              : property.status === 'occupied'
                ? 'Occupied'
                : 'Not Available'}
          </span>
          {stats.favorite_count >= 1 && (
            <span className="px-1 py-0.5 text-[7px] sm:text-[8px] uppercase font-bold tracking-wider rounded shadow-sm backdrop-blur-md bg-rose-500 text-white flex items-center gap-0.5">
              <svg className="w-2 h-2 sm:w-2.5 sm:h-2.5 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
              {stats.favorite_count}
            </span>
          )}
        </div>
        <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 z-10 text-white">
          <p className="text-sm sm:text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
          <p className="text-[8px] sm:text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
        </div>
      </div>
      <div className="p-1.5 sm:p-2">
        <div className="mb-0.5 sm:mb-1">
          <div className="flex justify-between items-start">
            <h3 className="text-xs sm:text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
            {stats.review_count > 0 && (<div className="flex items-center gap-1 text-xs shrink-0"><svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg><span className="font-bold text-gray-900">{stats.avg_rating.toFixed(1)}</span></div>)}
          </div>
          <p className="text-gray-500 text-[10px] sm:text-xs truncate">{property.city}, Philippines</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 text-gray-600 text-[10px] sm:text-xs">
          <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" /></svg>{property.bedrooms}</span>
          <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" /></svg>{property.bathrooms}</span>
          <span className="flex items-center gap-0.5 sm:gap-1 font-medium"><svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>{property.area_sqft} sqm</span>
        </div>
      </div>
    </div>
  )

  const carouselItemClass = "pl-2 basis-1/2 md:basis-1/4 lg:basis-[16.66%]"

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F5]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-black mb-4"></div>
        <p className="text-gray-500 font-medium">Loading Amazing Properties...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col scroll-smooth">
      <div className="max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10 flex-1">

        {tenantOccupancy ? (
          /* --- ACTIVE PROPERTY SECTION (MANAGEMENT VIEW) --- */
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Your Active Property</h1>
                <p className="text-slate-500 mt-1">Manage your active lease and upcoming payments.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/properties/allProperties')}
                  className="text-sm font-bold text-slate-600 hover:text-slate-900 hover:underline transition-all cursor-pointer"
                >
                  See More Properties
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

              {/* Left Column: Property Details & Support (Minimized) */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="relative w-full h-48 bg-gray-100 group">
                    {tenantOccupancy.property?.images?.length > 0 ? (
                      <>
                        <img src={tenantOccupancy.property.images[activePropertyImageIndex || 0]}
                          className="absolute inset-0 w-full h-full object-cover" alt="Property"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent">
                          <span
                            className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-0.5
                                rounded-full text-[10px] font-bold uppercase tracking-wider border
                                ${tenantOccupancy.status === 'pending_end'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full
                                    ${tenantOccupancy.status === 'pending_end' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            />
                            {tenantOccupancy.status === 'pending_end' ? 'Move-out Pending' : 'Active Lease'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-4 text-white z-10">
                      <h2 className="text-xl font-bold leading-tight drop-shadow-md mb-0.5 truncate">
                        {tenantOccupancy.property?.title}
                      </h2>
                      <p className="text-white/90 text-xs font-medium drop-shadow-md flex items-start gap-1">
                        <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="truncate">
                          {tenantOccupancy.property?.address}, {tenantOccupancy.property?.city}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="p-4 bg-white border-t border-gray-100">
                    <div className="flex flex-col gap-1.5 mb-4 px-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 font-semibold uppercase tracking-wide">Lease Start</span>
                        <span className="font-bold text-gray-900 font-mono">{new Date(tenantOccupancy.start_date || tenantOccupancy.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span>
                      </div>
                      {tenantOccupancy.contract_end_date && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-500 font-semibold uppercase tracking-wide">Lease End</span>
                          <span className="font-bold text-gray-900 font-mono">{new Date(tenantOccupancy.contract_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => router.push(`/properties/${tenantOccupancy.property?.id}`)} className="py-2 text-sm bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 border border-gray-200 cursor-pointer">View Details</button>
                      {tenantOccupancy?.contract_url && (
                        <a href={tenantOccupancy.contract_url} target="_blank" rel="noopener noreferrer" className="py-2 text-sm bg-black text-white font-bold rounded-lg hover:bg-gray-800 cursor-pointer text-center flex items-center justify-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          View Contract
                        </a>
                      )}
                      {canRenew && (
                        <button onClick={() => setShowRenewalModal(true)} className="py-2 text-sm bg-white text-black font-bold rounded-lg hover:bg-gray-50 border border-gray-300 cursor-pointer flex items-center justify-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          Renew Contract
                        </button>
                      )}
                      <button onClick={() => setShowEndRequestModal(true)} className="py-2 text-sm border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">End Contract</button>
                    </div>
                  </div>
                </div>

                {/* Security Deposit Card */}
                <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">Security Deposit</h3>
                  </div>
                  {securityDepositPaid ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Total Deposit</span>
                        <span className="font-black text-gray-900">₱{Number(tenantOccupancy?.security_deposit || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Used for Maintenance</span>
                        <span className="font-bold text-gray-600">₱{Number(tenantOccupancy?.security_deposit_used || 0).toLocaleString()}</span>
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-700">Remaining Balance</span>
                        <span className="font-black text-lg text-black">₱{Number((tenantOccupancy?.security_deposit || 0) - (tenantOccupancy?.security_deposit_used || 0)).toLocaleString()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500">No security deposit paid yet</p>
                      <p className="text-xs text-gray-400 mt-1">Required: ₱{Number(tenantOccupancy?.security_deposit || 0).toLocaleString()}</p>
                    </div>
                  )}
                  {securityDepositPaid && daysUntilContractEnd !== null && daysUntilContractEnd <= 30 && daysUntilContractEnd > 0 && (
                    <p className="text-[10px] text-gray-600 mt-3 bg-gray-100 p-2 rounded-lg">
                      💡 Your security deposit can be used as payment in your last month if unused.
                    </p>
                  )}
                </div>

                <div className="bg-black rounded-3xl p-6 text-white relative overflow-hidden shadow-lg">
                  <h3 className="text-lg font-bold mb-1">Help & Support</h3>
                  <p className="text-white/70 text-sm mb-4">Need assistance? Contact your landlord.</p>
                  <button onClick={() => router.push('/messages')} className="w-full bg-white text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-100 transition-colors cursor-pointer">Message Landlord</button>
                </div>
              </div>

              {/* Right Column: Financials & Pending Payments */}
              <div className="lg:col-span-8 space-y-6">

                {/* All Payments Section */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">

                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-lg">All Payments</h3>
                      {pendingPayments.length > 0 && (
                        <span className="bg-red-50 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full border border-red-100">
                          {pendingPayments.length} Pending
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => router.push('/payments')}
                      className="text-xs font-bold text-slate-500 hover:text-black hover:underline transition-all cursor-pointer"
                    >
                      See All
                    </button>
                  </div>

                  {/* 1. Pending Bills List */}
                  {pendingPayments.length > 0 ? (
                    <div className="space-y-3 mb-8">
                      {pendingPayments.map((bill) => {
                        const rent = parseFloat(bill.rent_amount) || 0;
                        const water = parseFloat(bill.water_bill) || 0;
                        const electric = parseFloat(bill.electrical_bill) || 0;
                        const wifi = parseFloat(bill.wifi_bill) || 0;
                        const other = parseFloat(bill.other_bills) || 0;
                        const security = parseFloat(bill.security_deposit_amount) || 0;
                        const advance = parseFloat(bill.advance_amount) || 0;

                        // FIX: Include security and advance in total
                        const total = rent + water + electric + wifi + other + security + advance;

                        let billType = 'Other Bill';
                        if (rent > 0) billType = 'House Rent';
                        else if (security > 0 && rent > 0) billType = 'Move-In Bill'; // Special case
                        else if (electric > 0) billType = 'Electric Bill';
                        else if (water > 0) billType = 'Water Bill';
                        else if (wifi > 0) billType = 'Wifi Bill';

                        return (
                          <div key={bill.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm shrink-0">
                                {billType === 'House Rent' ? (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                )}
                              </div>
                              <div>
                                <p className="font-bold text-slate-700 text-sm">{billType}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Due: {bill.due_date ? new Date(bill.due_date).toLocaleDateString() : 'Immediate'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                              <div className="text-right">
                                <p className="font-black text-slate-900">₱{total.toLocaleString()}</p>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total Amount</p>
                              </div>
                              <button
                                onClick={() => router.push('/payments')}
                                className="px-4 py-2 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200 cursor-pointer"
                              >
                                Pay Now
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 mb-8">
                      <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <p className="text-sm text-slate-500 font-medium">No pending payments. You're all caught up!</p>
                    </div>
                  )}
                  <p className="text-sm text-slate-500 font-medium">Note: Please ensure all bills are paid before the due date. The landlord is not liable for late payments.</p>


                  <div className="border-t border-gray-100 pt-6">
                    <h4 className="font-bold text-slate-900 text-sm mb-4">Payment Overview</h4>

                    {/* 2. Next Due Date & Last Payment Date Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

                      {/* Advance Payment / Credit Balance Card - Always visible */}
                      <div className={`col-span-1 md:col-span-2 rounded-2xl p-4 border flex items-center justify-between ${tenantBalance > 0 ? 'bg-gray-50/50 border-black-100' : 'bg-gray-50/50 border-gray-100'}`}>
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${tenantBalance > 0 ? 'text-black-600' : 'text-gray-500'}`}>Credit Balance</p>
                          <p className={`text-sm font-medium ${tenantBalance > 0 ? 'text-black-700' : 'text-gray-500'}`}>
                            {tenantBalance > 0 ? 'Available for next bill' : 'No credit available'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-2xl font-black ${tenantBalance > 0 ? 'text-black-700' : 'text-gray-400'}`}>₱{tenantBalance.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Next Due Date */}
                      <div className="bg-gray-50/50 rounded-2xl p-4 border border-indigo-50">
                        <p className="text-xs text-black-400 font-bold uppercase tracking-wider mb-1">Next House Due Date</p>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-black-100 text-white-600 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <div>
                            <p className="text-lg font-black text-slate-900">{nextPaymentDate || 'Loading...'}</p>
                            {tenantOccupancy?.property?.price && !String(nextPaymentDate).includes('All Paid') && (
                              <div className="mt-0.5">
                                <p className="text-xs text-black-500 font-semibold">
                                  Expected Bill: ₱{Math.max(0, Number(tenantOccupancy.property.price) - (tenantBalance || 0)).toLocaleString()}
                                </p>
                                {tenantBalance > 0 && (
                                  <p className="text-[10px] text-green-600 font-medium">
                                    (₱{Number(tenantOccupancy.property.price).toLocaleString()} - ₱{tenantBalance.toLocaleString()} credit)
                                  </p>
                                )}
                              </div>
                            )}
                            {tenantOccupancy?.property?.price && String(nextPaymentDate).includes('All Paid') && (
                              <p className="text-xs text-green-600 font-semibold mt-0.5">All bills settled!</p>
                            )}
                            {/* Contract Expiry Warning */}
                            {tenantOccupancy?.contract_end_date && (() => {
                              const endDate = new Date(tenantOccupancy.contract_end_date);
                              const today = new Date();
                              const daysUntilEnd = Math.floor((endDate - today) / (1000 * 60 * 60 * 24));

                              // Check if we are in the renewal window (at least 29 days before end)
                              if (daysUntilEnd > 29) {
                                return (
                                  <div className="mt-1">
                                    <p className="text-xs text-orange-600 font-bold flex items-center gap-1 mb-1">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                      Contract ends in {daysUntilEnd} days
                                    </p>
                                    <p
                                      onClick={() => setShowRenewalModal(true)}
                                      className="text-xs font-bold flex items-center gap-1 text-indigo-600 animate-pulse cursor-pointer hover:underline"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                      Renew Contract Available
                                    </p>
                                  </div>
                                );
                              }

                              // Fallback normal warning
                              if (daysUntilEnd <= 60 && daysUntilEnd > 0) {
                                return (
                                  <p className="text-xs text-orange-600 font-bold mt-1 flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    Contract ends in {daysUntilEnd} day{daysUntilEnd > 1 ? 's' : ''}
                                  </p>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Last House Due Date - ENHANCED with breakdown inside */}
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
                        <div>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Last House Due Date</p>
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                              <p className="text-lg font-black text-slate-900">
                                {lastPayment ? new Date(lastPayment.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'N/A'}
                              </p>
                              <p className="text-xs text-slate-500 font-semibold">Total Paid: ₱{lastPayment ? Number(lastPayment.amount_paid || (parseFloat(lastPayment.rent_amount || 0) + parseFloat(lastPayment.security_deposit_amount || 0) + parseFloat(lastPayment.advance_amount || 0) + parseFloat(lastPayment.water_bill || 0) + parseFloat(lastPayment.electrical_bill || 0) + parseFloat(lastPayment.wifi_bill || 0) + parseFloat(lastPayment.other_bills || 0))).toLocaleString() : '0'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Breakdown List INSIDE the card */}
                        {lastPayment && (
                          <div className="mt-2 space-y-1 bg-white/50 p-2 rounded-lg border border-slate-100/50">
                            {Number(lastPayment.rent_amount) > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500 font-medium">House Rent</span>
                                <span className="font-bold text-slate-700">₱{Number(lastPayment.rent_amount).toLocaleString()}</span>
                              </div>
                            )}
                            {Number(lastPayment.security_deposit_amount) > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500 font-medium">Sec. Dep.</span>
                                <span className="font-bold text-slate-700">₱{Number(lastPayment.security_deposit_amount).toLocaleString()}</span>
                              </div>
                            )}
                            {Number(lastPayment.advance_amount) > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500 font-medium">Advance</span>
                                <span className="font-bold text-slate-700">₱{Number(lastPayment.advance_amount).toLocaleString()}</span>
                              </div>
                            )}
                            {(Number(lastPayment.water_bill) > 0 || Number(lastPayment.electrical_bill) > 0) && (
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500 font-medium">Utilities</span>
                                <span className="font-bold text-slate-700">₱{(Number(lastPayment.water_bill || 0) + Number(lastPayment.electrical_bill || 0)).toLocaleString()}</span>
                              </div>
                            )}
                            {Number(lastPayment.other_bills) > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500 font-medium">Other / Penalty</span>
                                <span className="font-bold text-slate-700">₱{Number(lastPayment.other_bills).toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3. Rent Payment History (Visual Tracker) */}
                    <div className="bg-gray-50 rounded-2xl p-5 border border-slate-100">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-white text-slate-600 rounded-lg shadow-sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <h3 className="font-bold text-slate-900 text-sm">Rent Payment History ({new Date().getFullYear()})</h3>
                        </div>
                      </div>

                      {/* Month Tracker */}
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-6">
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => {
                          // Check if any paid bill covers this month (simplistic check based on due_date month)
                          // Note: A more robust check might look at start_date/end_date of the bill period.
                          // For now, checks if there is a paid bill with due_date in this month (current year or recent).

                          const currentYear = new Date().getFullYear();
                          const isPaid = paymentHistory.some(p => {
                            if (!p.due_date || parseFloat(p.rent_amount) <= 0) return false;

                            const d = new Date(p.due_date);
                            const pMonth = d.getMonth();
                            const pYear = d.getFullYear();

                            // Use advance_amount to determine if this bill covers future months
                            const advance = parseFloat(p.advance_amount || 0);
                            const rent = parseFloat(p.rent_amount || 0);
                            let monthsCovered = 1; // Default covers the due_date month

                            if (advance > 0 && rent > 0) {
                              monthsCovered += Math.floor(advance / rent);
                            }

                            // If payment year is different, we need more logic, 
                            // but assuming most advances are within a year or cross over simply.
                            // Simplified check: is the current 'index' month covered by this payment?

                            // Calculate start and end month indices relative to the payment start
                            // We normalize years to months for comparison: year * 12 + month
                            const targetAbsoluteMonth = currentYear * 12 + index;
                            const paymentStartAbsoluteMonth = pYear * 12 + pMonth;
                            const paymentEndAbsoluteMonth = paymentStartAbsoluteMonth + monthsCovered - 1;

                            return targetAbsoluteMonth >= paymentStartAbsoluteMonth && targetAbsoluteMonth <= paymentEndAbsoluteMonth;
                          });

                          return (
                            <div key={month} className={`flex flex-col items-center justify-center p-2 rounded-xl border ${isPaid ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100 opacity-60'}`}>
                              <span className={`text-[10px] font-bold uppercase mb-1 ${isPaid ? 'text-green-700' : 'text-gray-400'}`}>{month}</span>
                              {isPaid ? (
                                <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-200">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                </div>
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200"></div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* 4. Utility Reminders (Elec & Wifi) */}
                      <div className="space-y-3 border-t border-slate-200 pt-5">
                        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2">Utility Reminders</h4>

                        {/* Electricity */}
                        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-black-100">
                          <div className="p-2 bg-yellow-100 text-white-600 rounded-lg shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">Electricity Bill</p>
                            <p className="text-xs text-slate-600 leading-snug mt-0.5">
                              Only a friendly reminder: The electricity receipt usually arrives during the <strong>1st week of the month</strong>.
                            </p>
                          </div>
                        </div>

                        {/* Wifi */}
                        {tenantOccupancy?.wifi_due_day && (
                          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-black-100">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shrink-0">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">Internet Bill</p>
                              <p className="text-xs text-slate-600 leading-snug mt-0.5">
                                Your Wifi bill is typically due on the <strong>{tenantOccupancy.wifi_due_day}{[11, 12, 13].includes(tenantOccupancy.wifi_due_day) ? 'th' : ['st', 'nd', 'rd'][tenantOccupancy.wifi_due_day % 10 - 1] || 'th'}</strong> of the month.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* --- ALL PROPERTIES SECTION (DISCOVERY VIEW) --- */
          <div className="space-y-8">
            {/* All Properties Section */}
            <div className={`mb-0 mt-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2">
                <div className="mb-2 sm:mb-0 w-full sm:w-auto">
                  <h2 className="text-2xl font-black text-black uppercase">All Properties</h2>
                  <p className="text-sm text-gray-500">List of Properties</p>
                </div>
                <span onClick={handleSeeMore} className="text-sm font-semibold text-black hover:text-gray-600 cursor-pointer flex items-center gap-1 hover:underline transition-all">
                  See More Properties<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </span>
              </div>
              {properties.length === 0 ? (
                <div className="text-center py-20 h-[400px] flex items-center justify-center">No properties found.</div>
              ) : (
                <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)] cursor-pointer">
                  <CarouselContent className="-ml-2">
                    {properties.slice(0, maxDisplayItems).map((item) => (
                      <CarouselItem key={item.id} className={carouselItemClass}>
                        <div className="p-1 h-full">
                          <PropertyCard
                            property={item} images={getPropertyImages(item)}
                            currentIndex={currentImageIndex[item.id] || 0}
                            isSelectedForCompare={comparisonList.some(p => p.id === item.id)}
                            isFavorite={favorites.includes(item.id)}
                            stats={propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }}
                          />
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious /><CarouselNext />
                </Carousel>
              )}
            </div>

            {/* Tenants Favorites Section */}
            {guestFavorites.length > 0 && (
              <div className={`mb-2 mt-8 transition-all duration-700 delay-150 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Tenants Favorites</h2>
                    <p className="text-sm text-gray-500">Most loved by our community</p>
                  </div>
                </div>
                <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)]">
                  <CarouselContent className="-ml-2">
                    {guestFavorites.slice(0, maxDisplayItems).map((item) => {
                      const images = getPropertyImages(item)
                      const currentIndex = currentImageIndex[item.id] || 0
                      const isSelectedForCompare = comparisonList.some(p => p.id === item.id)
                      const isFavorite = favorites.includes(item.id)
                      const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }

                      return (
                        <CarouselItem key={item.id} className={carouselItemClass}>
                          <div className="p-1 h-full">
                            <PropertyCard
                              property={item}
                              images={images}
                              currentIndex={currentIndex}
                              isSelectedForCompare={isSelectedForCompare}
                              isFavorite={isFavorite}
                              stats={stats}
                            />
                          </div>
                        </CarouselItem>
                      )
                    })}
                  </CarouselContent>
                  <CarouselPrevious />
                  <CarouselNext />
                </Carousel>
              </div>
            )}

            {/* Top Rated Section - Carousel */}
            {topRated.length > 0 && (
              <div className={`mb-2 mt-8 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Top Rated</h2>
                    <p className="text-sm text-gray-500">Highest rated by tenants</p>
                  </div>
                </div>
                <Carousel className="w-full mx-auto sm:max-w-[calc(100%-100px)]">
                  <CarouselContent className="-ml-2">
                    {topRated.slice(0, maxDisplayItems).map((item) => {
                      const images = getPropertyImages(item)
                      const currentIndex = currentImageIndex[item.id] || 0
                      const isSelectedForCompare = comparisonList.some(p => p.id === item.id)
                      const isFavorite = favorites.includes(item.id)
                      const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }

                      return (
                        <CarouselItem key={item.id} className={carouselItemClass}>
                          <div className="p-1 h-full">
                            <PropertyCard
                              property={item}
                              images={images}
                              currentIndex={currentIndex}
                              isSelectedForCompare={isSelectedForCompare}
                              isFavorite={isFavorite}
                              stats={stats}
                            />
                          </div>
                        </CarouselItem>
                      )
                    })}
                  </CarouselContent>
                  <CarouselPrevious />
                  <CarouselNext />
                </Carousel>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Floating Compare Button */}
      {comparisonList.length > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40 animate-bounce-in">
          <button onClick={handleCompareClick} className="bg-black text-white px-8 py-4 rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center gap-3 border-2 border-white/20 cursor-pointer">
            <span className="relative">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-black">
                {comparisonList.length}
              </span>
            </span>
            <span className="font-bold text-sm uppercase tracking-wider">Compare Selected</span>
            {comparisonList.length < 2 && (
              <span className="text-xs text-gray-400 font-normal normal-case">(Select at least 2)</span>
            )}
          </button>
        </div>
      )}

      {/* End Request Modal */}
      {showEndRequestModal && tenantOccupancy && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">Request to Leave</h3>

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 mb-1">Date when*</label>
              <input
                type="date"
                value={endRequestDate}
                onChange={(e) => setEndRequestDate(e.target.value)}
                className="w-full p-3 border rounded-xl"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 mb-1">Reason*</label>
              <textarea
                value={endRequestReason}
                onChange={(e) => setEndRequestReason(e.target.value)}
                placeholder="Enter your reason..."
                className="w-full p-3 border rounded-xl"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowEndRequestModal(false)} className="flex-1 py-2 bg-gray-100 rounded-xl cursor-pointer">Cancel</button>
              <button onClick={requestEndOccupancy} disabled={submittingEndRequest} className="flex-1 py-2 bg-black text-white rounded-xl cursor-pointer">Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && reviewTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">How was your stay?</h2>
              <p className="text-gray-500 text-sm">You recently ended your contract at <strong>{reviewTarget.property?.title}</strong>. Please rate your experience.</p>
            </div>

            {/* Rating Categories */}
            <div className="space-y-5 mb-6">
              {/* Cleanliness Rating */}
              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                    </div>
                    <span className="font-bold text-gray-800">Cleanliness</span>
                  </div>
                  <span className="text-sm font-bold text-gray-500">{cleanlinessRating}/5</span>
                </div>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setCleanlinessRating(star)} className="focus:outline-none transition-transform hover:scale-110 cursor-pointer">
                      <svg className={`w-8 h-8 ${star <= cleanlinessRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                    </button>
                  ))}
                </div>
              </div>

              {/* Communication Rating */}
              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    </div>
                    <span className="font-bold text-gray-800">Communication</span>
                  </div>
                  <span className="text-sm font-bold text-gray-500">{communicationRating}/5</span>
                </div>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setCommunicationRating(star)} className="focus:outline-none transition-transform hover:scale-110 cursor-pointer">
                      <svg className={`w-8 h-8 ${star <= communicationRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                    </button>
                  ))}
                </div>
              </div>

              {/* Location Rating */}
              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <span className="font-bold text-gray-800">Location</span>
                  </div>
                  <span className="text-sm font-bold text-gray-500">{locationRating}/5</span>
                </div>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setLocationRating(star)} className="focus:outline-none transition-transform hover:scale-110 cursor-pointer">
                      <svg className={`w-8 h-8 ${star <= locationRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Overall Rating Display */}
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-4 mb-6 border border-yellow-100">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-800">Overall Rating</span>
                <div className="flex items-center gap-2">
                  <svg className="w-6 h-6 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                  <span className="text-2xl font-black text-gray-900">{((cleanlinessRating + communicationRating + locationRating) / 3).toFixed(1)}</span>
                  <span className="text-gray-400 text-sm">/5</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">Average of Cleanliness, Communication & Location</p>
            </div>

            {/* Text Review */}
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Write your experience here..."
              className="w-full p-4 border border-gray-200 rounded-xl mb-6 text-sm bg-gray-50 focus:bg-white focus:border-black outline-none resize-none h-32"
            />

            {/* Submit Button */}
            <button
              onClick={submitReview}
              disabled={submittingReview || !reviewComment.trim()}
              className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all ${submittingReview || !reviewComment.trim() ? 'bg-gray-300 cursor-not-allowed' : 'bg-black hover:bg-gray-800 hover:shadow-xl cursor-pointer'}`}
            >
              {submittingReview ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </div>
      )}

      {/* Contract Renewal Modal */}
      {showRenewalModal && tenantOccupancy && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Request Contract Renewal</h3>
                <p className="text-sm text-gray-500">{tenantOccupancy.property?.title}</p>
              </div>
            </div>

            <div className="bg-indigo-50 rounded-xl p-4 mb-4 border border-indigo-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-indigo-600 font-bold">Current Contract Ends</span>
                <span className="font-bold text-indigo-900">{new Date(tenantOccupancy.contract_end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-indigo-600 font-bold">Days Remaining</span>
                <span className="font-bold text-indigo-900">{daysUntilContractEnd} days</span>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-2">Select Meeting Date for Contract Signing <span className="text-red-500">*</span></label>
              <input
                type="date"
                required
                min={new Date().toISOString().split('T')[0]}
                className="w-full border-2 border-gray-200 focus:border-indigo-500 rounded-xl px-4 py-3 text-sm font-medium outline-none transition-colors"
                value={renewalMeetingDate}
                onChange={(e) => setRenewalMeetingDate(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Please choose a date to meet the landlord for signing the new contract.</p>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              By requesting a renewal, your landlord will be notified and can approve or propose new terms for your continued stay.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowRenewalModal(false)}
                className="flex-1 py-3 border border-gray-200 rounded-xl font-bold cursor-pointer hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={requestContractRenewal}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold cursor-pointer hover:bg-indigo-700 shadow-lg"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}