import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'
import Link from 'next/link'
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js'

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
  
  // New states for QR and proof uploads
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
  
  // Edit bill states
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

  const [formData, setFormData] = useState({
    property_id: '',
    application_id: '',
    tenant: '',
    amount: '',
    water_bill: '',
    electrical_bill: '',
    other_bills: '',
    bills_description: '',
    due_date: '',
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

  async function loadUserRole(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    
    setUserRole(data?.role || 'tenant')
  }

  useEffect(() => {
    if (session && userRole) {
      loadPayments()
      loadPaymentRequests()
      if (userRole === 'landlord') {
        loadProperties()
        loadApprovedApplications()
      }
    }
  }, [session, userRole])

  async function loadApprovedApplications() {
    // Get landlord's properties first
    const { data: myProperties } = await supabase
      .from('properties')
      .select('id')
      .eq('landlord', session.user.id)

    if (myProperties && myProperties.length > 0) {
      const propertyIds = myProperties.map(p => p.id)
      
      // Get approved applications for those properties
      const { data } = await supabase
        .from('applications')
        .select(`
          id,
          property_id,
          tenant,
          property:properties(title),
          tenant_profile:profiles(first_name, middle_name, last_name)
        `)
        .in('property_id', propertyIds)
        .eq('status', 'accepted')
        .order('submitted_at', { ascending: false })
      
      setApprovedApplications(data || [])
    }
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
    
    // Validate required uploads
    if (!billReceiptFile) {
      showToast.warning("Please upload the bill receipt/screenshot", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

      return
    }
    
    // Calculate total amount
    const rent = parseFloat(formData.amount) || 0
    const water = parseFloat(formData.water_bill) || 0
    const electrical = parseFloat(formData.electrical_bill) || 0
    const other = parseFloat(formData.other_bills) || 0
    const total = rent + water + electrical + other
    
    try {
      // Upload QR code if provided
      let qrCodeUrl = null
      if (qrCodeFile) {
        const qrFileName = `qr_${Date.now()}_${qrCodeFile.name}`
        const { data: qrUpload, error: qrError } = await supabase.storage
          .from('payment-files')
          .upload(qrFileName, qrCodeFile)
        
        if (qrError) throw qrError
        
        const { data: qrPublic } = supabase.storage
          .from('payment-files')
          .getPublicUrl(qrFileName)
        qrCodeUrl = qrPublic.publicUrl
      }
      
      // Upload bill receipt (required)
      const receiptFileName = `receipt_${Date.now()}_${billReceiptFile.name}`
      const { data: receiptUpload, error: receiptError } = await supabase.storage
        .from('payment-files')
        .upload(receiptFileName, billReceiptFile)
      
      if (receiptError) throw receiptError
      
      const { data: receiptPublic } = supabase.storage
        .from('payment-files')
        .getPublicUrl(receiptFileName)
      const billReceiptUrl = receiptPublic.publicUrl
      
      // Create payment request
      const { data: paymentRequest, error } = await supabase
        .from('payment_requests')
        .insert({
          property_id: formData.property_id,
          application_id: formData.application_id || null,
          tenant: formData.tenant,
          landlord: session.user.id,
          rent_amount: rent,
          water_bill: water,
          electrical_bill: electrical,
          other_bills: other,
          bills_description: formData.bills_description || null,
          due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
          status: 'pending',
          qr_code_url: qrCodeUrl,
          bill_receipt_url: billReceiptUrl
        })
        .select()
        .single()

      if (error) throw error

      // Send notification to tenant
      const { data: property } = await supabase
        .from('properties')
        .select('title')
        .eq('id', formData.property_id)
        .maybeSingle()

      await supabase.from('notifications').insert({
        recipient: formData.tenant,
        actor: session.user.id,
        type: 'payment_request',
        message: `New payment request for ${property?.title || 'property'}: ₱${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        link: '/payments',
        data: { payment_request_id: paymentRequest.id }
      })

      // Reset form
      setFormData({ 
        property_id: '', 
        application_id: '',
        tenant: '',
        amount: '', 
        water_bill: '',
        electrical_bill: '',
        other_bills: '',
        bills_description: '',
        due_date: '',
        method: 'bank_transfer'
      })
      setQrCodeFile(null)
      setQrCodePreview(null)
      setBillReceiptFile(null)
      setBillReceiptPreview(null)
      setShowFormModal(false)
      loadPaymentRequests()
      showToast.success('Payment request sent', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    } catch (error) {
      console.error('Error creating payment request:', error)
      showToast.error('Failed to send payment request', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
    }
  }

  async function handlePayBill(request) {
    setSelectedBill(request)
    setShowPaymentModal(true)
  }

  async function submitPayment() {
    if (!selectedBill) return
    
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
      
      // Update payment request status to pending_confirmation
      const { error } = await supabase
        .from('payment_requests')
        .update({
          status: 'pending_confirmation',
          paid_at: new Date().toISOString(),
          payment_method: paymentMethod,
          tenant_proof_url: proofUrl,
          tenant_reference_number: referenceNumber.trim() || null
        })
        .eq('id', selectedBill.id)

      if (error) throw error

      // Notify landlord to confirm payment
      const total = (
        parseFloat(selectedBill.rent_amount) +
        parseFloat(selectedBill.water_bill || 0) +
        parseFloat(selectedBill.electrical_bill || 0) +
        parseFloat(selectedBill.other_bills || 0)
      ).toLocaleString('en-US', { minimumFractionDigits: 2 })

      await supabase.from('notifications').insert({
        recipient: selectedBill.landlord,
        actor: session.user.id,
        type: 'payment_confirmation_needed',
        message: `Tenant paid ₱${total} for ${selectedBill.properties?.title || 'property'} via ${paymentMethod === 'qr_code' ? 'QR Code' : 'Cash'}. Please confirm payment receipt.`,
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

  async function confirmPayment(requestId) {
    setConfirmPaymentId(null)
    const request = paymentRequests.find(r => r.id === requestId)
    if (!request) return

    const confirmPromise = new Promise(async (resolve, reject) => {
      try {
        // Create payment record
        const { data: payment, error: paymentError } = await supabase
          .from('payments')
          .insert({
            property_id: request.property_id,
            application_id: request.application_id,
            tenant: request.tenant,
            landlord: session.user.id,
            amount: request.rent_amount,
              water_bill: request.water_bill,
              electrical_bill: request.electrical_bill,
              other_bills: request.other_bills,
              bills_description: request.bills_description,
              method: request.payment_method || 'cash',
              status: 'recorded'
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

          // Notify tenant that payment is confirmed
          await supabase.from('notifications').insert({
            recipient: request.tenant,
            actor: session.user.id,
            type: 'payment_confirmed',
            message: `Your payment for ${request.properties?.title || 'property'} has been confirmed by your landlord.`,
            link: '/payments'
          })

          loadPaymentRequests()
          loadPayments()
          resolve('Payment confirmed and recorded!')
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
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Send Payment Request</h2>
                <button
                  onClick={() => setShowFormModal(false)}
                  className="text-gray-400 hover:text-black cursor-pointer"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            
              {approvedApplications.length === 0 ? (
                <div className="text-black text-sm bg-gray-50 border border-gray-200 p-4 rounded-lg">
                  <p className="font-bold">No approved applications found.</p>
                  <p>Payment requests can only be sent to tenants with approved applications.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1">Select Tenant Application *</label>
                    <div className="relative">
                      <select
                        required
                        className="w-full border-2 border-black px-3 py-2 rounded-lg bg-white appearance-none cursor-pointer font-medium focus:outline-none focus:ring-2 focus:ring-black"
                        value={formData.application_id}
                        onChange={e => {
                          const selectedApp = approvedApplications.find(app => app.id === e.target.value)
                          if (selectedApp) {
                            setFormData({ 
                              ...formData, 
                              application_id: e.target.value,
                              property_id: selectedApp.property_id,
                              tenant: selectedApp.tenant
                            })
                          }
                        }}
                      >
                        <option value="">Select an approved application</option>
                        {approvedApplications.map(app => (
                          <option key={app.id} value={app.id}>
                            {app.property?.title} - {app.tenant_profile?.first_name} {app.tenant_profile?.last_name}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-3 pointer-events-none">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-sm font-bold mb-4 text-black uppercase tracking-wider">Bill Details</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Rent Amount *</label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 font-medium transition-colors outline-none"
                          placeholder="0.00"
                          value={formData.amount}
                          onChange={e => setFormData({ ...formData, amount: e.target.value })}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Water Bill</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 font-medium transition-colors outline-none"
                          placeholder="0.00"
                          value={formData.water_bill}
                          onChange={e => setFormData({ ...formData, water_bill: e.target.value })}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Electrical Bill</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 font-medium transition-colors outline-none"
                          placeholder="0.00"
                          value={formData.electrical_bill}
                          onChange={e => setFormData({ ...formData, electrical_bill: e.target.value })}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Other Bills</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 font-medium transition-colors outline-none"
                          placeholder="0.00"
                          value={formData.other_bills}
                          onChange={e => setFormData({ ...formData, other_bills: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-500 mb-1">Description (Optional)</label>
                      <textarea
                        className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 font-medium transition-colors outline-none resize-none"
                        rows="2"
                        placeholder="Details about bills..."
                        value={formData.bills_description}
                        onChange={e => setFormData({ ...formData, bills_description: e.target.value })}
                      />
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-500 mb-1">Due Date *</label>
                      <input
                        type="date"
                        required
                        className="w-full border-2 border-gray-200 focus:border-black rounded-lg px-3 py-2 font-medium cursor-pointer outline-none"
                        value={formData.due_date}
                        onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                      />
                    </div>
                    
                    {/* Bill Receipt Upload */}
                    <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-500 mb-1">Bill Receipt *</label>
                      <div className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${billReceiptPreview ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'}`}>
                        {billReceiptPreview ? (
                          <div className="relative inline-block">
                            <img src={billReceiptPreview} alt="Bill Receipt" className="max-h-40 rounded shadow-sm border border-gray-200" />
                            <button
                              type="button"
                              onClick={() => {
                                setBillReceiptFile(null)
                                setBillReceiptPreview(null)
                              }}
                              className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-full shadow-md cursor-pointer hover:bg-gray-800"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer block w-full h-full">
                            <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            <span className="text-sm font-bold text-black">Upload Bill Receipt</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files[0]
                                if (file) {
                                  setBillReceiptFile(file)
                                  setBillReceiptPreview(URL.createObjectURL(file))
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    
                    {/* QR Code Upload */}
                    <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-500 mb-1">Payment QR Code (Optional)</label>
                      <div className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${qrCodePreview ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'}`}>
                        {qrCodePreview ? (
                          <div className="relative inline-block">
                            <img src={qrCodePreview} alt="QR Code" className="max-h-40 rounded shadow-sm border border-gray-200" />
                            <button
                              type="button"
                              onClick={() => {
                                setQrCodeFile(null)
                                setQrCodePreview(null)
                              }}
                              className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-full shadow-md cursor-pointer hover:bg-gray-800"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer block w-full h-full">
                            <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                            <span className="text-sm font-bold text-black">Upload Payment QR</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files[0]
                                if (file) {
                                  setQrCodeFile(file)
                                  setQrCodePreview(URL.createObjectURL(file))
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 bg-black text-white p-4 rounded-lg flex justify-between items-center">
                      <span className="text-sm font-bold uppercase tracking-wider">Total Amount</span>
                      <span className="text-xl font-bold">
                        ₱{(
                          (parseFloat(formData.amount) || 0) +
                          (parseFloat(formData.water_bill) || 0) +
                          (parseFloat(formData.electrical_bill) || 0) +
                          (parseFloat(formData.other_bills) || 0)
                        ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      type="submit" 
                      className="flex-1 px-6 py-3 bg-black text-white hover:bg-gray-800 font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      Send Request
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShowFormModal(false)}
                      className="px-6 py-3 border-2 border-black text-black font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
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
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
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
                  const total = rent + (parseFloat(request.water_bill)||0) + (parseFloat(request.electrical_bill)||0) + (parseFloat(request.other_bills)||0)
                  const isPastDue = request.due_date && new Date(request.due_date) < new Date() && request.status === 'pending'

                  return (
                    <div key={request.id} className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-bold text-sm">{request.properties?.title || 'Property'}</div>
                          <div className="text-xs text-gray-500">
                            {userRole === 'landlord' 
                              ? `Tenant: ${request.tenant_profile?.first_name || ''} ${request.tenant_profile?.last_name || ''}`
                              : `Landlord: ${request.landlord_profile?.first_name || ''} ${request.landlord_profile?.last_name || ''}`}
                          </div>
                        </div>
                        <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded border ${
                          request.status === 'paid' ? 'bg-black text-white border-black' :
                          request.status === 'pending_confirmation' ? 'bg-white text-black border-black border-dashed' :
                          request.status === 'cancelled' ? 'bg-gray-100 text-gray-500 border-gray-200' :
                          isPastDue ? 'bg-red-50 text-red-600 border-red-200' :
                          'bg-white text-black border-black'
                        }`}>
                          {request.status === 'pending_confirmation' ? 'Reviewing' : isPastDue ? 'Overdue' : request.status}
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
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Property</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                      {userRole === 'landlord' ? 'Tenant' : 'Landlord'}
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Due Date</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paymentRequests.map(request => {
                    const rent = parseFloat(request.rent_amount) || 0
                    const total = rent + (parseFloat(request.water_bill)||0) + (parseFloat(request.electrical_bill)||0) + (parseFloat(request.other_bills)||0)
                    const isPastDue = request.due_date && new Date(request.due_date) < new Date() && request.status === 'pending'

                    return (
                      <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-black">{request.properties?.title || 'N/A'}</div>
                          <div className="text-xs text-gray-500">{request.properties?.address}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {userRole === 'landlord' 
                            ? `${request.tenant_profile?.first_name || ''} ${request.tenant_profile?.last_name || ''}`
                            : `${request.landlord_profile?.first_name || ''} ${request.landlord_profile?.last_name || ''}`}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-black">
                            ₱{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-gray-400">Rent: ₱{rent.toLocaleString()}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm ${isPastDue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                            {request.due_date ? new Date(request.due_date).toLocaleDateString() : 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${
                            request.status === 'paid' ? 'bg-black text-white border-black' :
                            request.status === 'pending_confirmation' ? 'bg-white text-black border-black border-dashed' :
                            request.status === 'cancelled' ? 'bg-gray-100 text-gray-500 border-gray-200' :
                            isPastDue ? 'bg-red-50 text-red-600 border-red-200' :
                            'bg-white text-black border-black'
                          }`}>
                            {request.status === 'paid' ? 'Paid' :
                             request.status === 'pending_confirmation' ? 'Confirming' :
                             request.status === 'cancelled' ? 'Cancelled' :
                             isPastDue ? 'Overdue' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {userRole === 'tenant' && request.status === 'pending' && (
                            <button
                              onClick={() => handlePayBill(request)}
                              className="px-4 py-2 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 cursor-pointer shadow-sm hover:shadow-md transition-all"
                            >
                              Pay Now
                            </button>
                          )}
                          {userRole === 'tenant' && request.status === 'pending_confirmation' && (
                            <span className="text-xs font-bold text-gray-400">Wait for approval</span>
                          )}
                          {userRole === 'landlord' && request.status === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditBill(request)}
                                className="px-3 py-1.5 border border-gray-300 hover:border-black text-black text-xs font-bold rounded cursor-pointer transition-colors"
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
                                  className="px-3 py-1.5 text-red-600 hover:bg-red-50 text-xs font-bold rounded cursor-pointer transition-colors"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          )}
                          {userRole === 'landlord' && request.status === 'pending_confirmation' && (
                            confirmPaymentId === request.id ? (
                              <div className="flex gap-2 items-center">
                                <span className="text-xs font-bold">Sure?</span>
                                <button onClick={() => confirmPayment(request.id)} className="px-3 py-1.5 bg-black text-white text-xs font-bold rounded cursor-pointer">Yes</button>
                                <button onClick={() => setConfirmPaymentId(null)} className="px-3 py-1.5 border border-gray-300 text-black text-xs font-bold rounded cursor-pointer">No</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmPaymentId(request.id)}
                                className="px-4 py-2 border-2 border-black text-black hover:bg-black hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-all"
                              >
                                Confirm
                              </button>
                            )
                          )}
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
                  <div className="text-sm font-bold text-black mb-3 border-b border-gray-100 pb-2">Amount Details</div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Rent</span>
                      <span className="font-bold">₱{parseFloat(selectedBill.rent_amount || 0).toLocaleString()}</span>
                    </div>
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
                          parseFloat(selectedBill.water_bill || 0) +
                          parseFloat(selectedBill.electrical_bill || 0) +
                          parseFloat(selectedBill.other_bills || 0)
                        ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Method Selection */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Select Payment Method</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        paymentMethod === 'cash' 
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
                      disabled={!selectedBill.qr_code_url}
                      className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        !selectedBill.qr_code_url 
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
                      onClick={() => setPaymentMethod('paypal')}
                      className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        paymentMethod === 'paypal' 
                          ? 'border-[#0070ba] bg-[#0070ba] text-white' 
                          : 'border-gray-200 bg-white hover:border-[#0070ba] text-black'
                      }`}
                    >
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 2.43A.77.77 0 0 1 5.7 1.74h6.486c2.078 0 3.604.476 4.538 1.415.924.93 1.251 2.262.973 3.96l-.006.04v.022c-.298 1.947-1.268 3.479-2.884 4.558-1.569 1.047-3.618 1.578-6.092 1.578h-1.62a.77.77 0 0 0-.759.688l-.946 5.993a.641.641 0 0 1-.633.543h-.68zm13.795-14.2l-.006.046c-.37 2.416-1.511 4.249-3.395 5.452-1.813 1.158-4.227 1.745-7.176 1.745h-1.62c-.682 0-1.261.461-1.417 1.122l-.946 5.993a.641.641 0 0 1-.633.543H2.47a.641.641 0 0 1-.633-.74L4.944 2.43A.77.77 0 0 1 5.7 1.74h6.486c4.214 0 6.716 1.967 7.685 5.397z"/>
                      </svg>
                      <span className="font-bold text-sm">PayPal</span>
                    </button>
                  </div>
                </div>

                {/* QR Code Payment Flow */}
                {paymentMethod === 'qr_code' && selectedBill.qr_code_url && (
                  <div className="space-y-4 bg-gray-50 border border-gray-200 p-4 rounded-xl">
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
                  </div>
                )}

                {/* PayPal Payment Flow */}
                {paymentMethod === 'paypal' && (
                  <div className="space-y-4 bg-[#ffc439]/10 border border-[#0070ba]/30 p-4 rounded-xl">
                    <div className="text-center mb-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Pay with PayPal</p>
                      <p className="text-xs text-gray-500">Secure payment powered by PayPal</p>
                    </div>
                    
                    <PayPalScriptProvider options={{ 
                      clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
                      currency: 'PHP'
                    }}>
                      <PayPalButtons
                        style={{ 
                          layout: 'vertical',
                          color: 'blue',
                          shape: 'rect',
                          label: 'pay'
                        }}
                        disabled={paypalProcessing}
                        createOrder={async () => {
                          setPaypalProcessing(true)
                          try {
                            const total = (
                              parseFloat(selectedBill.rent_amount || 0) +
                              parseFloat(selectedBill.water_bill || 0) +
                              parseFloat(selectedBill.electrical_bill || 0) +
                              parseFloat(selectedBill.other_bills || 0)
                            ).toFixed(2)

                            const response = await fetch('/api/paypal/create-order', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                amount: total,
                                currency: 'PHP',
                                description: `EaseRent Payment - ${selectedBill.properties?.title}`,
                                paymentRequestId: selectedBill.id
                              })
                            })

                            const data = await response.json()
                            if (data.orderId) {
                              return data.orderId
                            }
                            throw new Error(data.error || 'Failed to create order')
                          } catch (error) {
                            console.error('PayPal Create Order Error:', error)
                            showToast.error('Failed to initialize PayPal payment', {
                              duration: 4000,
                              progress: true,
                              position: "top-center",
                              transition: "bounceIn",
                              icon: '',
                              sound: true,
                            })
                            setPaypalProcessing(false)
                            throw error
                          }
                        }}
                        onApprove={async (data) => {
                          try {
                            const response = await fetch('/api/paypal/capture-order', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ orderId: data.orderID })
                            })

                            const captureData = await response.json()

                            if (captureData.success) {
                              // Update payment request status
                              await supabase
                                .from('payment_requests')
                                .update({
                                  status: 'pending_confirmation',
                                  paid_at: new Date().toISOString(),
                                  payment_method: 'paypal',
                                  tenant_reference_number: captureData.transactionId
                                })
                                .eq('id', selectedBill.id)

                              // Notify landlord
                              const total = (
                                parseFloat(selectedBill.rent_amount || 0) +
                                parseFloat(selectedBill.water_bill || 0) +
                                parseFloat(selectedBill.electrical_bill || 0) +
                                parseFloat(selectedBill.other_bills || 0)
                              ).toLocaleString('en-US', { minimumFractionDigits: 2 })

                              await supabase.from('notifications').insert({
                                recipient: selectedBill.landlord,
                                actor: session.user.id,
                                type: 'payment_confirmation_needed',
                                message: `Tenant paid ₱${total} for ${selectedBill.properties?.title || 'property'} via PayPal (Transaction: ${captureData.transactionId}). Please confirm payment receipt.`,
                                link: '/payments',
                                data: { payment_request_id: selectedBill.id }
                              })

                              setShowPaymentModal(false)
                              setSelectedBill(null)
                              setPaymentMethod('cash')
                              loadPaymentRequests()
                              showToast.success('PayPal payment successful! Waiting for landlord confirmation.', {
                                duration: 4000,
                                progress: true,
                                position: "top-center",
                                transition: "bounceIn",
                                icon: '',
                                sound: true,
                              })
                            } else {
                              throw new Error(captureData.error || 'Payment capture failed')
                            }
                          } catch (error) {
                            console.error('PayPal Capture Error:', error)
                            showToast.error('Payment failed. Please try again.', {
                              duration: 4000,
                              progress: true,
                              position: "top-center",
                              transition: "bounceIn",
                              icon: '',
                              sound: true,
                            })
                          } finally {
                            setPaypalProcessing(false)
                          }
                        }}
                        onError={(err) => {
                          console.error('PayPal Error:', err)
                          showToast.error('PayPal payment failed', {
                            duration: 4000,
                            progress: true,
                            position: "top-center",
                            transition: "bounceIn",
                            icon: '',
                            sound: true,
                          })
                          setPaypalProcessing(false)
                        }}
                        onCancel={() => {
                          showToast.error('Payment cancelled', {
                            duration: 4000,
                            progress: true,
                            position: "top-center",
                            transition: "bounceIn",
                            icon: '',
                            sound: true,
                          })
                          setPaypalProcessing(false)
                        }}
                      />
                    </PayPalScriptProvider>

                    {paypalProcessing && (
                      <div className="text-center py-2">
                        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-[#0070ba]"></div>
                        <p className="text-xs text-gray-500 mt-2">Processing payment...</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3 pt-2">
                  {paymentMethod !== 'paypal' && (
                    <button
                      onClick={submitPayment}
                      disabled={uploadingProof}
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
                    className={`px-4 py-3 border-2 border-gray-200 text-black font-bold rounded-xl hover:border-black cursor-pointer transition-colors ${paymentMethod === 'paypal' ? 'flex-1' : ''}`}
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
    </div>
  )
}