import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { normalizeImageForUpload } from '../lib/imageCompression'
import { Input, Badge, Spinner } from './UI'
import { showToast } from 'nextjs-toast-notify'
import { useRouter } from 'next/router'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import {
  SUPPORT_TICKET_ISSUES,
  SUPPORT_TICKET_REQUEST_TYPES,
  SUPPORT_TICKET_STATUSES,
  formatSupportTicketId,
  getSupportOptionLabel
} from '../lib/supportTickets'

async function adminFetch(table, select = '*', filters = [], order = null, pagination = null, includeCount = false) {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const res = await fetch(`${baseUrl}/api/admin/list-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, select, filters, order, pagination, includeCount })
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to fetch data')
    if (includeCount) {
      return { data: json.data || [], count: json.count || 0 }
    }
    return json.data || []
  } catch (err) {
    console.error(`adminFetch failed for ${table}:`, err)
    throw err
  }
}

function useRealTimeClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  return now
}

function AnimatedCounter({ value, prefix = '', duration = 1200 }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const num = typeof value === 'number' ? value : parseInt(String(value).replace(/[^0-9]/g, '')) || 0
    if (num === 0) { setDisplay(0); return }
    let start = 0; const step = Math.ceil(num / (duration / 16))
    const timer = setInterval(() => { start += step; if (start >= num) { setDisplay(num); clearInterval(timer) } else setDisplay(start) }, 16)
    return () => clearInterval(timer)
  }, [value, duration])
  return <>{prefix}{display.toLocaleString()}</>
}

export default function AdminDashboard({ session, profile }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('overview')
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [showAdminProfileModal, setShowAdminProfileModal] = useState(false)
  const [pendingTicketsCount, setPendingTicketsCount] = useState(0)

  const navItems = [
    { id: 'overview', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { id: 'users', label: 'User Management', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'properties', label: 'All Properties', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { id: 'occupancies', label: 'Active Occupancy', icon: 'M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 'payments', label: 'Payment History', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'bookings', label: 'Bookings List', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'schedules', label: 'Schedule Days', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'maintenance', label: 'Maintenance', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    { id: 'leaves', label: 'Leave Pending monitoring', icon: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' },
    { id: 'support_tickets', label: 'Pending Tickets', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', badge: pendingTicketsCount },
  ]

  // Management Modals State
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState(null)
  const [paymentForm, setPaymentForm] = useState({
    tenant_id: '',
    property_id: '',
    landlord_id: '',
    rent_amount: 0,
    water_bill: 0,
    electrical_bill: 0,
    wifi_bill: 0,
    other_bills: 0,
    bills_description: '',
    due_date: '',
    status: 'pending'
  })

  const [showBookingEditModal, setShowBookingEditModal] = useState(false)
  const [editingBooking, setEditingBooking] = useState(null)
  const [bookingForm, setBookingForm] = useState({
    booking_date: '',
    status: 'pending'
  })

  const [showScheduleFormModal, setShowScheduleFormModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [scheduleForm, setScheduleForm] = useState({
    landlord_id: '',
    start_time: '',
    end_time: '',
    is_booked: false
  })

  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false)
  const [editingMaintenance, setEditingMaintenance] = useState(null)
  const [maintenanceForm, setMaintenanceForm] = useState({
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    category: 'general',
    attachment_urls: []
  })
  const [maintenanceUploading, setMaintenanceUploading] = useState(false)

  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [editingLeave, setEditingLeave] = useState(null)
  const [leaveForm, setLeaveForm] = useState({
    end_request_status: 'pending',
    end_request_reason: '',
    end_request_date: ''
  })

  const [showEndOccupancyConfirm, setShowEndOccupancyConfirm] = useState(false)
  const [occToEnd, setOccToEnd] = useState(null)
  const [landlords, setLandlords] = useState([])
  const [tenants, setTenants] = useState([])
  const [properties, setProperties] = useState([])
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const refresh = useCallback(() => setRefreshTrigger(prev => prev + 1), [])

  const loadPendingTicketsCount = useCallback(async () => {
    if (!session?.access_token) return

    try {
      const res = await fetch('/api/admin/support-tickets?status=pending', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load support tickets')
      setPendingTicketsCount(data.pendingCount || 0)
    } catch (error) {
      console.error('Failed to load pending support ticket count:', error)
    }
  }, [session?.access_token])

  useEffect(() => {
    loadPendingTicketsCount()
  }, [loadPendingTicketsCount, refreshTrigger])

  useEffect(() => {
    async function loadResources() {
      try {
        const { data: lData } = await supabase.from('profiles').select('id, first_name, last_name').eq('role', 'landlord').eq('is_deleted', false).order('first_name')
        setLandlords((lData || []).map(l => ({ id: l.id, name: `${l.first_name} ${l.last_name}` })))
        
        const { data: tData } = await supabase.from('profiles').select('id, first_name, last_name').eq('role', 'tenant').eq('is_deleted', false).order('first_name')
        setTenants((tData || []).map(t => ({ id: t.id, name: `${t.first_name} ${t.last_name}` })))

        const { data: pData } = await supabase.from('properties').select('id, title').order('title')
        setProperties(pData || [])
      } catch (e) { console.error(e) }
    }
    loadResources()
  }, [])

  async function handleLogout() {
    setShowLogoutModal(false)
    try {
      await supabase.auth.signOut()
      if (typeof window !== 'undefined') {
        localStorage.clear()
        sessionStorage.clear()
      }
      showToast.success("Logged out successfully")
      router.push('/')
    } catch (error) {
      showToast.error("Logout failed")
    }
  }

  // Action Handlers
  async function handleSavePayment() {
    try {
      const payload = {
        ...paymentForm,
        landlord: paymentForm.landlord_id,
        tenant: paymentForm.tenant_id,
        rent_amount: parseFloat(paymentForm.rent_amount) || 0,
        water_bill: parseFloat(paymentForm.water_bill) || 0,
        electrical_bill: parseFloat(paymentForm.electrical_bill) || 0,
        wifi_bill: parseFloat(paymentForm.wifi_bill) || 0,
        other_bills: parseFloat(paymentForm.other_bills) || 0,
        amount: (parseFloat(paymentForm.rent_amount) || 0) + 
                (parseFloat(paymentForm.water_bill) || 0) + 
                (parseFloat(paymentForm.electrical_bill) || 0) + 
                (parseFloat(paymentForm.wifi_bill) || 0) + 
                (parseFloat(paymentForm.other_bills) || 0)
      }
      delete payload.landlord_id
      delete payload.tenant_id

      let err;
      if (editingPayment) {
        const { error } = await supabase.from('payment_requests').update(payload).eq('id', editingPayment.id)
        err = error
      } else {
        const { error } = await supabase.from('payment_requests').insert([payload])
        err = error
      }

      if (err) throw err
      showToast.success(editingPayment ? "Payment updated" : "Payment created")
      setShowPaymentModal(false)
      setEditingPayment(null)
      refresh()
    } catch (error) {
      showToast.error(error.message)
    }
  }

  async function handleCancelPayment(id, currentStatus) {
    if (['paid', 'completed', 'cancelled'].includes(currentStatus)) {
      showToast.error(`Cannot cancel a payment that is already ${currentStatus}`)
      return
    }
    try {
      const { error } = await supabase.from('payment_requests').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
      showToast.success("Payment cancelled")
      refresh()
    } catch (error) {
      showToast.error(error.message)
    }
  }

  async function handleDeletePayment(id) {
    try {
      // 1. Delete associated payouts first to avoid foreign key constraint error
      await supabase.from('payouts').delete().eq('payment_request_id', id)
      
      // 2. Delete the payment request
      const { error } = await supabase.from('payment_requests').delete().eq('id', id)
      if (error) throw error
      
      showToast.success("Payment deleted")
      refresh()
    } catch (error) {
      showToast.error(error.message)
    }
  }

  async function handleSaveBooking() {
    try {
      const { error } = await supabase.from('bookings').update({
        booking_date: bookingForm.booking_date,
        status: bookingForm.status
      }).eq('id', editingBooking.id)
      if (error) throw error
      showToast.success("Booking updated/rescheduled successfully")
      setShowBookingEditModal(false)
      setEditingBooking(null)
      refresh()
    } catch (error) {
      showToast.error(error.message)
    }
  }

  async function handleCancelBooking(id, currentStatus) {
    if (['completed', 'cancelled'].includes(currentStatus)) {
      showToast.error(`Cannot cancel a booking that is already ${currentStatus}`)
      return
    }
    try {
      const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
      showToast.success("Booking cancelled")
      refresh()
    } catch (error) {
      showToast.error(error.message)
    }
  }

  async function handleSaveSchedule() {
    try {
      const payload = { ...scheduleForm }
      let err;
      if (editingSchedule) {
        const { error } = await supabase.from('available_time_slots').update(payload).eq('id', editingSchedule.id)
        err = error
      } else {
        const { error } = await supabase.from('available_time_slots').insert([payload])
        err = error
      }
      if (err) throw err
      showToast.success(editingSchedule ? "Schedule updated" : "Schedule created")
      setShowScheduleFormModal(false)
      setEditingSchedule(null)
      refresh()
    } catch (error) {
      showToast.error(error.message)
    }
  }

  async function handleSaveMaintenance() {
    try {
      setMaintenanceUploading(true)
      const payload = { ...maintenanceForm }
      let err;
      if (editingMaintenance) {
        const { error } = await supabase.from('maintenance_requests').update(payload).eq('id', editingMaintenance.id)
        err = error
      } else {
        const { error } = await supabase.from('maintenance_requests').insert([payload])
        err = error
      }
      if (err) throw err
      showToast.success(editingMaintenance ? "Request updated" : "Request created")
      setShowMaintenanceModal(false)
      setEditingMaintenance(null)
      refresh()
    } catch (error) {
      showToast.error(error.message)
    } finally {
      setMaintenanceUploading(false)
    }
  }

  async function handleMaintenanceFileUpload(e) {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    setMaintenanceUploading(true)
    try {
      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = `${session.user.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('maintenance-uploads')
          .upload(filePath, file)

        if (uploadError) throw uploadError

        const { data } = supabase.storage
          .from('maintenance-uploads')
          .getPublicUrl(filePath)

        return data.publicUrl
      })

      const newUrls = await Promise.all(uploadPromises)
      setMaintenanceForm(prev => ({
        ...prev,
        attachment_urls: [...(prev.attachment_urls || []), ...newUrls]
      }))
      showToast.success("Files uploaded")
    } catch (error) {
      showToast.error("Upload failed: " + error.message)
    } finally {
      setMaintenanceUploading(false)
    }
  }

  async function handleCancelMaintenance(id, currentStatus) {
    if (currentStatus === 'completed') {
      showToast.error("Cannot cancel a completed maintenance request")
      return
    }
    try {
      const { error } = await supabase.from('maintenance_requests').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
      showToast.success("Request cancelled")
      refresh()
    } catch (error) {
      showToast.error(error.message)
    }
  }

  async function handleDeleteMaintenance(id) {
    try {
      const { error } = await supabase.from('maintenance_requests').delete().eq('id', id)
      if (error) throw error
      showToast.success("Request deleted")
      refresh()
    } catch (error) {
      showToast.error(error.message)
    }
  }

  async function handleSaveLeave() {
    try {
      const { error } = await supabase.from('tenant_occupancies').update(leaveForm).eq('id', editingLeave.id)
      if (error) throw error
      showToast.success("Move-out request updated")
      setShowLeaveModal(false)
      setEditingLeave(null)
      refresh()
    } catch (error) {
      showToast.error(error.message)
    }
  }

  async function handleDeleteLeave(id) {
    try {
      console.log("Starting deletion for occupancy:", id)
      // 1. Get all payment requests associated with this occupancy
      const { data: payReqs, error: payReqError } = await supabase.from('payment_requests').select('id, payment_id').eq('occupancy_id', id).limit(10000)
      if (payReqError) throw payReqError
      const payReqIds = payReqs?.map(r => r.id) || []
      const paymentIds = payReqs?.map(r => r.payment_id).filter(Boolean) || []
      console.log(`Found ${payReqIds.length} payment requests and ${paymentIds.length} linked payment records`)

      // 2. Tenant-Centric Payout Cleanup
      console.log("Starting tenant-centric payout cleanup...")
      const { data: occInfo } = await supabase.from('tenant_occupancies').select('tenant_id').eq('id', id).single()
      const tenantId = occInfo?.tenant_id
      
      if (tenantId) {
        // Fetch all payouts for this tenant to manually check links
        const { data: tenantPayouts } = await supabase.from('payouts').select('id, payment_request_id, payment_id').eq('tenant_id', tenantId)
        
        const idsToDelete = tenantPayouts?.filter(p => 
          (p.payment_request_id && payReqIds.includes(p.payment_request_id)) || 
          (p.payment_id && paymentIds.includes(p.payment_id))
        ).map(p => p.id) || []
        
        if (idsToDelete.length > 0) {
          console.log(`Deleting ${idsToDelete.length} payouts for tenant ${tenantId}`)
          const { error: pdelError } = await supabase.from('payouts').delete().in('id', idsToDelete)
          if (pdelError) throw pdelError
        }
      }

      // 2.1 Direct Payout Cleanup (Safety net for payouts missing tenant_id or cross-linked)
      console.log("Performing direct payout cleanup by IDs...")
      if (payReqIds.length > 0) {
        const { error: prPayoutError } = await supabase.from('payouts').delete().in('payment_request_id', payReqIds)
        if (prPayoutError) console.warn("Direct payment_request_id payout delete failed:", prPayoutError)
      }
      if (paymentIds.length > 0) {
        const { error: pPayoutError } = await supabase.from('payouts').delete().in('payment_id', paymentIds)
        if (pPayoutError) console.warn("Direct payment_id payout delete failed:", pPayoutError)
      }
      
      console.log("Payouts cleanup completed")

      // 3. Delete tenant balances for this occupancy
      await supabase.from('tenant_balances').delete().eq('occupancy_id', id)
      console.log("Tenant balances cleanup attempted")

      // 4. Delete associated payment requests individually
      for (const reqId of payReqIds) {
        const { error: payDeleteError } = await supabase.from('payment_requests').delete().eq('id', reqId)
        if (payDeleteError) {
          console.warn(`Payment request ${reqId} blocked, trying deep cleanup...`)
          // Try to delete any payout that might still be lingering for this specific request
          await supabase.from('payouts').delete().eq('payment_request_id', reqId)
          const { error: retryError } = await supabase.from('payment_requests').delete().eq('id', reqId)
          if (retryError) throw retryError
        }
      }
      console.log("Payment requests cleanup completed")

      // 5. Delete associated family members
      await supabase.from('family_members').delete().eq('parent_occupancy_id', id)
      
      // 6. Finally delete the occupancy record
      const { error: occError } = await supabase.from('tenant_occupancies').delete().eq('id', id)
      if (occError) throw occError
      
      showToast.success("Occupancy and all associated records deleted")
      refresh()
    } catch (error) {
      console.error("Delete error:", error)
      showToast.error(error.message || "Failed to delete occupancy")
    }
  }


  async function handleEndOccupancyConfirm() {
    if (!occToEnd) return
    try {
      // 1. Update occupancy status to 'ended'
      const { error: occError } = await supabase.from('tenant_occupancies').update({ status: 'ended', end_date: new Date().toISOString() }).eq('id', occToEnd.id)
      if (occError) throw occError

      // 2. Mark property as available if it's not deleted
      if (occToEnd.property_id) {
        await supabase.from('properties').update({ status: 'available' }).eq('id', occToEnd.property_id)
      }

      showToast.success("Occupancy ended successfully")
      setShowEndOccupancyConfirm(false)
      setOccToEnd(null)
      refresh()
    } catch (error) {
      showToast.error(error.message)
    }
  }

  const clock = useRealTimeClock()
  const greeting = clock.getHours() < 12 ? 'Good Morning' : clock.getHours() < 17 ? 'Good Afternoon' : 'Good Evening'
  const currentLabel = navItems.find(n => n.id === activeTab)?.label || 'Overview'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)

  return (
    <div className="h-screen w-full flex flex-col md:flex-row font-sans bg-gray-50 [&_button]:cursor-pointer overflow-hidden">
      {/* SIDEBAR (Desktop) */}
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-56'} hidden md:flex flex-col flex-shrink-0 h-full z-20 transition-all duration-300 bg-black`}>
        <div className={`p-6 ${sidebarCollapsed ? 'px-4' : ''} flex items-center justify-between`}>
          {!sidebarCollapsed && (
            <h1 className="text-xl font-black tracking-tighter uppercase flex items-center gap-2">
              <span className="w-1 h-8 rounded-full bg-white"></span>
              <span className="text-white">Admin</span><span className="text-gray-400">TOOLS</span>
            </h1>
          )}
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 transition-all cursor-pointer">
            <svg className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto mt-2">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={sidebarCollapsed ? item.label : ''}
              className={`relative w-full flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2' : 'px-4'} py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${activeTab === item.id
                ? 'text-white bg-white/15'
                : 'text-gray-400'
                }`}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              {item.badge > 0 && (
                <span className={`${sidebarCollapsed ? 'absolute top-1 right-1' : 'ml-auto'} min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center`}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className={`p-4 border-t border-white/5 space-y-3 ${sidebarCollapsed ? 'px-2' : ''}`}>
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white bg-gray-600 flex-shrink-0">
              {profile?.first_name?.[0]}
            </div>
            {!sidebarCollapsed && (
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-white truncate">{profile?.first_name} {profile?.last_name}</p>
                <p className="text-[10px] text-gray-400 truncate uppercase tracking-wider font-bold">Administrator</p>
              </div>
            )}
          </div>
          <button onClick={() => setShowLogoutModal(true)} className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-center gap-2'} px-3 py-2.5 bg-red-700 text-black-700 rounded-xl text-xs font-bold transition-all cursor-pointer group border border-white-300`}>
            <svg className="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            {!sidebarCollapsed && 'Log Out'}
          </button>
        </div>
      </aside>

      {/* MOBILE NAV (Bottom Fixed) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-between px-4 py-3 pb-5 overflow-x-auto border-t border-gray-800 bg-black">
        {navItems.map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id)} className={`relative p-3 rounded-2xl transition-all cursor-pointer flex-shrink-0 ${activeTab === item.id ? 'text-white bg-white/15 transform -translate-y-1.5' : 'text-gray-500'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
            {item.badge > 0 && (
              <span className="absolute top-1 right-1 min-w-[1.1rem] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </button>
        ))}
        <button onClick={() => setShowLogoutModal(true)} className="p-3 rounded-2xl text-gray-700 cursor-pointer flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
        </button>
      </div>

      <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto overflow-x-hidden relative">
        <header className="hidden md:flex items-center justify-between px-8 py-5 bg-white border-b border-gray-200 sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <span>Admin</span><span>/</span><span className="text-gray-700 font-semibold">{currentLabel}</span>
            </div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">{greeting}, {profile?.first_name}</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900 tabular-nums">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <p className="text-[10px] text-gray-400 font-medium">{clock.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
            </div>
            <button 
              onClick={() => setShowAdminProfileModal(true)} 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm bg-gray-700 hover:bg-gray-800 transition-colors cursor-pointer"
              title="View Profile"
            >
              {profile?.first_name?.[0]}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 w-full max-w-[1400px] mx-auto">
          {activeTab === 'overview' && <OverviewView refreshTrigger={refreshTrigger} session={session} />}
          {activeTab === 'users' && <UsersView refreshTrigger={refreshTrigger} />}
          {activeTab === 'properties' && <PropertiesView refreshTrigger={refreshTrigger} />}
          {activeTab === 'occupancies' && <ActiveOccupanciesView refreshTrigger={refreshTrigger} />}
          {activeTab === 'payments' && (
            <PaymentsView 
              refreshTrigger={refreshTrigger} 
              setPaymentForm={setPaymentForm}
              setEditingPayment={setEditingPayment}
              setShowPaymentModal={setShowPaymentModal}
              handleCancelPayment={handleCancelPayment}
              handleDeletePayment={handleDeletePayment}
            />
          )}
          {activeTab === 'bookings' && (
            <BookingsView 
              refreshTrigger={refreshTrigger} 
              setBookingForm={setBookingForm}
              setEditingBooking={setEditingBooking}
              setShowBookingEditModal={setShowBookingEditModal}
              handleCancelBooking={handleCancelBooking}
            />
          )}
          {activeTab === 'schedules' && (
            <SchedulesView 
              refreshTrigger={refreshTrigger} 
              setScheduleForm={setScheduleForm}
              setEditingSchedule={setEditingSchedule}
              setShowScheduleFormModal={setShowScheduleFormModal}
            />
          )}
          {activeTab === 'maintenance' && (
            <MaintenanceMonitoringView 
              refreshTrigger={refreshTrigger} 
              setMaintenanceForm={setMaintenanceForm}
              setEditingMaintenance={setEditingMaintenance}
              setShowMaintenanceModal={setShowMaintenanceModal}
              handleCancelMaintenance={handleCancelMaintenance}
              handleDeleteMaintenance={handleDeleteMaintenance}
            />
          )}
          {activeTab === 'leaves' && (
            <LeaveMonitoringView 
              refreshTrigger={refreshTrigger} 
              setLeaveForm={setLeaveForm}
              setEditingLeave={setEditingLeave}
              setShowLeaveModal={setShowLeaveModal}
              handleDeleteLeave={handleDeleteLeave}
            />
          )}
          {activeTab === 'support_tickets' && (
            <PendingTicketsView
              session={session}
              refreshTrigger={refreshTrigger}
              onPendingCountChange={setPendingTicketsCount}
            />
          )}
        </main>
      </div>

      {/* MODALS */}
      {showAdminProfileModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-start md:items-center justify-center z-[100] p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl border border-gray-100 max-h-[92vh] overflow-hidden relative flex flex-col">
            <button 
              onClick={() => setShowAdminProfileModal(false)}
              className="absolute top-4 right-4 w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors cursor-pointer z-10"
              aria-label="Close profile modal"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="overflow-y-auto p-5 sm:p-7 md:p-8">
              <AdminProfileView session={session} profile={profile} />
            </div>
          </div>
        </div>
      )}
      {showPaymentModal && (
        <ManagementModal 
          title={editingPayment ? "Edit Payment Bill" : "Create Payment Bill"} 
          onClose={() => { setShowPaymentModal(false); setEditingPayment(null); }}
          onSave={handleSavePayment}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Tenant</label>
                <select className="w-full border rounded-xl px-3 py-2 text-sm" value={paymentForm.tenant_id} onChange={e => setPaymentForm({...paymentForm, tenant_id: e.target.value})}>
                  <option value="">Select Tenant</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Property</label>
                <select className="w-full border rounded-xl px-3 py-2 text-sm" value={paymentForm.property_id} onChange={e => setPaymentForm({...paymentForm, property_id: e.target.value})}>
                  <option value="">Select Property</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Landlord</label>
                <select className="w-full border rounded-xl px-3 py-2 text-sm" value={paymentForm.landlord_id} onChange={e => setPaymentForm({...paymentForm, landlord_id: e.target.value})}>
                  <option value="">Select Landlord</option>
                  {landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Due Date</label>
                <input type="date" className="w-full border rounded-xl px-3 py-2 text-sm" value={paymentForm.due_date} onChange={e => setPaymentForm({...paymentForm, due_date: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Rent</label>
                <input type="number" className="w-full border rounded-xl px-3 py-2 text-sm" value={paymentForm.rent_amount} onChange={e => setPaymentForm({...paymentForm, rent_amount: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Water</label>
                <input type="number" className="w-full border rounded-xl px-3 py-2 text-sm" value={paymentForm.water_bill} onChange={e => setPaymentForm({...paymentForm, water_bill: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Electric</label>
                <input type="number" className="w-full border rounded-xl px-3 py-2 text-sm" value={paymentForm.electrical_bill} onChange={e => setPaymentForm({...paymentForm, electrical_bill: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Description</label>
              <textarea className="w-full border rounded-xl px-3 py-2 text-sm" value={paymentForm.bills_description} onChange={e => setPaymentForm({...paymentForm, bills_description: e.target.value})} rows={3}></textarea>
            </div>
          </div>
        </ManagementModal>
      )}

      {showBookingEditModal && (
        <ManagementModal 
          title="Edit/Reschedule Booking" 
          onClose={() => { setShowBookingEditModal(false); setEditingBooking(null); }}
          onSave={handleSaveBooking}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Booking Date & Time</label>
              <input type="datetime-local" className="w-full border rounded-xl px-3 py-2 text-sm" value={bookingForm.booking_date ? new Date(bookingForm.booking_date).toISOString().slice(0, 16) : ''} onChange={e => setBookingForm({...bookingForm, booking_date: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm" value={bookingForm.status} onChange={e => setBookingForm({...bookingForm, status: e.target.value})}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        </ManagementModal>
      )}

      {showScheduleFormModal && (
        <ManagementModal 
          title={editingSchedule ? "Edit Schedule Slot" : "Create Schedule Slot"} 
          onClose={() => { setShowScheduleFormModal(false); setEditingSchedule(null); }}
          onSave={handleSaveSchedule}
        >
          <div className="space-y-4">
            {!editingSchedule && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Landlord</label>
                <select className="w-full border rounded-xl px-3 py-2 text-sm" value={scheduleForm.landlord_id} onChange={e => setScheduleForm({...scheduleForm, landlord_id: e.target.value})}>
                  <option value="">Select Landlord</option>
                  {landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Start Time</label>
                <input type="datetime-local" className="w-full border rounded-xl px-3 py-2 text-sm" value={scheduleForm.start_time ? new Date(scheduleForm.start_time).toISOString().slice(0, 16) : ''} onChange={e => setScheduleForm({...scheduleForm, start_time: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">End Time</label>
                <input type="datetime-local" className="w-full border rounded-xl px-3 py-2 text-sm" value={scheduleForm.end_time ? new Date(scheduleForm.end_time).toISOString().slice(0, 16) : ''} onChange={e => setScheduleForm({...scheduleForm, end_time: e.target.value})} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_booked" checked={scheduleForm.is_booked} onChange={e => setScheduleForm({...scheduleForm, is_booked: e.target.checked})} />
              <label htmlFor="is_booked" className="text-sm font-bold text-gray-700">Mark as Booked</label>
            </div>
          </div>
        </ManagementModal>
      )}

      {showMaintenanceModal && (
        <ManagementModal 
          title={editingMaintenance ? "Edit Maintenance Request" : "Create Maintenance Request"} 
          onClose={() => { setShowMaintenanceModal(false); setEditingMaintenance(null); }}
          onSave={handleSaveMaintenance}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Title</label>
              <input type="text" className="w-full border rounded-xl px-3 py-2 text-sm" value={maintenanceForm.title} onChange={e => setMaintenanceForm({...maintenanceForm, title: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm" value={maintenanceForm.status} onChange={e => setMaintenanceForm({...maintenanceForm, status: e.target.value})}>
                <option value="pending">Pending</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Priority</label>
                <select className="w-full border rounded-xl px-3 py-2 text-sm" value={maintenanceForm.priority} onChange={e => setMaintenanceForm({...maintenanceForm, priority: e.target.value})}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Category</label>
                <select className="w-full border rounded-xl px-3 py-2 text-sm" value={maintenanceForm.category} onChange={e => setMaintenanceForm({...maintenanceForm, category: e.target.value})}>
                  <option value="general">General</option>
                  <option value="plumbing">Plumbing</option>
                  <option value="electrical">Electrical</option>
                  <option value="appliance">Appliance</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Description</label>
              <textarea className="w-full border rounded-xl px-3 py-2 text-sm" value={maintenanceForm.description} onChange={e => setMaintenanceForm({...maintenanceForm, description: e.target.value})} rows={3}></textarea>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Proof Files (Images/Videos)</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {maintenanceForm.attachment_urls?.map((url, idx) => (
                  <div key={idx} className="relative group aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                    {url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/) ? (
                      <video src={url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={url} className="w-full h-full object-cover" alt="proof" />
                    )}
                    <button 
                      onClick={() => {
                        const newUrls = [...maintenanceForm.attachment_urls];
                        newUrls.splice(idx, 1);
                        setMaintenanceForm({...maintenanceForm, attachment_urls: newUrls});
                      }}
                      className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <a href={url} target="_blank" rel="noreferrer" className="absolute bottom-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <label className="relative flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 hover:border-gray-300 transition-all cursor-pointer">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  {maintenanceUploading ? 'Uploading...' : 'Add More Images/Videos'}
                  <input 
                    type="file" 
                    className="hidden" 
                    multiple 
                    accept="image/*,video/*" 
                    onChange={handleMaintenanceFileUpload} 
                    disabled={maintenanceUploading}
                  />
                </label>
              </div>
            </div>
          </div>
        </ManagementModal>
      )}

      {showLeaveModal && (
        <ManagementModal 
          title="Edit Move-out Request" 
          onClose={() => { setShowLeaveModal(false); setEditingLeave(null); }}
          onSave={handleSaveLeave}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm" value={leaveForm.end_request_status} onChange={e => setLeaveForm({...leaveForm, end_request_status: e.target.value})}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
                <option value="cancel_pending">Cancellation Requested</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Scheduled Move-out Date</label>
              <input type="date" className="w-full border rounded-xl px-3 py-2 text-sm" value={leaveForm.end_request_date} onChange={e => setLeaveForm({...leaveForm, end_request_date: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Reason</label>
              <textarea className="w-full border rounded-xl px-3 py-2 text-sm" value={leaveForm.end_request_reason} onChange={e => setLeaveForm({...leaveForm, end_request_reason: e.target.value})} rows={4}></textarea>
            </div>
          </div>
        </ManagementModal>
      )}

      {showEndOccupancyConfirm && (
        <DeleteModal 
          isOpen={showEndOccupancyConfirm} 
          onClose={() => setShowEndOccupancyConfirm(false)} 
          onConfirm={handleEndOccupancyConfirm} 
          title="End Occupancy" 
          message={`Are you sure you want to end the occupancy for ${occToEnd?.tenant?.first_name} ${occToEnd?.tenant?.last_name}? This will mark the property as available.`} 
        />
      )}

      <DeleteModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        title="Log Out"
        message="Are you sure you want to log out?"
        confirmText="Log Out"
      />
    </div>
  )
}


function DeleteModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete', zIndexClass = 'z-[70]' }) {
  if (!isOpen) return null;
  return (
    <div className={`fixed inset-0 ${zIndexClass} bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200`}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-7 text-center shadow-2xl mx-4 border border-gray-100">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </div>
        <h3 className="text-xl font-black text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-7 leading-relaxed">{message}</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={onClose} className="w-full py-3 bg-gray-50 border border-gray-200 text-gray-700 font-bold rounded-xl transition-all cursor-pointer">Cancel</button>
          <button onClick={onConfirm} className="w-full py-3 bg-black text-white font-bold rounded-xl transition-all cursor-pointer">{confirmText}</button>
        </div>
      </div>
    </div>
  )
}

function EmptyStateRow({ colSpan, message }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-16 text-center">
        <div className="flex flex-col items-center justify-center text-gray-400 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="font-semibold text-gray-400">{message}</p>
        </div>
      </td>
    </tr>
  )
}

// --- CHART HELPERS ---
const CHART_COLORS = ['#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#111827', '#4b5563']

function ChartCard({ title, data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col h-72 shadow-sm">
        <h4 className="font-bold text-gray-900 text-sm mb-4 text-center">{title}</h4>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm font-medium">No data</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col h-72 shadow-sm hover:shadow-lg transition-all duration-300">
      <h4 className="font-bold text-gray-900 text-sm mb-2 text-center">{title}</h4>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              isAnimationActive={false}
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              itemStyle={{ fontSize: '13px', fontWeight: 'bold', color: '#111827' }}
            />
            <Legend 
              verticalAlign="bottom" 
              height={40} 
              iconType="circle"
              wrapperStyle={{ fontSize: '11px', fontWeight: '600', color: '#4b5563', paddingTop: '10px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// --- SUB-VIEWS ---

function OverviewView({ refreshTrigger, session }) {
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [monthlyStatementReport, setMonthlyStatementReport] = useState(null)
  const [monthlyStatementLastRun, setMonthlyStatementLastRun] = useState(null)
  const [monthlyStatementLastSource, setMonthlyStatementLastSource] = useState(null)
  const [monthlyStatementHistory, setMonthlyStatementHistory] = useState([])
  const [remindersEnabled, setRemindersEnabled] = useState(true)
  const [togglingReminders, setTogglingReminders] = useState(false)
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false)
  const [bulkEmailRecipients, setBulkEmailRecipients] = useState('')
  const [bulkEmailSubject, setBulkEmailSubject] = useState('')
  const [bulkEmailBody, setBulkEmailBody] = useState('')
  const [sendingBulkEmail, setSendingBulkEmail] = useState(false)

  useEffect(() => { loadStats(); checkReminderStatus(); loadMonthlyStatementStatus(); }, [refreshTrigger, session?.access_token])

  async function checkReminderStatus() {
    try {
      const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'reminders_enabled').single()
      if (error) {
        console.warn("Could not fetch reminder status (table may not exist):", error.message)
        setRemindersEnabled(true)
        return
      }
      if (data) setRemindersEnabled(data.value === true || data.value === 'true')
    } catch (e) {
      console.error("Failed to load settings", e)
      setRemindersEnabled(true)
    }
  }

  async function loadMonthlyStatementStatus() {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['monthly_statements_last_run_at', 'monthly_statements_last_run_source', 'monthly_statements_run_history'])

      if (error || !data) return

      const map = Object.fromEntries((data || []).map((item) => [item.key, item.value]))
      setMonthlyStatementLastRun(map.monthly_statements_last_run_at || null)
      setMonthlyStatementLastSource(map.monthly_statements_last_run_source || null)

      const rawHistory = map.monthly_statements_run_history
      let parsedHistory = []
      if (Array.isArray(rawHistory)) {
        parsedHistory = rawHistory
      } else if (typeof rawHistory === 'string') {
        try {
          const parsed = JSON.parse(rawHistory)
          if (Array.isArray(parsed)) parsedHistory = parsed
        } catch {
          parsedHistory = []
        }
      }
      setMonthlyStatementHistory(parsedHistory.slice(0, 10))
    } catch {
      // Ignore read errors so dashboard remains usable.
    }
  }

  async function toggleReminders() {
    if (!confirm(`Are you sure you want to ${remindersEnabled ? 'STOP' : 'START'} sending automated reminders?`)) return

    setTogglingReminders(true)
    try {
      const newState = !remindersEnabled
      const res = await fetch('/api/admin/toggle-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: newState })
      })
      if (res.ok) {
        setRemindersEnabled(newState)
        showToast.success(`Reminders ${newState ? 'STARTED' : 'STOPPED'} successfully`)
      } else {
        showToast.error("Failed to toggle reminders")
      }
    } catch (e) {
      showToast.error("Error: " + e.message)
    } finally {
      setTogglingReminders(false)
    }
  }

  function resetBulkEmailForm() {
    setBulkEmailRecipients('')
    setBulkEmailSubject('')
    setBulkEmailBody('')
  }

  async function sendBulkEmailFromAdmin() {
    const parsedEmails = Array.from(
      new Set(
        bulkEmailRecipients
          .split(/[\n,;]+/)
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean)
      )
    )

    if (parsedEmails.length === 0) {
      showToast.error('Please add at least one recipient email')
      return
    }

    if (!bulkEmailSubject.trim() || !bulkEmailBody.trim()) {
      showToast.error('Subject and body are required')
      return
    }

    setSendingBulkEmail(true)
    try {
      const res = await fetch('/api/admin/send-bulk-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: parsedEmails,
          subject: bulkEmailSubject.trim(),
          body: bulkEmailBody.trim()
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send bulk email')
      }

      const failedCount = data.failed?.length || 0
      showToast.success(`Email sent: ${data.sent || 0} success, ${failedCount} failed`)

      if (failedCount > 0) {
        console.warn('Bulk email failures:', data.failed)
      }

      resetBulkEmailForm()
      setShowBulkEmailModal(false)
    } catch (err) {
      showToast.error(err.message || 'Failed to send bulk email')
    } finally {
      setSendingBulkEmail(false)
    }
  }

  async function loadStats() {
    setLoading(true)
    try {
      if (!session?.access_token) {
        setChartData(null)
        return
      }

      const res = await fetch(`/api/admin/overview-stats?refresh=${refreshTrigger}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load overview statistics')
      }

      setChartData(data.chartData || {})
    } catch (err) {
      console.error("Overview stats load failed:", err)
      setChartData({})
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-8 animate-in fade-in duration-500">


      {/* Analytics Charts */}
      {chartData && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 mb-8">
          <h3 className="font-bold text-lg mb-5 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            </span>
            Analytics Overview
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <ChartCard title="Total Users" data={chartData.users} />
            <ChartCard title="Bookings" data={chartData.bookings} />
            <ChartCard title="Properties" data={chartData.properties} />
            <ChartCard title="Maintenance" data={chartData.maintenance} />
            <ChartCard title="Pending Tickets" data={chartData.tickets} />
            <ChartCard title="Leave Pending" data={chartData.leaves} />
            <ChartCard title="Active Occupancy" data={chartData.occupancy} />
          </div>
        </div>
      )}

      {/* Automated Processes */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg mb-5 flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></span>
          Automated Processes
        </h3>
        <div className="flex flex-col lg:flex-row items-stretch gap-4 p-5 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex-1">
            <h4 className="font-bold text-gray-900 text-base">Monthly Statements</h4>
            <p className="text-sm text-gray-500 mt-1">Send payment statements to tenants and financial overviews to landlords via email.</p>
            <p className="text-xs text-gray-600 font-semibold mt-3 bg-gray-100 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full">
              Auto-sends via Supabase cron at end of month, 12:00 AM PH time / Click to send manually
            </p>
            {monthlyStatementLastRun && (
              <p className="text-xs text-gray-500 mt-2">
                Last run: {new Date(monthlyStatementLastRun).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                {' '}({monthlyStatementLastSource === 'pg_cron' ? 'cron' : 'manual'})
              </p>
            )}

            {monthlyStatementHistory.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 space-y-1.5">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Recent Run Records</p>
                {monthlyStatementHistory.map((item) => (
                  <div
                    key={item.id || `${item.runAt}-${item.source}`}
                    className="text-xs text-gray-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-t border-gray-100 pt-1.5 first:border-t-0 first:pt-0"
                  >
                    <span>
                      {item.runAt ? new Date(item.runAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown time'}
                      {' '}({item.source === 'pg_cron' ? 'cron' : 'manual'})
                    </span>
                    <span>
                      T: {item.tenants?.processed || 0}/{item.tenants?.total || 0} | L: {item.landlords?.processed || 0} | F: {(item.tenants?.failed || 0) + (item.landlords?.failed || 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={async (e) => {
              const btn = e.currentTarget
              const originalText = btn.innerText
              btn.innerText = 'Sending...'
              btn.disabled = true
              try {
                const res = await fetch('/api/admin/send-monthly-statements', { method: 'POST' })
                const data = await res.json()
                if (res.ok) {
                  setMonthlyStatementReport(data)
                  setMonthlyStatementLastRun(data.lastRunAt || null)
                  setMonthlyStatementLastSource(data.source || 'manual_admin')
                  if (Array.isArray(data.historyPreview)) {
                    setMonthlyStatementHistory(data.historyPreview)
                  }
                  showToast.success(`Sent to ${data.tenants?.processed || 0} tenants and ${data.landlords?.processed || 0} landlords`)
                }
                else { showToast.error(data.error || 'Failed to send statements') }
              } catch (err) { showToast.error("Failed to connect to server") }
              finally { btn.innerText = originalText; btn.disabled = false }
            }}
            className="self-center px-6 py-3 bg-gray-800 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            Send Now
          </button>
        </div>

        {monthlyStatementReport && (
          <div className="mt-4 p-5 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="font-bold text-gray-900">Last Monthly Statement Report</h5>
              <span className="text-xs font-semibold text-gray-600 bg-gray-200 px-2 py-1 rounded-full">{monthlyStatementReport.period}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-bold text-gray-900">Tenants</p>
                <p className="text-xs text-gray-500 mt-1">Processed: {monthlyStatementReport.tenants?.processed || 0} / {monthlyStatementReport.tenants?.total || 0}</p>
                <p className="text-xs text-gray-700 mt-1">Failed: {monthlyStatementReport.tenants?.errors?.length || 0}</p>
                {(monthlyStatementReport.tenants?.sentRecipients?.length || 0) > 0 && (
                  <div className="mt-2 max-h-28 overflow-y-auto text-xs text-gray-700 space-y-1">
                    {monthlyStatementReport.tenants.sentRecipients.map((r, i) => (
                      <p key={`tenant-sent-${i}`}>Sent: {r.email}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-bold text-gray-900">Landlords</p>
                <p className="text-xs text-gray-500 mt-1">Processed: {monthlyStatementReport.landlords?.processed || 0}</p>
                <p className="text-xs text-gray-700 mt-1">Skipped overlap: {monthlyStatementReport.landlords?.skippedTenantOverlap || 0}</p>
                <p className="text-xs text-gray-700 mt-1">Failed: {monthlyStatementReport.landlords?.errors?.length || 0}</p>
                {(monthlyStatementReport.landlords?.sentRecipients?.length || 0) > 0 && (
                  <div className="mt-2 max-h-28 overflow-y-auto text-xs text-gray-700 space-y-1">
                    {monthlyStatementReport.landlords.sentRecipients.map((r, i) => (
                      <p key={`landlord-sent-${i}`}>Sent: {r.email}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {(monthlyStatementReport.tenants?.errors?.length || 0) > 0 && (
              <div className="bg-gray-100 rounded-lg border border-gray-300 p-3 text-xs text-gray-700 max-h-28 overflow-y-auto space-y-1">
                {monthlyStatementReport.tenants.errors.map((e, i) => (
                  <p key={`tenant-err-${i}`}>Tenant error: {e.tenant || e.occupancyId || 'Unknown'} - {e.error}</p>
                ))}
              </div>
            )}

            {(monthlyStatementReport.landlords?.errors?.length || 0) > 0 && (
              <div className="bg-gray-100 rounded-lg border border-gray-300 p-3 text-xs text-gray-700 max-h-28 overflow-y-auto space-y-1">
                {monthlyStatementReport.landlords.errors.map((e, i) => (
                  <p key={`landlord-err-${i}`}>Landlord error: {e.landlord || e.landlordId || 'Unknown'} - {e.error}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reminder Toggle */}
        <div className="flex flex-col lg:flex-row items-stretch gap-4 p-5 bg-gray-50 rounded-xl border border-gray-200 mt-4">
          <div className="flex-1">
            <h4 className="font-bold text-gray-900 text-base">Payment Reminders</h4>
            <p className="text-sm text-gray-500 mt-1">Automatically email/SMS tenants about upcoming due dates.</p>
            <div className="mt-2">
              {remindersEnabled ? (
                <span className="text-xs text-gray-700 font-bold bg-gray-100 px-3 py-1.5 rounded-full flex items-center gap-1.5 w-fit">
                  <span className="w-2 h-2 rounded-full bg-gray-700 animate-pulse"></span> ACTIVE
                </span>
              ) : (
                <span className="text-xs text-gray-700 font-bold bg-gray-100 px-3 py-1.5 rounded-full flex items-center gap-1.5 w-fit">
                  <span className="w-2 h-2 rounded-full bg-black"></span> STOPPED
                </span>
              )}
            </div>
          </div>
          <button
            onClick={toggleReminders}
            disabled={togglingReminders}
            className={`self-center px-6 py-3 font-bold rounded-xl transition-all cursor-pointer min-w-[140px] whitespace-nowrap ${remindersEnabled
              ? 'bg-gray-100 text-gray-700 border border-gray-300'
              : 'text-white shadow-lg'
              }`}
            style={!remindersEnabled ? { backgroundColor: '#000000' } : {}}
          >
            {togglingReminders ? 'Processing...' : remindersEnabled ? 'Stop Reminders' : 'Start Reminders'}
          </button>
        </div>

        <div className="flex flex-col lg:flex-row items-stretch gap-4 p-5 bg-gray-50 rounded-xl border border-gray-200 mt-4">
          <div className="flex-1">
            <h4 className="font-bold text-gray-900 text-base">Bulk Email</h4>
            <p className="text-sm text-gray-500 mt-1">Compose and send one message to multiple email recipients.</p>
            <p className="text-xs text-gray-600 font-semibold mt-3 bg-gray-100 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full">
              Add recipients separated by comma, semicolon, or new line
            </p>
          </div>
          <button
            onClick={() => setShowBulkEmailModal(true)}
            className="self-center px-6 py-3 bg-black text-white font-bold rounded-xl transition-all cursor-pointer min-w-[170px] whitespace-nowrap"
          >
            Compose Bulk Email
          </button>
        </div>
      </div>

      {showBulkEmailModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[80] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-black text-gray-900">Send Bulk Email</h3>
              <button
                onClick={() => {
                  if (!sendingBulkEmail) {
                    setShowBulkEmailModal(false)
                  }
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 cursor-pointer"
                disabled={sendingBulkEmail}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Recipients</label>
                <textarea
                  rows={5}
                  value={bulkEmailRecipients}
                  onChange={(e) => setBulkEmailRecipients(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black focus:border-transparent outline-none resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={bulkEmailSubject}
                  onChange={(e) => setBulkEmailSubject(e.target.value)}
                  placeholder="Enter email subject"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Body</label>
                <textarea
                  rows={8}
                  value={bulkEmailBody}
                  onChange={(e) => setBulkEmailBody(e.target.value)}
                  placeholder="Write your message here..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black focus:border-transparent outline-none resize-y"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowBulkEmailModal(false)
                  resetBulkEmailForm()
                }}
                disabled={sendingBulkEmail}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-bold text-sm cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={sendBulkEmailFromAdmin}
                disabled={sendingBulkEmail}
                className="px-8 py-3 bg-black text-white rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {sendingBulkEmail ? 'Sending...' : 'Send Emails'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UsersView({ refreshTrigger }) {
  const USERS_PAGE_SIZE = 10
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [deleteId, setDeleteId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [slotRemovalConfirm, setSlotRemovalConfirm] = useState(null)
  const [newUserForm, setNewUserForm] = useState({ first_name: '', middle_name: '', last_name: '', email: '', phone: '', password: '', role: 'tenant', birthday: '', gender: '', avatar_url: '' })
  const [isCreating, setIsCreating] = useState(false)
  const [familySubscriptions, setFamilySubscriptions] = useState({})
  const [landlordSubscriptions, setLandlordSubscriptions] = useState({})
  const [addingSlotForUserId, setAddingSlotForUserId] = useState(null)
  const [addingPropertySlotForUserId, setAddingPropertySlotForUserId] = useState(null)
  const [removingSlotForUserId, setRemovingSlotForUserId] = useState(null)
  const [removingPropertySlotForUserId, setRemovingPropertySlotForUserId] = useState(null)

  useEffect(() => { setCurrentPage(1) }, [search, roleFilter])
  useEffect(() => { fetchUsers() }, [currentPage, search, roleFilter, refreshTrigger])

  async function fetchUsers() {
    setLoading(true)
    try {
      let query = supabase
        .from('profiles')
        .select('*, email', { count: 'exact' })
        .eq('is_deleted', false)
        .neq('role', 'admin')

      if (roleFilter !== 'all') {
        query = query.eq('role', roleFilter)
      }

      const term = search.trim()
      if (term) {
        const like = `%${term}%`
        query = query.or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      }

      const from = (currentPage - 1) * USERS_PAGE_SIZE
      const to = from + USERS_PAGE_SIZE - 1
      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)

      if (error) throw error
      setUsers(data || [])
      setTotalUsers(count || 0)
      await Promise.all([
        loadFamilySubscriptions(data || []),
        loadLandlordSubscriptions(data || [])
      ])
    } catch (error) {
      console.error(error)
      setUsers([])
      setTotalUsers(0)
      setFamilySubscriptions({})
      setLandlordSubscriptions({})
    }
    setLoading(false)
  }

  async function loadFamilySubscriptions(userRows) {
    const tenantIds = (userRows || []).filter((u) => u.role === 'tenant').map((u) => u.id)
    if (!tenantIds.length) {
      setFamilySubscriptions({})
      return
    }

    try {
      const response = await fetch('/api/admin/family-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stats', tenantIds })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to load family subscriptions')
      setFamilySubscriptions(data.stats || {})
    } catch (error) {
      console.error('Failed to load family subscriptions:', error)
      setFamilySubscriptions({})
    }
  }

  async function loadLandlordSubscriptions(userRows) {
    const landlordIds = (userRows || []).filter((u) => u.role === 'landlord').map((u) => u.id)
    if (!landlordIds.length) {
      setLandlordSubscriptions({})
      return
    }

    try {
      const response = await fetch('/api/admin/landlord-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stats', landlordIds })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to load landlord subscriptions')
      setLandlordSubscriptions(data.stats || {})
    } catch (error) {
      console.error('Failed to load landlord subscriptions:', error)
      setLandlordSubscriptions({})
    }
  }

  async function addFamilySlot(userId) {
    if (!userId) return
    setAddingSlotForUserId(userId)
    try {
      const response = await fetch('/api/admin/family-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-slot', tenantId: userId })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to add family slot')

      showToast.success(data.message || 'Family slot added successfully')
      await fetchUsers()
    } catch (error) {
      showToast.error(error.message || 'Failed to add family slot')
    }
    setAddingSlotForUserId(null)
  }

  async function addPropertySlot(userId) {
    if (!userId) return
    setAddingPropertySlotForUserId(userId)
    try {
      const response = await fetch('/api/admin/landlord-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-slot', landlordId: userId })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to add property slot')

      showToast.success(data.message || 'Property slot added successfully')
      await fetchUsers()
    } catch (error) {
      showToast.error(error.message || 'Failed to add property slot')
    }
    setAddingPropertySlotForUserId(null)
  }

  async function removeFamilySlot(userId) {
    if (!userId) return
    setRemovingSlotForUserId(userId)
    try {
      const response = await fetch('/api/admin/family-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-slot', tenantId: userId })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to remove family slot')

      showToast.success(data.message || 'Family slot removed successfully')
      await fetchUsers()
    } catch (error) {
      showToast.error(error.message || 'Failed to remove family slot')
    } finally {
      setRemovingSlotForUserId(null)
    }
  }

  async function removePropertySlot(userId) {
    if (!userId) return
    setRemovingPropertySlotForUserId(userId)
    try {
      const response = await fetch('/api/admin/landlord-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-slot', landlordId: userId })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to remove property slot')

      showToast.success(data.message || 'Property slot removed successfully')
      await fetchUsers()
    } catch (error) {
      showToast.error(error.message || 'Failed to remove property slot')
    } finally {
      setRemovingPropertySlotForUserId(null)
    }
  }

  function openFamilySlotRemoval(userId) {
    setSlotRemovalConfirm({
      type: 'family',
      userId,
      title: 'Remove Family Slot',
      message: 'Remove 1 available family slot from this tenant? Occupied family slots cannot be removed.',
      confirmText: 'Remove 1 Family Slot'
    })
  }

  function openPropertySlotRemoval(userId) {
    setSlotRemovalConfirm({
      type: 'property',
      userId,
      title: 'Remove Property Slot',
      message: 'Remove 1 available property slot from this landlord? Occupied property slots cannot be removed.',
      confirmText: 'Remove 1 Property Slot'
    })
  }

  async function confirmRemoveSlot() {
    if (!slotRemovalConfirm) return
    const pendingRemoval = slotRemovalConfirm
    setSlotRemovalConfirm(null)

    if (pendingRemoval.type === 'family') {
      await removeFamilySlot(pendingRemoval.userId)
    } else {
      await removePropertySlot(pendingRemoval.userId)
    }
  }

  async function handleUpdate() {
    try {
      const currentAcceptedPayments = (editForm.accepted_payments && typeof editForm.accepted_payments === 'object')
        ? editForm.accepted_payments
        : {}

      const acceptedPayments = {
        ...currentAcceptedPayments,
        cash: !!editForm.accepted_cash,
        qr_code: !!editForm.accepted_qr_code,
        paymongo: !!editForm.accepted_paymongo,
        stripe: !!editForm.accepted_stripe,
      }

      const response = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          email: editForm.email,
          password: editForm.password,
          profileData: {
            first_name: editForm.first_name,
            middle_name: editForm.middle_name,
            last_name: editForm.last_name,
            role: editForm.role,
            phone: editForm.phone,
            email: editForm.email,
            birthday: editForm.birthday || null,
            gender: editForm.gender || null,
            avatar_url: editForm.avatar_url || null,
            phone_verified: !!editForm.phone_verified,
            business_name: editForm.business_name || null,
            accepted_payments: acceptedPayments,
          }
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      showToast.success("User updated successfully!")
      setEditingUser(null)
      setEditForm({})
      fetchUsers()
    } catch (error) {
      showToast.error("Update failed: " + error.message)
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: deleteId })
      })
      if (!response.ok) throw new Error('Failed to delete')
      showToast.success("User deleted successfully")
      fetchUsers()
    } catch (err) {
      showToast.error("Failed to delete user")
    }
    setDeleteId(null)
  }

  async function handleCreateUser() {
    if (!newUserForm.first_name || !newUserForm.last_name || !newUserForm.email || !newUserForm.password) {
      showToast.error("Please fill in all required fields")
      return
    }
    setIsCreating(true)
    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserForm)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      showToast.success("User created successfully!")
      setShowAddModal(false)
      setNewUserForm({ first_name: '', middle_name: '', last_name: '', email: '', phone: '', password: '', role: 'tenant', birthday: '', gender: '', avatar_url: '' })
      fetchUsers()
    } catch (error) {
      showToast.error("Failed to create user: " + error.message)
    }
    setIsCreating(false)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-gray-100/80">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Users Directory</h2>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Manage tenants and landlords.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Input
            placeholder="Search name, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-64"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="border rounded px-3 py-2 bg-gray-50 focus:ring-2 focus:ring-black outline-none cursor-pointer font-medium w-full sm:w-auto"
          >
            <option value="all">All Roles</option>
            <option value="tenant">Tenant</option>
            <option value="landlord">Landlord</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-white font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 justify-center shadow-lg shadow-gray-300"
            style={{ backgroundColor: '#000000' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            Add User
          </button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px] md:min-w-0">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase tracking-wider">User</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase tracking-wider">Email / Phone</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase tracking-wider">Slots</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(user => (
                  <tr key={user.id} className="transition-colors group">
                    <td className="p-4 md:p-5">
                      <div className="font-bold text-gray-900 text-sm md:text-base whitespace-nowrap">{user.first_name} {user.middle_name ? user.middle_name + ' ' : ''}{user.last_name}</div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">ID: {user.id.slice(0, 8)}...</div>
                    </td>
                    <td className="p-4 md:p-5">
                      <div className="text-sm font-medium text-gray-900">{user.email || 'N/A'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{user.phone || 'N/A'}</div>
                    </td>
                    <td className="p-4 md:p-5">
                      <Badge variant='default'>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="p-4 md:p-5">
                      {user.role === 'tenant' ? (
                        (() => {
                          const stats = familySubscriptions[user.id]
                          if (!stats) {
                            return <span className="text-xs text-gray-400">Loading...</span>
                          }
                          return (
                            <div className="text-xs text-gray-700">
                              <div className="font-bold">{stats.has_subscription ? 'Subscribed' : 'No record'}</div>
                              <div className="text-gray-500">{stats.used_slots || 0}/{stats.total_slots || 1} used</div>
                            </div>
                          )
                        })()
                      ) : user.role === 'landlord' ? (
                        (() => {
                          const stats = landlordSubscriptions[user.id]
                          if (!stats) {
                            return <span className="text-xs text-gray-400">Loading...</span>
                          }
                          return (
                            <div className="text-xs text-gray-700">
                              <div className="font-bold">{stats.paid_slots > 0 ? 'Paid plan' : 'Free plan'}</div>
                              <div className="text-gray-500">{stats.used_slots || 0}/{stats.total_slots || 3} used</div>
                            </div>
                          )
                        })()
                      ) : (
                        <span className="text-xs text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="p-4 md:p-5 flex justify-end gap-2">
                      {user.role === 'tenant' && (() => {
                        const stats = familySubscriptions[user.id]
                        const totalSlots = stats?.total_slots || 1
                        const availableSlots = stats?.available_slots ?? Math.max(0, totalSlots - (stats?.used_slots || 0))
                        const canDecrease = stats && totalSlots > 1 && availableSlots > 0
                        return (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openFamilySlotRemoval(user.id)}
                              disabled={removingSlotForUserId === user.id || !canDecrease}
                              title={canDecrease ? 'Remove one available family slot' : 'Cannot remove an occupied or free family slot'}
                              className="px-3 py-1.5 md:px-4 md:py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {removingSlotForUserId === user.id ? 'Removing...' : 'Remove 1 Family Slot'}
                            </button>
                            <button
                              onClick={() => addFamilySlot(user.id)}
                              disabled={addingSlotForUserId === user.id}
                              className="px-3 py-1.5 md:px-4 md:py-2 bg-black text-white rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-50"
                            >
                              {addingSlotForUserId === user.id ? 'Adding...' : 'Add Family Slot'}
                            </button>
                          </div>
                        )
                      })()}
                      {user.role === 'landlord' && (() => {
                        const stats = landlordSubscriptions[user.id]
                        const totalSlots = stats?.total_slots || 3
                        const availableSlots = stats?.available_slots ?? Math.max(0, totalSlots - (stats?.used_slots || 0))
                        const canDecrease = stats && totalSlots > 3 && availableSlots > 0
                        return (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openPropertySlotRemoval(user.id)}
                              disabled={removingPropertySlotForUserId === user.id || !canDecrease}
                              title={canDecrease ? 'Remove one available property slot' : 'Cannot remove an occupied or free property slot'}
                              className="px-3 py-1.5 md:px-4 md:py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {removingPropertySlotForUserId === user.id ? 'Removing...' : 'Remove 1 Property Slot'}
                            </button>
                            <button
                              onClick={() => addPropertySlot(user.id)}
                              disabled={addingPropertySlotForUserId === user.id}
                              className="px-3 py-1.5 md:px-4 md:py-2 bg-black text-white rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-50"
                            >
                              {addingPropertySlotForUserId === user.id ? 'Adding...' : 'Add Property Slot'}
                            </button>
                          </div>
                        )
                      })()}
                      <button
                        onClick={() => {
                          const accepted = (user.accepted_payments && typeof user.accepted_payments === 'object') ? user.accepted_payments : {}
                          setEditingUser(user)
                          setEditForm({
                            ...user,
                            password: '',
                            phone_verified: !!user.phone_verified,
                            business_name: user.business_name || '',
                            accepted_cash: !!accepted.cash,
                            accepted_qr_code: !!accepted.qr_code,
                            accepted_paymongo: !!accepted.paymongo,
                            accepted_stripe: !!accepted.stripe,
                          })
                        }}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-gray-100 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteId(user.id)}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && <EmptyStateRow colSpan={5} message="No users found." />}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={totalUsers}
            pageSize={USERS_PAGE_SIZE}
            onPageChange={setCurrentPage}
            label="users"
          />
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[80] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl md:text-2xl font-black tracking-tight">Edit User Profile</h3>
              <button onClick={() => setEditingUser(null)} className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer text-gray-400">✕</button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="First Name" value={editForm.first_name || ''} onChange={e => setEditForm({ ...editForm, first_name: e.target.value })} />
                <Input label="Middle Name" value={editForm.middle_name || ''} onChange={e => setEditForm({ ...editForm, middle_name: e.target.value })} />
              </div>
              <Input label="Last Name" value={editForm.last_name || ''} onChange={e => setEditForm({ ...editForm, last_name: e.target.value })} />

              <div className="h-px bg-gray-100 my-2"></div>

              <Input label="Email Address" type="email" value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
              <Input label="Phone Number" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Business Name" value={editForm.business_name || ''} onChange={e => setEditForm({ ...editForm, business_name: e.target.value })} />
                <div className="space-y-1">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Phone Verified</label>
                  <select
                    value={editForm.phone_verified ? 'true' : 'false'}
                    onChange={e => setEditForm({ ...editForm, phone_verified: e.target.value === 'true' })}
                    className="w-full border rounded-xl px-4 py-3 cursor-pointer bg-white focus:ring-2 focus:ring-black outline-none transition-shadow"
                  >
                    <option value="true">Verified</option>
                    <option value="false">Not Verified</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-gray-700">Accepted Payments</label>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 p-3 bg-gray-50">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!editForm.accepted_cash}
                      onChange={(e) => setEditForm({ ...editForm, accepted_cash: e.target.checked })}
                      className="w-4 h-4"
                    />
                    Cash
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!editForm.accepted_qr_code}
                      onChange={(e) => setEditForm({ ...editForm, accepted_qr_code: e.target.checked })}
                      className="w-4 h-4"
                    />
                    QR Code
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!editForm.accepted_paymongo}
                      onChange={(e) => setEditForm({ ...editForm, accepted_paymongo: e.target.checked })}
                      className="w-4 h-4"
                    />
                    PayMongo
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!editForm.accepted_stripe}
                      onChange={(e) => setEditForm({ ...editForm, accepted_stripe: e.target.checked })}
                      className="w-4 h-4"
                    />
                    Stripe
                  </label>
                </div>
              </div>

              {editForm.role === 'tenant' && (
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">Family Subscription</label>
                  <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                    <p className="text-sm font-bold text-gray-900">
                      {familySubscriptions[editingUser.id]?.has_subscription ? 'Subscribed' : 'No subscription record'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Slots: {familySubscriptions[editingUser.id]?.used_slots || 0}/{familySubscriptions[editingUser.id]?.total_slots || 1} used
                    </p>
                    <p className="text-xs text-gray-500">
                      Available: {familySubscriptions[editingUser.id]?.available_slots ?? 1}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openFamilySlotRemoval(editingUser.id)}
                        disabled={
                          removingSlotForUserId === editingUser.id ||
                          !familySubscriptions[editingUser.id] ||
                          (familySubscriptions[editingUser.id]?.total_slots || 1) <= 1 ||
                          (familySubscriptions[editingUser.id]?.available_slots ?? Math.max(0, (familySubscriptions[editingUser.id]?.total_slots || 1) - (familySubscriptions[editingUser.id]?.used_slots || 0))) <= 0
                        }
                        title="Remove one available family slot"
                        className="px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {removingSlotForUserId === editingUser.id ? 'Removing...' : 'Remove 1 Family Slot'}
                      </button>
                      <button
                        type="button"
                        onClick={() => addFamilySlot(editingUser.id)}
                        disabled={addingSlotForUserId === editingUser.id}
                        className="px-3 py-2 bg-black text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        {addingSlotForUserId === editingUser.id ? 'Adding...' : 'Add Family Slot'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {editForm.role === 'landlord' && (
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-gray-700">Property Slots</label>
                  <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                    <p className="text-sm font-bold text-gray-900">
                      {(landlordSubscriptions[editingUser.id]?.paid_slots || 0) > 0 ? 'Paid plan' : 'Free plan'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Slots: {landlordSubscriptions[editingUser.id]?.used_slots || 0}/{landlordSubscriptions[editingUser.id]?.total_slots || 3} used
                    </p>
                    <p className="text-xs text-gray-500">
                      Available: {landlordSubscriptions[editingUser.id]?.available_slots ?? 3}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openPropertySlotRemoval(editingUser.id)}
                        disabled={
                          removingPropertySlotForUserId === editingUser.id ||
                          !landlordSubscriptions[editingUser.id] ||
                          (landlordSubscriptions[editingUser.id]?.total_slots || 3) <= 3 ||
                          (landlordSubscriptions[editingUser.id]?.available_slots ?? Math.max(0, (landlordSubscriptions[editingUser.id]?.total_slots || 3) - (landlordSubscriptions[editingUser.id]?.used_slots || 0))) <= 0
                        }
                        title="Remove one available property slot"
                        className="px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {removingPropertySlotForUserId === editingUser.id ? 'Removing...' : 'Remove 1 Property Slot'}
                      </button>
                      <button
                        type="button"
                        onClick={() => addPropertySlot(editingUser.id)}
                        disabled={addingPropertySlotForUserId === editingUser.id}
                        className="px-3 py-2 bg-black text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        {addingPropertySlotForUserId === editingUser.id ? 'Adding...' : 'Add Property Slot'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Date of Birth" type="date" value={editForm.birthday ? editForm.birthday.split('T')[0] : ''} onChange={e => setEditForm({ ...editForm, birthday: e.target.value })} />
                <div className="space-y-1">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Gender</label>
                  <select
                    value={editForm.gender || ''}
                    onChange={e => setEditForm({ ...editForm, gender: e.target.value })}
                    className="w-full border rounded-xl px-4 py-3 cursor-pointer bg-white focus:ring-2 focus:ring-black outline-none transition-shadow"
                  >
                    <option value="" disabled>Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>
              <Input label="Avatar URL" type="url" value={editForm.avatar_url || ''} onChange={e => setEditForm({ ...editForm, avatar_url: e.target.value })} placeholder="https://example.com/avatar.png" />

              <div className="relative">
                <label className="block text-sm font-bold text-gray-700 mb-1">Set New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password to reset..."
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-black outline-none"
                    value={editForm.password || ''}
                    onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Leave blank to keep current password.</p>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-bold text-gray-700 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full border rounded-xl px-4 py-3 cursor-pointer bg-white focus:ring-2 focus:ring-black outline-none transition-shadow"
                >
                  <option value="tenant">Tenant</option>
                  <option value="landlord">Landlord</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-8">
              <button type="button" className="flex-1 py-3.5 cursor-pointer rounded-xl bg-gray-200 text-gray-700 font-medium" onClick={() => setEditingUser(null)}>Cancel</button>
              <button type="button" className="flex-1 py-3.5 text-white cursor-pointer rounded-xl shadow-lg font-medium" style={{ backgroundColor: '#000000' }} onClick={handleUpdate}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[80] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl md:text-2xl font-black tracking-tight">Create New User</h3>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer text-gray-400">✕</button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="First Name *" value={newUserForm.first_name} onChange={e => setNewUserForm({ ...newUserForm, first_name: e.target.value })} />
                <Input label="Middle Name" value={newUserForm.middle_name} onChange={e => setNewUserForm({ ...newUserForm, middle_name: e.target.value })} />
              </div>
              <Input label="Last Name *" value={newUserForm.last_name} onChange={e => setNewUserForm({ ...newUserForm, last_name: e.target.value })} />
              <div className="h-px bg-gray-100 my-2"></div>
              <Input label="Email Address *" type="email" value={newUserForm.email} onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })} />
              <Input label="Phone Number" value={newUserForm.phone} onChange={e => setNewUserForm({ ...newUserForm, phone: e.target.value })} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Date of Birth" type="date" value={newUserForm.birthday} onChange={e => setNewUserForm({ ...newUserForm, birthday: e.target.value })} />
                <div className="space-y-1">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Gender</label>
                  <select
                    value={newUserForm.gender}
                    onChange={e => setNewUserForm({ ...newUserForm, gender: e.target.value })}
                    className="w-full border rounded-xl px-4 py-3 cursor-pointer bg-white focus:ring-2 focus:ring-black outline-none transition-shadow"
                  >
                    <option value="" disabled>Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>
              <Input label="Avatar URL" type="url" value={newUserForm.avatar_url} onChange={e => setNewUserForm({ ...newUserForm, avatar_url: e.target.value })} placeholder="https://example.com/avatar.png" />
              <Input label="Password *" type="password" value={newUserForm.password} onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })} />
              <div className="space-y-1">
                <label className="block text-sm font-bold text-gray-700 mb-1">Role</label>
                <select
                  value={newUserForm.role}
                  onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full border rounded-xl px-4 py-3 cursor-pointer bg-white focus:ring-2 focus:ring-black outline-none transition-shadow"
                >
                  <option value="tenant">Tenant</option>
                  <option value="landlord">Landlord</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-8">
              <button type="button" className="flex-1 py-3.5 cursor-pointer rounded-xl bg-gray-200 text-gray-700 font-medium" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button
                type="button"
                className="flex-1 py-3.5 text-white cursor-pointer rounded-xl shadow-lg disabled:opacity-50 font-medium"
                style={{ backgroundColor: '#000000' }}
                onClick={handleCreateUser}
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DeleteModal
        isOpen={!!slotRemovalConfirm}
        onClose={() => setSlotRemovalConfirm(null)}
        onConfirm={confirmRemoveSlot}
        title={slotRemovalConfirm?.title || 'Remove Slot'}
        message={slotRemovalConfirm?.message || ''}
        confirmText={slotRemovalConfirm?.confirmText || 'Remove'}
        zIndexClass="z-[100]"
      />

      <DeleteModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={confirmDelete} title="Delete User" message="Are you sure you want to delete this user? They will no longer be able to log in." />
    </div>
  )
}

function PropertiesView({ refreshTrigger }) {
  const PROPERTIES_PAGE_SIZE = 10
  const router = useRouter()
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalProperties, setTotalProperties] = useState(0)
  const [editingProp, setEditingProp] = useState(null)
  const [propForm, setPropForm] = useState({})
  const [deleteId, setDeleteId] = useState(null)
  const [imageUrls, setImageUrls] = useState([''])
  const [uploadingImages, setUploadingImages] = useState({})
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { setCurrentPage(1) }, [search, statusFilter])
  useEffect(() => { loadProperties() }, [currentPage, search, statusFilter, refreshTrigger])

  async function loadProperties() {
    setLoading(true)
    try {
      let query = supabase
        .from('properties')
        .select('*, landlord_profile:profiles!properties_landlord_fkey(first_name, last_name)', { count: 'exact' })
        .eq('is_deleted', false)

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const term = search.trim()
      if (term) {
        const like = `%${term}%`
        query = query.or(`title.ilike.${like},city.ilike.${like},address.ilike.${like}`)
      }

      const from = (currentPage - 1) * PROPERTIES_PAGE_SIZE
      const to = from + PROPERTIES_PAGE_SIZE - 1
      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
      if (error) throw error

      setProperties(data || [])
      setTotalProperties(count || 0)
    } catch (error) {
      console.error(error)
      setProperties([])
      setTotalProperties(0)
    }
    setLoading(false)
  }

  function openEditModal(p) {
    setEditingProp(p)
    setPropForm({ ...p })
    setImageUrls(p.images && p.images.length > 0 ? [...p.images] : [''])
  }

  async function uploadImageFile(file, index) {
    if (!file) return
    if (!file.type.startsWith('image/')) { showToast.error('Please upload an image file'); return }

    setUploadingImages(prev => ({ ...prev, [index]: true }))
    try {
      const uploadFile = await normalizeImageForUpload(file)
      const fileExt = uploadFile.name.split('.').pop()
      const randomId = Math.random().toString(36).substring(2, 10)
      const fileName = `admin/${Date.now()}_${randomId}.${fileExt}`
      const { data, error } = await supabase.storage.from('property-images').upload(fileName, uploadFile)
      if (error) throw error
      const { data: publicUrlData } = supabase.storage.from('property-images').getPublicUrl(fileName)
      setImageUrls(prev => { const newUrls = [...prev]; newUrls[index] = publicUrlData.publicUrl; return newUrls })
    } catch (error) {
      showToast.error(error.message || 'Error uploading image')
    } finally {
      setUploadingImages(prev => ({ ...prev, [index]: false }))
    }
  }

  async function handleImageUpload(e, index) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    await uploadImageFile(file, index)
  }

  async function handleQuickImageUpload(e) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    const nextIndex = imageUrls.length
    setImageUrls(prev => [...prev, ''])
    await uploadImageFile(file, nextIndex)
  }

  function removeImageSlot(index) {
    const newUrls = imageUrls.filter((_, i) => i !== index)
    setImageUrls(newUrls.length === 0 ? [''] : newUrls)
  }

  async function handleUpdateProperty() {
    const validImageUrls = imageUrls.filter(url => url && url.trim() !== '')
    const { error } = await supabase.from('properties').update({
      title: propForm.title, address: propForm.address, city: propForm.city, country: propForm.country, state_province: propForm.state_province, price: propForm.price,
      description: propForm.description, bedrooms: propForm.bedrooms, bathrooms: propForm.bathrooms,
      area_sqft: propForm.area_sqft, status: propForm.status, utilities_cost: propForm.utilities_cost,
      internet_cost: propForm.internet_cost, association_dues: propForm.association_dues,
      building_no: propForm.building_no, street: propForm.street, zip: propForm.zip,
      location_link: propForm.location_link, owner_phone: propForm.owner_phone, owner_email: propForm.owner_email,
      amenities: propForm.amenities || [], terms_conditions: propForm.terms_conditions,
      images: validImageUrls.length > 0 ? validImageUrls : null
    }).eq('id', editingProp.id)
    if (error) showToast.error("Failed to update property")
    else {
      showToast.success("Property updated successfully")
      setEditingProp(null)
      loadProperties()
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      const response = await fetch('/api/admin/delete-property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: deleteId })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to delete property')
      showToast.success("Property deleted")
      loadProperties()
    } catch (err) {
      showToast.error(err.message || "Failed to delete")
    }
    setDeleteId(null)
  }

  const availableAmenities = ['Kitchen', 'Pool', 'TV', 'Elevator', 'Air conditioning', 'Heating', 'Basketball court',
    'Washing machine', 'Dryer', 'Parking', 'Gym', 'Security', 'Balcony', 'Garden', "Kid's Playground",
    'Pet friendly', 'Furnished', 'Carbon monoxide alarm', 'Smoke alarm', 'Fire extinguisher', 'First aid kit'
]

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-gray-100/80">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">All Properties</h2>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Manage listings and view associated landlords.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button
            onClick={() => router.push('/properties/new')}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm font-bold cursor-pointer whitespace-nowrap"
          >
            + Add Property
          </button>
          <Input placeholder="Search properties..." value={search} onChange={e => setSearch(e.target.value)} className="w-full md:w-64" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded px-3 py-2 bg-gray-50 focus:ring-2 focus:ring-black outline-none cursor-pointer font-medium w-full sm:w-auto">
            <option value="all">All Status</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="not available">Not Available</option>
          </select>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px] md:min-w-0">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Property</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Landlord</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Specs</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Status</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {properties.map(p => (
                  <tr key={p.id} className="transition-colors">
                    <td className="p-4 md:p-5">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
                          {p.images && p.images.length > 0 ? (
                            <img src={p.images[0]} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 whitespace-nowrap">{p.title}</div>
                          <div className="text-xs text-gray-500 whitespace-nowrap">{p.city}, {p.address}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 md:p-5 text-sm font-medium text-gray-700 whitespace-nowrap">
                      {p.landlord_profile ? `${p.landlord_profile.first_name} ${p.landlord_profile.last_name}` : 'Unknown'}
                    </td>
                    <td className="p-4 md:p-5 text-sm whitespace-nowrap">
                      <div className="font-bold">₱{Number(p.price).toLocaleString()}</div>
                      <div className="text-xs text-gray-400">{p.bedrooms}bd • {p.bathrooms}ba • {p.area_sqft}sqft</div>
                    </td>
                    <td className="p-4 md:p-5"><Badge variant='default'>{p.status}</Badge></td>
                    <td className="p-4 md:p-5 text-right flex justify-end gap-2">
                      <button onClick={() => openEditModal(p)} className="text-black bg-gray-100 font-bold text-xs cursor-pointer px-3 py-2 rounded-lg transition-colors whitespace-nowrap">Edit Details</button>
                      <button onClick={() => setDeleteId(p.id)} className="text-gray-700 font-bold text-xs cursor-pointer px-3 py-2 bg-gray-100 rounded-lg transition-colors whitespace-nowrap">Delete</button>
                    </td>
                  </tr>
                ))}
                {properties.length === 0 && <EmptyStateRow colSpan={5} message="No properties found." />}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={totalProperties}
            pageSize={PROPERTIES_PAGE_SIZE}
            onPageChange={setCurrentPage}
            label="properties"
          />
        </div>
      )}

      {/* EDIT PROPERTY MODAL - Full Details Including Images */}
      {editingProp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[80] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-4xl p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl md:text-2xl font-black tracking-tight">Edit Property</h3>
              <button onClick={() => setEditingProp(null)} className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer text-gray-400">✕</button>
            </div>

            {/* Image Management */}
            <div className="mb-6 p-5 bg-gray-50 rounded-xl border border-gray-200">
              <label className="block text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Property Photos (Max 10)
              </label>
              <label className="inline-flex items-center gap-2 px-3 py-2 mb-3 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Upload Photo
                <input type="file" accept="image/*" className="hidden" onChange={handleQuickImageUpload} />
              </label>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {imageUrls.map((url, index) => (
                  <div key={index} className="relative aspect-square">
                    <label className="cursor-pointer block h-full">
                      {url ? (
                        <div className="w-full h-full rounded-lg overflow-hidden border-2 border-gray-300 relative group">
                          <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold">Change</span>
                          </div>
                        </div>
                      ) : (
                        <div className={`w-full h-full border-2 border-dashed rounded-lg flex items-center justify-center text-xs transition-colors ${uploadingImages[index] ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-300 text-gray-400'}`}>
                          {uploadingImages[index] ? (
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                          ) : <span className="text-lg">+</span>}
                        </div>
                      )}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, index)} disabled={uploadingImages[index]} />
                    </label>
                    {url && imageUrls.length > 1 && (
                      <button type="button" onClick={() => removeImageSlot(index)} className="absolute -top-1 -right-1 w-4 h-4 bg-black text-white text-[10px] rounded-full flex items-center justify-center cursor-pointer shadow-sm border border-white">×</button>
                    )}
                  </div>
                ))}
                {imageUrls.length < 10 && (
                  <button type="button" onClick={() => setImageUrls([...imageUrls, ''])} className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer bg-white transition-colors text-lg">+</button>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Max 2MB per image. Click to upload or replace.</p>
            </div>

            <div className="space-y-6">
              <div className="pb-6 border-b border-gray-50">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Rent Title *</label>
                <input
                  type="text"
                  className="w-full bg-gray-50 border-2 border-transparent focus:bg-white focus:border-black rounded-xl px-4 py-4 text-xl font-medium transition-all outline-none placeholder-gray-400"
                  placeholder="e.g. Modern Loft in Downtown"
                  value={propForm.title || ''}
                  onChange={e => setPropForm({ ...propForm, title: e.target.value })}
                />
              </div>

              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-black rounded-full"></span> Location
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Bldg No.</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                      value={propForm.building_no || ''}
                      onChange={e => setPropForm({ ...propForm, building_no: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Street</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                      value={propForm.street || ''}
                      onChange={e => setPropForm({ ...propForm, street: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Barangay</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                      value={propForm.address || ''}
                      onChange={e => setPropForm({ ...propForm, address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">City</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                      value={propForm.city || ''}
                      onChange={e => setPropForm({ ...propForm, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Country</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                      value={propForm.country || ''}
                      onChange={e => setPropForm({ ...propForm, country: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">State / Province</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                      value={propForm.state_province || ''}
                      onChange={e => setPropForm({ ...propForm, state_province: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 ml-1">ZIP</label>
                    <input
                      type="number"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                      value={propForm.zip || ''}
                      onChange={e => setPropForm({ ...propForm, zip: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-xs font-semibold text-gray-500 ml-1">Google Map Link (Preferred)</label>
                    <input
                      type="url"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none text-blue-600"
                      value={propForm.location_link || ''}
                      onChange={e => setPropForm({ ...propForm, location_link: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2 border-t border-gray-100">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-black rounded-full"></span> Contact
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-500 ml-1">Phone</label>
                      <input
                        type="tel"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                        value={propForm.owner_phone || ''}
                        onChange={e => setPropForm({ ...propForm, owner_phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-500 ml-1">Email</label>
                      <input
                        type="email"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black focus:ring-0 outline-none"
                        value={propForm.owner_email || ''}
                        onChange={e => setPropForm({ ...propForm, owner_email: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-black rounded-full"></span> Details
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700 ml-1">Monthly Price (₱)</label>
                      <input
                        type="number"
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:bg-white focus:border-black outline-none font-semibold"
                        value={propForm.price || ''}
                        onChange={e => setPropForm({ ...propForm, price: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-500 ml-1">Status</label>
                      <select
                        value={propForm.status || 'available'}
                        onChange={e => setPropForm({ ...propForm, status: e.target.value })}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none cursor-pointer"
                      >
                        <option value="available">Available</option>
                        <option value="occupied">Occupied</option>
                        <option value="not available">Unavailable</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-500 ml-1">Beds</label>
                      <input
                        type="number"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none"
                        value={propForm.bedrooms || ''}
                        onChange={e => setPropForm({ ...propForm, bedrooms: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-500 ml-1">Baths</label>
                      <input
                        type="number"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none"
                        value={propForm.bathrooms || ''}
                        onChange={e => setPropForm({ ...propForm, bathrooms: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-500 ml-1">Sqft</label>
                      <input
                        type="number"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none"
                        value={propForm.area_sqft || ''}
                        onChange={e => setPropForm({ ...propForm, area_sqft: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1 col-span-2">
                      <label className="text-xs font-semibold text-gray-500 ml-1">Internet (₱)</label>
                      <input
                        type="number"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-black outline-none"
                        value={propForm.internet_cost || ''}
                        onChange={e => setPropForm({ ...propForm, internet_cost: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-black rounded-full"></span> Amenities
                </h4>
                <div className="flex flex-wrap gap-2">
                  {availableAmenities.map(amenity => (
                    <button key={amenity} type="button" onClick={() => {
                      const current = propForm.amenities || []
                      setPropForm({ ...propForm, amenities: current.includes(amenity) ? current.filter(a => a !== amenity) : [...current, amenity] })
                    }} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${(propForm.amenities || []).includes(amenity) ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                      {amenity}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 ml-1 mb-1">Description</label>
                <textarea className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none resize-none" rows={4} value={propForm.description || ''} onChange={e => setPropForm({ ...propForm, description: e.target.value })} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 ml-1">Terms & Conditions URL</label>
                <input
                  type="url"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-black outline-none"
                  value={propForm.terms_conditions || ''}
                  onChange={e => setPropForm({ ...propForm, terms_conditions: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-8">
              <button type="button" className="flex-1 py-3.5 cursor-pointer rounded-xl bg-gray-200 text-gray-700 font-medium" onClick={() => setEditingProp(null)}>Cancel</button>
              <button type="button" className="flex-1 py-3.5 bg-black text-white cursor-pointer rounded-xl font-medium" onClick={handleUpdateProperty}>Update Property</button>
            </div>
          </div>
        </div>
      )}

      <DeleteModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={confirmDelete} title="Delete Property" message="Are you sure? This will remove the property from the listing." />
    </div>
  )
}

function ActiveOccupanciesView({ refreshTrigger }) {
  const ACTIVE_OCCUPANCIES_PAGE_SIZE = 10
  const [activeOccupancies, setActiveOccupancies] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalActiveOccupancies, setTotalActiveOccupancies] = useState(0)
  const [selectedOccupancy, setSelectedOccupancy] = useState(null)
  const [occupancyDetails, setOccupancyDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  useEffect(() => { loadActiveOccupancies() }, [currentPage, refreshTrigger])

  async function loadActiveOccupancies() {
    setLoading(true)
    try {
      const { data, count } = await adminFetch(
        'tenant_occupancies',
        'id, created_at, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone), property:properties(id, title, address, city, landlord_profile:profiles!properties_landlord_fkey(first_name, last_name))',
        [{ type: 'eq', column: 'status', value: 'active' }],
        { column: 'created_at', ascending: false },
        { page: currentPage, pageSize: ACTIVE_OCCUPANCIES_PAGE_SIZE },
        true
      )

      setActiveOccupancies(data || [])
      setTotalActiveOccupancies(count || 0)
    } catch (error) {
      console.error('Failed to load active occupancies:', error)
      setActiveOccupancies([])
      setTotalActiveOccupancies(0)
    }
    setLoading(false)
  }

  async function openOccupancyDetails(occupancy) {
    setSelectedOccupancy(occupancy)
    setOccupancyDetails(null)
    setDetailsLoading(true)
    try {
      const response = await fetch(`/api/admin/occupancy-details?occupancy_id=${encodeURIComponent(occupancy.id)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to load occupancy details')
      setOccupancyDetails(data)
    } catch (error) {
      showToast.error(error.message || 'Failed to load occupancy details')
      setOccupancyDetails(null)
    }
    setDetailsLoading(false)
  }

  function closeOccupancyDetails() {
    setSelectedOccupancy(null)
    setOccupancyDetails(null)
    setDetailsLoading(false)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-gray-100/80">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Active Occupancy</h2>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Track active tenants, their properties, and assigned landlords.</p>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px] md:min-w-0">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Tenant</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Property</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Landlord</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Date Added</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeOccupancies.map(occ => (
                  <tr key={occ.id} onClick={() => openOccupancyDetails(occ)} className="cursor-pointer">
                    <td className="p-4 md:p-5 text-sm font-medium text-gray-800 whitespace-nowrap">
                      {occ.tenant ? `${occ.tenant.first_name || ''} ${occ.tenant.last_name || ''}`.trim() : 'Unknown Tenant'}
                    </td>
                    <td className="p-4 md:p-5 text-sm text-gray-700">
                      <div className="font-semibold text-gray-900 whitespace-nowrap">{occ.property?.title || 'Unknown Property'}</div>
                      <div className="text-xs text-gray-500 whitespace-nowrap">{occ.property?.city || ''}{occ.property?.city && occ.property?.address ? ', ' : ''}{occ.property?.address || ''}</div>
                    </td>
                    <td className="p-4 md:p-5 text-sm text-gray-700 whitespace-nowrap">
                      {occ.property?.landlord_profile ? `${occ.property.landlord_profile.first_name || ''} ${occ.property.landlord_profile.last_name || ''}`.trim() : 'Unknown'}
                    </td>
                    <td className="p-4 md:p-5 text-sm text-gray-700 whitespace-nowrap">
                      {occ.created_at ? new Date(occ.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-4 md:p-5">
                      <Badge variant='success'>Active</Badge>
                    </td>
                  </tr>
                ))}
                {activeOccupancies.length === 0 && <EmptyStateRow colSpan={5} message="No active occupancies found." />}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={totalActiveOccupancies}
            pageSize={ACTIVE_OCCUPANCIES_PAGE_SIZE}
            onPageChange={setCurrentPage}
            label="active occupancies"
          />
        </div>
      )}

      {selectedOccupancy && (
        <div className="fixed inset-0 z-[95] flex">
          <div className="flex-1 bg-black/50" onClick={closeOccupancyDetails}></div>
          <aside className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl border-l border-gray-200">
            <div className="p-6 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-black text-gray-900">Occupancy Details</h3>
                <p className="text-sm text-gray-500 mt-1">ID: {selectedOccupancy.id}</p>
              </div>
              <button onClick={closeOccupancyDetails} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 cursor-pointer">✕</button>
            </div>

            {detailsLoading ? (
              <div className="p-8 flex justify-center"><Spinner /></div>
            ) : (
              <div className="p-6 space-y-6">
                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-xs font-black text-gray-500 uppercase mb-2">Tenant</p>
                  <p className="text-sm font-bold text-gray-900">
                    {occupancyDetails?.occupancy?.tenant
                      ? `${occupancyDetails.occupancy.tenant.first_name || ''} ${occupancyDetails.occupancy.tenant.middle_name ? `${occupancyDetails.occupancy.tenant.middle_name} ` : ''}${occupancyDetails.occupancy.tenant.last_name || ''}`.trim()
                      : 'Unknown Tenant'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{occupancyDetails?.occupancy?.tenant?.email || 'No email'}</p>
                  <p className="text-xs text-gray-600">{occupancyDetails?.occupancy?.tenant?.phone || 'No phone'}</p>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-xs font-black text-gray-500 uppercase mb-2">Property</p>
                  <p className="text-sm font-bold text-gray-900">{occupancyDetails?.occupancy?.property?.title || 'Unknown Property'}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {occupancyDetails?.occupancy?.property?.city || ''}
                    {occupancyDetails?.occupancy?.property?.city && occupancyDetails?.occupancy?.property?.address ? ', ' : ''}
                    {occupancyDetails?.occupancy?.property?.address || ''}
                  </p>
                  <p className="text-xs text-gray-600">Monthly Rent: ₱{Number(occupancyDetails?.occupancy?.property?.price || 0).toLocaleString()}</p>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-xs font-black text-gray-500 uppercase mb-2">Landlord</p>
                  <p className="text-sm font-bold text-gray-900">
                    {occupancyDetails?.occupancy?.landlord
                      ? `${occupancyDetails.occupancy.landlord.first_name || ''} ${occupancyDetails.occupancy.landlord.middle_name ? `${occupancyDetails.occupancy.landlord.middle_name} ` : ''}${occupancyDetails.occupancy.landlord.last_name || ''}`.trim()
                      : 'Unknown Landlord'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{occupancyDetails?.occupancy?.landlord?.email || 'No email'}</p>
                  <p className="text-xs text-gray-600">{occupancyDetails?.occupancy?.landlord?.phone || 'No phone'}</p>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-xs font-black text-gray-500 uppercase mb-2">Occupancy Meta</p>
                  <div className="grid grid-cols-2 gap-3 text-xs text-gray-700">
                    <div>
                      <p className="text-gray-500">Status</p>
                      <p className="font-semibold">{occupancyDetails?.occupancy?.status || 'active'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Date Added</p>
                      <p className="font-semibold">{occupancyDetails?.occupancy?.created_at ? new Date(occupancyDetails.occupancy.created_at).toLocaleDateString() : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Start Date</p>
                      <p className="font-semibold">{occupancyDetails?.occupancy?.start_date ? new Date(occupancyDetails.occupancy.start_date).toLocaleDateString() : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">End Date</p>
                      <p className="font-semibold">{occupancyDetails?.occupancy?.end_date ? new Date(occupancyDetails.occupancy.end_date).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-xs font-black text-gray-500 uppercase mb-2">Family Subscription</p>
                  <p className="text-sm text-gray-800">
                    {occupancyDetails?.subscription
                      ? `${occupancyDetails.subscription.used_slots || 0}/${occupancyDetails.subscription.total_slots || 1} used`
                      : 'No subscription record (default free slot applies)'}
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-xs font-black text-gray-500 uppercase mb-3">Family Members</p>
                  {(occupancyDetails?.familyMembers || []).length === 0 ? (
                    <p className="text-sm text-gray-500">No family members linked to this occupancy.</p>
                  ) : (
                    <div className="space-y-2">
                      {(occupancyDetails?.familyMembers || []).map((member) => (
                        <div key={member.id} className="rounded-lg border border-gray-200 bg-white p-3">
                          <p className="text-sm font-bold text-gray-900">
                            {member.member_profile
                              ? `${member.member_profile.first_name || ''} ${member.member_profile.middle_name ? `${member.member_profile.middle_name} ` : ''}${member.member_profile.last_name || ''}`.trim()
                              : 'Unknown Member'}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">{member.member_profile?.email || 'No email'}</p>
                          <p className="text-xs text-gray-600">{member.member_profile?.phone || 'No phone'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <button
                    onClick={() => {
                      setOccToEnd({
                        id: selectedOccupancy.id,
                        property_id: selectedOccupancy.property?.id,
                        tenant: selectedOccupancy.tenant
                      });
                      setShowEndOccupancyConfirm(true);
                    }}
                    className="w-full py-4 bg-red-50 text-red-600 font-bold rounded-2xl border border-red-100 hover:bg-red-100 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    End Occupancy
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function PaymentsView({ refreshTrigger, setPaymentForm, setEditingPayment, setShowPaymentModal, handleCancelPayment, handleDeletePayment }) {
  const PAYMENTS_PAGE_SIZE = 10
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [landlords, setLandlords] = useState([])
  const [selectedLandlordId, setSelectedLandlordId] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPayments, setTotalPayments] = useState(0)
  const [selectedPaymentLog, setSelectedPaymentLog] = useState(null)

  useEffect(() => { loadLandlords() }, [])
  useEffect(() => { setCurrentPage(1) }, [statusFilter, selectedLandlordId])
  useEffect(() => { loadData() }, [currentPage, statusFilter, selectedLandlordId, refreshTrigger])

  async function loadLandlords() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('is_deleted', false)
        .eq('role', 'landlord')
        .order('first_name', { ascending: true })
        .range(0, 199)

      if (error) throw error
      setLandlords((data || []).map((l) => ({ id: l.id, name: `${l.first_name} ${l.last_name}` })))
    } catch (error) {
      console.error('Failed to load landlords:', error)
      setLandlords([])
    }
  }

  async function loadData() {
    setLoading(true)
    try {
      const filters = []
      if (statusFilter !== 'all') {
        filters.push({ type: 'eq', column: 'status', value: statusFilter })
      }
      if (selectedLandlordId !== 'all') {
        filters.push({ type: 'eq', column: 'landlord', value: selectedLandlordId })
      }

      const { data: rawPayments, count } = await adminFetch(
        'payment_requests',
        '*, property:properties(id, title, address, city, area_sqft, landlord_profile:profiles!properties_landlord_fkey(id, first_name, last_name)), tenant_profile:profiles!payment_requests_tenant_fkey(id, first_name, last_name)',
        filters,
        { column: 'created_at', ascending: false },
        { page: currentPage, pageSize: PAYMENTS_PAGE_SIZE },
        true
      )

      // Compute display amount: use amount field, or sum components
      const enriched = rawPayments.map(p => ({
        ...p,
        display_amount: p.amount || (parseFloat(p.rent_amount || 0) + parseFloat(p.water_bill || 0) + parseFloat(p.electrical_bill || 0) + parseFloat(p.other_bills || 0))
      }))
      setPayments(enriched)
      setTotalPayments(count || 0)
    } catch (error) {
      console.error('Failed to load payments:', error)
      setPayments([])
      setTotalPayments(0)
    }
    setLoading(false)
  }

  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const graphData = useMemo(() => {
    const totals = new Array(12).fill(0)
    payments.forEach((p) => {
      if (['paid', 'completed', 'confirmed'].includes(p.status)) {
        const monthIndex = new Date(p.created_at).getMonth()
        if (monthIndex >= 0 && monthIndex <= 11) {
          totals[monthIndex] += (p.display_amount || 0)
        }
      }
    })
    return monthLabels.map((month, index) => ({ month, value: totals[index] }))
  }, [payments])

  const maxIncomeRaw = Math.max(...graphData.map((item) => item.value), 1)
  const yStep = Math.max(50000, Math.ceil(maxIncomeRaw / 4 / 50000) * 50000)
  const maxIncome = yStep * 4
  const yTicks = [0, yStep, yStep * 2, yStep * 3, yStep * 4]
  const chartWidth = 980
  const chartHeight = 260
  const chartPadding = { top: 16, right: 20, bottom: 38, left: 60 }
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom
  const baseY = chartPadding.top + plotHeight

  const chartPoints = graphData.map((item, index) => {
    const x = chartPadding.left + (index * plotWidth) / (graphData.length - 1)
    const y = baseY - (item.value / maxIncome) * plotHeight
    return { ...item, x, y }
  })
  const totalIncome = graphData.reduce((sum, item) => sum + item.value, 0)

  function buildSmoothPath(points) {
    if (!points.length) return ''
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

    let path = `M ${points[0].x} ${points[0].y}`
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[i + 2] || p2

      const cp1x = p1.x + (p2.x - p0.x) / 6
      const rawCp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const rawCp2y = p2.y - (p3.y - p1.y) / 6

      // Keep bezier control points within segment bounds and above baseline
      // so the curve doesn't dip below zero between months.
      const minY = Math.min(p1.y, p2.y)
      const maxY = Math.min(baseY, Math.max(p1.y, p2.y))
      const cp1y = Math.max(minY, Math.min(maxY, rawCp1y))
      const cp2y = Math.max(minY, Math.min(maxY, rawCp2y))

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
    }
    return path
  }

  const linePath = buildSmoothPath(chartPoints)
  const areaPath = chartPoints.length
    ? `${linePath} L ${chartPoints[chartPoints.length - 1].x} ${baseY} L ${chartPoints[0].x} ${baseY} Z`
    : ''

  const formatYAxis = (value) => `₱${Math.round(value / 1000)}k`
  const getRentMonth = (dueDateString) => {
    if (!dueDateString) return '-'
    const due = new Date(dueDateString)
    return due.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const getBillType = (r) => {
    const rent = parseFloat(r.rent_amount) || 0
    const water = parseFloat(r.water_bill) || 0
    const electric = parseFloat(r.electrical_bill) || 0
    const wifi = parseFloat(r.wifi_bill) || 0
    if (rent > 0) return 'House Rent'
    if (electric > 0) return 'Electric Bill'
    if (water > 0) return 'Water Bill'
    if (wifi > 0) return 'Wifi Bill'
    return 'Other Bill'
  }

  const filteredPayments = payments.filter(p => {
    const term = search.toLowerCase()
    const tenant = p.tenant_profile ? `${p.tenant_profile.first_name} ${p.tenant_profile.last_name}` : ''
    const landlord = p.property?.landlord_profile ? `${p.property.landlord_profile.first_name} ${p.property.landlord_profile.last_name}` : ''
    const matchesSearch = tenant.toLowerCase().includes(term) || landlord.toLowerCase().includes(term) || (p.property?.title || '').toLowerCase().includes(term)
    return matchesSearch
  })

  if (loading) return <Spinner />

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-black flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></span>
              Income Analytics
            </h3>
            <p className="text-sm text-gray-500 mt-1">Showing: <span className="font-bold text-gray-900">{selectedLandlordId === 'all' ? 'All Landlords' : landlords.find(l => l.id === selectedLandlordId)?.name}</span></p>
            <p className="text-sm text-gray-700 mt-1">Total Income: <span className="font-bold text-gray-900">₱{totalIncome.toLocaleString()}</span></p>
          </div>
          <select value={selectedLandlordId} onChange={(e) => setSelectedLandlordId(e.target.value)} className="bg-gray-50 border border-gray-200 text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-black outline-none cursor-pointer font-medium w-full md:w-auto">
            <option value="all">All Landlords (Total)</option>
            {landlords.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}
          </select>
        </div>
        <div className="pt-2">
          <div className="w-full overflow-x-auto">
            <div className="min-w-[980px] rounded-2xl border border-gray-200 bg-[#f5f5f5] p-2">
              {chartPoints.every((point) => point.value === 0) ? (
                <div className="h-56 flex items-center justify-center text-gray-400 italic">No income data</div>
              ) : (
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-64" role="img" aria-label="Income analytics line graph">
                  {yTicks.map((tickValue, index) => {
                    const y = baseY - (tickValue / maxIncome) * plotHeight
                    return (
                      <g key={`tick-${index}`}>
                        <line
                          x1={chartPadding.left}
                          y1={y}
                          x2={chartWidth - chartPadding.right}
                          y2={y}
                          stroke="#d7d7d7"
                          strokeWidth="1"
                          strokeDasharray="4 6"
                        />
                        <text
                          x={chartPadding.left - 10}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="12"
                          fill="#94a3b8"
                          fontWeight="600"
                        >
                          {formatYAxis(tickValue)}
                        </text>
                      </g>
                    )
                  })}

                  <path d={areaPath} fill="#4cd34c" fillOpacity="0.12" />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#4cd34c"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {chartPoints.map((point) => (
                    <text
                      key={`month-${point.month}`}
                      x={point.x}
                      y={chartHeight - 8}
                      textAnchor="middle"
                      fontSize="12"
                      fill="#94a3b8"
                      fontWeight="500"
                    >
                      {point.month}
                    </text>
                  ))}
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <div><h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Transaction History</h2><p className="text-gray-500 text-sm">Full log of payments.</p></div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
            <button 
              onClick={() => {
                setPaymentForm({
                  tenant_id: '',
                  property_id: '',
                  landlord_id: '',
                  rent_amount: 0,
                  water_bill: 0,
                  electrical_bill: 0,
                  wifi_bill: 0,
                  other_bills: 0,
                  bills_description: '',
                  due_date: new Date().toISOString().split('T')[0],
                  status: 'pending'
                });
                setEditingPayment(null);
                setShowPaymentModal(true);
              }}
              className="px-4 py-2 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-all cursor-pointer flex items-center gap-2 text-sm whitespace-nowrap order-last sm:order-first"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Send Payment
            </button>
            <Input placeholder="Search transaction..." value={search} onChange={e => setSearch(e.target.value)} className="w-full md:w-64" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded px-3 py-2 bg-gray-50 focus:ring-2 focus:ring-black outline-none cursor-pointer font-medium w-full sm:w-auto">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="completed">Completed</option>
              <option value="confirmed">Confirmed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px] md:min-w-0">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Date</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Tenant</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Landlord</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Property</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase text-right">Amount</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPayments.map(p => (
                  <tr key={p.id} className="transition-colors cursor-pointer" onClick={() => setSelectedPaymentLog(p)}>
                    <td className="p-4 md:p-5 text-xs text-gray-500 font-mono whitespace-nowrap">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="p-4 md:p-5 font-bold text-gray-900 whitespace-nowrap">{p.tenant_profile?.first_name} {p.tenant_profile?.last_name}</td>
                    <td className="p-4 md:p-5 text-sm text-gray-700 whitespace-nowrap">{p.property?.landlord_profile?.first_name || 'N/A'} {p.property?.landlord_profile?.last_name || ''}</td>
                    <td className="p-4 md:p-5 text-sm text-gray-600 max-w-[150px] truncate" title={p.property?.title}>{p.property?.title || 'N/A'}</td>
                    <td className="p-4 md:p-5 text-right font-bold text-gray-900 whitespace-nowrap">₱{(p.display_amount || 0).toLocaleString()}</td>
                    <td className="p-4 md:p-5 text-right whitespace-nowrap"><Badge variant='default'>{p.status}</Badge></td>
                  </tr>
                ))}
                {filteredPayments.length === 0 && <EmptyStateRow colSpan={6} message="No transactions found." />}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={totalPayments}
            pageSize={PAYMENTS_PAGE_SIZE}
            onPageChange={setCurrentPage}
            label="payments"
          />
        </div>
      </div>

      {selectedPaymentLog && (() => {
        const r = selectedPaymentLog
        const rent = parseFloat(r.rent_amount) || 0
        const water = parseFloat(r.water_bill) || 0
        const electric = parseFloat(r.electrical_bill) || 0
        const wifi = parseFloat(r.wifi_bill) || 0
        const other = parseFloat(r.other_bills) || 0
        const securityDeposit = parseFloat(r.security_deposit_amount) || 0
        const advance = parseFloat(r.advance_amount) || 0
        const total = rent + water + electric + wifi + other + securityDeposit + advance
        const billType = getBillType(r)
        const isPastDue = r.due_date && new Date(r.due_date) < new Date() && r.status === 'pending'

        return (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSelectedPaymentLog(null)} />
            <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
              <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-lg font-black">Bill Details</h3>
                <button onClick={() => setSelectedPaymentLog(null)} className="p-2 rounded-full transition-colors cursor-pointer">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <span className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full border ${r.status === 'paid' ? 'bg-green-50 text-green-700 border-green-200' : r.status === 'pending_confirmation' ? 'bg-yellow-50 text-yellow-700 border-yellow-200 border-dashed' : r.status === 'cancelled' ? 'bg-gray-100 text-gray-600 border-gray-300' : r.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : isPastDue ? 'bg-red-50 text-red-600 border-red-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                    {r.status === 'pending_confirmation' ? 'Confirming' : isPastDue ? 'Overdue' : (r.status || 'Pending')}
                  </span>
                  <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded">{billType}</span>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Property</label>
                  <p className="font-bold text-gray-900 mt-0.5">{r.property?.title || 'N/A'}{r.property?.area_sqft ? ` - ${r.property.area_sqft} sqm` : ''}</p>
                  {(r.property?.address || r.property?.city) && <p className="text-xs text-gray-500 mt-0.5">{r.property?.address || ''}{r.property?.city ? `${r.property?.address ? ', ' : ''}${r.property?.city}` : ''}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Landlord</label>
                    <p className="font-bold text-sm mt-0.5">{r.property?.landlord_profile?.first_name || ''} {r.property?.landlord_profile?.last_name || ''}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tenant</label>
                    <p className="font-bold text-sm mt-0.5">{r.tenant_profile?.first_name || ''} {r.tenant_profile?.last_name || ''}</p>
                  </div>
                </div>

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
                    <span className="text-sm font-bold text-gray-900">{r.payment_method === 'paymongo' ? 'E-Wallet / Cards' : r.payment_method === 'stripe' ? 'Stripe' : r.payment_method === 'qr_code' ? 'QR Code' : r.payment_method === 'cash' ? 'Cash' : '-'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs font-bold text-gray-400 uppercase">Reference No.</span>
                    <span className="text-sm font-bold font-mono text-gray-900">{r.tenant_reference_number || r.reference_number || '-'}</span>
                  </div>
                  <div className="py-2 border-b border-gray-50">
                    <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Message / Description</span>
                    <p className="text-sm text-gray-700">{r.bills_description || r.description || '-'}</p>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-100 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setPaymentForm({
                        tenant_id: r.tenant,
                        property_id: r.property_id,
                        landlord_id: r.landlord,
                        rent_amount: r.rent_amount,
                        water_bill: r.water_bill,
                        electrical_bill: r.electrical_bill,
                        wifi_bill: r.wifi_bill,
                        other_bills: r.other_bills,
                        bills_description: r.bills_description || r.description,
                        due_date: r.due_date,
                        status: r.status
                      });
                      setEditingPayment(r);
                      setShowPaymentModal(true);
                    }}
                    className="flex-1 py-3 bg-gray-100 text-gray-900 font-bold rounded-xl hover:bg-gray-200 transition-all cursor-pointer flex items-center justify-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Edit
                  </button>
                  {!['paid', 'completed', 'cancelled'].includes(r.status) && (
                    <button
                      onClick={() => {
                        if (confirm('Cancel this payment?')) handleCancelPayment(r.id, r.status);
                      }}
                      className="flex-1 py-3 bg-yellow-50 text-yellow-700 font-bold rounded-xl border border-yellow-100 hover:bg-yellow-100 transition-all cursor-pointer flex items-center justify-center gap-2 text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('Permanently delete this payment record?')) handleDeletePayment(r.id);
                    }}
                    className="col-span-2 py-3 bg-red-50 text-red-600 font-bold rounded-xl border border-red-100 hover:bg-red-100 transition-all cursor-pointer flex items-center justify-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete Record
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function BookingsView({ refreshTrigger, setBookingForm, setEditingBooking, setShowBookingEditModal, handleCancelBooking }) {
  const BOOKINGS_PAGE_SIZE = 10
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalBookings, setTotalBookings] = useState(0)

  useEffect(() => { setCurrentPage(1) }, [statusFilter])
  useEffect(() => { loadBookings() }, [currentPage, statusFilter, refreshTrigger])

  async function loadBookings() {
    setLoading(true)
    try {
      const filters = []
      if (statusFilter !== 'all') {
        filters.push({ type: 'eq', column: 'status', value: statusFilter })
      }

      const { data: bookingsData, count } = await adminFetch(
        'bookings',
        '*',
        filters,
        { column: 'created_at', ascending: false },
        { page: currentPage, pageSize: BOOKINGS_PAGE_SIZE },
        true
      )

      setTotalBookings(count || 0)
      if (bookingsData && bookingsData.length > 0) {
        const propIds = [...new Set(bookingsData.map(b => b.property_id).filter(Boolean))]
        const userIds = [...new Set([...bookingsData.map(b => b.tenant), ...bookingsData.map(b => b.landlord)].filter(Boolean))]

        let propMap = {}
        let userMap = {}

        if (propIds.length > 0) {
          const props = await adminFetch('properties', 'id, title', [{ type: 'in', column: 'id', value: propIds }])
          propMap = props?.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}) || {}
        }
        if (userIds.length > 0) {
          const users = await adminFetch('profiles', 'id, first_name, last_name, email', [{ type: 'in', column: 'id', value: userIds }])
          userMap = users?.reduce((acc, u) => ({ ...acc, [u.id]: u }), {}) || {}
        }

        const enriched = bookingsData.map(b => ({
          ...b,
          property_title: propMap[b.property_id]?.title || 'No Listing Available',
          tenant_name: userMap[b.tenant] ? `${userMap[b.tenant].first_name} ${userMap[b.tenant].last_name}` : 'Unknown',
          landlord_name: userMap[b.landlord] ? `${userMap[b.landlord].first_name} ${userMap[b.landlord].last_name}` : 'Unknown'
        }))
        setBookings(enriched)
      } else {
        setBookings([])
      }
    } catch (err) {
      console.error('Failed to load bookings:', err)
      setBookings([])
      setTotalBookings(0)
    }
    setLoading(false)
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('bookings').delete().eq('id', deleteId)
    if (error) showToast.error("Failed to delete")
    else { showToast.success("Deleted"); loadBookings() }
    setDeleteId(null)
  }

  const filtered = bookings.filter(b => {
    const matchesSearch = b.property_title.toLowerCase().includes(search.toLowerCase()) ||
      b.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
      b.landlord_name.toLowerCase().includes(search.toLowerCase())
    return matchesSearch
  })

  const uniqueStatuses = [...new Set(bookings.map(b => b.status).filter(Boolean))]

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-gray-100/80">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">All Bookings</h2>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Manage and review booking requests.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Input placeholder="Search bookings..." value={search} onChange={e => setSearch(e.target.value)} className="w-full md:w-64" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded px-3 py-2 bg-gray-50 focus:ring-2 focus:ring-black outline-none cursor-pointer font-medium w-full sm:w-auto">
            <option value="all">All Status</option>
            {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px] md:min-w-0">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Property</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Tenant</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Landlord</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Date</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Status</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(b => (
                  <tr key={b.id} className="transition-colors">
                    <td className="p-4 md:p-5 font-bold text-gray-900 text-sm whitespace-nowrap">{b.property_title}</td>
                    <td className="p-4 md:p-5 text-sm text-gray-600 whitespace-nowrap">{b.tenant_name}</td>
                    <td className="p-4 md:p-5 text-sm text-gray-600 whitespace-nowrap">{b.landlord_name}</td>
                    <td className="p-4 md:p-5 text-sm text-gray-600 whitespace-nowrap">{b.booking_date ? new Date(b.booking_date).toLocaleDateString() : 'N/A'}</td>
                    <td className="p-4 md:p-5"><Badge variant='default'>{b.status}</Badge></td>
                    <td className="p-4 md:p-5 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setBookingForm({ booking_date: b.booking_date, status: b.status });
                          setEditingBooking(b);
                          setShowBookingEditModal(true);
                        }} 
                        className="text-black bg-gray-100 font-bold text-[10px] cursor-pointer px-2 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                        title="Edit or Reschedule Booking"
                      >
                        Edit/Reschedule
                      </button>
                      {!['completed', 'cancelled'].includes(b.status) && (
                        <button 
                          onClick={() => {
                            if (confirm('Cancel this booking?')) handleCancelBooking(b.id, b.status);
                          }} 
                          className="text-yellow-700 bg-yellow-50 font-bold text-[10px] cursor-pointer px-2 py-1.5 rounded-lg border border-yellow-100 hover:bg-yellow-100 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      <button onClick={() => setDeleteId(b.id)} className="text-gray-700 font-bold text-[10px] cursor-pointer px-2 py-1.5 bg-gray-100 rounded-lg transition-colors whitespace-nowrap">Delete</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <EmptyStateRow colSpan={6} message="No bookings found." />}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={totalBookings}
            pageSize={BOOKINGS_PAGE_SIZE}
            onPageChange={setCurrentPage}
            label="bookings"
          />
        </div>
      )}
      <DeleteModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={confirmDelete} title="Delete Booking" message="Are you sure you want to delete this booking request?" />
    </div>
  )
}


function SchedulesView({ refreshTrigger, setScheduleForm, setEditingSchedule, setShowScheduleFormModal }) {
  const SLOTS_PAGE_SIZE = 10
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalSlots, setTotalSlots] = useState(0)

  useEffect(() => { loadSlots() }, [currentPage, refreshTrigger])

  async function loadSlots() {
    setLoading(true)
    try {
      const from = (currentPage - 1) * SLOTS_PAGE_SIZE
      const to = from + SLOTS_PAGE_SIZE - 1
      const { data: slotData, error, count } = await supabase
        .from('available_time_slots')
        .select('*', { count: 'exact' })
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .range(from, to)

      if (error) throw error
      setTotalSlots(count || 0)

      if (slotData && slotData.length > 0) {
        const userIds = [...new Set(slotData.map(s => s.landlord_id).filter(Boolean))]
        const { data: users } = await supabase.from('profiles').select('id, first_name, last_name').in('id', userIds)
        const userMap = users?.reduce((acc, u) => ({ ...acc, [u.id]: u }), {}) || {}
        const enriched = slotData.map(s => ({
          ...s,
          landlord_name: userMap[s.landlord_id] ? `${userMap[s.landlord_id].first_name} ${userMap[s.landlord_id].last_name}` : 'Unknown',
          formatted_date: new Date(s.start_time).toLocaleDateString(),
          formatted_time: `${new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        }))
        setSlots(enriched)
      } else {
        setSlots([])
      }
    } catch (error) {
      console.error('Failed to load schedule slots:', error)
      setSlots([])
      setTotalSlots(0)
    }
    setLoading(false)
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('available_time_slots').delete().eq('id', deleteId)
    if (error) showToast.error("Failed to delete")
    else { showToast.success("Deleted"); loadSlots() }
    setDeleteId(null)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Active Schedule Slots</h2>
        <button 
          onClick={() => {
            setScheduleForm({
              landlord_id: '',
              start_time: '',
              end_time: '',
              is_booked: false
            });
            setEditingSchedule(null);
            setShowScheduleFormModal(true);
          }}
          className="px-4 py-2 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-all cursor-pointer flex items-center gap-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Create Slot
        </button>
      </div>
      {loading ? <Spinner /> : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px] md:min-w-0">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Landlord</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Date</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Time</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Status</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {slots.map(s => (
                  <tr key={s.id}>
                    <td className="p-4 md:p-5 font-bold text-gray-900 text-sm whitespace-nowrap">{s.landlord_name}</td>
                    <td className="p-4 md:p-5 text-sm text-gray-600 whitespace-nowrap">{s.formatted_date}</td>
                    <td className="p-4 md:p-5 text-sm text-gray-600 whitespace-nowrap">{s.formatted_time}</td>
                    <td className="p-4 md:p-5"><Badge variant='default'>{s.is_booked ? 'Booked' : 'Available'}</Badge></td>
                    <td className="p-4 md:p-5 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setScheduleForm({
                            landlord_id: s.landlord_id,
                            start_time: s.start_time,
                            end_time: s.end_time,
                            is_booked: s.is_booked
                          });
                          setEditingSchedule(s);
                          setShowScheduleFormModal(true);
                        }}
                        className="text-black bg-gray-100 font-bold text-xs cursor-pointer px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Edit
                      </button>
                      {!s.is_booked && (
                        <button 
                          onClick={async () => {
                            if (confirm('Cancel this slot? (Mark as unavailable/booked)')) {
                              const { error } = await supabase.from('available_time_slots').update({ is_booked: true }).eq('id', s.id)
                              if (error) showToast.error("Failed to cancel slot")
                              else { showToast.success("Slot cancelled (marked as booked)"); loadSlots() }
                            }
                          }}
                          className="text-yellow-700 bg-yellow-50 font-bold text-xs cursor-pointer px-3 py-1.5 rounded-lg border border-yellow-100 hover:bg-yellow-100 transition-colors whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      )}
                      <button onClick={() => setDeleteId(s.id)} className="text-gray-700 font-bold text-xs cursor-pointer px-3 py-1.5 bg-gray-100 rounded-lg transition-colors whitespace-nowrap">Delete</button>
                    </td>
                  </tr>
                ))}
                {slots.length === 0 && <EmptyStateRow colSpan={5} message="No active slots found." />}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={totalSlots}
            pageSize={SLOTS_PAGE_SIZE}
            onPageChange={setCurrentPage}
            label="schedule slots"
          />
        </div>
      )}
      <DeleteModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={confirmDelete} title="Delete Schedule" message="Are you sure you want to remove this time slot?" />
    </div>
  )
}

function AdminProfileView({ session, profile }) {
  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    middle_name: profile?.middle_name || '',
    last_name: profile?.last_name || '',
    phone: profile?.phone || '',
    birthday: profile?.birthday || '',
    gender: profile?.gender || '',
  })
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    async function getEmail() {
      if (session?.user?.email) {
        setEmail(session.user.email)
      }
    }
    getEmail()
  }, [session])

  async function handleSaveProfile() {
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({
        first_name: form.first_name,
        middle_name: form.middle_name,
        last_name: form.last_name,
        phone: form.phone,
        birthday: form.birthday || null,
        gender: form.gender || null,
      }).eq('id', profile?.id)
      if (error) throw error
      showToast.success('Profile updated successfully')
    } catch (err) {
      showToast.error(err.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (!newPassword || newPassword.length < 6) {
      showToast.error('Password must be at least 6 characters')
      return
    }
    setSavingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      showToast.success('Password updated successfully')
      setNewPassword('')
    } catch (err) {
      showToast.error(err.message || 'Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500 max-w-none">
      <div className="pr-12">
        <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Admin Profile</h2>
        <p className="text-gray-500 mt-1 text-sm">Update your personal information and security settings.</p>
      </div>

      {/* Profile Details */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
        <h3 className="font-bold text-lg text-gray-900 mb-5">Personal Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">First Name</label>
            <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-black outline-none text-sm"
              value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Middle Name</label>
            <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-black outline-none text-sm"
              value={form.middle_name} onChange={e => setForm({ ...form, middle_name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Last Name</label>
            <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-black outline-none text-sm"
              value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Phone Number</label>
            <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-black outline-none text-sm"
              value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Birthday</label>
            <input type="date" className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-black outline-none text-sm"
              value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Gender</label>
            <select className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-black outline-none text-sm cursor-pointer"
              value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-xs font-bold text-gray-500 mb-1">Email Address</label>
          <input type="email" disabled className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 text-gray-500 text-sm cursor-not-allowed" value={email} />
          <p className="text-[10px] text-gray-400 mt-1">Email cannot be changed here. Contact support if needed.</p>
        </div>
        <div className="flex justify-end mt-6">
          <button onClick={handleSaveProfile} disabled={saving}
            className="w-full sm:w-auto px-6 py-3 bg-black text-white font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
        <h3 className="font-bold text-lg text-gray-900 mb-5">Security</h3>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">New Password</label>
          <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-white focus:ring-2 focus:ring-black outline-none text-sm"
            placeholder="Enter new password (min 6 characters)"
            value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </div>
        <div className="flex justify-end mt-6">
          <button onClick={handleChangePassword} disabled={savingPassword || !newPassword}
            className="w-full sm:w-auto px-6 py-3 bg-black text-white font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatAdminTicketDate(value) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function getTicketPersonName(profile) {
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
  return name || profile?.email || 'N/A'
}

function appendTicketComment(ticket, comment) {
  if (!ticket) return ticket

  return {
    ...ticket,
    updated_at: new Date().toISOString(),
    comments: [...(ticket.comments || []), comment]
  }
}

function getCommentAuthorLabel(comment, currentUserId) {
  if (comment.author_id === currentUserId) return 'You'
  if (comment.author?.role === 'admin') return 'Admin'
  return 'User'
}

function SupportTicketStatusBadge({ status }) {
  const variant = status === 'resolved' || status === 'closed'
    ? 'success'
    : status === 'pending'
      ? 'warning'
      : 'default'

  return (
    <Badge variant={variant}>
      {getSupportOptionLabel(SUPPORT_TICKET_STATUSES, status)}
    </Badge>
  )
}

function PendingTicketsView({ session, refreshTrigger, onPendingCountChange }) {
  const [tickets, setTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [commentBody, setCommentBody] = useState('')
  const [commenting, setCommenting] = useState(false)

  useEffect(() => { loadTickets() }, [statusFilter, refreshTrigger])

  async function loadTickets() {
    if (!session?.access_token) return

    setLoading(true)
    try {
      const res = await fetch(`/api/admin/support-tickets?status=${encodeURIComponent(statusFilter)}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load support tickets')

      const nextTickets = data.tickets || []
      setTickets(nextTickets)
      setSelectedTicket(prev => prev ? nextTickets.find(ticket => ticket.id === prev.id) || null : prev)
      onPendingCountChange?.(data.pendingCount || 0)
    } catch (error) {
      console.error('Failed to load support tickets:', error)
      showToast.error(error.message || 'Failed to load support tickets')
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  async function updateTicket(ticketId, action, status = null) {
    if (!session?.access_token) return

    setUpdatingId(ticketId)
    try {
      const res = await fetch('/api/admin/support-tickets', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ ticketId, action, status })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update ticket')

      setTickets(prev => {
        if (statusFilter !== 'all' && data.ticket?.status !== statusFilter) {
          return prev.filter(ticket => ticket.id !== ticketId)
        }
        return prev.map(ticket => ticket.id === ticketId ? data.ticket : ticket)
      })
      setSelectedTicket(prev => prev?.id === ticketId ? data.ticket : prev)
      onPendingCountChange?.(data.pendingCount || 0)
      showToast.success(action === 'claim' ? 'Ticket claimed' : 'Ticket updated')
    } catch (error) {
      showToast.error(error.message || 'Failed to update ticket')
    } finally {
      setUpdatingId(null)
    }
  }

  async function submitTicketComment(event) {
    event.preventDefault()

    if (!selectedTicket || !session?.access_token) return

    const body = commentBody.trim()
    if (!body) return

    setCommenting(true)
    try {
      const res = await fetch('/api/support-ticket-comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          body
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add comment')

      setTickets(prev => prev.map(ticket => (
        ticket.id === selectedTicket.id ? appendTicketComment(ticket, data.comment) : ticket
      )))
      setSelectedTicket(prev => appendTicketComment(prev, data.comment))
      setCommentBody('')
      showToast.success('Comment added')
    } catch (error) {
      showToast.error(error.message || 'Failed to add comment')
    } finally {
      setCommenting(false)
    }
  }

  const filteredTickets = tickets.filter(ticket => {
    const term = search.trim().toLowerCase()
    if (!term) return true

    return (
      formatSupportTicketId(ticket.id).toLowerCase().includes(term) ||
      (ticket.subject || '').toLowerCase().includes(term) ||
      (ticket.description || '').toLowerCase().includes(term) ||
      (ticket.issue || '').toLowerCase().includes(term) ||
      getTicketPersonName(ticket.requester).toLowerCase().includes(term) ||
      (ticket.requester?.email || '').toLowerCase().includes(term)
    )
  })
  const selectedTicketCanComment = selectedTicket?.claimed_by === session?.user?.id
  const selectedTicketIsClosed = selectedTicket?.status === 'closed'
  const selectedTicketAssignedToOtherAdmin = Boolean(selectedTicket?.claimed_by && !selectedTicketCanComment)

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-gray-100/80">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Pending Tickets</h2>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Review, claim, and resolve Help Center requests.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Input placeholder="Search request..." value={search} onChange={e => setSearch(e.target.value)} className="w-full md:w-64" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded px-3 py-2 bg-gray-50 focus:ring-2 focus:ring-black outline-none cursor-pointer font-medium w-full sm:w-auto">
            <option value="all">All Status</option>
            {SUPPORT_TICKET_STATUSES.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[1000px] md:min-w-0">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">ID of the Request</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Subject</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Requester</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Created</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Status</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Claimed By</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTickets.map(ticket => (
                  <tr
                    key={ticket.id}
                    onClick={() => {
                      setSelectedTicket(ticket)
                      setCommentBody('')
                    }}
                    className="transition-colors hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="p-4 md:p-5 text-sm font-mono font-bold text-gray-800 whitespace-nowrap">{formatSupportTicketId(ticket.id)}</td>
                    <td className="p-4 md:p-5">
                      <div className="font-bold text-gray-900 text-sm">{ticket.subject}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{getSupportOptionLabel(SUPPORT_TICKET_REQUEST_TYPES, ticket.request_type)}</div>
                    </td>
                    <td className="p-4 md:p-5">
                      <div className="text-sm font-bold text-gray-900 whitespace-nowrap">{getTicketPersonName(ticket.requester)}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5 break-all">{ticket.requester?.email || 'No email'}</div>
                    </td>
                    <td className="p-4 md:p-5 text-sm text-gray-700 whitespace-nowrap">{formatAdminTicketDate(ticket.created_at)}</td>
                    <td className="p-4 md:p-5">
                      <SupportTicketStatusBadge status={ticket.status} />
                    </td>
                    <td className="p-4 md:p-5 text-sm text-gray-700 whitespace-nowrap">
                      {ticket.claimed_by_profile ? getTicketPersonName(ticket.claimed_by_profile) : 'Unclaimed'}
                    </td>
                    <td className="p-4 md:p-5 text-right">
                      {!ticket.claimed_by && (
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation()
                            updateTicket(ticket.id, 'claim')
                          }}
                          disabled={updatingId === ticket.id}
                          className="text-black bg-gray-100 font-bold text-[10px] cursor-pointer px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                        >
                          {updatingId === ticket.id ? 'Claiming...' : 'Claim'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredTickets.length === 0 && <EmptyStateRow colSpan={7} message="No support tickets found." />}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTicket && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedTicket(null)}></div>
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="font-black text-gray-900">{selectedTicket.subject}</h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{formatSupportTicketId(selectedTicket.id)}</p>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer text-gray-400">Close</button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-145px)] space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TicketDetail label="Request Type" value={getSupportOptionLabel(SUPPORT_TICKET_REQUEST_TYPES, selectedTicket.request_type)} />
                <TicketDetail label="Issue" value={getSupportOptionLabel(SUPPORT_TICKET_ISSUES, selectedTicket.issue)} />
                <TicketDetail label="Phone Number" value={selectedTicket.phone_number || 'N/A'} />
                <TicketDetail label="Created" value={formatAdminTicketDate(selectedTicket.created_at)} />
                <TicketDetail label="Requester" value={getTicketPersonName(selectedTicket.requester)} />
                <TicketDetail label="Requester Email" value={selectedTicket.requester?.email || 'N/A'} />
                <TicketDetail label="Claimed By" value={selectedTicket.claimed_by_profile ? getTicketPersonName(selectedTicket.claimed_by_profile) : 'Unclaimed'} />
              </div>

              <div>
                <p className="text-xs font-black text-gray-500 uppercase mb-2">Subject</p>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-gray-900">{selectedTicket.subject}</div>
              </div>

              <div>
                <p className="text-xs font-black text-gray-500 uppercase mb-2">Description</p>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedTicket.description}</div>
              </div>

              <div>
                <p className="text-xs font-black text-gray-500 uppercase mb-2">Attachments</p>
                {Array.isArray(selectedTicket.attachments) && selectedTicket.attachments.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedTicket.attachments.map((file, index) => (
                      <a
                        key={`${file.url}-${index}`}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-2xl border border-gray-200 bg-white p-4 text-sm font-bold text-gray-800 hover:bg-gray-50 transition-colors truncate"
                      >
                        {file.name || `Attachment ${index + 1}`}
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">No attachments.</div>
                )}
              </div>

              <div>
                <p className="text-xs font-black text-gray-500 uppercase mb-2">Comments</p>
                <div className="space-y-4">
                  {(selectedTicket.comments || []).length > 0 ? (
                    selectedTicket.comments.map(comment => (
                      <div key={comment.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <div className="inline-flex max-w-full items-center gap-3 rounded-2xl bg-gray-200/70 px-4 py-3">
                          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-xs font-black text-gray-500 flex-shrink-0">
                            {getTicketPersonName(comment.author).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-sm font-black text-gray-900 truncate">
                                {comment.author_id === session?.user?.id ? 'You' : getTicketPersonName(comment.author)}
                              </p>
                              <span className="text-[10px] font-black uppercase text-gray-500 bg-white rounded-full px-2 py-0.5">
                                {getCommentAuthorLabel(comment, session?.user?.id)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">{formatAdminTicketDate(comment.created_at)}</p>
                          </div>
                        </div>
                        <p className="mt-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{comment.body}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">No comments yet.</div>
                  )}

                  {selectedTicketIsClosed ? (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-600">
                      This ticket is closed. Comments are disabled.
                    </div>
                  ) : selectedTicketCanComment ? (
                    <form onSubmit={submitTicketComment} className="pt-1">
                      <label className="block">
                        <span className="block text-sm font-bold text-gray-700 mb-2">Add Comment</span>
                        <textarea
                          rows={4}
                          maxLength={2000}
                          value={commentBody}
                          onChange={event => setCommentBody(event.target.value)}
                          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black resize-none"
                          placeholder="Write your reply"
                        />
                      </label>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="submit"
                          disabled={commenting || !commentBody.trim()}
                          className="px-5 py-2.5 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {commenting ? 'Sending...' : 'Send Comment'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                      {selectedTicketAssignedToOtherAdmin ? 'Only the assigned admin can comment on this ticket.' : 'Claim this ticket before replying.'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-gray-500 uppercase">Status</span>
                <select
                  value={selectedTicket.status}
                  onChange={event => updateTicket(selectedTicket.id, 'status', event.target.value)}
                  disabled={updatingId === selectedTicket.id}
                  className="border rounded-xl px-3 py-2 bg-white text-sm font-bold focus:ring-2 focus:ring-black outline-none cursor-pointer disabled:opacity-50"
                >
                  {SUPPORT_TICKET_STATUSES.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              {!selectedTicket.claimed_by && (
                <button
                  type="button"
                  onClick={() => updateTicket(selectedTicket.id, 'claim')}
                  disabled={updatingId === selectedTicket.id}
                  className="px-5 py-2.5 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {updatingId === selectedTicket.id ? 'Claiming...' : 'Claim Ticket'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TicketDetail({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-black text-gray-500 uppercase mb-2">{label}</p>
      <p className="text-sm font-bold text-gray-900 break-words">{value}</p>
    </div>
  )
}

function MaintenanceMonitoringView({ refreshTrigger, setMaintenanceForm, setEditingMaintenance, setShowMaintenanceModal, handleCancelMaintenance, handleDeleteMaintenance }) {
  const MAINTENANCE_PAGE_SIZE = 10
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalRequests, setTotalRequests] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { setCurrentPage(1) }, [statusFilter, search])
  useEffect(() => { loadRequests() }, [currentPage, statusFilter, search, refreshTrigger])

  async function loadRequests() {
    setLoading(true)
    try {
      const filters = []
      if (statusFilter !== 'all') {
        filters.push({ type: 'eq', column: 'status', value: statusFilter })
      }
      
      const { data, count } = await adminFetch(
        'maintenance_requests',
        '*, property:properties(id, title, landlord_profile:profiles!properties_landlord_fkey(first_name, last_name)), tenant_profile:profiles!maintenance_requests_tenant_fkey(first_name, last_name)',
        filters,
        { column: 'created_at', ascending: false },
        { page: currentPage, pageSize: MAINTENANCE_PAGE_SIZE },
        true
      )

      setRequests(data || [])
      setTotalRequests(count || 0)
    } catch (error) {
      console.error('Failed to load maintenance requests:', error)
      setRequests([])
      setTotalRequests(0)
    }
    setLoading(false)
  }

  const filteredRequests = requests.filter(r => {
    const term = search.toLowerCase()
    return (
      (r.title || '').toLowerCase().includes(term) ||
      (r.property?.title || '').toLowerCase().includes(term) ||
      (r.tenant_profile ? `${r.tenant_profile.first_name} ${r.tenant_profile.last_name}`.toLowerCase().includes(term) : false) ||
      (r.id || '').toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-gray-100/80">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Maintenance Monitoring</h2>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Monitor all maintenance requests across the platform.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Input placeholder="Search requests..." value={search} onChange={e => setSearch(e.target.value)} className="w-full md:w-64" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded px-3 py-2 bg-gray-50 focus:ring-2 focus:ring-black outline-none cursor-pointer font-medium w-full sm:w-auto">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px] md:min-w-0">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Request</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Property</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Tenant</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Landlord</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Status</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRequests.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-gray-50">
                    <td className="p-4 md:p-5">
                      <div className="font-bold text-gray-900 text-sm whitespace-nowrap">{r.title}</div>
                      <div className="text-[10px] text-gray-400 font-mono">ID: {r.id.slice(0, 8)}...</div>
                    </td>
                    <td className="p-4 md:p-5">
                      <div className="text-sm font-medium text-gray-900 whitespace-nowrap">{r.property?.title || 'Unknown'}</div>
                    </td>
                    <td className="p-4 md:p-5 text-sm text-gray-700 whitespace-nowrap">
                      {r.tenant ? `${r.tenant.first_name} ${r.tenant.last_name}` : 'Unknown'}
                    </td>
                    <td className="p-4 md:p-5 text-sm text-gray-700 whitespace-nowrap">
                      {r.property?.landlord_profile ? `${r.property.landlord_profile.first_name} ${r.property.landlord_profile.last_name}` : 'Unknown'}
                    </td>
                    <td className="p-4 md:p-5">
                      <Badge variant={r.status === 'completed' ? 'success' : r.status === 'pending' ? 'warning' : 'default'}>
                        {r.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="p-4 md:p-5 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setEditingMaintenance(r);
                          setMaintenanceForm({
                            title: r.title,
                            description: r.description,
                            status: r.status,
                            priority: r.priority || 'medium',
                            category: r.category || 'general',
                            attachment_urls: r.attachment_urls || []
                          });
                          setShowMaintenanceModal(true);
                        }}
                        className="text-black bg-gray-100 font-bold text-[10px] cursor-pointer px-2 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Edit
                      </button>
                      {r.status !== 'completed' && r.status !== 'cancelled' && (
                        <button 
                          onClick={() => {
                            if (confirm('Cancel this maintenance request?')) handleCancelMaintenance(r.id, r.status);
                          }}
                          className="text-yellow-700 bg-yellow-50 font-bold text-[10px] cursor-pointer px-2 py-1.5 rounded-lg border border-yellow-100 hover:bg-yellow-100 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          if (confirm('Permanently delete this maintenance request?')) handleDeleteMaintenance(r.id);
                        }}
                        className="text-red-700 bg-red-50 font-bold text-[10px] cursor-pointer px-2 py-1.5 rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredRequests.length === 0 && <EmptyStateRow colSpan={6} message="No maintenance requests found." />}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={totalRequests}
            pageSize={MAINTENANCE_PAGE_SIZE}
            onPageChange={setCurrentPage}
            label="requests"
          />
        </div>
      )}
    </div>
  )
}

function LeaveMonitoringView({ refreshTrigger, setLeaveForm, setEditingLeave, setShowLeaveModal, handleDeleteLeave }) {
  const LEAVE_PAGE_SIZE = 10
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalRequests, setTotalRequests] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { setCurrentPage(1) }, [statusFilter, search])
  useEffect(() => { loadRequests() }, [currentPage, statusFilter, search, refreshTrigger])

  async function loadRequests() {
    setLoading(true)
    try {
      const filters = []
      if (statusFilter !== 'all') {
        filters.push({ type: 'eq', column: 'end_request_status', value: statusFilter })
      } else {
        filters.push({ type: 'not_null', column: 'end_request_status' })
      }
      
      const { data, count } = await adminFetch(
        'tenant_occupancies',
        '*, property:properties(id, title, address, city, landlord_profile:profiles!properties_landlord_fkey(first_name, last_name)), tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone, email, avatar_url)',
        filters,
        { column: 'end_requested_at', ascending: false },
        { page: currentPage, pageSize: LEAVE_PAGE_SIZE },
        true
      )

      setRequests(data || [])
      setTotalRequests(count || 0)
    } catch (error) {
      console.error('Failed to load leave requests:', error)
      setRequests([])
      setTotalRequests(0)
    }
    setLoading(false)
  }

  const filteredRequests = requests.filter(r => {
    const term = search.toLowerCase()
    return (
      (r.property?.title || '').toLowerCase().includes(term) ||
      (r.tenant_profile ? `${r.tenant_profile.first_name} ${r.tenant_profile.last_name}`.toLowerCase().includes(term) : false) ||
      (r.end_request_reason || '').toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-gray-100/80">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Leave Monitoring</h2>
          <p className="text-gray-500 mt-1 text-sm md:text-base">Track and monitor tenant move-out requests.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Input placeholder="Search move-outs..." value={search} onChange={e => setSearch(e.target.value)} className="w-full md:w-64" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded px-3 py-2 bg-gray-50 focus:ring-2 focus:ring-black outline-none cursor-pointer font-medium w-full sm:w-auto">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="all">All Requests</option>
          </select>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px] md:min-w-0">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Property</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Tenant</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Landlord</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Reason</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Leave Date</th>
                  <th className="p-4 md:p-5 text-xs font-black text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRequests.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-gray-50">
                    <td className="p-4 md:p-5">
                      <div className="font-bold text-gray-900 text-sm whitespace-nowrap">{r.property?.title || 'Unknown'}</div>
                    </td>
                    <td className="p-4 md:p-5 text-sm font-medium text-gray-800 whitespace-nowrap">
                      {r.tenant ? `${r.tenant.first_name} ${r.tenant.last_name}` : 'Unknown'}
                    </td>
                    <td className="p-4 md:p-5 text-sm text-gray-700 whitespace-nowrap">
                      {r.property?.landlord_profile ? `${r.property.landlord_profile.first_name} ${r.property.landlord_profile.last_name}` : 'Unknown'}
                    </td>
                    <td className="p-4 md:p-5">
                      <div className="text-xs text-gray-600 max-w-[200px] line-clamp-2" title={r.end_request_reason}>{r.end_request_reason || '-'}</div>
                    </td>
                    <td className="p-4 md:p-5 text-sm text-gray-900 font-bold whitespace-nowrap">
                      {r.end_request_date ? new Date(r.end_request_date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-4 md:p-5">
                      <Badge variant={r.end_request_status === 'completed' ? 'success' : r.end_request_status === 'approved' ? 'success' : r.end_request_status === 'pending' ? 'warning' : 'default'}>
                        {r.end_request_status}
                      </Badge>
                    </td>
                    <td className="p-4 md:p-5 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setEditingLeave(r);
                          setLeaveForm({
                            end_request_status: r.end_request_status || 'pending',
                            end_request_reason: r.end_request_reason || '',
                            end_request_date: r.end_request_date || ''
                          });
                          setShowLeaveModal(true);
                        }}
                        className="text-black bg-gray-100 font-bold text-[10px] cursor-pointer px-2 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => {
                          if (confirm('Permanently delete this occupancy record? This cannot be undone.')) handleDeleteLeave(r.id);
                        }}
                        className="text-red-700 bg-red-50 font-bold text-[10px] cursor-pointer px-2 py-1.5 rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredRequests.length === 0 && <EmptyStateRow colSpan={6} message="No move-out requests found." />}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={totalRequests}
            pageSize={LEAVE_PAGE_SIZE}
            onPageChange={setCurrentPage}
            label="requests"
          />
        </div>
      )}
    </div>
  )
}

function ManagementModal({ title, children, onClose, onSave }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-black text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer text-gray-400">✕</button>
        </div>
        <div className="p-6">
          {children}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">Cancel</button>
          <button onClick={onSave} className="px-6 py-2.5 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all shadow-sm cursor-pointer">Save Changes</button>
        </div>
      </div>
    </div>
  )
}

function PaginationControls({ currentPage, totalItems, pageSize, onPageChange, label = 'items' }) {
  const totalPages = Math.max(1, Math.ceil((totalItems || 0) / pageSize))
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
      <p className="text-xs text-gray-600">
        Showing {start}-{end} of {totalItems} {label}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <span className="text-xs font-semibold text-gray-700">Page {currentPage} / {totalPages}</span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  )
}

