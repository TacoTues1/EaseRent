import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { createNotification, NotificationTemplates } from '../lib/notifications'
import { showToast } from 'nextjs-toast-notify'

const MAX_ACTIVE_MAINTENANCE_REQUESTS = 2
const ACTIVE_MAINTENANCE_STATUSES = ['pending', 'scheduled', 'in_progress']
const MAINTENANCE_REQUESTS_PER_PAGE = 5

export default function MaintenancePage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [requests, setRequests] = useState([])
  const [totalRequestCount, setTotalRequestCount] = useState(0)
  const [properties, setProperties] = useState([])
  const [occupiedProperty, setOccupiedProperty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [responseText, setResponseText] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [requestToCancel, setRequestToCancel] = useState(null)
  const [showDoneConfirmModal, setShowDoneConfirmModal] = useState(false)
  const [requestToMarkDone, setRequestToMarkDone] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchId, setSearchId] = useState('')
  const [proofFiles, setProofFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [requestToSchedule, setRequestToSchedule] = useState(null)
  const [scheduleModalMode, setScheduleModalMode] = useState('schedule')
  const [scheduleDate, setScheduleDate] = useState('')
  const [repairmanName, setRepairmanName] = useState('')
  const [formData, setFormData] = useState({
    property_id: '',
    title: '',
    description: '',
    priority: 'normal'
  })
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [requestForFeedback, setRequestForFeedback] = useState(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [submittingFeedback, setSubmittingFeedback] = useState(false)
  const [showEditRequestModal, setShowEditRequestModal] = useState(false)
  const [requestToEdit, setRequestToEdit] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState('normal')
  const [editExistingProofs, setEditExistingProofs] = useState([])
  const [editNewFiles, setEditNewFiles] = useState([])
  const [savingEditRequest, setSavingEditRequest] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  // Maintenance cost states
  const [showCostModal, setShowCostModal] = useState(false)
  const [requestToComplete, setRequestToComplete] = useState(null)
  const [maintenanceCost, setMaintenanceCost] = useState('')
  const [deductFromDeposit, setDeductFromDeposit] = useState(true)
  const [depositCheckLoading, setDepositCheckLoading] = useState(false)
  const [depositAvailableAmount, setDepositAvailableAmount] = useState(0)
  const [depositOccupancyId, setDepositOccupancyId] = useState(null)
  const [billingTenantId, setBillingTenantId] = useState(null)
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    scheduled: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-orange-100 text-orange-800',
    completed: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800'
  }

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
      } else {
        router.push('/')
      }
    })
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (data) setProfile(data)
  }

  useEffect(() => {
    if (session && profile) {
      loadProperties()
    }
  }, [session, profile])

  useEffect(() => {
    if (session && profile) {
      loadRequests(currentPage, statusFilter, searchId)
    }
  }, [session, profile, currentPage, statusFilter, searchId])

  useEffect(() => {
    if (!session || !profile) return

    const interval = setInterval(() => {
      loadRequests(currentPage, statusFilter, searchId)
    }, 30000)

    return () => clearInterval(interval)
  }, [session, profile, currentPage, statusFilter, searchId])

  async function autoStartDueMaintenanceForLandlord(propertyIds) {
    if (!propertyIds || propertyIds.length === 0) return

    const nowISO = new Date().toISOString()

    const { data: dueRequests, error: dueError } = await supabase
      .from('maintenance_requests')
      .select('id, title, tenant')
      .in('property_id', propertyIds)
      .eq('status', 'scheduled')
      .lte('scheduled_date', nowISO)

    if (dueError) {
      console.error('Auto-start due maintenance check failed:', dueError)
      return
    }

    if (!dueRequests || dueRequests.length === 0) return

    const dueIds = dueRequests.map(r => r.id)
    const { error: updateError } = await supabase
      .from('maintenance_requests')
      .update({ status: 'in_progress' })
      .in('id', dueIds)

    if (updateError) {
      console.error('Auto-start due maintenance update failed:', updateError)
      return
    }

    for (const req of dueRequests) {
      if (!req.tenant) continue
      await createNotification({
        recipient: req.tenant,
        actor: session.user.id,
        type: 'maintenance_status',
        message: `The scheduled repair for "${req.title}" has now started!`,
        link: '/maintenance'
      })
    }
  }

  async function loadRequests(page = currentPage, selectedStatus = statusFilter, searchTerm = searchId) {
    let query = supabase
      .from('maintenance_requests')
      .select('*, properties(title, landlord), tenant_profile:profiles!maintenance_requests_tenant_fkey(first_name, middle_name, last_name)', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (selectedStatus !== 'all') {
      query = query.eq('status', selectedStatus)
    }

    const trimmedSearch = (searchTerm || '').trim().toLowerCase()

    if (profile?.role === 'tenant') {
      let tenantIds = [session.user.id]

      const { data: myOcc } = await supabase
        .from('tenant_occupancies')
        .select('id, is_family_member')
        .eq('tenant_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (myOcc && !myOcc.is_family_member) {
        const { data: fms } = await supabase
          .from('family_members')
          .select('member_id')
          .eq('parent_occupancy_id', myOcc.id)
        if (fms) {
          tenantIds = [...tenantIds, ...fms.map(f => f.member_id)]
        }
      } else if (!myOcc) {
        try {
          const res = await fetch(`/api/family-members?member_id=${session.user.id}`)
          const fmData = await res.json()
          if (fmData && fmData.occupancy) {
            tenantIds = [session.user.id] // family member fetches their own
          }
        } catch (e) { console.error('Error fetching family member requests', e) }
      }

      query = query.in('tenant', tenantIds)
    } else if (profile?.role === 'landlord') {
      const { data: myProps } = await supabase
        .from('properties')
        .select('id')
        .eq('landlord', session.user.id)

      if (myProps && myProps.length > 0) {
        const propIds = myProps.map(p => p.id)

        // Auto-transition due scheduled tasks when time has arrived.
        await autoStartDueMaintenanceForLandlord(propIds)

        query = query.in('property_id', propIds)
      } else {
        setRequests([])
        setTotalRequestCount(0)
        setLoading(false)
        return
      }
    }

    let requestRows = []
    let requestCount = 0

    if (trimmedSearch) {
      const { data, error } = await query

      if (error) {
        console.error('Error loading maintenance requests:', error)
        setRequests([])
        setTotalRequestCount(0)
        setLoading(false)
        return
      }

      const idMatchedRows = (data || []).filter((row) =>
        String(row.id || '').toLowerCase().includes(trimmedSearch)
      )

      requestCount = idMatchedRows.length
      const from = (page - 1) * MAINTENANCE_REQUESTS_PER_PAGE
      const to = from + MAINTENANCE_REQUESTS_PER_PAGE
      requestRows = idMatchedRows.slice(from, to)
    } else {
      const from = (page - 1) * MAINTENANCE_REQUESTS_PER_PAGE
      const to = from + MAINTENANCE_REQUESTS_PER_PAGE - 1
      const { data, count, error } = await query.range(from, to)

      if (error) {
        console.error('Error loading maintenance requests:', error)
        setRequests([])
        setTotalRequestCount(0)
        setLoading(false)
        return
      }

      requestRows = data || []
      requestCount = count || 0
    }

    setTotalRequestCount(requestCount)

    if (requestRows.length > 0) {
      const tenantIdsInRequests = [...new Set(requestRows.map(r => r.tenant))]
      let fmMap = {}

      try {
        const res = await fetch('/api/family-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'lookup_members', member_ids: tenantIdsInRequests })
        })
        const fData = await res.json()
        fmMap = fData.membersMap || {}
      } catch (e) { console.error('Error fetching members lookup', e) }

      const enrichedRequests = requestRows.map(req => {
        // Freeze family member status directly from the table (new flow), or fallback to map (legacy)
        let isFam = req.is_family_member;
        let pName = req.primary_tenant_name;

        if (isFam === null || isFam === undefined) {
          isFam = !!fmMap[req.tenant];
          pName = fmMap[req.tenant] ? `${fmMap[req.tenant].first_name} ${fmMap[req.tenant].last_name}` : null;
        }

        return {
          ...req,
          is_family_member: isFam,
          primary_tenant_name: pName
        };
      })

      setRequests(enrichedRequests)
    } else {
      setRequests([])
    }
    setLoading(false)
  }

  async function loadProperties() {
    if (profile?.role === 'tenant') {
      const { data: occupancy } = await supabase
        .from('tenant_occupancies')
        .select('property_id, property:properties(id, title)')
        .eq('tenant_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle()

      let prop = null

      if (occupancy && occupancy.property) {
        prop = occupancy.property
      } else {
        try {
          const res = await fetch(`/api/family-members?member_id=${session.user.id}`)
          const fmData = await res.json()
          if (fmData && fmData.occupancy && fmData.occupancy.property) {
            prop = fmData.occupancy.property
          }
        } catch (e) { console.error('Error fetching family properties', e) }
      }

      if (prop) {
        setOccupiedProperty(prop)
        setProperties([prop])
        setFormData(prev => ({ ...prev, property_id: prop.id }))
      } else {
        const { data: acceptedApps } = await supabase
          .from('applications')
          .select('property_id, property:properties(id, title)')
          .eq('tenant', session.user.id)
          .eq('status', 'accepted')

        const approvedProperties = acceptedApps?.map(app => app.property).filter(Boolean) || []
        setProperties(approvedProperties)
        setOccupiedProperty(null)
      }
    } else if (profile?.role === 'landlord') {
      const { data } = await supabase
        .from('properties')
        .select('id, title')
        .eq('landlord', session.user.id)

      setProperties(data || [])
    }
  }

  async function updateRequestStatus(requestId, newStatus) {
    const { error } = await supabase
      .from('maintenance_requests')
      .update({
        status: newStatus,
        resolved_at: newStatus === 'completed' ? new Date().toISOString() : null
      })
      .eq('id', requestId)

    if (!error) {
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'maintenance_status',
          recordId: requestId,
          actorId: session.user.id
        })
      })
      showToast.success(`Status updated to ${newStatus.replace('_', ' ')}`, {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      loadRequests()

      const request = requests.find(r => r.id === requestId)
      if (request && request.tenant) {
        const template = NotificationTemplates.maintenanceStatusUpdate(
          request.title,
          newStatus
        )
        // If landlord is marking it as something, notify tenant
        if (profile?.role === 'landlord') {
          await createNotification({
            recipient: request.tenant,
            actor: session.user.id,
            type: template.type,
            message: template.message,
            link: '/maintenance'
          })
        }

        // If tenant is marking it as completed, notify landlord
        if (profile?.role === 'tenant' && newStatus === 'completed' && request.properties?.landlord) {
          await createNotification({
            recipient: request.properties.landlord,
            actor: session.user.id,
            type: 'maintenance_status',
            message: `${profile.first_name} marked maintenance "${request.title}" as Done!`,
            link: '/maintenance'
          })
        }
      }
    } else {
      showToast.error("Failed to update status");
    }
  }

  async function resolveBillingOccupancy(request) {
    if (!request?.tenant) return null

    let query = supabase
      .from('tenant_occupancies')
      .select('id, tenant_id, property_id, security_deposit, security_deposit_used')
      .eq('tenant_id', request.tenant)
      .in('status', ['active', 'pending_end'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (request?.property_id) {
      query = query.eq('property_id', request.property_id)
    }

    const { data: directOccupancy, error } = await query.maybeSingle()
    if (error) {
      console.error('Failed to load direct tenant occupancy for billing:', error)
    }
    if (directOccupancy) return directOccupancy

    // Family-member fallback: use parent occupancy (primary tenant billing account).
    try {
      const fmRes = await fetch(`/api/family-members?member_id=${request.tenant}`, { cache: 'no-store' })
      const fmData = await fmRes.json()
      const parentOcc = fmData?.occupancy || null

      if (!parentOcc) return null
      if (request?.property_id && parentOcc.property_id && parentOcc.property_id !== request.property_id) {
        return null
      }

      return {
        id: parentOcc.id,
        tenant_id: parentOcc.tenant_id,
        property_id: parentOcc.property_id,
        security_deposit: parentOcc.security_deposit,
        security_deposit_used: parentOcc.security_deposit_used
      }
    } catch (fmErr) {
      console.error('Failed to resolve family member parent occupancy:', fmErr)
      return null
    }
  }

  // Open cost modal before completing maintenance
  async function openCostModal(request) {
    setRequestToComplete(request)
    setMaintenanceCost('')
    setDeductFromDeposit(false)
    setDepositAvailableAmount(0)
    setDepositOccupancyId(null)
    setBillingTenantId(null)
    setDepositCheckLoading(true)
    setShowCostModal(true)

    try {
      if (!request?.tenant) return

      const occupancy = await resolveBillingOccupancy(request)

      if (!occupancy) {
        setBillingTenantId(request.tenant)
        return
      }

      const available = Math.max(
        0,
        (parseFloat(occupancy.security_deposit || 0) - parseFloat(occupancy.security_deposit_used || 0))
      )
      setDepositAvailableAmount(available)
      setDepositOccupancyId(occupancy.id)
      setBillingTenantId(occupancy.tenant_id || request.tenant)
    } finally {
      setDepositCheckLoading(false)
    }
  }

  // Complete maintenance with cost
  async function completeWithCost() {
    if (!requestToComplete) return

    if (depositCheckLoading) {
      showToast.error('Please wait while checking security deposit availability')
      return
    }

    const cost = parseFloat(maintenanceCost) || 0
    let effectiveOccupancyId = depositOccupancyId
    let effectiveTenantId = billingTenantId || requestToComplete.tenant

    if ((!effectiveOccupancyId || !effectiveTenantId) && requestToComplete?.tenant) {
      const resolved = await resolveBillingOccupancy(requestToComplete)
      if (resolved) {
        effectiveOccupancyId = resolved.id
        effectiveTenantId = resolved.tenant_id || effectiveTenantId
      }
    }

    const canDeductExactAmount = cost > 0 && !!depositOccupancyId && depositAvailableAmount >= cost
    const shouldDeductFromDeposit = deductFromDeposit && canDeductExactAmount

    if (deductFromDeposit && !canDeductExactAmount) {
      showToast.error('Security deposit is not enough for exact deduction. Send as payment cost instead.')
      return
    }

    // Update maintenance request with cost
    const { error: updateError } = await supabase
      .from('maintenance_requests')
      .update({
        status: 'completed',
        resolved_at: new Date().toISOString(),
        maintenance_cost: cost,
        cost_deducted_from_deposit: shouldDeductFromDeposit
      })
      .eq('id', requestToComplete.id)

    if (updateError) {
      showToast.error("Failed to complete maintenance");
      return
    }

    // If deducting from security deposit
    if (shouldDeductFromDeposit && cost > 0 && effectiveTenantId && effectiveOccupancyId) {
      const { data: latestOcc, error: latestOccError } = await supabase
        .from('tenant_occupancies')
        .select('id, security_deposit, security_deposit_used')
        .eq('id', effectiveOccupancyId)
        .maybeSingle()

      if (latestOccError || !latestOcc) {
        showToast.error('Failed to read tenant security deposit. Please try again.')
        return
      }

      const latestAvailable = Math.max(
        0,
        (parseFloat(latestOcc.security_deposit || 0) - parseFloat(latestOcc.security_deposit_used || 0))
      )

      if (latestAvailable < cost) {
        showToast.error('Security deposit is no longer enough for exact deduction. Send as payment cost instead.')
        return
      }

      const newUsed = (parseFloat(latestOcc.security_deposit_used || 0)) + cost
      const { error: depositUpdateError } = await supabase
        .from('tenant_occupancies')
        .update({ security_deposit_used: newUsed })
        .eq('id', effectiveOccupancyId)

      if (depositUpdateError) {
        console.error('Failed to update security deposit usage:', depositUpdateError)
      } else {
        // Notify tenant about deduction
        await createNotification({
          recipient: effectiveTenantId,
          actor: session.user.id,
          type: 'security_deposit_deduction',
          message: `₱${cost.toLocaleString()} has been deducted from your security deposit for maintenance: "${requestToComplete.title}"`,
          link: '/dashboard'
        })
      }
    }

    // If landlord chooses not to deduct, send maintenance cost as a payment bill to tenant.
    if (!shouldDeductFromDeposit && cost > 0 && effectiveTenantId) {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 7)

      const { data: bill, error: billError } = await supabase
        .from('payment_requests')
        .insert({
          landlord: session.user.id,
          tenant: effectiveTenantId,
          property_id: requestToComplete.property_id,
          occupancy_id: effectiveOccupancyId,
          rent_amount: 0,
          water_bill: 0,
          electrical_bill: 0,
          wifi_bill: 0,
          other_bills: cost,
          bills_description: `Maintenance cost for "${requestToComplete.title}"`,
          due_date: dueDate.toISOString(),
          status: 'pending'
        })
        .select('id')
        .single()

      if (billError) {
        console.error('Failed to create maintenance payment bill:', billError)
        showToast.error('Maintenance completed, but failed to create payment bill. Please retry.')
      } else if (bill?.id) {
        await createNotification({
          recipient: effectiveTenantId,
          actor: session.user.id,
          type: 'payment_request',
          message: `A maintenance cost bill of ₱${cost.toLocaleString()} was issued for "${requestToComplete.title}".`,
          link: '/payments'
        })

        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'payment_bill',
            recordId: bill.id,
            actorId: session.user.id
          })
        }).catch(err => console.error('Failed to trigger payment bill notify:', err))
      }
    }

    // Send regular completion notification
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'maintenance_status',
        recordId: requestToComplete.id,
        actorId: session.user.id
      })
    })

    if (requestToComplete.tenant) {
      const costMessage = cost > 0
        ? ` Maintenance cost: ₱${cost.toLocaleString()}${shouldDeductFromDeposit ? ' (deducted from security deposit)' : ' (sent as payment cost)'}.`
        : ''
      await createNotification({
        recipient: requestToComplete.tenant,
        actor: session.user.id,
        type: 'maintenance',
        message: `Maintenance "${requestToComplete.title}" has been completed.${costMessage}`,
        link: '/maintenance'
      })

      // Ensure tenant receives SMS + email whenever landlord logs maintenance cost.
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'maintenance_cost_logged',
          recordId: requestToComplete.id,
          actorId: session.user.id
        })
      }).catch(err => console.error('Failed to trigger maintenance cost notify:', err))
    }

    showToast.success('Maintenance completed!', {
      duration: 4000,
      progress: true,
      position: "top-center",
      transition: "bounceIn",
    });

    setShowCostModal(false)
    setRequestToComplete(null)
    setMaintenanceCost('')
    setDeductFromDeposit(false)
    setDepositAvailableAmount(0)
    setDepositOccupancyId(null)
    setBillingTenantId(null)
    loadRequests()
  }

  useEffect(() => {
    if (!showCostModal) return

    const enteredCost = parseFloat(maintenanceCost) || 0
    const canDeduct = enteredCost > 0 && !!depositOccupancyId && depositAvailableAmount >= enteredCost

    if (!canDeduct && deductFromDeposit) {
      setDeductFromDeposit(false)
    }
  }, [showCostModal, maintenanceCost, depositOccupancyId, depositAvailableAmount, deductFromDeposit])

  async function addResponse(requestId) {
    if (!responseText.trim()) return

    await updateRequestStatus(requestId, 'in_progress')

    const request = requests.find(r => r.id === requestId)
    if (request && request.tenant) {
      await createNotification({
        recipient: request.tenant,
        actor: session.user.id,
        type: 'maintenance',
        message: `Landlord responded to "${request.title}": ${responseText}`,
        link: '/maintenance'
      })
    }

    setResponseText('')
    setSelectedRequest(null)
    showToast.success("Response sent to tenant!", {
      duration: 4000,
      progress: true,
      position: "top-center",
      transition: "bounceIn",
      icon: '',
      sound: true,
    });
  }

  // --- File Upload Logic (Multiple Files) ---
  async function uploadProofFiles(files = proofFiles) {
    if (files.length === 0) return []

    const uploadPromises = files.map(async (file) => {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `${session.user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('maintenance-uploads')
        .upload(filePath, file)

      if (uploadError) {
        throw uploadError
      }

      const { data } = supabase.storage
        .from('maintenance-uploads')
        .getPublicUrl(filePath)

      return data.publicUrl
    })

    return Promise.all(uploadPromises)
  }

  function handleFileSelect(e) {
    const newFiles = Array.from(e.target.files)
    const maxFiles = 10
    const maxSize = 50 * 1024 * 1024 // 50MB per file

    // Filter valid files
    const validFiles = newFiles.filter(file => {
      if (file.size > maxSize) {
        showToast.warning(`${file.name} exceeds 50MB limit`);
        return false
      }
      return true
    })

    // Check total count
    if (proofFiles.length + validFiles.length > maxFiles) {
      showToast.error(`Maximum ${maxFiles} files allowed`);
      return
    }

    setProofFiles(prev => [...prev, ...validFiles])
  }

  function removeFile(index) {
    setProofFiles(prev => prev.filter((_, i) => i !== index))
  }

  function openEditRequestModal(request) {
    if (request?.tenant !== session?.user?.id) {
      showToast.error('You can only edit your own request')
      return
    }

    if (!['pending', 'scheduled'].includes(request?.status)) {
      showToast.error('You can only edit request details before work is in progress')
      return
    }

    setRequestToEdit(request)
    setEditTitle(request.title || '')
    setEditDescription(request.description || '')
    setEditPriority(request.priority || 'normal')
    setEditExistingProofs(Array.isArray(request.attachment_urls) ? request.attachment_urls : [])
    setEditNewFiles([])
    setShowEditRequestModal(true)
  }

  function closeEditRequestModal() {
    if (savingEditRequest) return
    setShowEditRequestModal(false)
    setRequestToEdit(null)
    setEditTitle('')
    setEditDescription('')
    setEditPriority('normal')
    setEditExistingProofs([])
    setEditNewFiles([])
  }

  function handleEditFileSelect(e) {
    const newFiles = Array.from(e.target.files || [])
    const maxFiles = 10
    const maxSize = 50 * 1024 * 1024 // 50MB per file

    const validFiles = newFiles.filter(file => {
      if (file.size > maxSize) {
        showToast.warning(`${file.name} exceeds 50MB limit`)
        return false
      }
      return true
    })

    if (editExistingProofs.length + editNewFiles.length + validFiles.length > maxFiles) {
      showToast.error(`Maximum ${maxFiles} files allowed`)
      return
    }

    setEditNewFiles(prev => [...prev, ...validFiles])
  }

  function removeExistingEditProof(index) {
    setEditExistingProofs(prev => prev.filter((_, i) => i !== index))
  }

  function removeEditNewFile(index) {
    setEditNewFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function saveEditedRequest() {
    if (!requestToEdit) return

    const cleanTitle = editTitle.trim()
    const cleanDescription = editDescription.trim()

    if (!cleanTitle || !cleanDescription) {
      showToast.error('Title and description are required')
      return
    }

    setSavingEditRequest(true)
    try {
      const uploadedUrls = await uploadProofFiles(editNewFiles)
      const finalAttachmentUrls = [...editExistingProofs, ...uploadedUrls]

      if (finalAttachmentUrls.length === 0) {
        showToast.error('At least one proof file is required')
        setSavingEditRequest(false)
        return
      }

      const { error } = await supabase
        .from('maintenance_requests')
        .update({
          title: cleanTitle,
          description: cleanDescription,
          priority: editPriority,
          attachment_urls: finalAttachmentUrls
        })
        .eq('id', requestToEdit.id)
        .eq('tenant', session.user.id)
        .in('status', ['pending', 'scheduled'])

      if (error) {
        showToast.error('Failed to update request details')
        setSavingEditRequest(false)
        return
      }

      if (requestToEdit?.properties?.landlord) {
        await createNotification({
          recipient: requestToEdit.properties.landlord,
          actor: session.user.id,
          type: 'maintenance_request',
          message: `${profile.first_name} ${profile.last_name} updated maintenance request: "${cleanTitle}"`,
          link: '/maintenance'
        })
      }

      showToast.success('Maintenance request updated')
      closeEditRequestModal()
      loadRequests()
    } catch (err) {
      console.error('Edit maintenance request failed:', err)
      showToast.error('Failed to update request details')
    }
    setSavingEditRequest(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const resolvedPropertyId = formData.property_id || occupiedProperty?.id || properties?.[0]?.id || ''

    if (!resolvedPropertyId) {
      showToast.error('No valid property found for this maintenance request.')
      return
    }

    const { count: activeCount, error: activeCountError } = await supabase
      .from('maintenance_requests')
      .select('*', { count: 'exact', head: true })
      .eq('tenant', session.user.id)
      .in('status', ACTIVE_MAINTENANCE_STATUSES)

    if (activeCountError) {
      showToast.error('Unable to validate maintenance request limit. Please try again.')
      return
    }

    if ((activeCount || 0) >= MAX_ACTIVE_MAINTENANCE_REQUESTS) {
      showToast.error(`You can only have up to ${MAX_ACTIVE_MAINTENANCE_REQUESTS} active maintenance requests.`)
      return
    }

    if (proofFiles.length === 0) {
      showToast.error("You must attach at least one picture or video as proof.");
      return
    }

    setUploading(true)
    const toastId = showToast.info("Uploading files");

    try {
      const attachmentUrls = await uploadProofFiles()

      // Calculate family member status
      let is_family = false;
      let primary_name = null;
      try {
        const fmRes = await fetch(`/api/family-members?member_id=${session.user.id}`);
        const fmData = await fmRes.json();
        if (fmData && fmData.occupancy && fmData.occupancy.tenant) {
          is_family = true;
          primary_name = `${fmData.occupancy.tenant.first_name} ${fmData.occupancy.tenant.last_name}`;
        }
      } catch (e) {
        console.error('Error checking family member info', e);
      }

      const { data: insertData, error } = await supabase.from('maintenance_requests').insert({
        ...formData,
        property_id: resolvedPropertyId,
        tenant: session.user.id,
        status: 'pending',
        attachment_urls: attachmentUrls, // Save array of file URLs
        is_family_member: is_family,
        primary_tenant_name: primary_name
      }).select('*, properties(title, landlord)')

      if (error) throw error
      if (insertData && insertData[0]) {
        const property = insertData[0].properties

        // --- NOTIFICATION LOGIC (SMS + In-App) ---
        if (property && property.landlord) {

          // 1. In-App Notification
          await createNotification({
            recipient: property.landlord,
            actor: session.user.id,
            type: 'maintenance_request',
            message: `${profile.first_name} ${profile.last_name} submitted a new maintenance request: "${formData.title}"`,
            link: '/dashboard' // or /maintenance
          })

          // 2. Fetch Landlord Phone Number for SMS
          const { data: landlordProfile } = await supabase
            .from('profiles')
            .select('phone')
            .eq('id', property.landlord)
            .single()

          // 3. Send SMS if phone exists
          if (landlordProfile?.phone) {
            await fetch('/api/send-sms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phoneNumber: landlordProfile.phone,
                message: `EaseRent Alert: New maintenance request for "${property.title}". Title: ${formData.title}. Log in to view.`
              })
            })
          }
        }

        setFormData(prev => ({
          ...prev,
          property_id: resolvedPropertyId,
          title: '',
          description: '',
          priority: 'normal'
        }))
        setProofFiles([]) // Reset files
        setShowModal(false)
        loadRequests()
        showToast.success(`Request submitted successfully!`, {
          duration: 4000,
          progress: true,
          // position: "top-center",
          transition: "bounceIn",
        });
      }
    } catch (error) {
      console.error(error)
      showToast.error('Error submitting request: ' + error.message, { id: toastId });
    } finally {
      setUploading(false)
    }
  }

  // --- FEEDBACK LOGIC (TEXT ONLY) ---
  function openFeedbackModal(request) {
    setRequestForFeedback(request)
    setFeedbackText('')
    setShowFeedbackModal(true)
  }

  async function submitFeedback() {
    if (!requestForFeedback) return
    setSubmittingFeedback(true)

    const { error } = await supabase
      .from('maintenance_requests')
      .update({
        feedback: feedbackText
      })
      .eq('id', requestForFeedback.id)

    if (!error) {
      showToast.success("Feedback submitted! Thank you.");
      loadRequests()
      setShowFeedbackModal(false)
      setRequestForFeedback(null)
    } else {
      showToast.error("Failed to submit feedback");
    }
    setSubmittingFeedback(false)
  }

  if (!session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  const activeMyRequestCount = requests.filter(
    req => req.tenant === session.user.id && ACTIVE_MAINTENANCE_STATUSES.includes(req.status)
  ).length
  const reachedMaintenanceRequestLimit = profile?.role === 'tenant' && activeMyRequestCount >= MAX_ACTIVE_MAINTENANCE_REQUESTS
  const disableNewRequestButton = reachedMaintenanceRequestLimit || loading

  const filteredRequests = requests
  const totalPages = Math.max(1, Math.ceil(totalRequestCount / MAINTENANCE_REQUESTS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedRequests = filteredRequests
  const pageStart = totalRequestCount === 0 ? 0 : (safeCurrentPage - 1) * MAINTENANCE_REQUESTS_PER_PAGE + 1
  const pageEnd = Math.min((safeCurrentPage - 1) * MAINTENANCE_REQUESTS_PER_PAGE + paginatedRequests.length, totalRequestCount)

  function handlePageChange(nextPage) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === safeCurrentPage) return

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    setLoading(true)
    setRequests([])

    setCurrentPage(nextPage)
  }

  function handleSearchIdChange(event) {
    setLoading(true)
    setRequests([])
    setCurrentPage(1)
    setSearchId(event.target.value)
  }

  function handleStatusFilterChange(event) {
    setLoading(true)
    setRequests([])
    setCurrentPage(1)
    setStatusFilter(event.target.value)
  }

  function promptCancel(request) {
    setRequestToCancel(request)
    setShowCancelModal(true)
  }

  function promptMarkAsDone(request) {
    if (!request) return
    setRequestToMarkDone(request)
    setShowDoneConfirmModal(true)
  }

  async function confirmMarkAsDone() {
    if (!requestToMarkDone) return
    await updateRequestStatus(requestToMarkDone.id, 'completed')
    setShowDoneConfirmModal(false)
    setRequestToMarkDone(null)
  }

  async function confirmCancel() {
    if (!requestToCancel) return
    await updateRequestStatus(requestToCancel.id, 'cancelled')
    setShowCancelModal(false)
    setRequestToCancel(null)
  }

  function toDateTimeLocalValue(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return ''
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const mins = String(d.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${mins}`
  }

  function openStartWorkModal(request) {
    setRequestToSchedule(request)
    setScheduleModalMode('schedule')
    setScheduleDate('') // Reset date
    setRepairmanName('') // Reset repairman name
    setShowScheduleModal(true)
  }

  function openEditDetailsModal(request) {
    if (request?.status !== 'scheduled') {
      showToast.error('You can only edit details while request is scheduled.')
      return
    }
    setRequestToSchedule(request)
    setScheduleModalMode('edit')
    setScheduleDate(toDateTimeLocalValue(request.scheduled_date))
    setRepairmanName(request.repairman_name || '')
    setShowScheduleModal(true)
  }

  async function confirmStartWork() {
    if (!requestToSchedule || !scheduleDate) return

    const nextStatus = requestToSchedule.status === 'pending' ? 'scheduled' : requestToSchedule.status

    const { error } = await supabase
      .from('maintenance_requests')
      .update({
        status: nextStatus,
        scheduled_date: new Date(scheduleDate).toISOString(),
        repairman_name: repairmanName.trim() || null
      })
      .eq('id', requestToSchedule.id)

    if (!error) {
      const isEditing = scheduleModalMode === 'edit'
      showToast.success(isEditing ? 'Maintenance details updated!' : 'Work Scheduled!')

      const formattedDate = new Date(scheduleDate).toLocaleString();
      const repairmanInfo = repairmanName.trim() ? ` Assigned repairman: ${repairmanName.trim()}.` : '';
      await createNotification({
        recipient: requestToSchedule.tenant,
        actor: session.user.id,
        type: 'maintenance',
        message: isEditing
          ? `Maintenance details for "${requestToSchedule.title}" were updated. New schedule: ${formattedDate}.${repairmanInfo}`
          : `Work on "${requestToSchedule.title}" is scheduled to start on ${formattedDate}.${repairmanInfo}`,
        link: '/maintenance'
      })

      loadRequests()
      setShowScheduleModal(false)
      setRequestToSchedule(null)
      setRepairmanName('')
      setScheduleModalMode('schedule')
    } else {
      showToast.error("Failed to update request");
    }
  }

  const maintenanceCostValue = parseFloat(maintenanceCost) || 0
  const canDeductExactForEnteredCost = maintenanceCostValue > 0 && !!depositOccupancyId && depositAvailableAmount >= maintenanceCostValue
  const skeletonRequestIndices = Array.from({ length: MAINTENANCE_REQUESTS_PER_PAGE }, (_, i) => i)

  const renderMaintenanceSkeletonList = () => (
    <div className="space-y-4">
      {skeletonRequestIndices.map((index) => (
        <div key={`maintenance-skeleton-${index}`} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="h-6 w-24 rounded bg-slate-200 skeleton-shimmer" />
              <div className="h-6 w-20 rounded-full bg-slate-200 skeleton-shimmer" />
            </div>
            <div className="h-4 w-36 rounded bg-slate-200 skeleton-shimmer" />
          </div>

          <div className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1">
                <div className="h-7 w-2/3 rounded bg-slate-200 skeleton-shimmer mb-3" />
                <div className="flex flex-wrap gap-2 mb-4">
                  <div className="h-5 w-40 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-5 w-32 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-5 w-28 rounded bg-slate-200 skeleton-shimmer" />
                </div>

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-4 space-y-2">
                  <div className="h-4 w-full rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-4 w-11/12 rounded bg-slate-200 skeleton-shimmer" />
                  <div className="h-4 w-4/5 rounded bg-slate-200 skeleton-shimmer" />
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                  <div className="h-9 w-28 rounded-lg bg-slate-200 skeleton-shimmer" />
                  <div className="h-9 w-28 rounded-lg bg-slate-200 skeleton-shimmer" />
                  <div className="h-9 w-24 rounded-lg bg-slate-200 skeleton-shimmer" />
                </div>
              </div>

              <div className="w-full md:w-72 flex-shrink-0">
                <div className="h-4 w-24 rounded bg-slate-200 skeleton-shimmer mb-3" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-20 rounded-lg bg-slate-200 skeleton-shimmer" />
                  <div className="h-20 rounded-lg bg-slate-200 skeleton-shimmer" />
                  <div className="h-20 rounded-lg bg-slate-200 skeleton-shimmer" />
                  <div className="h-20 rounded-lg bg-slate-200 skeleton-shimmer" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F3F4F5] p-4 sm:p-8 font-sans text-black">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase">
              {profile?.role === 'landlord' ? 'Maintenance Board' : 'My Maintenance'}
            </h1>
            <p className="text-sm text-gray-500 font-medium mt-1">
              {profile?.role === 'landlord'
                ? 'Manage and track requests from your properties.'
                : 'Report issues and track resolution status.'}
            </p>
          </div>
          {profile?.role === 'tenant' && (
            <button
              onClick={() => {
                if (loading) {
                  return
                }
                if (reachedMaintenanceRequestLimit) {
                  showToast.error(`Maximum of ${MAX_ACTIVE_MAINTENANCE_REQUESTS} active requests reached. Please wait for one to be completed or cancelled.`)
                  return
                }
                setShowModal(true)
              }}
              disabled={disableNewRequestButton}
              className="w-full sm:w-auto px-6 py-3 bg-black text-white hover:bg-gray-800 rounded-xl font-bold text-sm shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? 'Loading...'
                : reachedMaintenanceRequestLimit
                ? `Max ${MAX_ACTIVE_MAINTENANCE_REQUESTS} Active Requests`
                : '+ New Request'}
            </button>
          )}
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-col sm:flex-row gap-3">
          {/* Search by ID */}
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search request ID..."
              value={searchId}
              onChange={handleSearchIdChange}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase">Status:</span>
            <select
              value={statusFilter}
              onChange={handleStatusFilterChange}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Requests List */}
        <div className="space-y-4">
          {loading && filteredRequests.length === 0 ? (
            renderMaintenanceSkeletonList()
          ) : filteredRequests.length === 0 ? (
          <div className="min-h-screen flex items-start justify-center px-4 pt-20">
    <div className="w-full max-w-md rounded-[28px] p-8 text-center ">

      <h2 className="text-2xl font-bold tracking-tight text-gray-800">
        No Maintenance Request
      </h2>

      <p className="mt-3 text-sm leading-6 text-gray-500">
        You’re all caught up. New maintenance requests will appear here once
        they are submitted.
      </p>
    </div>
  </div>
          ): (
            paginatedRequests.map(req => (
              <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                {/* Header Strip */}
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400">ID:</span>
                      <span className="text-xs font-mono font-bold text-black bg-gray-200 px-2 py-1 rounded">{req.id.substring(0, 8).toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400">Status:</span>
                      <span className={`px-3 py-1 text-[10px] uppercase font-bold rounded-full tracking-wider ${statusColors[req.status] || 'bg-gray-100 text-gray-800'
                        }`}>
                        {req.status?.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-gray-500">
                    {new Date(req.created_at).toLocaleDateString()} at {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Main Content */}
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-1">{req.title}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mb-4">
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                          {req.properties?.title}
                        </span>
                        {profile?.role === 'landlord' && req.tenant_profile && (
                          <span className="flex items-center gap-1 flex-wrap">
                            <span className="flex items-center gap-1 text-gray-700">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              {req.tenant_profile.first_name} {req.tenant_profile.last_name}
                            </span>
                            {req.is_family_member && (
                              <span className="ml-0 sm:ml-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] rounded border border-purple-200 uppercase font-bold">
                                Family of {req.primary_tenant_name}
                              </span>
                            )}
                          </span>
                        )}
                        {profile?.role === 'tenant' && req.tenant !== session?.user?.id && req.tenant_profile && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded border border-blue-200 uppercase font-bold">
                            {req.tenant_profile.first_name}'s Request
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${req.priority === 'high' ? 'bg-red-50 text-red-700 border-red-100' :
                          req.priority === 'normal' ? 'bg-green-50 text-green-700 border-green-100' :
                            req.priority === 'low' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                              'bg-gray-50 text-gray-700 border-gray-200'
                          }`}>
                          {req.priority} Priority
                        </span>
                      </div>

                      {req.scheduled_date && (
                        <div className="mt-2 mb-3 flex flex-wrap gap-2">
                          <div className="inline-flex items-center gap-2 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100">
                            <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span className="text-xs font-bold text-orange-800">
                              Work starts: {new Date(req.scheduled_date).toLocaleString()}
                            </span>
                          </div>
                          {req.repairman_name && (
                            <div className="inline-flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              <span className="text-xs font-bold text-blue-800">
                                Repairman: {req.repairman_name}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-sm text-gray-700 leading-relaxed mb-4">
                        {req.description}
                      </div>
                      {/* Display Feedback if exists (Text Only) */}
                      {req.feedback && (
                        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-100 rounded-xl">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold uppercase text-yellow-800">Tenant Feedback</span>
                          </div>
                          <p className="text-sm text-gray-800 italic">"{req.feedback}"</p>
                        </div>
                      )}

                      {/* Tenant Actions */}
                      {profile?.role === 'tenant' && !['completed', 'closed', 'cancelled'].includes(req.status) && (
                        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end gap-2">
                          {req.tenant === session?.user?.id && ['pending', 'scheduled'].includes(req.status) && (
                            <button onClick={() => openEditRequestModal(req)} className="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer">
                              Edit Request
                            </button>
                          )}
                          {req.status === 'in_progress' && (
                            <button onClick={() => promptMarkAsDone(req)} className="px-4 py-2 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 transition-colors cursor-pointer flex items-center gap-1.5">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              Mark as Done
                            </button>
                          )}
                          {(req.status === 'in_progress' || !req.scheduled_date) && (
                            <button onClick={() => promptCancel(req)} className="px-4 py-2 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 transition-colors cursor-pointer">
                              Cancel Request
                            </button>
                          )}
                        </div>
                      )}

                      {/* FEEDBACK BUTTON (Tenant Only, when Completed or Closed) */}
                      {profile?.role === 'tenant' && ['completed', 'closed'].includes(req.status) && !req.feedback && (
                        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                          <button onClick={() => openFeedbackModal(req)} className="px-6 py-2 bg-yellow-400 text-black text-xs font-bold rounded-lg hover:bg-yellow-500 transition-colors shadow-sm cursor-pointer flex items-center gap-2">
                            Leave Feedback
                          </button>
                        </div>
                      )}

                      {/* Landlord Actions */}
                      {profile?.role === 'landlord' && (
                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                          {req.status !== 'closed' && (
                            <>
                              {req.status === 'pending' && (
                                <button onClick={() => openStartWorkModal(req)} className="px-4 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 cursor-pointer">Mark Scheduled</button>
                              )}
                              {req.status === 'pending' && (
                                <button onClick={() => promptCancel(req)} className="px-4 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-lg hover:bg-red-100 cursor-pointer">Rejected</button>
                              )}
                              {req.status === 'scheduled' && (
                                <button onClick={() => openEditDetailsModal(req)} className="px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-100 cursor-pointer">Edit Details</button>
                              )}
                              {req.status === 'scheduled' && (
                                <button onClick={() => promptCancel(req)} className="px-4 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-lg hover:bg-red-100 cursor-pointer">Cancel</button>
                              )}
                              {(['completed', 'complete'].includes(String(req.status || '').toLowerCase()) && (req.maintenance_cost == null || Number(req.maintenance_cost) <= 0)) && (
                                <button onClick={() => openCostModal(req)} className="px-4 py-2 bg-green-50 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 cursor-pointer">Log Maintenance Cost</button>
                              )}
                              {(req.status === 'completed' || req.status === 'resolved') && (
                                <button onClick={() => updateRequestStatus(req.id, 'closed')} className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer">Archive/Close</button>
                              )}
                              {req.status === 'in_progress' && (
                                <button onClick={() => promptCancel(req)} className="px-4 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-lg hover:bg-red-100 cursor-pointer">Cancel</button>
                              )}
                              <button
                                onClick={() => setSelectedRequest(selectedRequest === req.id ? null : req.id)}
                                className="ml-auto px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer"
                              >
                                {selectedRequest === req.id ? 'Cancel Reply' : 'Reply'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Attachments */}
                    {req.attachment_urls && req.attachment_urls.length > 0 && (
                      <div className="w-full md:w-72 flex-shrink-0">
                        <p className="text-xs font-bold uppercase text-gray-400 mb-2">Proof ({req.attachment_urls.length})</p>
                        <div className="grid grid-cols-2 gap-2">
                          {req.attachment_urls.map((url, index) => {
                            const isVideo = /\.(mp4|mov|webm|avi|mkv|ogg)$/i.test(url)
                            return (
                              <a key={index} href={url} target="_blank" rel="noreferrer" className="block group relative overflow-hidden rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all">
                                {isVideo ? (
                                  <video src={url} className="w-full h-20 object-cover" muted playsInline preload="metadata" />
                                ) : (
                                  <img src={url} alt={`Proof ${index + 1}`} className="w-full h-20 object-cover" />
                                )}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  {isVideo && (
                                    <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-90 transition-opacity drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                  )}
                                </div>
                              </a>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reply Section */}
                  {profile?.role === 'landlord' && selectedRequest === req.id && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 animate-in fade-in slide-in-from-top-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder="Say something to tenants"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black"
                        />
                        <button onClick={() => addResponse(req.id)} className="px-4 py-2 bg-black text-white rounded-lg text-xs font-bold cursor-pointer">Send</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {!loading && filteredRequests.length > 0 && totalPages > 1 && (
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs font-medium text-gray-500">
                Showing {pageStart}-{pageEnd} of {totalRequestCount}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(safeCurrentPage - 1)}
                  disabled={safeCurrentPage === 1}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-xs font-bold text-gray-600 px-2">
                  Page {safeCurrentPage} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(safeCurrentPage + 1)}
                  disabled={safeCurrentPage === totalPages}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Request Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
              <h2 className="text-lg font-bold">New Maintenance Request</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {properties.length === 0 ? (
                <div className="p-8 text-center bg-yellow-50 rounded-xl border border-yellow-100">
                  <h3 className="text-lg font-bold text-yellow-800 mb-2">No Active Lease</h3>
                  <p className="text-sm text-yellow-700 mb-4">You can only submit requests for properties you are currently renting.</p>
                  <button onClick={() => router.push('/dashboard')} className="px-6 py-2 bg-black text-white rounded-lg font-bold text-sm cursor-pointer">View Dashboard</button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {reachedMaintenanceRequestLimit && (
                    <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700 font-semibold">
                      You already have {activeMyRequestCount} active maintenance requests. The limit is {MAX_ACTIVE_MAINTENANCE_REQUESTS}.
                    </div>
                  )}

                  {/* Property Selector */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Property</label>
                    <div className="w-full border bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3">
                      <span className="font-bold text-sm">{occupiedProperty?.title || properties[0]?.title}</span>
                    </div>
                  </div>

                  {/* Title & Priority */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Issue Title</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Leaking faucet in kitchen"
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Priority</label>
                      <select
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black outline-none bg-white cursor-pointer"
                        value={formData.priority}
                        onChange={e => setFormData({ ...formData, priority: e.target.value })}
                      >
                        <option value="low">Low (Cosmetic)</option>
                        <option value="normal">Normal (Functional)</option>
                        <option value="high">High (Urgent)</option>
                      </select>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Description</label>
                    <textarea
                      rows="4"
                      required
                      placeholder="Describe the issue in detail..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black focus:border-transparent outline-none resize-none"
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  {/* File Upload (Required - Multiple Files) */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">
                      Proof (Photos or Videos) <span className="text-red-500">*At least 1 required</span>
                      <span className="text-gray-400 ml-2">({proofFiles.length}/10 files)</span>
                    </label>
                    <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${proofFiles.length > 0 ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-black'}`}>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        id="proof-upload"
                        className="hidden"
                        multiple
                        onChange={handleFileSelect}
                      />
                      <label htmlFor="proof-upload" className="cursor-pointer w-full h-full block">
                        <div className="flex flex-col items-center gap-1 text-gray-500">
                          <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          <span className="text-sm font-bold">Click to add photos or videos</span>
                        </div>
                      </label>
                    </div>

                    {/* File Previews */}
                    {proofFiles.length > 0 && (
                      <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {proofFiles.map((file, index) => {
                          const isVideo = file.type.startsWith('video/')
                          return (
                            <div key={index} className="relative group">
                              <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                                {isVideo ? (
                                  <video
                                    src={URL.createObjectURL(file)}
                                    className="w-full h-full object-cover"
                                    muted
                                    playsInline
                                    preload="metadata"
                                  />
                                ) : (
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt={`Preview ${index + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                                {isVideo && (
                                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <svg className="w-8 h-8 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile(index)}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <button type="button" onClick={() => setShowModal(false)} className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 cursor-pointer">Cancel</button>
                    <button type="submit" disabled={uploading || reachedMaintenanceRequestLimit} className="px-8 py-3 bg-black text-white rounded-xl font-bold text-sm hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg cursor-pointer">
                      {uploading ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- FEEDBACK MODAL (TEXT ONLY) --- */}
      {showFeedbackModal && requestForFeedback && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Maintenance Feedback</h3>
              <p className="text-sm text-gray-500">How was the resolution for "{requestForFeedback.title}"?</p>
            </div>

            {/* Comment Only (No Stars) */}
            <textarea
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:border-black focus:outline-none resize-none mb-6"
              rows="4"
              placeholder="Describe your experience..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
            ></textarea>

            <div className="flex gap-3">
              <button onClick={() => setShowFeedbackModal(false)} className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">Cancel</button>
              <button
                onClick={submitFeedback}
                disabled={submittingFeedback}
                className="flex-1 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-900 transition-colors shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tenant Edit Request Modal */}
      {showEditRequestModal && requestToEdit && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
              <h2 className="text-lg font-bold">Edit Maintenance Request</h2>
              <button onClick={closeEditRequestModal} className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" disabled={savingEditRequest}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Issue Title</label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Description</label>
                <textarea
                  rows="4"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black focus:border-transparent outline-none resize-none"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Priority</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-black outline-none bg-white cursor-pointer"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                >
                  <option value="low">Low (Cosmetic)</option>
                  <option value="normal">Normal (Functional)</option>
                  <option value="high">High (Urgent)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5">
                  Proof Files <span className="text-gray-400 ml-2">({editExistingProofs.length + editNewFiles.length}/10 files)</span>
                </label>

                {editExistingProofs.length > 0 && (
                  <div className="mb-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {editExistingProofs.map((url, index) => {
                      const isVideo = /\.(mp4|mov|webm|avi|mkv|ogg)$/i.test(url)
                      return (
                        <div key={`existing-${index}`} className="relative group">
                          <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                            {isVideo ? (
                              <video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                            ) : (
                              <img src={url} alt={`Existing Proof ${index + 1}`} className="w-full h-full object-cover" />
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeExistingEditProof(index)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {editNewFiles.length > 0 && (
                  <div className="mb-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {editNewFiles.map((file, index) => {
                      const isVideo = file.type.startsWith('video/')
                      return (
                        <div key={`new-${index}`} className="relative group">
                          <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                            {isVideo ? (
                              <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                            ) : (
                              <img src={URL.createObjectURL(file)} alt={`New Proof ${index + 1}`} className="w-full h-full object-cover" />
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeEditNewFile(index)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors border-gray-300 hover:border-black">
                  <input type="file" accept="image/*,video/*" id="edit-proof-upload" className="hidden" multiple onChange={handleEditFileSelect} />
                  <label htmlFor="edit-proof-upload" className="cursor-pointer w-full h-full block">
                    <div className="flex flex-col items-center gap-1 text-gray-500">
                      <svg className="w-7 h-7 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <span className="text-sm font-bold">Add more photos or videos</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button onClick={closeEditRequestModal} className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 cursor-pointer" disabled={savingEditRequest}>Cancel</button>
                <button onClick={saveEditedRequest} disabled={savingEditRequest} className="px-8 py-3 bg-black text-white rounded-xl font-bold text-sm hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg cursor-pointer">
                  {savingEditRequest ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && requestToCancel && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6 text-center">
            <h3 className="text-lg font-bold text-gray-900 mb-2 cursor-pointer">Cancel Maintenance Request?</h3>
            <p className="text-gray-500 text-sm mb-6">Are you sure you want to cancel: "{requestToCancel.title}"?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-bold cursor-pointer">No</button>
              <button onClick={confirmCancel} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold cursor-pointer">Yes, Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Done Confirmation Modal */}
      {showDoneConfirmModal && requestToMarkDone && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6 text-center">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Mark as Done?</h3>
            <p className="text-gray-500 text-sm mb-6">
              This will mark "{requestToMarkDone.title}" as completed. Continue?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDoneConfirmModal(false)
                  setRequestToMarkDone(null)
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl font-bold cursor-pointer"
              >
                No
              </button>
              <button
                onClick={confirmMarkAsDone}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-bold cursor-pointer"
              >
                Yes, Mark Done
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Schedule Modal */}
      {showScheduleModal && requestToSchedule && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-4">{scheduleModalMode === 'edit' ? 'Edit Maintenance Details' : 'Set Start Date & Assign Repairman'}</h3>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Start Date & Time</label>
                <input type="datetime-local" className="w-full border rounded-xl px-3 py-2" value={scheduleDate} min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={e => setScheduleDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Repairman Name (Optional)</label>
                <input
                  type="text"
                  className="w-full border rounded-xl px-3 py-2"
                  placeholder="e.g. Juan Dela Cruz"
                  value={repairmanName}
                  onChange={e => setRepairmanName(e.target.value)}
                />
                <p className="text-[10px] text-gray-400 mt-1">Tenant will see this name on their maintenance request.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowScheduleModal(false); setRequestToSchedule(null); setScheduleModalMode('schedule'); }} className="flex-1 py-2.5 border rounded-xl font-bold cursor-pointer">Cancel</button>
              <button onClick={confirmStartWork} className="flex-1 py-2.5 bg-black text-white rounded-xl font-bold cursor-pointer">{scheduleModalMode === 'edit' ? 'Save Changes' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Cost Modal */}
      {showCostModal && requestToComplete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-100 shadow-2xl rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Log Maintenance Cost</h3>
                <p className="text-sm text-gray-500">{requestToComplete.title}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Maintenance Cost / Expense</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₱</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-lg font-bold focus:outline-none focus:border-black transition-colors"
                  value={maintenanceCost}
                  onChange={(e) => setMaintenanceCost(e.target.value)}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Leave as 0 if there&apos;s no cost to the tenant.</p>
            </div>

            <div className="mb-4 p-3 rounded-xl border border-gray-200 bg-gray-50">
              {depositCheckLoading ? (
                <p className="text-xs text-gray-600 font-semibold">Checking tenant security deposit...</p>
              ) : (
                <>
                  <p className="text-xs text-gray-700 font-semibold">
                    Available Security Deposit: ₱{depositAvailableAmount.toLocaleString()}
                  </p>
                  {maintenanceCostValue > 0 && (
                    <div className="mt-2">
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Cost Handling</label>
                      <select
                        value={deductFromDeposit ? 'deposit' : 'payment'}
                        onChange={(e) => setDeductFromDeposit(e.target.value === 'deposit')}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-black"
                      >
                        <option value="payment">Send as Payment Cost</option>
                        <option value="deposit" disabled={!canDeductExactForEnteredCost}>
                          Deduct from Security Deposit{!canDeductExactForEnteredCost ? ' (Unavailable)' : ''}
                        </option>
                      </select>

                      {!canDeductExactForEnteredCost && (
                        <p className="text-[11px] text-gray-500 mt-1 font-semibold">
                          Deduct from security deposit is disabled because available deposit is not enough for this exact cost.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowCostModal(false); setRequestToComplete(null); }}
                className="flex-1 py-3 border border-gray-200 rounded-xl font-bold cursor-pointer hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={completeWithCost}
                disabled={depositCheckLoading}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold cursor-pointer hover:bg-green-700 shadow-lg"
              >
                Save Cost
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}