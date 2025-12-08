import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast, { Toaster } from 'react-hot-toast'

export default function PaymentsPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [payments, setPayments] = useState([])
  const [paymentRequests, setPaymentRequests] = useState([])
  const [properties, setProperties] = useState([])
  const [approvedApplications, setApprovedApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
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
          tenant_profile:profiles(full_name)
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
      .select('*, properties(title), profiles!payments_tenant_fkey(full_name)')
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
        tenant_profile:profiles!payment_requests_tenant_fkey(full_name, phone),
        landlord_profile:profiles!payment_requests_landlord_fkey(full_name, phone)
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
      toast.error('Please upload the bill receipt/screenshot')
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
      setShowForm(false)
      loadPaymentRequests()
      toast.success('Payment request sent to tenant successfully!')
    } catch (error) {
      console.error('Error creating payment request:', error)
      toast.error('Failed to send payment request. Please try again.')
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
        toast.error('Please enter reference number or upload payment proof')
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
      toast.success('Payment submitted! Waiting for landlord confirmation.')
    } catch (error) {
      console.error('Payment error:', error)
      toast.error('Payment failed. Please try again.')
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

    toast.promise(confirmPromise, {
      loading: 'Confirming payment...',
      success: (msg) => msg,
      error: (err) => err,
    })
  }

  async function handleCancelBill(requestId) {
    setCancelBillId(null)
    const { error } = await supabase
      .from('payment_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)

    if (!error) {
      loadPaymentRequests()
      toast.success('Payment request cancelled.')
    } else {
      console.error('Error cancelling:', error)
      toast.error('Failed to cancel payment request.')
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
    <div className="min-h-screen bg-white p-3 sm:p-6">   
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold">Payments</h1>
          {userRole === 'landlord' && (
            <button
            style={{ 
              borderRadius: '6px',
            }}
              onClick={() => setShowForm(!showForm)}
              className="w-full sm:w-auto px-4 py-2 bg-black text-white hover:bg-black font-medium cursor-pointer"
            >
              {showForm ? 'Cancel' : 'Send Bill to Tenant'}
            </button>
          )}
        </div>

        {userRole === 'landlord' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
            <div className="bg-white border-2 border-black p-4 sm:p-6">
              <div className="text-xs sm:text-sm text-black mb-1">Total Income</div>
              <div className="text-xl sm:text-3xl font-bold text-black-600">₱{totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-white border-2 border-black p-4 sm:p-6">
              <div className="text-xs sm:text-sm text-black mb-1">Total Payments</div>
              <div className="text-xl sm:text-3xl font-bold text-black-600">{payments.length}</div>
            </div>
            <div className="bg-white border-2 border-black p-4 sm:p-6">
              <div className="text-xs sm:text-sm text-black mb-1">Avg Payment</div>
              <div className="text-xl sm:text-3xl font-bold text-black-600">
                ₱{payments.length > 0 ? (totalIncome / payments.length).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </div>
            </div>
          </div>
        )}

        {showForm && userRole === 'landlord' && (
          <div className="bg-white border-2 border-black p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Send Payment Request to Tenant</h2>
            
            {approvedApplications.length === 0 ? (
              <div className="text-black text-sm bg-white border-2 border-black p-4">
                <p className="font-medium">No approved applications found.</p>
                <p>Payment requests can only be sent to tenants with approved applications.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Select Approved Application *</label>
                  <select
                    required
                    className="w-full border-2 border-black px-3 py-2"
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
                        {app.property?.title} - {app.tenant_profile?.full_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-black mt-1">Only approved tenant applications are shown</p>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3 text-black">Payment Details</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Rent Amount *</label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        className="w-full border-2 border-black px-3 py-2"
                        placeholder="0.00"
                        value={formData.amount}
                        onChange={e => setFormData({ ...formData, amount: e.target.value })}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Water Bill</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full border-2 border-black px-3 py-2"
                        placeholder="0.00"
                        value={formData.water_bill}
                        onChange={e => setFormData({ ...formData, water_bill: e.target.value })}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Electrical Bill</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full border-2 border-black px-3 py-2"
                        placeholder="0.00"
                        value={formData.electrical_bill}
                        onChange={e => setFormData({ ...formData, electrical_bill: e.target.value })}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Other Bills</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full border-2 border-black px-3 py-2"
                        placeholder="0.00"
                        value={formData.other_bills}
                        onChange={e => setFormData({ ...formData, other_bills: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-1">Bills Description (optional)</label>
                    <textarea
                      className="w-full border-2 border-black px-3 py-2"
                      rows="2"
                      placeholder="E.g., Internet, cable, parking, etc."
                      value={formData.bills_description}
                      onChange={e => setFormData({ ...formData, bills_description: e.target.value })}
                    />
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-1">Due Date *</label>
                    <input
                      type="date"
                      required
                      className="w-full border-2 border-black px-3 py-2"
                      value={formData.due_date}
                      onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>
                  
                  {/* Bill Receipt Upload (Required) */}
                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-1">Bill Receipt/Screenshot * <span className="text-red-500">(Required)</span></label>
                    <p className="text-xs text-gray-500 mb-2">Upload a photo of the actual bills so tenant can verify</p>
                    <div className="border-2 border-dashed border-gray-300 p-4 text-center">
                      {billReceiptPreview ? (
                        <div className="relative">
                          <img src={billReceiptPreview} alt="Bill Receipt" className="max-h-40 mx-auto rounded" />
                          <button
                            type="button"
                            onClick={() => {
                              setBillReceiptFile(null)
                              setBillReceiptPreview(null)
                            }}
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-sm text-gray-600">Click to upload bill receipt</span>
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
                  
                  {/* QR Code Upload (Optional) */}
                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-1">QR Code for Payment (Optional)</label>
                    <p className="text-xs text-gray-500 mb-2">Upload your GCash/Maya/Bank QR code for digital payment</p>
                    <div className="border-2 border-dashed border-gray-300 p-4 text-center">
                      {qrCodePreview ? (
                        <div className="relative">
                          <img src={qrCodePreview} alt="QR Code" className="max-h-40 mx-auto rounded" />
                          <button
                            type="button"
                            onClick={() => {
                              setQrCodeFile(null)
                              setQrCodePreview(null)
                            }}
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                          </svg>
                          <span className="text-sm text-gray-600">Click to upload QR code</span>
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

                  {/* Total calculation */}
                  <div className="mt-4 bg-white p-3 border-2 border-black">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-black">Total Amount:</span>
                      <span className="text-xl font-bold text-black">
                        ₱{(
                          (parseFloat(formData.amount) || 0) +
                          (parseFloat(formData.water_bill) || 0) +
                          (parseFloat(formData.electrical_bill) || 0) +
                          (parseFloat(formData.other_bills) || 0)
                        ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="submit" 
                    className="px-6 py-2 bg-black text-white hover:bg-black font-medium flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Send Payment Request
                  </button>
                  <button 
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-6 py-2 bg-white text-black font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Payment Requests / Bills Section */}
        <div className="bg-white border-2 border-black overflow-hidden mb-6">
          <div className="px-4 sm:px-6 py-4 border-b border-black bg-white">
            <h2 className="text-base sm:text-lg font-semibold text-black">
              {userRole === 'landlord' ? 'Sent Bills' : 'Your Bills to Pay'}
            </h2>
          </div>
          {loading ? (
            <p className="p-6 text-black">Loading...</p>
          ) : paymentRequests.length === 0 ? (
            <div className="p-6 text-center text-black text-sm sm:text-base">
              {userRole === 'landlord' 
                ? "No bills sent yet. Click 'Send Bill to Tenant' to create a payment request."
                : "No bills received yet. Your landlord hasn't sent you any payment requests."}
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden divide-y">
                {paymentRequests.map(request => {
                  const rent = parseFloat(request.rent_amount) || 0
                  const water = parseFloat(request.water_bill) || 0
                  const electrical = parseFloat(request.electrical_bill) || 0
                  const other = parseFloat(request.other_bills) || 0
                  const total = rent + water + electrical + other
                  const isPastDue = request.due_date && new Date(request.due_date) < new Date() && request.status === 'pending'

                  return (
                    <div key={request.id} className={`p-4 ${isPastDue ? 'bg-red-50' : ''}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium text-sm">{request.properties?.title || 'N/A'}</div>
                          <div className="text-xs text-gray-500">
                            {userRole === 'landlord' 
                              ? request.tenant_profile?.full_name 
                              : request.landlord_profile?.full_name}
                          </div>
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          request.status === 'paid' ? 'bg-green-100 text-green-700' :
                          request.status === 'pending_confirmation' ? 'bg-blue-100 text-blue-700' :
                          request.status === 'cancelled' ? 'bg-gray-100 text-gray-700' :
                          isPastDue ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {request.status === 'paid' ? 'Paid' :
                           request.status === 'pending_confirmation' ? 'Awaiting' :
                           request.status === 'cancelled' ? 'Cancelled' :
                           isPastDue ? 'Overdue' : 'Pending'}
                        </span>
                      </div>
                      
                      <div className="text-lg font-bold text-green-600 mb-2">
                        ₱{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      
                      <div className="text-xs text-gray-500 space-y-0.5 mb-3">
                        <div>Rent: ₱{rent.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                        {water > 0 && <div>Water: ₱{water.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>}
                        {electrical > 0 && <div>Electric: ₱{electrical.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>}
                        {other > 0 && <div>Other: ₱{other.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>}
                      </div>
                      
                      {request.due_date && (
                        <div className={`text-xs mb-3 ${isPastDue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                          Due: {new Date(request.due_date).toLocaleDateString()}
                          {isPastDue && ' (OVERDUE)'}
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        {userRole === 'tenant' && request.status === 'pending' && (
                          <button
                            onClick={() => handlePayBill(request)}
                            className="flex-1 px-3 py-2 bg-black text-white text-sm font-medium rounded"
                          >
                            Pay Now
                          </button>
                        )}
                        {userRole === 'tenant' && request.status === 'pending_confirmation' && (
                          <span className="text-xs text-blue-600 font-medium">Waiting for confirmation</span>
                        )}
                        {userRole === 'landlord' && request.status === 'pending' && (
                          <button
                            onClick={() => setCancelBillId(request.id)}
                            className="px-3 py-2 bg-gray-200 text-black text-sm font-medium rounded"
                          >
                            Cancel
                          </button>
                        )}
                        {userRole === 'landlord' && request.status === 'pending_confirmation' && (
                          <button
                            onClick={() => setConfirmPaymentId(request.id)}
                            className="flex-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded"
                          >
                            Confirm Payment
                          </button>
                        )}
                      </div>
                      
                      {/* Confirmation dialogs */}
                      {cancelBillId === request.id && (
                        <div className="mt-3 p-3 bg-gray-100 rounded">
                          <p className="text-sm mb-2">Cancel this bill?</p>
                          <div className="flex gap-2">
                            <button onClick={() => handleCancelBill(request.id)} className="px-3 py-1 bg-red-500 text-white text-xs rounded">Yes</button>
                            <button onClick={() => setCancelBillId(null)} className="px-3 py-1 bg-gray-300 text-xs rounded">No</button>
                          </div>
                        </div>
                      )}
                      {confirmPaymentId === request.id && (
                        <div className="mt-3 p-3 bg-green-50 rounded">
                          <p className="text-sm mb-2">Confirm this payment?</p>
                          <div className="flex gap-2">
                            <button onClick={() => confirmPayment(request.id)} className="px-3 py-1 bg-green-600 text-white text-xs rounded">Yes</button>
                            <button onClick={() => setConfirmPaymentId(null)} className="px-3 py-1 bg-gray-300 text-xs rounded">No</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Property</th>
                    {userRole === 'landlord' ? (
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">Tenant</th>
                    ) : (
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">Landlord</th>
                    )}
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Amount</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Due Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paymentRequests.map(request => {
                    const rent = parseFloat(request.rent_amount) || 0
                    const water = parseFloat(request.water_bill) || 0
                    const electrical = parseFloat(request.electrical_bill) || 0
                    const other = parseFloat(request.other_bills) || 0
                    const total = rent + water + electrical + other
                    const isPastDue = request.due_date && new Date(request.due_date) < new Date() && request.status === 'pending'

                    return (
                      <tr key={request.id} className={`hover:bg-gray-50 ${isPastDue ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3 text-sm">
                          <div>{request.properties?.title || 'N/A'}</div>
                          {request.properties?.address && (
                            <div className="text-xs text-gray-500">{request.properties.address}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {userRole === 'landlord' 
                            ? request.tenant_profile?.full_name || 'N/A'
                            : request.landlord_profile?.full_name || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-bold text-green-600">
                            ₱{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                            <div>Rent: ₱{rent.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                            {water > 0 && <div>Water: ₱{water.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>}
                            {electrical > 0 && <div>Electric: ₱{electrical.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>}
                            {other > 0 && <div>Other: ₱{other.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>}
                          </div>
                          {request.bills_description && (
                            <div className="text-xs text-gray-500 italic mt-1">{request.bills_description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {request.due_date ? (
                            <div className={isPastDue ? 'text-red-600 font-medium' : ''}>
                              {new Date(request.due_date).toLocaleDateString()}
                              {isPastDue && <div className="text-xs">OVERDUE</div>}
                            </div>
                          ) : (
                            <span className="text-gray-400">No due date</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            request.status === 'paid' ? 'bg-green-100 text-green-700' :
                            request.status === 'pending_confirmation' ? 'bg-blue-100 text-blue-700' :
                            request.status === 'cancelled' ? 'bg-gray-100 text-gray-700' :
                            isPastDue ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {request.status === 'paid' ? 'Paid' :
                             request.status === 'pending_confirmation' ? 'Awaiting Confirmation' :
                             request.status === 'cancelled' ? 'Cancelled' :
                             isPastDue ? 'Overdue' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {userRole === 'tenant' && request.status === 'pending' && (
                            <button
                              onClick={() => handlePayBill(request)}
                              className="px-3 py-1 bg-black text-white hover:bg-gray-800 text-xs font-medium rounded"
                            >
                              Pay Now
                            </button>
                          )}
                          {userRole === 'tenant' && request.status === 'pending_confirmation' && (
                            <span className="text-xs text-blue-600 font-medium">Waiting for landlord confirmation</span>
                          )}
                          {userRole === 'landlord' && request.status === 'pending' && (
                            cancelBillId === request.id ? (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleCancelBill(request.id)}
                                  className="px-2 py-1 bg-red-500 text-white text-xs font-medium rounded"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setCancelBillId(null)}
                                  className="px-2 py-1 bg-gray-200 text-black text-xs font-medium rounded"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setCancelBillId(request.id)}
                                className="px-3 py-1 bg-gray-200 text-black text-xs font-medium rounded hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            )
                          )}
                          {userRole === 'landlord' && request.status === 'pending_confirmation' && (
                            confirmPaymentId === request.id ? (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => confirmPayment(request.id)}
                                  className="px-2 py-1 bg-green-600 text-white text-xs font-medium rounded"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setConfirmPaymentId(null)}
                                  className="px-2 py-1 bg-gray-200 text-black text-xs font-medium rounded"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmPaymentId(request.id)}
                                className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700"
                              >
                                Confirm Payment
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

        {/* Payment History */}
        <div className="bg-white border-2 border-black overflow-hidden">
          <div className="px-6 py-4 border-b border-black bg-white">
            <h2 className="text-lg font-semibold text-black">Payment History</h2>
          </div>
          {loading ? (
            <p className="p-6 text-black">Loading...</p>
          ) : payments.length === 0 ? (
            <div className="p-6">
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-black mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="text-lg font-medium text-black mb-2">No payment records yet</h3>
                <p className="text-black text-sm mb-4">
                  {userRole === 'landlord' 
                    ? approvedApplications.length > 0
                      ? `You have ${approvedApplications.length} approved application(s). Click "Record Payment" above to create your first payment record when a tenant pays.`
                      : "Once you approve tenant applications, you can record payments here."
                    : "Your payment history will appear here once your landlord records payments."}
                </p>
                {/* {userRole === 'landlord' && approvedApplications.length > 0 && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="inline-flex items-center px-4 py-2 bg-black text-white hover:bg-black text-sm font-medium"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Record Your First Payment
                  </button>
                )} */}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Property</th>
                    {userRole === 'landlord' && (
                      <th className="px-4 py-3 text-left text-sm font-medium text-black">Tenant</th>
                    )}
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Rent</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Bills</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Total</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Method</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-black">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map(payment => {
                    const rent = parseFloat(payment.amount) || 0
                    const water = parseFloat(payment.water_bill) || 0
                    const electrical = parseFloat(payment.electrical_bill) || 0
                    const other = parseFloat(payment.other_bills) || 0
                    const totalBills = water + electrical + other
                    const grandTotal = rent + totalBills

                    return (
                      <tr key={payment.id} className="hover:bg-white">
                        <td className="px-4 py-3 text-sm">{payment.properties?.title || 'N/A'}</td>
                        {userRole === 'landlord' && (
                          <td className="px-4 py-3 text-sm">{payment.profiles?.full_name || 'N/A'}</td>
                        )}
                        <td className="px-4 py-3 text-sm font-medium">
                          ₱{rent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {totalBills > 0 ? (
                            <div className="space-y-1">
                              {water > 0 && (
                                <div className="text-xs text-black">
                                  Water: ₱{water.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                              {electrical > 0 && (
                                <div className="text-xs text-black">
                                  Electric: ₱{electrical.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                              {other > 0 && (
                                <div className="text-xs text-black">
                                  Other: ₱{other.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                              {payment.bills_description && (
                                <div className="text-xs text-black italic mt-1">
                                  {payment.bills_description}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-black text-xs">No bills</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-black">
                          ₱{grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm capitalize">{payment.method?.replace('_', ' ')}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 py-1 text-xs bg-black text-white">
                            {payment.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-black whitespace-nowrap">
                          {new Date(payment.paid_at).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Payment Modal for Tenants */}
        {showPaymentModal && selectedBill && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white border-2 border-black max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-black">Pay Bill</h3>
                <button
                  onClick={() => {
                    setShowPaymentModal(false)
                    setSelectedBill(null)
                    setPaymentMethod('cash')
                    setProofFile(null)
                    setProofPreview(null)
                    setReferenceNumber('')
                  }}
                  className="text-black"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Property Info */}
                <div className="bg-gray-50 p-3 sm:p-4 rounded">
                  <div className="text-sm font-medium text-gray-500 mb-1">Property</div>
                  <div className="font-semibold text-black">{selectedBill.properties?.title}</div>
                  {selectedBill.properties?.address && (
                    <div className="text-xs text-gray-500 mt-1">{selectedBill.properties.address}</div>
                  )}
                </div>
                
                {/* View Bill Receipt Button */}
                {selectedBill.bill_receipt_url && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBillReceipt(selectedBill.bill_receipt_url)
                      setShowBillReceiptModal(true)
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View Bill Receipt from Landlord
                  </button>
                )}

                {/* Bill Breakdown */}
                <div className="border-2 border-black p-3 sm:p-4">
                  <div className="text-sm font-medium text-black mb-3">Bill Breakdown</div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Rent:</span>
                      <span className="font-medium">₱{parseFloat(selectedBill.rent_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {parseFloat(selectedBill.water_bill || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Water Bill:</span>
                        <span className="font-medium">₱{parseFloat(selectedBill.water_bill).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {parseFloat(selectedBill.electrical_bill || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Electrical Bill:</span>
                        <span className="font-medium">₱{parseFloat(selectedBill.electrical_bill).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {parseFloat(selectedBill.other_bills || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Other Bills:</span>
                        <span className="font-medium">₱{parseFloat(selectedBill.other_bills).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {selectedBill.bills_description && (
                      <div className="text-xs text-gray-500 italic mt-2 pt-2 border-t">
                        {selectedBill.bills_description}
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold pt-2 border-t border-black">
                      <span>Total Amount:</span>
                      <span className="text-green-600">
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

                {/* Due Date */}
                {selectedBill.due_date && (
                  <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-sm">
                        <span className="font-medium text-yellow-800">Due Date: </span>
                        <span className="text-yellow-700">{new Date(selectedBill.due_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Method Selection */}
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Select Payment Method</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`p-3 border-2 rounded flex flex-col items-center gap-2 transition-all ${
                        paymentMethod === 'cash' 
                          ? 'border-green-500 bg-green-50' 
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <svg className={`w-8 h-8 ${paymentMethod === 'cash' ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span className={`text-sm font-medium ${paymentMethod === 'cash' ? 'text-green-700' : 'text-gray-600'}`}>Cash</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedBill.qr_code_url) {
                          setPaymentMethod('qr_code')
                        } else {
                          toast.error('Landlord has not provided a QR code')
                        }
                      }}
                      disabled={!selectedBill.qr_code_url}
                      className={`p-3 border-2 rounded flex flex-col items-center gap-2 transition-all ${
                        !selectedBill.qr_code_url 
                          ? 'border-gray-200 bg-gray-100 cursor-not-allowed opacity-50'
                          : paymentMethod === 'qr_code' 
                            ? 'border-green-500 bg-green-50' 
                            : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <svg className={`w-8 h-8 ${paymentMethod === 'qr_code' ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                      <span className={`text-sm font-medium ${paymentMethod === 'qr_code' ? 'text-green-700' : 'text-gray-600'}`}>QR Code</span>
                      {!selectedBill.qr_code_url && (
                        <span className="text-xs text-red-500">Not available</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* QR Code Payment Flow */}
                {paymentMethod === 'qr_code' && selectedBill.qr_code_url && (
                  <div className="space-y-4 border-2 border-blue-200 bg-blue-50 p-4 rounded">
                    <div className="text-center">
                      <p className="text-sm font-medium text-blue-800 mb-2">Scan this QR Code to Pay</p>
                      <img 
                        src={selectedBill.qr_code_url} 
                        alt="Payment QR Code" 
                        className="max-h-48 mx-auto rounded border-2 border-white shadow"
                      />
                    </div>
                    
                    <div className="border-t border-blue-200 pt-4">
                      <p className="text-sm font-medium text-blue-800 mb-3">After payment, provide proof:</p>
                      
                      {/* Reference Number */}
                      <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                        <input
                          type="text"
                          value={referenceNumber}
                          onChange={e => setReferenceNumber(e.target.value)}
                          placeholder="Enter reference/transaction number"
                          className="w-full border-2 border-gray-300 px-3 py-2 rounded"
                        />
                      </div>
                      
                      {/* Screenshot Upload */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Screenshot (Optional)</label>
                        <div className="border-2 border-dashed border-gray-300 p-4 text-center rounded bg-white">
                          {proofPreview ? (
                            <div className="relative inline-block">
                              <img src={proofPreview} alt="Payment Proof" className="max-h-32 rounded" />
                              <button
                                type="button"
                                onClick={() => {
                                  setProofFile(null)
                                  setProofPreview(null)
                                }}
                                className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <label className="cursor-pointer">
                              <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="text-sm text-gray-600">Click to upload screenshot</span>
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

                {/* Cash Payment Info */}
                {paymentMethod === 'cash' && (
                  <div className="bg-gray-50 border-2 border-gray-200 p-3 rounded">
                    <div className="flex gap-2">
                      <svg className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-xs text-gray-600">
                        <p className="font-medium mb-1">Cash Payment:</p>
                        <p>After submitting, your landlord will verify the payment before it's marked as paid. Please ensure you've handed over the cash payment.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={submitPayment}
                    disabled={uploadingProof}
                    className="flex-1 px-4 py-3 bg-black text-white hover:bg-gray-800 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                  >
                    {uploadingProof ? (
                      <>
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Submitting...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Submit Payment
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowPaymentModal(false)
                      setSelectedBill(null)
                      setPaymentMethod('cash')
                      setProofFile(null)
                      setProofPreview(null)
                      setReferenceNumber('')
                    }}
                    className="px-6 py-3 bg-gray-200 text-black font-medium rounded hover:bg-gray-300"
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">Bill Receipt from Landlord</h3>
                <button
                  onClick={() => {
                    setShowBillReceiptModal(false)
                    setSelectedBillReceipt(null)
                  }}
                  className="text-gray-500 hover:text-black"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <img src={selectedBillReceipt} alt="Bill Receipt" className="w-full rounded" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
