import Lottie from "lottie-react"
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import { useEffect, useState, useRef } from 'react'
import loadingAnimation from "../assets/loading.json"
import { createNotification } from '../lib/notifications'
import { supabase } from '../lib/supabaseClient'
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
  const [paymentHistory, setPaymentHistory] = useState([])
  const [familyPaidBills, setFamilyPaidBills] = useState([])
  const [showEndRequestModal, setShowEndRequestModal] = useState(false)
  const [endRequestDate, setEndRequestDate] = useState('')
  const [endRequestReason, setEndRequestReason] = useState('')
  const [submittingEndRequest, setSubmittingEndRequest] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewTarget, setReviewTarget] = useState(null)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [dontShowReviewAgain, setDontShowReviewAgain] = useState(false)
  const [submittingRenewal, setSubmittingRenewal] = useState(false)
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
  const [familyMembers, setFamilyMembers] = useState([])
  const [showFamilyModal, setShowFamilyModal] = useState(false)
  const [familySearchQuery, setFamilySearchQuery] = useState('')
  const [familySearchResults, setFamilySearchResults] = useState([])
  const [familySearching, setFamilySearching] = useState(false)
  const [addingMember, setAddingMember] = useState(null)
  const [removingMember, setRemovingMember] = useState(null)
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null)
  const [loadingFamily, setLoadingFamily] = useState(false)
  const [isFamilyMember, setIsFamilyMember] = useState(false)
  const maxDisplayItems = 8
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const searchRef = useRef(null)
  const mostFavoriteId = Object.entries(propertyStats).filter(([_, s]) => (s.favorite_count || 0) > 0).sort((a, b) => b[1].favorite_count - a[1].favorite_count)?.[0]?.[0];
  const topRatedId = Object.entries(propertyStats).filter(([_, s]) => (s.review_count || 0) > 0).sort((a, b) => b[1].avg_rating - a[1].avg_rating || b[1].review_count - a[1].review_count)?.[0]?.[0];

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
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }
    const debounceTimer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('id, title, city, price, images, status')
          .eq('is_deleted', false)
          .or(`title.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
          .limit(6)
        if (data && !error) {
          setSearchResults(data)
          setShowSearchDropdown(true)
        }
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(debounceTimer)
  }, [searchQuery])

  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [searchRef])

  const handleSearch = () => {
    if (!searchQuery.trim()) return
    router.push(`/properties/allProperties?search=${encodeURIComponent(searchQuery.trim())}`)
  }

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
    }, 1450)

    return () => clearInterval(interval)
  }, [properties, guestFavorites, topRated])


  useEffect(() => {
    if (!tenantOccupancy?.property?.images || tenantOccupancy.property.images.length <= 1) return

    const interval = setInterval(() => {
      setActivePropertyImageIndex(prev =>
        (prev + 1) % tenantOccupancy.property.images.length
      )
    }, 3000) 

    return () => clearInterval(interval)
  }, [tenantOccupancy])

  useEffect(() => {
    if (profile) {
      loadInitialData()
    }
  }, [profile])

  async function loadInitialData() {
    await loadProperties()
    await loadPropertyStats()
    const occupancy = await loadTenantOccupancy() 

    const isOwnOccupancy = occupancy && occupancy.tenant_id === session.user.id
    if (isOwnOccupancy) {
      await loadTenantBalance(occupancy)
      await loadPendingPayments(occupancy)
      await loadPaymentHistory(occupancy)
    }

    await checkPendingReviews(session.user.id)
    await loadUserFavorites()
    await loadFeaturedSections()

    if (occupancy) {
      if (isOwnOccupancy) {
        await checkLastMonthDepositLogic(occupancy)
      }
      calculateNextPayment(occupancy.id, occupancy)
    }
    setLoading(false)
  }

  async function checkLastMonthDepositLogic(occupancy) {
    if (!occupancy.contract_end_date) return;

    const endDate = new Date(occupancy.contract_end_date);
    const today = new Date();
    endDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = endDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const renewalPendingOrApproved = occupancy.renewal_requested ||
      occupancy.renewal_status === 'pending' ||
      occupancy.renewal_status === 'approved';

    if (diffDays <= 28 && diffDays > 0 && !renewalPendingOrApproved) {

      const windowStart = new Date(endDate);
      windowStart.setDate(windowStart.getDate() - 40);

      const { data: existingBills } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('occupancy_id', occupancy.id)
        .gte('due_date', windowStart.toISOString().split('T')[0])
        .gt('rent_amount', 0);

      if (existingBills && existingBills.length > 0) {
        return;
      }

      console.log('Executing Last Month Deposit Logic...');

      const rentAmount = Number(occupancy.property?.price || 0);
      const depositTotal = Number(occupancy.security_deposit || 0);
      const depositUsed = Number(occupancy.security_deposit_used || 0);
      const availableDeposit = depositTotal - depositUsed;

      if (availableDeposit >= rentAmount) {
        await supabase.from('payment_requests').insert({
          tenant: session.user.id,
          property_id: occupancy.property_id,
          occupancy_id: occupancy.id,
          rent_amount: rentAmount,
          status: 'paid',
          due_date: new Date().toISOString(),
          bills_description: 'Last Month Rent (Paid via Security Deposit)',
          is_move_in_payment: false
        });

        await supabase.from('tenant_occupancies')
          .update({ security_deposit_used: depositUsed + rentAmount })
          .eq('id', occupancy.id);

        showToast.success("Last month rent paid using Security Deposit");
        await createNotification({
          recipient: session.user.id,
          actor: session.user.id,
          type: 'payment_paid',
          message: 'Your last month rent has been automatically paid using your Security Deposit.',
          link: '/payments'
        });

      } else {
        if (availableDeposit > 0) {
          await supabase.from('tenant_occupancies')
            .update({ security_deposit_used: depositUsed + availableDeposit })
            .eq('id', occupancy.id);
        }

        const lackAmount = rentAmount - availableDeposit;

        await supabase.from('payment_requests').insert({
          tenant: session.user.id,
          property_id: occupancy.property_id,
          occupancy_id: occupancy.id,
          rent_amount: lackAmount,
          status: 'pending',
          due_date: new Date().toISOString(),
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
      loadPendingPayments(occupancy);
      loadTenantOccupancy();
    }
  }

  async function loadPendingPayments(occupancy) {
    const tenantId = occupancy?.tenant_id || session.user.id
    const occupancyId = occupancy?.id
    // Load pending payments for this tenant
    let query = supabase
      .from('payment_requests')
      .select('*')
      .eq('tenant', tenantId)
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

  async function loadPaymentHistory(occupancy) {
    const tenantId = occupancy?.tenant_id || session.user.id
    const occupancyId = occupancy?.id
    // Fetch PAID bills for Rent History
    let query = supabase
      .from('payment_requests')
      .select('*')
      .eq('tenant', tenantId)
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
    const isOwn = currentOccupancy?.tenant_id === session.user.id;

    // 1. Check for pending bills first (including move-in payments)
    let allPendingBills = null;
    let allPaidBills = null;

    if (isOwn) {
      // Primary tenant: query via client
      const { data: pendingData } = await supabase
        .from('payment_requests')
        .select('due_date, is_move_in_payment, is_renewal_payment, occupancy_id, property_id, status')
        .eq('tenant', currentOccupancy.tenant_id)
        .eq('status', 'pending')
        .gt('rent_amount', 0)
        .order('due_date', { ascending: true })
      allPendingBills = pendingData;

      const { data: paidData } = await supabase
        .from('payment_requests')
        .select('due_date, rent_amount, advance_amount, is_renewal_payment, is_advance_payment, is_move_in_payment, property_id, occupancy_id, status')
        .eq('tenant', currentOccupancy.tenant_id)
        .in('status', ['paid', 'pending_confirmation'])
        .gt('rent_amount', 0)
        .order('due_date', { ascending: false })
      allPaidBills = paidData;
    } else {
      // Family member: use already-loaded state (from API)
      allPendingBills = pendingPayments.filter(p => p.status === 'pending' && parseFloat(p.rent_amount) > 0);
      // Use the robust allPaidBills fetched from family-members.js to ensure advance_amount logic works
      allPaidBills = familyPaidBills && familyPaidBills.length > 0
        ? familyPaidBills
        : [...paymentHistory].sort((a, b) => new Date(b.due_date) - new Date(a.due_date));
    }

    // Filter to only bills for this occupancy/property, but be lenient
    let pendingBill = null;
    if (allPendingBills && allPendingBills.length > 0) {
      pendingBill = allPendingBills.find(bill => {
        if (occupancyId && bill.occupancy_id === occupancyId) return true;
        if (currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id) return true;
        if (!bill.occupancy_id && currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id) return true;
        return false;
      });
      if (!pendingBill && allPendingBills.length > 0) {
        pendingBill = allPendingBills[0];
      }
    }

    console.log('All paid bills for tenant:', allPaidBills);
    console.log('Occupancy ID:', occupancyId, 'Property ID:', currentOccupancy?.property_id);

    // Filter to only bills for this property/occupancy
    let filteredBills = [];
    if (allPaidBills && allPaidBills.length > 0) {
      filteredBills = allPaidBills.filter(bill => {
        // STRICT FILTER: If bill has an occupancy_id and it doesn't match the current one, EXCLUDE IT
        // This prevents picking up bills from previous leases for the same tenant/property
        if (occupancyId && bill.occupancy_id && bill.occupancy_id !== occupancyId) return false;

        // Match by occupancy_id (most specific)
        if (occupancyId && bill.occupancy_id === occupancyId) return true;
        // Match by property_id (only if bill has no occupancy_id)
        if (currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id && !bill.occupancy_id) return true;

        return false;
      });
    }

    console.log('Filtered paid bills for this occupancy/property:', filteredBills);

    // Prioritize bills with advance_amount (original renewal bills) over advance payment bills
    // This ensures we calculate monthsCovered correctly for renewal payments
    // Move-in payments should be included (they have advance_amount = 0, so they'll be in filteredBills?.[0] if no advance bills exist)
    // CRITICAL: For renewal payments, the bill's due_date should be the actual next due date (not contract end date)
    // This is updated in payments.js when the renewal is confirmed
    const lastBill = filteredBills?.find(bill => bill.advance_amount > 0 && bill.is_renewal_payment) ||
      filteredBills?.find(bill => bill.advance_amount > 0) ||
      filteredBills?.[0];

    console.log('Last paid bill for next due calc:', lastBill);
    console.log('Paid bills count:', filteredBills?.length || 0);
    console.log('All paid bills count:', allPaidBills?.length || 0);

    // CRITICAL: For newly assigned tenants with NO paid bills, ALWAYS use pending bill if available
    // This MUST happen before any other calculations to prevent "All Paid" from showing
    if (!lastBill) {
      // If we have a pending bill, use it immediately
      if (pendingBill && pendingBill.due_date && pendingBill.is_renewal_payment !== true) {
        console.log('✅ No paid bills found, using pending bill due date:', pendingBill.due_date, 'is_move_in:', pendingBill.is_move_in_payment);
        const formattedDate = new Date(pendingBill.due_date).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
        });
        console.log('✅ Setting nextPaymentDate to:', formattedDate);
        setNextPaymentDate(formattedDate);
        setLastRentPeriod("N/A"); // No last payment yet if there's a pending bill
        return; // CRITICAL: Return immediately to prevent any "All Paid" logic
      }

      // If no pending bill found in initial query, do a more aggressive search
      console.log('⚠️ No pending bill found in initial query, doing aggressive search...');

      let aggressivePendingCheck = null;
      if (isOwn) {
        const { data } = await supabase
          .from('payment_requests')
          .select('due_date, occupancy_id, property_id, is_move_in_payment, is_renewal_payment, status')
          .eq('tenant', currentOccupancy.tenant_id)
          .eq('status', 'pending')
          .gt('rent_amount', 0)
          .order('due_date', { ascending: true })
          .limit(5); // Get multiple to see what's available
        aggressivePendingCheck = data;
      } else {
        aggressivePendingCheck = allPendingBills.slice(0, 5);
      }

      console.log('Aggressive pending bill search results:', aggressivePendingCheck);

      if (aggressivePendingCheck && aggressivePendingCheck.length > 0) {
        // Find any pending bill that's not a renewal
        const validPending = aggressivePendingCheck.find(bill =>
          bill.due_date &&
          bill.is_renewal_payment !== true &&
          (
            (occupancyId && bill.occupancy_id === occupancyId) ||
            (currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id) ||
            (!bill.occupancy_id && currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id) ||
            (!bill.occupancy_id && !bill.property_id) // Accept bills with no IDs for new tenants
          )
        ) || aggressivePendingCheck.find(bill => bill.due_date && bill.is_renewal_payment !== true);

        if (validPending && validPending.due_date) {
          console.log('✅ Found pending bill in aggressive search, using it:', validPending.due_date);
          setNextPaymentDate(new Date(validPending.due_date).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
          }));
          setLastRentPeriod("N/A");
          return; // CRITICAL: Return immediately
        }
      }

      // If still no pending bill, use start_date (never show "All Paid" for new tenants)
      console.log('⚠️ No pending bills found at all for newly assigned tenant, using start_date');
      if (currentOccupancy?.start_date) {
        const startDate = new Date(currentOccupancy.start_date);
        const formattedDate = startDate.toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
        });
        console.log('✅ Setting nextPaymentDate to start_date for newly assigned tenant:', formattedDate);
        setNextPaymentDate(formattedDate);
        setLastRentPeriod("N/A");
        return; // CRITICAL: Return immediately to prevent "All Paid"
      }
    }

    const baseDateString = currentOccupancy?.start_date;

    if (baseDateString) {
      const startDate = new Date(baseDateString);
      const startDay = startDate.getUTCDate();
      let nextDue;

      if (lastBill && lastBill.due_date) {
        const rentAmount = parseFloat(lastBill.rent_amount || 0);
        const advanceAmount = parseFloat(lastBill.advance_amount || 0);

        let monthsCovered = 1;
        if (rentAmount > 0 && advanceAmount > 0) {
          // For renewal payments: advance_amount = 1 month rent, so total = 2 months
          // The renewal payment's due_date should be the actual next due date (March 6), not contract end date (April 6)
          // Example: If renewal due_date = March 6, it covers March (rent) + April (advance) = 2 months
          // So the next due date should be: March 6 + 2 months = May 6
          // We add 2 months because the renewal payment covers 2 months total (1 month rent + 1 month advance)
          monthsCovered = 1 + Math.floor(advanceAmount / rentAmount);
        }

        console.log('Next due calculation:', {
          rentAmount,
          advanceAmount,
          monthsCovered,
          billDueDate: lastBill.due_date,
          isRenewal: lastBill.is_renewal_payment,
          isMoveIn: lastBill.is_move_in_payment,
          originalDueDate: lastBill.due_date,
          billStatus: lastBill.status
        });

        // Create a new date object from the bill's due_date
        nextDue = new Date(lastBill.due_date);

        // Ensure we're working with a valid date
        if (isNaN(nextDue.getTime())) {
          console.error('Invalid date from lastBill.due_date:', lastBill.due_date);
          nextDue = new Date(startDate);
          nextDue.setUTCDate(startDay);
        } else {
          // Add months to the due date - CRITICAL: Preserve the day of month
          const originalDate = new Date(nextDue); // Save original for logging
          const currentMonth = nextDue.getMonth();
          const currentYear = nextDue.getFullYear();
          const currentDay = nextDue.getDate(); // Preserve the day (e.g., 6th of the month)

          // Calculate target month and year
          const targetMonth = currentMonth + monthsCovered;
          const targetYear = currentYear + Math.floor(targetMonth / 12);
          let finalMonth = targetMonth % 12;
          if (finalMonth < 0) finalMonth += 12;

          // Set the new date
          nextDue.setFullYear(targetYear);
          nextDue.setMonth(finalMonth);
          nextDue.setDate(currentDay); // Preserve the day of month

          console.log('Calculated next due date:', {
            original: originalDate.toISOString(),
            originalFormatted: originalDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
            calculated: nextDue.toISOString(),
            calculatedFormatted: nextDue.toLocaleDateString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
            }),
            monthsAdded: monthsCovered,
            originalMonth: originalDate.getMonth() + 1,
            calculatedMonth: nextDue.getMonth() + 1,
            monthDifference: (nextDue.getMonth() + 1) - (originalDate.getMonth() + 1),
            preservedDay: currentDay
          });
        }

        // CRITICAL: Set the calculated date and return immediately
        // This prevents any other logic from overriding the calculated next due date
        if (nextDue && !isNaN(nextDue.getTime())) {
          const formattedNextDue = nextDue.toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
          });
          console.log('✅ Setting nextPaymentDate from paid bill calculation:', formattedNextDue);

          // Check contract end date: Only show "All Paid" if the PAID period already covers past contract end
          // CRITICAL: For move-in payments, they only cover 1 month, so we should NEVER show "All Paid" immediately after move-in
          // CRITICAL: For newly assigned tenants (within 3 months), NEVER show "All Paid" - always show the calculated next due date
          if (currentOccupancy.contract_end_date && lastBill) {
            const endDate = new Date(currentOccupancy.contract_end_date);
            const lastPaidDate = new Date(lastBill.due_date);
            const rentAmount = parseFloat(lastBill.rent_amount || 0);
            const advanceAmount = parseFloat(lastBill.advance_amount || 0);

            // Check if this is a move-in payment - move-in payments only cover 1 month
            const isMoveInPayment = lastBill.is_move_in_payment === true;

            let monthsCoveredByPayment = 1;
            if (rentAmount > 0 && advanceAmount > 0) {
              monthsCoveredByPayment = 1 + Math.floor(advanceAmount / rentAmount);
            }

            // Calculate when the paid period ends
            const paidPeriodEnd = new Date(lastPaidDate);
            paidPeriodEnd.setMonth(paidPeriodEnd.getMonth() + monthsCoveredByPayment);

            // CRITICAL: For move-in payments, they only cover the first month
            // The next due date should be start_date + 1 month, not "All Paid"
            if (isMoveInPayment) {
              console.log('Move-in payment detected - showing calculated next due date, not "All Paid"');
              // The nextDue is already calculated correctly above, just use it
              setNextPaymentDate(formattedNextDue);
              if (lastBill) {
                const lastDate = new Date(lastBill.due_date);
                setLastRentPeriod(lastDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
              } else {
                setLastRentPeriod("N/A");
              }
              return; // Return immediately for move-in payments
            }

            // Only show "All Paid" if the paid period already extends past contract end
            // BUT first check if there are any pending bills - if so, don't show "All Paid"
            if (paidPeriodEnd >= endDate) {
              // Before showing "All Paid", check for pending bills one more time
              let finalPendingCheck = null;
              if (isOwn) {
                const { data } = await supabase
                  .from('payment_requests')
                  .select('due_date, occupancy_id, property_id, is_renewal_payment')
                  .eq('tenant', currentOccupancy.tenant_id)
                  .eq('status', 'pending')
                  .gt('rent_amount', 0)
                  .neq('is_renewal_payment', true)
                  .order('due_date', { ascending: true })
                  .limit(1)
                  .maybeSingle();
                finalPendingCheck = data;
              } else {
                finalPendingCheck = allPendingBills && allPendingBills.find(p => p.is_renewal_payment !== true);
              }

              if (finalPendingCheck && finalPendingCheck.due_date) {
                // There's a pending bill, use it instead of "All Paid"
                console.log('⚠️ Found pending bill even though paid period extends past contract end, using pending bill:', finalPendingCheck.due_date);
                setNextPaymentDate(new Date(finalPendingCheck.due_date).toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
                }));
                setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
                return;
              }

              // No pending bills found, show "All Paid"
              console.log('Paid period already covers past contract end, showing "All Paid"');
              setNextPaymentDate("All Paid - Contract Ending");
              setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
              return;
            }
          }

          // Set the calculated next due date
          console.log('✅ FINAL: Setting nextPaymentDate to:', formattedNextDue);
          setNextPaymentDate(formattedNextDue);

          if (lastBill) {
            const lastDate = new Date(lastBill.due_date);
            setLastRentPeriod(lastDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
          } else {
            setLastRentPeriod("N/A");
          }
          return; // IMPORTANT: Return immediately to prevent any other code from overriding
        }
      } else {
        console.log('No lastBill found, using start_date:', baseDateString);

        // CRITICAL: For newly assigned tenants with no paid bills, ALWAYS check for pending bills FIRST
        // This must happen BEFORE any contract end date checks to prevent "All Paid" from showing incorrectly
        if (!pendingBill) {
          // Check for ANY pending bill (move-in or regular rent bill)
          let anyPendingBillData = null;
          if (isOwn) {
            const { data } = await supabase
              .from('payment_requests')
              .select('due_date, occupancy_id, property_id, is_move_in_payment, is_renewal_payment')
              .eq('tenant', currentOccupancy.tenant_id)
              .eq('status', 'pending')
              .gt('rent_amount', 0)
              .order('due_date', { ascending: true })
              .limit(1)
              .maybeSingle();
            anyPendingBillData = data;
          } else {
            anyPendingBillData = allPendingBills && allPendingBills.length > 0 ? allPendingBills[0] : null;
          }

          // Only use it if it's not a renewal payment
          const anyPendingBill = (anyPendingBillData && anyPendingBillData.is_renewal_payment !== true) ? anyPendingBillData : null;

          if (anyPendingBill && anyPendingBill.due_date) {
            // Check if it matches this occupancy/property (be lenient for newly assigned tenants)
            const matches = (occupancyId && anyPendingBill.occupancy_id === occupancyId) ||
              (currentOccupancy?.property_id && anyPendingBill.property_id === currentOccupancy.property_id) ||
              (!anyPendingBill.occupancy_id && currentOccupancy?.property_id && anyPendingBill.property_id === currentOccupancy.property_id) ||
              (!anyPendingBill.occupancy_id && !anyPendingBill.property_id); // If bill has no IDs, use it anyway for new tenants

            if (matches) {
              console.log('✅ Found pending bill for newly assigned tenant, using its due date:', anyPendingBill.due_date);
              setNextPaymentDate(new Date(anyPendingBill.due_date).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
              }));
              setLastRentPeriod("N/A");
              return; // CRITICAL: Return immediately to prevent "All Paid" logic
            }
          }
        } else if (pendingBill && pendingBill.due_date) {
          // We already have a pending bill from earlier, use it
          console.log('✅ Using existing pending bill for newly assigned tenant:', pendingBill.due_date);
          setNextPaymentDate(new Date(pendingBill.due_date).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
          }));
          setLastRentPeriod("N/A");
          return; // CRITICAL: Return immediately to prevent "All Paid" logic
        }

        nextDue = new Date(startDate);
        nextDue.setUTCDate(startDay);
      }

      // Only reach here if we didn't have a paid bill to calculate from
      // Check contract end date
      if (currentOccupancy.contract_end_date) {
        const endDate = new Date(currentOccupancy.contract_end_date);

        // Only show "All Paid" if the PAID period already covers past contract end
        // Don't show "All Paid" just because next due date exceeds contract end - tenant hasn't paid for that month yet!
        if (nextDue >= endDate && lastBill) {
          const lastPaidDate = new Date(lastBill.due_date);
          const rentAmount = parseFloat(lastBill.rent_amount || 0);
          const advanceAmount = parseFloat(lastBill.advance_amount || 0);
          let monthsCoveredByPayment = 1;
          if (rentAmount > 0 && advanceAmount > 0) {
            monthsCoveredByPayment = 1 + Math.floor(advanceAmount / rentAmount);
          }

          // Calculate when the paid period ends
          const paidPeriodEnd = new Date(lastPaidDate);
          paidPeriodEnd.setMonth(paidPeriodEnd.getMonth() + monthsCoveredByPayment);

          // Only show "All Paid" if the paid period already extends past contract end
          if (paidPeriodEnd >= endDate) {
            // Check if this is likely an error (contract end is far in future but we only covered limited months)
            // If contract ends more than 35 days from now, do NOT show "All Paid"
            const today = new Date();
            const timeDiff = endDate - today;
            const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

            if (daysDiff > 45) {
              console.log('⚠️ Paid period >= endDate but endDate is far away (' + daysDiff + ' days). Assuming calculation sync issue. Showing calculated date.');
              setNextPaymentDate(formattedNextDue);
              setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
              return;
            }

            setNextPaymentDate("All Paid - Contract Ending");
            setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
            return;
          }
          // If paid period doesn't extend past contract end, show the calculated next due date
          console.log('Paid period does not extend past contract end, showing calculated next due date');
        }

        // CRITICAL: For newly assigned tenants with no paid bills, NEVER show "All Paid"
        // Even if nextDue >= endDate, if there's no paid bill, we should show the start_date or pending bill
        // Only show "All Paid" if there's actually a paid bill that covers past the contract end
        if (nextDue >= endDate && !lastBill) {
          // This should never happen for newly assigned tenants because we already checked for pending bills above
          // But as a safety net, use start_date instead of "All Paid"
          console.log('⚠️ No paid bills and nextDue >= endDate, but no pending bills found. Using start_date instead of "All Paid"');
          setNextPaymentDate(nextDue.toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
          }));
          setLastRentPeriod("N/A");
          return;
        }
      }

      // Fallback: Use calculated nextDue (from start_date if no paid bill)
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
      if (lastBill && lastBill.due_date) {
        const rentAmount = parseFloat(lastBill.rent_amount || 0);
        const advanceAmount = parseFloat(lastBill.advance_amount || 0);

        let monthsCovered = 1;
        if (rentAmount > 0 && advanceAmount > 0) {
          monthsCovered = 1 + Math.floor(advanceAmount / rentAmount);
        }

        console.log('Next due calculation (no baseDate):', {
          rentAmount,
          advanceAmount,
          monthsCovered,
          billDueDate: lastBill.due_date,
          isMoveIn: lastBill.is_move_in_payment
        });

        const d = new Date(lastBill.due_date);
        const originalDate = new Date(d); // Save original for logging
        const currentMonth = d.getMonth();
        const currentYear = d.getFullYear();
        const currentDay = d.getDate(); // Preserve the day of month

        // Calculate target month and year
        const targetMonth = currentMonth + monthsCovered;
        const targetYear = currentYear + Math.floor(targetMonth / 12);
        let finalMonth = targetMonth % 12;
        if (finalMonth < 0) finalMonth += 12;

        // Set the new date
        d.setFullYear(targetYear);
        d.setMonth(finalMonth);
        d.setDate(currentDay); // Preserve the day of month

        console.log('Calculated next due date (no baseDate):', {
          original: originalDate.toISOString(),
          originalFormatted: originalDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
          calculated: d.toISOString(),
          calculatedFormatted: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
          monthsAdded: monthsCovered,
          monthDifference: (d.getMonth() + 1) - (originalDate.getMonth() + 1)
        });

        if (currentOccupancy?.contract_end_date) {
          const endDate = new Date(currentOccupancy.contract_end_date);
          // Only show "All Paid" if the PAID period already covers past contract end
          const lastPaidDate = new Date(lastBill.due_date);
          const paidPeriodEnd = new Date(lastPaidDate);
          paidPeriodEnd.setMonth(paidPeriodEnd.getMonth() + monthsCovered);

          // Only show "All Paid" if the paid period already extends past contract end
          if (paidPeriodEnd >= endDate) {
            setNextPaymentDate("All Paid - Contract Ending");
            return;
          }
          // Otherwise, show the calculated next due date
        }

        setNextPaymentDate(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }));
      } else {
        setNextPaymentDate("N/A");
      }
    }
  }

  useEffect(() => {
    if (tenantOccupancy) calculateNextPayment(tenantOccupancy.id, tenantOccupancy)
  }, [pendingPayments, tenantOccupancy, familyPaidBills, paymentHistory])

  async function checkPendingReviews(userId) {
    // Fetch ended occupancies that haven't been dismissed for review
    const { data: endedOccupancies } = await supabase
      .from('tenant_occupancies')
      .select('*, property:properties(id, title)')
      .eq('tenant_id', userId)
      .eq('status', 'ended')
      .neq('review_dismissed', true)
      .order('created_at', { ascending: false })

    if (!endedOccupancies || endedOccupancies.length === 0) return

    const { data: existingReviews } = await supabase.from('reviews').select('occupancy_id').eq('user_id', userId)
    const reviewedOccupancyIds = existingReviews?.map(r => r.occupancy_id) || []

    // Find first occupancy that is ENDED and NOT REVIEWED
    const unreviewed = endedOccupancies.find(o =>
      !reviewedOccupancyIds.includes(o.id)
    )

    if (unreviewed) {
      setReviewTarget(unreviewed)
      setShowReviewModal(true)
    }
  }

  // Close the modal — if "don't show again" is checked, permanently dismiss in DB
  async function handleCancelReview() {
    if (dontShowReviewAgain && reviewTarget) {
      await supabase
        .from('tenant_occupancies')
        .update({ review_dismissed: true })
        .eq('id', reviewTarget.id)
    }
    setShowReviewModal(false)
    setDontShowReviewAgain(false)
  }

  // Skip Review — ALWAYS permanently dismisses the review in DB
  async function handleSkipReview() {
    if (reviewTarget) {
      await supabase
        .from('tenant_occupancies')
        .update({ review_dismissed: true })
        .eq('id', reviewTarget.id)
    }
    setShowReviewModal(false)
    setDontShowReviewAgain(false)
  }

  async function submitReview() {
    if (!reviewTarget) return
    setSubmittingReview(true)
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
    } else {
      showToast.success("Review submitted successfully!")
      setShowReviewModal(false)
      setCleanlinessRating(5)
      setCommunicationRating(5)
      setLocationRating(5)
      setReviewComment('')
      setDontShowReviewAgain(false)
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
      .select(`*, property:properties(id, title, address, city, images, price, terms_conditions), landlord:profiles!tenant_occupancies_landlord_id_fkey(id, first_name, middle_name, last_name)`)
      .eq('tenant_id', session.user.id)
      .in('status', ['active', 'pending_end'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let finalOccupancy = occupancy

    if (error) {
      console.error("Error fetching occupancy:", error)
      return null
    }

    if (!finalOccupancy) {
      // Check if user is a family member via API (bypasses RLS)
      try {
        const fmRes = await fetch(`/api/family-members?member_id=${session.user.id}`, { cache: 'no-store' })
        const fmData = await fmRes.json()
        if (fmData?.occupancy) {
          finalOccupancy = fmData.occupancy
          // Set payment data directly from API (bypasses RLS)
          if (fmData.pendingPayments) setPendingPayments(fmData.pendingPayments)
          if (fmData.paymentHistory) setPaymentHistory(fmData.paymentHistory)
          if (fmData.allPaidBills) setFamilyPaidBills(fmData.allPaidBills)
          if (fmData.tenantBalance !== undefined) setTenantBalance(fmData.tenantBalance)
          if (fmData.lastPaidBill !== undefined) setLastPayment(fmData.lastPaidBill)
          if (fmData.securityDepositPaid !== undefined) setSecurityDepositPaid(fmData.securityDepositPaid)
        }
      } catch (err) {
        console.error('Family member check error:', err)
      }
      if (!finalOccupancy) return null
    }

    setTenantOccupancy(finalOccupancy)

    if (finalOccupancy) {
      // Calculate days until contract end for renewal
      if (finalOccupancy.contract_end_date) {
        const endDate = new Date(finalOccupancy.contract_end_date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        endDate.setHours(0, 0, 0, 0)
        const diffTime = endDate - today
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        setDaysUntilContractEnd(diffDays)
        // Can only renew if:
        // 1. More than 29 days remaining (not in the last month block)
        // 2. Not already requested
        // 3. User is the primary tenant (not a family member)
        setCanRenew(diffDays > 29 && !finalOccupancy.renewal_requested && finalOccupancy.tenant_id === session?.user?.id)
        setRenewalRequested(finalOccupancy.renewal_requested || false)
      }

      const isOwn = finalOccupancy.tenant_id === session.user.id

      if (isOwn) {
        // Primary tenant: query via client
        // Fetch the LAST PAID BILL from payment_requests for proper due_date display
        const { data: lastPaidBill } = await supabase
          .from('payment_requests')
          .select('*')
          .eq('occupancy_id', finalOccupancy.id)
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
          .eq('occupancy_id', finalOccupancy.id)
          .eq('status', 'paid')
          .gt('security_deposit_amount', 0)
          .limit(1)
          .maybeSingle()

        setSecurityDepositPaid(!!paidSecurityDeposit)
      }
      // Family members: data was already set from the API response above

      // Determine if they are a family member
      setIsFamilyMember(!isOwn)
    }

    return finalOccupancy
  }

  // --- RENEWAL MEETING DATE STATE ---
  const [renewalMeetingDate, setRenewalMeetingDate] = useState('')

  async function requestContractRenewal() {
    if (!tenantOccupancy || !canRenew) return

    if (!renewalMeetingDate) {
      showToast.error("Please select a date to meet the landlord");
      return;
    }

    setSubmittingRenewal(true)

    const { error } = await supabase
      .from('tenant_occupancies')
      .update({
        renewal_requested: true,
        renewal_requested_at: new Date().toISOString(),
        renewal_status: 'pending',
        renewal_meeting_date: renewalMeetingDate
      })
      .eq('id', tenantOccupancy.id)

    setSubmittingRenewal(false)

    if (error) {
      showToast.error('Failed to request renewal')
      return
    }

    // Notify landlord (Internal)
    await createNotification({
      recipient: tenantOccupancy.landlord_id,
      actor: session.user.id,
      type: 'contract_renewal_request',
      message: `${profile.first_name} ${profile.last_name} has requested to renew contract. PROPOSED SIGNING DATE: ${new Date(renewalMeetingDate).toLocaleDateString()}.`,
      link: '/dashboard'
    })

    showToast.success('Renewal request submitted!')

    // Notify landlord (SMS & Email)
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'renewal_request',
          recordId: tenantOccupancy.id, // REQUIRED by notify.js
          landlordId: tenantOccupancy.landlord_id,
          tenantName: `${profile.first_name} ${profile.last_name}`.trim(),
          propertyTitle: tenantOccupancy.property?.title,
          proposedDate: renewalMeetingDate
        })
      })
    } catch (err) {
      console.error('Failed to send renewal notification:', err)
    }
    setRenewalRequested(true)
    setCanRenew(false)
    setShowRenewalModal(false)
    loadTenantOccupancy()
  }

  async function loadTenantBalance(occupancy) {
    const occupancyId = occupancy?.id
    const tenantId = occupancy?.tenant_id || session?.user?.id
    if (!session || !occupancyId) {
      setTenantBalance(0)
      return
    }
    // Try to get balance for current occupancy first
    const { data } = await supabase.from('tenant_balances').select('amount').eq('tenant_id', tenantId).eq('occupancy_id', occupancyId).maybeSingle()
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

  // ─── FAMILY MEMBERS FUNCTIONS ───
  async function loadFamilyMembers() {
    if (!tenantOccupancy) return
    // Only load family for the primary tenant (not family members themselves)
    // But if they are a family member, we use their parent_occupancy_id
    const occId = tenantOccupancy.is_family_member ? tenantOccupancy.parent_occupancy_id : tenantOccupancy.id
    if (!occId) return
    setLoadingFamily(true)
    try {
      const res = await fetch(`/api/family-members?occupancy_id=${occId}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.members) setFamilyMembers(data.members)
    } catch (err) {
      console.error('Failed to load family members:', err)
    }
    setLoadingFamily(false)
  }

  useEffect(() => {
    if (tenantOccupancy) loadFamilyMembers()
  }, [tenantOccupancy])

  async function searchFamilyMember(query) {
    if (!query || query.trim().length < 2) {
      setFamilySearchResults([])
      return
    }
    setFamilySearching(true)
    try {
      const excludeIds = [session.user.id, ...familyMembers.map(m => m.member_id)]
      const res = await fetch('/api/family-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', query: query.trim(), exclude_ids: excludeIds })
      })
      const data = await res.json()
      if (data.results) setFamilySearchResults(data.results)
    } catch (err) {
      console.error('Family search error:', err)
    }
    setFamilySearching(false)
  }

  useEffect(() => {
    if (!familySearchQuery.trim()) { setFamilySearchResults([]); return }
    const timer = setTimeout(() => searchFamilyMember(familySearchQuery), 400)
    return () => clearTimeout(timer)
  }, [familySearchQuery])

  useEffect(() => {
    if (!showFamilyModal) return

    const originalOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    function handleFamilyModalKeydown(event) {
      if (event.key === 'Escape') {
        setShowFamilyModal(false)
        setFamilySearchQuery('')
        setFamilySearchResults([])
        setFamilySearching(false)
      }
    }

    document.addEventListener('keydown', handleFamilyModalKeydown)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleFamilyModalKeydown)
    }
  }, [showFamilyModal])

  function openFamilyModal() {
    setFamilySearchQuery('')
    setFamilySearchResults([])
    setShowFamilyModal(true)
  }

  function closeFamilyModal() {
    setShowFamilyModal(false)
    setFamilySearchQuery('')
    setFamilySearchResults([])
    setFamilySearching(false)
  }

  async function addFamilyMember(memberId) {
    if (!tenantOccupancy || isFamilyMember) return
    setAddingMember(memberId)
    try {
      const res = await fetch('/api/family-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          parent_occupancy_id: tenantOccupancy.id,
          member_id: memberId,
          mother_id: session.user.id
        })
      })
      const data = await res.json()
      if (data.success) {
        showToast.success('Family member added successfully!')
        setFamilySearchQuery('')
        setFamilySearchResults([])
        loadFamilyMembers()
      } else {
        showToast.error(data.error || 'Failed to add family member')
      }
    } catch (err) {
      showToast.error('Failed to add family member')
    }
    setAddingMember(null)
  }

  async function removeFamilyMember(familyMemberId) {
    if (!tenantOccupancy || isFamilyMember) return
    setRemovingMember(familyMemberId)
    try {
      const res = await fetch('/api/family-members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family_member_id: familyMemberId,
          mother_id: session.user.id
        })
      })
      const data = await res.json()
      if (data.success) {
        showToast.success('Family member removed')
        loadFamilyMembers()
      } else {
        showToast.error(data.error || 'Failed to remove family member')
      }
    } catch (err) {
      showToast.error('Failed to remove family member')
    }
    setRemovingMember(null)
    setConfirmRemoveMember(null)
  }

  const getPropertyImages = (property) => {
    if (property.images && Array.isArray(property.images) && property.images.length > 0) return property.images
    return []
  }

  const renderPropertyCard = ({ property, images, currentIndex, isSelectedForCompare, isFavorite, stats }) => (
    <div
      className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer flex flex-col h-full card-hover ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100 hover:border-gray-300'}`}
      onClick={() => router.push(`/properties/${property.id}`)}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 rounded-2xl">
        <img src={images[currentIndex]} alt={property.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
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
            <div className="flex flex-wrap items-center gap-1.5 min-w-0 pr-1">
              <h3 className="text-xs sm:text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
              {mostFavoriteId && property.id === mostFavoriteId && (
                <span className="shrink-0 px-1 py-0.5 bg-rose-100 text-rose-600 border border-rose-200 text-[8px] font-bold rounded uppercase tracking-wider">
                  Most Favorite
                </span>
              )}
              {topRatedId && property.id === topRatedId && (
                <span className="shrink-0 px-1 py-0.5 bg-amber-100 text-amber-600 border border-amber-200 text-[8px] font-bold rounded uppercase tracking-wider">
                  Top Rated
                </span>
              )}
            </div>
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
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col scroll-smooth">
      <div className="max-w-[1800px] w-full mx-auto mt-0 px-4 sm:px-6 lg:px-8 pt-2 relative z-10 flex-1">

        {tenantOccupancy ? (
          /* --- ACTIVE PROPERTY SECTION (MANAGEMENT VIEW) --- */
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-4">

              {/* Left Column: Property Details & Support (Minimized) */}
              <div className="lg:col-span-4 space-y-6">

                {/* Active Property Card */}
                <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                      </div>
                      Active Property
                    </h2>
                    <button
                      onClick={() => router.push('/properties/allProperties')}
                      className="text-[10px] font-bold text-slate-500 hover:text-black hover:underline cursor-pointer uppercase tracking-wider bg-gray-50 px-2 py-1 rounded"
                    >
                      See More Properties
                    </button>
                  </div>

                  <div className="flex flex-col gap-4">
                    {/* Image & Details */}
                    <div className="flex items-center gap-4">
                      {tenantOccupancy.property?.images?.length > 0 ? (
                        <div className="w-[85px] h-[85px] shrink-0 rounded-2xl overflow-hidden shadow-sm border border-gray-100 bg-gray-50">
                          <img src={tenantOccupancy.property.images[activePropertyImageIndex]} alt="Property" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-[85px] h-[85px] shrink-0 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400">
                          <svg className="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight line-clamp-1 mb-0.5">{tenantOccupancy.property?.title}</h1>
                        <p className="text-gray-500 text-[11px] flex items-start gap-1 font-medium mb-1.5">
                          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          <span className="line-clamp-2 leading-snug">{tenantOccupancy.property?.city}, {tenantOccupancy.property?.address}</span>
                        </p>
                        <span className={`self-start px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide border ${tenantOccupancy.status === 'pending_end' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-[#E3F6ED] text-[#1E9A5B] border-[#1E9A5B]/20'} shadow-sm`}>
                          {tenantOccupancy.status === 'pending_end' ? 'Move-out Pending' : 'Active Lease'}
                        </span>
                      </div>
                    </div>

                    {/* Expiration date */}
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col gap-1.5 mt-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Lease Start</span>
                        <span className="text-gray-900 text-xs font-bold font-mono">
                          {new Date(tenantOccupancy.start_date || tenantOccupancy.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                        </span>
                      </div>
                      {tenantOccupancy.contract_end_date && (
                        <div className="flex justify-between items-center border-t border-gray-200 pt-1.5">
                          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Lease Ends</span>
                          <span className="text-gray-900 text-xs font-bold font-mono">
                            {new Date(tenantOccupancy.contract_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Buttons Grid */}
                    <div className="flex flex-col gap-2 mt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => router.push(`/properties/${tenantOccupancy.property?.id}`)} className="py-2.5 text-xs bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer items-center justify-center flex text-center">Details</button>
                        {tenantOccupancy?.contract_url && <a href={tenantOccupancy.contract_url} target="_blank" rel="noopener noreferrer" className="py-2.5 text-xs bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:bg-gray-50 shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Contract</a>}
                        {tenantOccupancy.property?.terms_conditions && <a href={tenantOccupancy.property.terms_conditions.startsWith('http') ? tenantOccupancy.property.terms_conditions : '/terms'} target="_blank" rel="noopener noreferrer" className="col-span-1 py-2.5 text-xs bg-white text-gray-800 font-bold rounded-xl border border-gray-200 hover:bg-gray-50 shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Terms</a>}
                        {canRenew && !isFamilyMember && <button onClick={() => setShowRenewalModal(true)} className="col-span-1 py-2.5 text-xs bg-[#3B82F6] text-white font-bold rounded-xl hover:bg-blue-600 border border-transparent shadow-sm shadow-blue-500/30 transition-colors cursor-pointer whitespace-nowrap text-center">Renew</button>}
                        {!isFamilyMember && <button onClick={() => setShowEndRequestModal(true)} className="col-span-1 py-2.5 text-[11px] uppercase tracking-wider bg-white text-red-500 font-bold rounded-xl border border-red-100 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors cursor-pointer text-center">End Contract</button>}
                      </div>
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

                {/* Family Members Section */}
                <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm">Family Members</h3>
                        <p className="text-[10px] text-gray-400">{familyMembers.length + 1}/5 members</p>
                      </div>
                    </div>
                    {!isFamilyMember && familyMembers.length < 4 && (
                      <button
                        onClick={openFamilyModal}
                        className="text-[10px] font-bold text-black-600 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-full transition-colors cursor-pointer border border-gray-200"
                      >
                        + Add Member
                      </button>
                    )}
                  </div>

                  {/* Primary Tenant (Mother) */}
                  <div className="p-2.5 bg-gradient-to-r from-gray-50 to-gray-50 rounded-xl border border-gray-100 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gray-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                        {isFamilyMember
                          ? (tenantOccupancy?.tenant?.avatar_url
                            ? <img src={tenantOccupancy.tenant.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                            : `${tenantOccupancy?.tenant?.first_name?.[0] || ''}${tenantOccupancy?.tenant?.last_name?.[0] || ''}`)
                          : (profile?.avatar_url
                            ? <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                            : `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`)
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">
                          {isFamilyMember
                            ? `${tenantOccupancy?.tenant?.first_name || ''} ${tenantOccupancy?.tenant?.last_name || ''}`.trim() || 'Primary Tenant'
                            : `${profile.first_name} ${profile.last_name}`}
                        </p>
                        <p className="text-[10px] text-gray-600 font-semibold">Primary Tenant</p>
                      </div>
                      <span className="text-[9px] font-bold bg-gray-200 text-black-800 px-2 py-0.5 rounded-full">Owner</span>
                    </div>
                  </div>

                  {/* Members List */}
                  {loadingFamily ? (
                    <div className="text-center py-3">
                      <div className="w-5 h-5 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : familyMembers.length > 0 ? (
                    <div className="space-y-1.5">
                      {familyMembers.map((fm) => (
                        <div key={fm.id} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 transition-all group">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-bold text-[10px] shadow-sm">
                              {fm.member_profile?.avatar_url ? (
                                <img src={fm.member_profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                              ) : (
                                `${fm.member_profile?.first_name?.[0] || ''}${fm.member_profile?.last_name?.[0] || ''}`
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-gray-900 truncate">
                                {fm.member_profile?.first_name} {fm.member_profile?.last_name}
                              </p>
                              <p className="text-[10px] text-gray-400 truncate">{fm.member_profile?.email}</p>
                            </div>
                            {!isFamilyMember && (
                              confirmRemoveMember === fm.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => removeFamilyMember(fm.id)}
                                    disabled={removingMember === fm.id}
                                    className="text-[9px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-md cursor-pointer border border-red-200 disabled:opacity-50"
                                  >
                                    {removingMember === fm.id ? '...' : 'Yes'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmRemoveMember(null)}
                                    className="text-[9px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-md cursor-pointer"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmRemoveMember(fm.id)}
                                  className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-red-500 hover:text-red-700 transition-all cursor-pointer p-1"
                                  title="Remove family member"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-3">
                      <p className="text-[11px] text-gray-400">No family members added yet.</p>
                    </div>
                  )}

                  {isFamilyMember && (
                    <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        You are a family member. Only the primary tenant can manage family members and end the contract.
                      </p>
                    </div>
                  )}
                </div>

                {/* Add Family Member Modal */}
                {showFamilyModal && (
                  <div
                    className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto px-4 py-5 sm:items-center sm:px-6 sm:py-8"
                    onClick={closeFamilyModal}
                  >
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[4px]" />
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="family-member-modal-title"
                      className="relative isolate my-auto flex w-full max-w-[460px] max-h-[min(720px,calc(100vh-2.5rem))] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_30px_60px_-12px_rgba(15,23,42,0.35)] animate-in fade-in duration-150"
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Modal Header */}
                      <div className="bg-gray-900 px-5 py-5 sm:px-7 sm:py-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-4">
                            <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white shadow-sm">
                              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                            </div>
                            <div className="min-w-0">
                              <p id="family-member-modal-title" className="text-white font-black text-[22px] tracking-[-0.02em] leading-[1.15]">
                                Add Family Member
                              </p>
                              <p className="mt-1 text-[13px] font-medium text-white/80">{familyMembers.length}/4 slots used</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={closeFamilyModal}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white shadow-sm transition-all hover:bg-white/30 cursor-pointer"
                            aria-label="Close add family member modal"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>

                      {/* Search Input */}
                      <div className="border-b border-gray-100 bg-white px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
                        <div className="relative mb-3">
                          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-all focus-within:border-slate-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-900/10">
                            <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input
                              type="text"
                              placeholder="Search by name or email..."
                              value={familySearchQuery}
                              onChange={e => setFamilySearchQuery(e.target.value)}
                              className="h-14 w-full rounded-[24px] border-0 bg-transparent pl-12 pr-12 text-[15px] font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:outline-none focus:ring-0"
                              autoFocus
                            />
                          </div>
                          {familySearching && (
                            <div className="absolute right-5 top-1/2 -translate-y-1/2">
                              <div className="w-5 h-5 border-[3px] border-gray-900/30 border-t-gray-900 rounded-full animate-spin"></div>
                            </div>
                          )}
                        </div>
                        <p className="ml-2 text-[12px] font-medium text-slate-400">Only tenant accounts will appear in results.</p>
                      </div>

                      {/* Search Results */}
                      <div className="min-h-[240px] flex-1 overflow-y-auto bg-[#fafafa]">
                        {familySearchResults.length > 0 ? (
                          <div className="p-4 space-y-2">
                            {familySearchResults.map(user => (
                              <div key={user.id} className="p-3 bg-white rounded-[20px] border border-gray-200 hover:border-gray-400 hover:shadow-md transition-all shadow-sm">
                                <div className="flex items-center gap-3">
                                  <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm border border-gray-200/50">
                                    {user.avatar_url ? (
                                      <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                      `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[15px] font-bold text-gray-900 truncate tracking-tight">
                                      {user.first_name} {user.middle_name && user.middle_name.toLowerCase() !== 'n/a' ? user.middle_name + ' ' : ''}{user.last_name}
                                    </p>
                                    <p className="text-[12px] font-medium text-gray-500 truncate">{user.email}</p>
                                    {user.phone && <p className="text-[10px] text-gray-400 mt-0.5">{user.phone}</p>}
                                  </div>
                                  <button
                                    onClick={() => addFamilyMember(user.id)}
                                    disabled={addingMember === user.id}
                                    className="text-[13px] font-bold text-white bg-gray-900 hover:bg-black px-5 py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 shadow-md flex-shrink-0"
                                  >
                                    {addingMember === user.id ? (
                                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    ) : 'Add'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : familySearchQuery.trim().length >= 2 && !familySearching ? (
                          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-gray-100 text-[#9ca3af] flex items-center justify-center mb-4 shadow-sm">
                              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </div>
                            <p className="text-[17px] font-bold text-gray-700 tracking-tight">No tenant accounts found</p>
                            <p className="text-[13px] font-medium text-[#9ca3af] mt-1.5">Try a different name or email</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mb-4 shadow-sm">
                              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <p className="text-[17px] font-bold text-[#64748b] tracking-tight">Search for a tenant</p>
                            <p className="text-[13px] font-medium text-[#94a3b8] mt-1.5">Type at least 2 characters to search</p>
                          </div>
                        )}
                      </div>

                      {/* Footer Note */}
                      <div className="border-t border-gray-100 bg-white px-5 py-4 sm:px-6 sm:py-5">
                        <p className="text-center text-[13px] font-medium leading-[1.6] text-[#64748b]">
                          Note: Family members will have access to payments and maintenance for this property.
                          They cannot end the contract, renew contract.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Right Column: Financials & Pending Payments */}
              <div className="lg:col-span-8 space-y-6">

                {/* All Payments Section */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">

                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-lg">Recent Payments</h3>
                      {pendingPayments.length > 0 && (
                        <span className="bg-red-50 text-orange-600 text-xs font-bold px-2.5 py-1 rounded-full border border-red-100">
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
                    <div className="space-y-3 mb-9">
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
                              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-black border border-slate-100 shadow-sm shrink-0">
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
                    <div className="text-center py-3 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 mb-4">
                      <div className="w-12 h-12 bg-green-300 text-black-600 rounded-full flex items-center justify-center mx-auto mb-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <p className="text-sm text-slate-500 font-medium">No pending payments. You're all caught up!</p>
                    </div>
                  )}
                  <p className="text-sm text-slate-500 font-medium">Note: Please ensure all electricity and wifi bills are paid before the due date. The landlord is not liable for late payments.</p>


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
                            {nextPaymentDate ? (
                              <p className="text-lg font-black text-slate-900">{nextPaymentDate}</p>
                            ) : (
                              <p className="text-lg font-black text-slate-900 flex items-center gap-1">
                                Loading <span className="flex items-center"><span className="animate-pulse delay-75">.</span><span className="animate-pulse delay-150">.</span><span className="animate-pulse delay-300">.</span></span>
                              </p>
                            )}
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
                                    {canRenew && !isFamilyMember && (
                                      <p
                                        onClick={() => setShowRenewalModal(true)}
                                        className="text-xs font-bold flex items-center gap-1 text-indigo-600 cursor-pointer hover:underline"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        Renew Contract Available
                                      </p>
                                    )}
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
                    {/* <div className="bg-gray-50 rounded-2xl p-5 border border-slate-100"> */}
                    {/* <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-white text-slate-600 rounded-lg shadow-sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <h3 className="font-bold text-slate-900 text-sm">Rent Payment History ({new Date().getFullYear()})</h3>
                        </div>
                      </div> */}

                    {/* Redesigned Month Tracker */}
                    {/* <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-2"> */}
                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => {
                      // const currentYear = new Date().getFullYear();
                      // const isPaid = paymentHistory.some(p => {
                      //   if (!p.due_date || parseFloat(p.rent_amount) <= 0) return false;

                      //   const d = new Date(p.due_date);
                      //   const pMonth = d.getMonth();
                      //   const pYear = d.getFullYear();

                      //   // Use advance_amount to determine if this bill covers future months
                      //   const advance = parseFloat(p.advance_amount || 0);
                      //   const rent = parseFloat(p.rent_amount || 0);
                      //   let monthsCovered = 1; // Default covers the due_date month

                      //   if (advance > 0 && rent > 0) {
                      //     monthsCovered += Math.floor(advance / rent);
                      //   }

                      //   // Calculate start and end month indices relative to the payment start
                      //   const targetAbsoluteMonth = currentYear * 12 + index;
                      //   const paymentStartAbsoluteMonth = pYear * 12 + pMonth;
                      //   const paymentEndAbsoluteMonth = paymentStartAbsoluteMonth + monthsCovered - 1;

                      //   return targetAbsoluteMonth >= paymentStartAbsoluteMonth && targetAbsoluteMonth <= paymentEndAbsoluteMonth;
                      // });

                      // const isActiveMonth = new Date().getMonth() === index;

                      // return (
                      //   <div key={month} className="flex flex-col items-center justify-center p-2">
                      //     <span className={`text-[10px] font-bold uppercase mb-1.5 ${isPaid ? 'text-black' : 'text-gray-400'}`}>
                      //       {month}
                      //     </span>

                      //     {isPaid ? (
                      //       <div className="w-5 h-5 rounded-full bg-green-300 text-black flex items-center justify-center shadow-sm">
                      //         <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      //           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      //         </svg>
                      //       </div>
                      //     ) : isActiveMonth ? (
                      //       <div className="w-5 h-5 rounded-full border-2 border-black flex items-center justify-center">
                      //         <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
                      //       </div>
                      //     ) : (
                      //       <div className="w-5 h-5 rounded-full border border-gray-200"></div>
                      //     )}
                      //   </div>
                      // )
                    })}
                    {/* </div> */}
                    {/* </div> */}
                  </div>
                </div>
              </div>
            </div>
          </div >
        ) : (
          /* --- ALL PROPERTIES SECTION (DISCOVERY VIEW) --- */
          <div className="space-y-8">
            {/* All Properties Section */}
            <div className={`mb-0 mt-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center mb-2 gap-3">
                <h2 className="text-2xl font-black text-black shrink-0">Recommended Properties</h2>
                <div className="flex items-center gap-3 w-full sm:w-auto sm:flex-1 sm:max-w-md lg:max-w-lg">
                  <div className="relative flex-1" ref={searchRef}>
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                      {isSearching ? (
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin"></div>
                      ) : (
                        <svg className="text-gray-400 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Search properties, cities..."
                      className="w-full bg-white border border-gray-200 rounded-full focus:ring-2 focus:ring-black/20 focus:border-gray-400 font-medium pl-11 pr-10 py-3 text-sm transition-all duration-300 hover:border-gray-300 hover:shadow-md focus:shadow-md placeholder:text-gray-400 shadow-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => searchResults.length > 0 && setShowSearchDropdown(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchQuery.trim()) handleSearch()
                        if (e.key === 'Escape') setShowSearchDropdown(false)
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearchDropdown(false) }}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-900 transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                    {/* Search Dropdown */}
                    {showSearchDropdown && searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50" style={{ animationDuration: '0.2s' }}>
                        <div className="p-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Search Results</p>
                          {searchResults.map((property) => (
                            <div
                              key={property.id}
                              onClick={() => { router.push(`/properties/${property.id}`); setShowSearchDropdown(false) }}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-all duration-200 group"
                            >
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                {property.images?.[0] ? (
                                  <img src={property.images[0]} alt={property.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{property.title}</p>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <span>{property.city}</span>
                                  <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                  <span className="font-bold text-gray-900">₱{Number(property.price).toLocaleString()}/mo</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-gray-100 p-2">
                          <button
                            onClick={() => { handleSearch(); setShowSearchDropdown(false) }}
                            className="w-full text-center py-2 text-sm font-bold text-gray-900 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                          >
                            View all results for "{searchQuery}"
                          </button>
                        </div>
                      </div>
                    )}
                    {showSearchDropdown && searchQuery.trim() && searchResults.length === 0 && !isSearching && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 p-4 text-center">
                        <p className="text-sm font-medium text-gray-500">No properties found for "{searchQuery}"</p>
                      </div>
                    )}
                  </div>
                </div>

                <span onClick={handleSeeMore} className="text-sm font-semibold text-black hover:text-gray-600 cursor-pointer flex items-center gap-1 hover:underline transition-all shrink-0 ml-auto">
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
                          {renderPropertyCard({
                            property: item, images: getPropertyImages(item),
                            currentIndex: currentImageIndex[item.id] || 0,
                            isSelectedForCompare: comparisonList.some(p => p.id === item.id),
                            isFavorite: favorites.includes(item.id),
                            stats: propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
                          })}
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
                            {renderPropertyCard({
                              property: item,
                              images,
                              currentIndex,
                              isSelectedForCompare,
                              isFavorite,
                              stats
                            })}
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
                            {renderPropertyCard({
                              property: item,
                              images,
                              currentIndex,
                              isSelectedForCompare,
                              isFavorite,
                              stats
                            })}
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
        )
        }

      </div >

      {/* Floating Compare Button */}
      {
        comparisonList.length > 0 && (
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
        )
      }

      {/* End Request Modal */}
      {
        showEndRequestModal && tenantOccupancy && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold mb-4">Request to Leave</h3>

              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-1">Date when*</label>
                <input
                  type="date"
                  value={endRequestDate}
                  min={new Date().toISOString().split('T')[0]}
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
                <button onClick={() => setShowEndRequestModal(false)} className="flex-1 py-2 bg-gray-100 rounded-xl cursor-pointer hover:bg-gray-200 transition-colors">Cancel</button>
                <button
                  onClick={requestEndOccupancy}
                  disabled={submittingEndRequest}
                  className={`flex-1 py-2 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${submittingEndRequest ? 'bg-black/70 cursor-not-allowed' : 'bg-black hover:bg-gray-800 cursor-pointer'}`}
                >
                  {submittingEndRequest ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Submitting...
                    </>
                  ) : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Review Modal */}
      {
        showReviewModal && reviewTarget && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCancelReview}>
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto relative" style={{ animation: 'reviewModalIn 0.25s ease-out' }} onClick={e => e.stopPropagation()}>

              {/* Close (X) Button — just closes, doesn't permanently dismiss */}
              <button
                onClick={handleCancelReview}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-600">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">How was your stay?</h2>
                <p className="text-gray-500 text-sm">You recently ended your contract at <strong>{reviewTarget.property?.title}</strong> ({new Date(reviewTarget.start_date || reviewTarget.created_at).toLocaleDateString()} - {new Date(reviewTarget.contract_end_date || reviewTarget.end_date || new Date()).toLocaleDateString()}). We&apos;d love to hear your feedback!</p>
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

              {/* Text Review (Optional) */}
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Write your experience here (optional)..."
                className="w-full p-4 border border-gray-200 rounded-xl mb-4 text-sm bg-gray-50 focus:bg-white focus:border-black outline-none resize-none h-28"
              />

              {/* Don't show again checkbox */}
              <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShowReviewAgain}
                  onChange={(e) => setDontShowReviewAgain(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black cursor-pointer"
                />
                <span className="text-sm text-gray-500">Don&apos;t show this again for this property</span>
              </label>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleSkipReview}
                  className="flex-1 py-3.5 rounded-xl font-bold border border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100 transition-all cursor-pointer"
                >
                  Skip Review
                </button>
                <button
                  onClick={submitReview}
                  disabled={submittingReview}
                  className={`flex-1 py-3.5 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 ${submittingReview ? 'bg-gray-400 cursor-not-allowed' : 'bg-black hover:bg-gray-800 hover:shadow-xl cursor-pointer'}`}
                >
                  {submittingReview ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Submitting...
                    </>
                  ) : 'Submit Review'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Review Modal Animation */}
      <style jsx>{`
        @keyframes reviewModalIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Contract Renewal Modal */}
      {
        showRenewalModal && tenantOccupancy && (
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
                  className={`flex-1 py-3 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all ${submittingRenewal ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'}`}
                >
                  {submittingRenewal ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Sending Request...
                    </>
                  ) : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      <Footer />
    </div >
  )
}
