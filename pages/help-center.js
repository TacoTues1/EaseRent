import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  ArrowLeft,
  ChevronDown,
  Inbox,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  Paperclip,
  Search,
  Send,
  Ticket,
  Upload,
  UserCircle,
  X
} from 'lucide-react'
import { showToast } from 'nextjs-toast-notify'
import Footer from '../components/Footer'
import { supabase } from '../lib/supabaseClient'
import {
  SUPPORT_TICKET_ISSUES,
  SUPPORT_TICKET_REQUEST_TYPES,
  SUPPORT_TICKET_STATUSES,
  formatSupportTicketId,
  getSupportOptionLabel,
  getSupportProfileName
} from '../lib/supportTickets'

const initialForm = {
  requestType: '',
  issue: '',
  subject: '',
  description: '',
  phoneNumber: ''
}

const HELP_CENTER_FAQS = [
  {
    question: 'How do I submit a support ticket?',
    answer: 'Log in to your Abalay account, open Help Center, choose Submit a Ticket, select the correct request type and issue, complete the details, and attach any helpful screenshots or videos.'
  },
  {
    question: 'How do I submit a maintenance ticket?',
    answer: 'Choose Submit a Ticket, set the request type to Maintenance Support, select Maintenance as the issue, then include the property name, room or unit, problem description, urgency, and photos or videos if available.'
  },
  {
    question: 'How do I submit a booking ticket?',
    answer: 'Choose Submit a Ticket, set the request type to Booking Support, select Booking as the issue, then include the property, booking date, schedule, landlord or tenant name, and what needs to be fixed or checked.'
  },
  {
    question: 'How do I submit a payment ticket?',
    answer: 'Choose Submit a Ticket, set the request type to Payment Support, select Payment Problems as the issue, then include the property, billing period, amount, payment method, reference number, and receipt or error screenshots.'
  },
  {
    question: 'How do I submit an account or profile ticket?',
    answer: 'Choose Submit a Ticket, set the request type to Account Help, select Account / Profile as the issue, then describe the login, verification, profile, email, phone, or password concern clearly.'
  },
  {
    question: 'How do I submit a property listing ticket?',
    answer: 'Choose Submit a Ticket, set the request type to Property Listing, select Property Listing as the issue, then include the listing title, address, landlord name, and the listing detail that needs review.'
  },
  {
    question: 'How do I submit a messages or notifications ticket?',
    answer: 'Choose Submit a Ticket, select Messages / Notifications as the issue, then include who you were messaging, the notification type, the date and time, and screenshots of the missing or incorrect message.'
  },
  {
    question: 'Where can I check my ticket status?',
    answer: 'Use My Tickets in the Help Center. Open a request to see the full details, current status, assigned admin, attachments, and conversation.'
  },
  {
    question: 'Can I add more information after submitting?',
    answer: 'Yes. Open your ticket from My Tickets and add a comment. The assigned admin can reply in the same conversation.'
  },
  {
    question: 'What should I include for payment concerns?',
    answer: 'Include the property, billing period, payment method, reference number if available, and clear screenshots of receipts or failed payment messages.'
  },
  {
    question: 'Who handles maintenance or property concerns?',
    answer: 'Support reviews the request and coordinates with the assigned admin or property contact when more information is needed.'
  },
  {
    question: 'Why is my ticket not assigned yet?',
    answer: 'New tickets start as pending until an admin claims them. You can still add comments while waiting.'
  }
]

function formatDate(value) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function getStatusBadgeClass(status) {
  if (status === 'resolved') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'closed') return 'bg-gray-100 text-gray-700 border-gray-200'
  if (status === 'in_progress') return 'bg-blue-50 text-blue-700 border-blue-200'
  return 'bg-amber-50 text-amber-700 border-amber-200'
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

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch (_error) {
    const isHtml = text.trim().startsWith('<')
    if (isHtml) {
      throw new Error(`${fallbackMessage}. The server returned an HTML error page.`)
    }
    throw new Error(fallbackMessage)
  }
}

function FaqItem({ faq }) {
  return (
    <details className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left text-sm font-black text-gray-900">
        <span>{faq.question}</span>
        <ChevronDown className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180 flex-shrink-0" />
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">{faq.answer}</p>
    </details>
  )
}

export default function HelpCenter() {
  const router = useRouter()
  const menuRef = useRef(null)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('home')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [files, setFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tickets, setTickets] = useState([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [commentBody, setCommentBody] = useState('')
  const [commenting, setCommenting] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      const nextSession = data?.session || null
      setSession(nextSession)

      if (nextSession) {
        await loadProfile(nextSession.user.id)
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) {
        await loadProfile(nextSession.user.id)
      } else {
        setProfile(null)
        setTickets([])
        setSelectedTicket(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [router])

  useEffect(() => {
    if (!session || !router.isReady) return
    const requestedView = router.query.view
    if (requestedView === 'form' || requestedView === 'tickets') {
      setView(requestedView)
      if (requestedView === 'tickets') loadTickets()
    }
  }, [router.isReady, router.query.view, session])

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadProfile(userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, avatar_url, role')
        .eq('id', userId)
        .maybeSingle()

      setProfile(data || null)
      if (data?.phone) {
        setForm(prev => ({ ...prev, phoneNumber: prev.phoneNumber || data.phone }))
      }
    } catch (error) {
      console.error('Help Center profile load failed:', error)
    }
  }

  async function loadTickets(accessToken = session?.access_token) {
    if (!accessToken) return

    setTicketsLoading(true)
    try {
      const res = await fetch('/api/support-tickets', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })
      const data = await readJsonResponse(res, 'Failed to load tickets')
      if (!res.ok) throw new Error(data.error || 'Failed to load tickets')
      const nextTickets = data.tickets || []
      setTickets(nextTickets)
      setSelectedTicket(prev => prev ? nextTickets.find(ticket => ticket.id === prev.id) || null : prev)
    } catch (error) {
      showToast.error(error.message || 'Failed to load tickets')
    } finally {
      setTicketsLoading(false)
    }
  }

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase()

    return tickets.filter(ticket => {
      const statusMatches = statusFilter === 'all' || ticket.status === statusFilter
      const searchMatches = !term ||
        formatSupportTicketId(ticket.id).toLowerCase().includes(term) ||
        (ticket.subject || '').toLowerCase().includes(term) ||
        (ticket.description || '').toLowerCase().includes(term)

      return statusMatches && searchMatches
    })
  }, [tickets, search, statusFilter])

  function handleFileChange(event) {
    const selected = Array.from(event.target.files || [])
    if (selected.length === 0) return

    const validFiles = selected.filter(file => {
      const isAllowed = file.type.startsWith('image/') || file.type.startsWith('video/')
      const isWithinLimit = file.size <= 50 * 1024 * 1024

      if (!isAllowed) showToast.error(`${file.name} must be an image or video.`)
      if (!isWithinLimit) showToast.error(`${file.name} must be 50MB or less.`)

      return isAllowed && isWithinLimit
    })

    setFiles(prev => [...prev, ...validFiles].slice(0, 8))
    event.target.value = ''
  }

  async function uploadAttachments() {
    if (files.length === 0) return []

    setUploading(true)
    try {
      const uploaded = []

      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${session.user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`
        const { error } = await supabase.storage
          .from('support-ticket-attachments')
          .upload(path, file, {
            contentType: file.type,
            upsert: false
          })

        if (error) throw error

        const { data } = supabase.storage
          .from('support-ticket-attachments')
          .getPublicUrl(path)

        uploaded.push({
          name: file.name,
          url: data.publicUrl,
          path,
          type: file.type,
          size: file.size
        })
      }

      return uploaded
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!session?.access_token) {
      redirectToLogin('form')
      return
    }

    setSubmitting(true)
    try {
      const attachments = await uploadAttachments()
      const res = await fetch('/api/support-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          ...form,
          attachments
        })
      })
      const data = await readJsonResponse(res, 'Failed to submit ticket')
      if (!res.ok) throw new Error(data.error || 'Failed to submit ticket')

      setForm({
        ...initialForm,
        phoneNumber: profile?.phone || ''
      })
      setFiles([])
      await loadTickets()
      setView('tickets')
      if (data.email?.failed > 0 || data.email?.attempted === 0) {
        showToast.warning('Ticket submitted, but admin email notification failed. Please contact support if urgent.')
      } else {
        showToast.success('Ticket submitted successfully.')
      }
    } catch (error) {
      showToast.error(error.message || 'Failed to submit ticket')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitComment(event) {
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
      const data = await readJsonResponse(res, 'Failed to add comment')
      if (!res.ok) throw new Error(data.error || 'Failed to add comment')

      setTickets(prev => prev.map(ticket => (
        ticket.id === selectedTicket.id ? appendTicketComment(ticket, data.comment) : ticket
      )))
      setSelectedTicket(prev => appendTicketComment(prev, data.comment))
      setCommentBody('')
      showToast.success('Comment added.')
    } catch (error) {
      showToast.error(error.message || 'Failed to add comment')
    } finally {
      setCommenting(false)
    }
  }

  async function handleLogout() {
    setShowUserMenu(false)
    await supabase.auth.signOut()
    setSelectedTicket(null)
    setView('home')
  }

  function redirectToLogin(nextView = 'form') {
    const redirect = encodeURIComponent(`/help-center?view=${nextView}`)
    router.push(`/login?redirect=${redirect}`)
  }

  function openProtectedView(nextView) {
    if (!session) {
      redirectToLogin(nextView)
      return
    }

    setView(nextView)
    if (nextView === 'tickets') loadTickets()
    if (nextView !== 'tickets') setSelectedTicket(null)
  }

  const displayName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || session?.user?.email || 'User'
  const isBusy = submitting || uploading
  const selectedTicketIsClosed = selectedTicket?.status === 'closed'

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-gray-950 font-sans">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200">
        <nav className="max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/home.png" alt="Abalay" className="w-9 h-9 object-contain" />
            <span className="text-3xl font-black tracking-tight" style={{ fontFamily: '"Pacifico", cursive', marginTop: '-4px' }}>Abalay</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => openProtectedView('tickets')}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Ticket className="w-4 h-4" />
              <span className="hidden sm:inline">My Tickets</span>
            </button>

            {session ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setShowUserMenu(prev => !prev)}
                  className="inline-flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={displayName} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <UserCircle className="w-7 h-7 text-gray-500" />
                  )}
                  <span className="hidden md:block text-sm font-bold max-w-[140px] truncate">{displayName}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-black truncate">{displayName}</p>
                      <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
                    </div>
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      Dashboard
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => redirectToLogin('form')}
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-black text-white text-sm font-bold hover:bg-gray-800 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/register?redirect=${encodeURIComponent('/help-center?view=form')}`)}
                  className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-800 hover:bg-gray-50 transition-colors"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </nav>
      </header>

      <main className="min-h-[calc(100vh-64px)]">
        {view === 'home' && (
          <section className="px-4 py-12 sm:py-16">
            <div className="max-w-5xl mx-auto">
              <div className="min-h-[360px] flex items-center justify-center text-center">
                <div className="w-full max-w-xl">
                  <div className="w-40 h-40 mx-auto  flex items-center justify-center mb-6">
                    <img src="/home.png" alt="Abalay logo" width="90" height="90" className="w-30 h-30 object-contain" />
                  </div>
                  <h1 className="text-3xl sm:text-5xl font-black tracking-tight">Abalay help Center</h1>
                  <p className="mt-4 text-gray-600 text-base sm:text-lg">Send a request to the Abalay support team.</p>
                  <button
                    type="button"
                    onClick={() => openProtectedView('form')}
                    className="mt-8 inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-black text-white text-base font-black shadow-lg hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    <Send className="w-5 h-5" />
                    Submit a Ticket
                  </button>
                </div>
              </div>

              <div className="mt-8">
                <div className="mb-5">
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Frequently Asked Questions</h2>
                  <p className="mt-2 text-sm sm:text-base text-gray-600">Quick answers for common account, payment, booking, and ticket concerns.</p>
                </div>
                <div className="min-h-[620px]">
                  <div className="space-y-3 md:hidden">
                    {HELP_CENTER_FAQS.map(faq => (
                      <FaqItem key={faq.question} faq={faq} />
                    ))}
                  </div>
                  <div className="hidden md:grid md:grid-cols-2 md:gap-3 md:items-start">
                    {[0, 1].map(columnIndex => (
                      <div key={columnIndex} className="space-y-3">
                        {HELP_CENTER_FAQS
                          .filter((_, index) => index % 2 === columnIndex)
                          .map(faq => (
                            <FaqItem key={faq.question} faq={faq} />
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {view === 'form' && (
          <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <button
              type="button"
              onClick={() => setView('home')}
              className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-black cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 sm:px-7 py-6 border-b border-gray-100">
                <h2 className="text-2xl font-black tracking-tight">Submit Request</h2>
                <h6 className="text-s text-gray-700 mt-2">Please provide all information (User name, ID's, Screenshots)</h6>
              </div>

              <div className="p-5 sm:p-7 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <label className="block">
                    <span className="block text-sm font-bold text-gray-700 mb-2">Request Type</span>
                    <select
                      required
                      value={form.requestType}
                      onChange={event => setForm(prev => ({ ...prev, requestType: event.target.value }))}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-black"
                    >
                      <option value="" disabled>Pick the type of request</option>
                      {SUPPORT_TICKET_REQUEST_TYPES.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="block text-sm font-bold text-gray-700 mb-2">Issue</span>
                    <select
                      required
                      value={form.issue}
                      onChange={event => setForm(prev => ({ ...prev, issue: event.target.value }))}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-black"
                    >
                      <option value="" disabled>Select issue</option>
                      {SUPPORT_TICKET_ISSUES.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="block text-sm font-bold text-gray-700 mb-2">Subject</span>
                  <input
                    required
                    maxLength={160}
                    value={form.subject}
                    onChange={event => setForm(prev => ({ ...prev, subject: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-black"
                    placeholder="Short summary"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-bold text-gray-700 mb-2">Description</span>
                  <textarea
                    required
                    rows={7}
                    maxLength={4000}
                    value={form.description}
                    onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-black resize-none"
                    placeholder="Describe what happened"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-bold text-gray-700 mb-2">Phone Number <span className="font-medium text-gray-400">(if available)</span></span>
                  <input
                    value={form.phoneNumber}
                    onChange={event => setForm(prev => ({ ...prev, phoneNumber: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-black"
                    placeholder="Phone number"
                  />
                </label>

                <div>
                  <span className="block text-sm font-bold text-gray-700 mb-2">Attachments <span className="font-medium text-gray-400">(Image & Video)</span></span>
                  <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center cursor-pointer hover:bg-gray-100 transition-colors">
                    <Upload className="w-7 h-7 text-gray-500" />
                    <span className="text-sm font-bold text-gray-700">Upload image or video</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>

                  {files.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {files.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-semibold text-gray-700 truncate">{file.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFiles(prev => prev.filter((_, fileIndex) => fileIndex !== index))}
                            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                            aria-label={`Remove ${file.name}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 sm:px-7 py-5 border-t border-gray-100 bg-gray-50 flex justify-end">
                <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <p className="text-xs sm:text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    Please review your request carefully. Tickets cannot be edited once submitted.
                  </p>
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-black text-white text-sm font-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {uploading ? 'Uploading...' : submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {view === 'tickets' && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
              <div>
                <button
                  type="button"
                  onClick={() => selectedTicket ? setSelectedTicket(null) : setView('home')}
                  className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-black cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {selectedTicket ? 'Back to Tickets' : 'Back'}
                </button>
                <h2 className="text-3xl font-black tracking-tight">My Tickets</h2>
              </div>

              <button
                type="button"
                onClick={() => openProtectedView('form')}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black text-white text-sm font-black hover:bg-gray-800 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Submit a Ticket
              </button>
            </div>

            {selectedTicket ? (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
                <div className="space-y-5">
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-5 sm:px-6 py-5 border-b border-gray-100">
                      <p className="text-xs font-mono font-black text-gray-500">{formatSupportTicketId(selectedTicket.id)}</p>
                      <h3 className="text-2xl font-black text-gray-950 mt-1 break-words">{selectedTicket.subject}</h3>
                    </div>
                    <div className="p-5 sm:p-6 space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <p className="text-xs font-black text-gray-500 uppercase mb-2">Request Type</p>
                          <p className="text-sm font-bold text-gray-900">{getSupportOptionLabel(SUPPORT_TICKET_REQUEST_TYPES, selectedTicket.request_type)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <p className="text-xs font-black text-gray-500 uppercase mb-2">Issue</p>
                          <p className="text-sm font-bold text-gray-900">{getSupportOptionLabel(SUPPORT_TICKET_ISSUES, selectedTicket.issue)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <p className="text-xs font-black text-gray-500 uppercase mb-2">Phone Number</p>
                          <p className="text-sm font-bold text-gray-900">{selectedTicket.phone_number || 'N/A'}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <p className="text-xs font-black text-gray-500 uppercase mb-2">Created</p>
                          <p className="text-sm font-bold text-gray-900">{formatDate(selectedTicket.created_at)}</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-black text-gray-500 uppercase mb-2">Description</p>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedTicket.description}</div>
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
                                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm font-bold text-gray-800 hover:bg-gray-50 transition-colors min-w-0"
                              >
                                <Paperclip className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                <span className="truncate">{file.name || `Attachment ${index + 1}`}</span>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">No attachments.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-5 sm:px-6 py-5 border-b border-gray-100">
                      <h3 className="text-xl font-black text-gray-950">Comments</h3>
                      <p className="text-sm text-gray-500 mt-1">Conversation with the assigned admin.</p>
                    </div>

                    <div className="p-5 sm:p-6 space-y-4">
                      {(selectedTicket.comments || []).length > 0 ? (
                        selectedTicket.comments.map(comment => (
                          <div key={comment.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <div className="inline-flex max-w-full items-center gap-3 rounded-2xl bg-gray-200/70 px-4 py-3">
                              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-xs font-black text-gray-500 flex-shrink-0">
                                {getSupportProfileName(comment.author, 'U').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-sm font-black text-gray-900 truncate">
                                    {comment.author_id === session?.user?.id ? 'You' : getSupportProfileName(comment.author, 'User')}
                                  </p>
                                  <span className="text-[10px] font-black uppercase text-gray-500 bg-white rounded-full px-2 py-0.5">
                                    {getCommentAuthorLabel(comment, session?.user?.id)}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500">{formatDate(comment.created_at)}</p>
                              </div>
                            </div>
                            <p className="mt-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{comment.body}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">No comments yet.</div>
                      )}

                      {selectedTicketIsClosed ? (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-600">
                          This ticket is closed. Comments are disabled.
                        </div>
                      ) : (
                        <form onSubmit={handleSubmitComment} className="pt-1">
                          <label className="block">
                            <span className="block text-sm font-bold text-gray-700 mb-2">Add Comment</span>
                            <textarea
                              rows={4}
                              maxLength={2000}
                              value={commentBody}
                              onChange={event => setCommentBody(event.target.value)}
                              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-black resize-none"
                              placeholder="Write your reply"
                            />
                          </label>
                          <div className="mt-3 flex justify-end">
                            <button
                              type="submit"
                              disabled={commenting || !commentBody.trim()}
                              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white text-sm font-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {commenting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              {commenting ? 'Sending...' : 'Send Comment'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                </div>

                <aside className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 lg:sticky lg:top-24">
                  <p className="text-xs font-black text-gray-500 uppercase mb-2">Status</p>
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-black capitalize ${getStatusBadgeClass(selectedTicket.status)}`}>
                    {getSupportOptionLabel(SUPPORT_TICKET_STATUSES, selectedTicket.status)}
                  </span>

                  <div className="mt-6 space-y-4">
                    <div>
                      <p className="text-xs font-black text-gray-500 uppercase mb-1">Assigned To</p>
                      <p className="text-sm font-black text-gray-900 break-words">
                        {getSupportProfileName(selectedTicket.claimed_by_profile, 'Not assigned yet')}
                      </p>
                      {/* {selectedTicket.claimed_by_profile?.email && (
                        <p className="text-xs text-gray-500 break-words mt-1">{selectedTicket.claimed_by_profile.email}</p>
                      )} */}
                    </div>
                    <div>
                      <p className="text-xs font-black text-gray-500 uppercase mb-1">Last Updated</p>
                      <p className="text-sm font-bold text-gray-900">{formatDate(selectedTicket.updated_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black text-gray-500 uppercase mb-1">Ticket ID</p>
                      <p className="text-sm font-mono font-bold text-gray-900">{formatSupportTicketId(selectedTicket.id)}</p>
                    </div>
                  </div>
                </aside>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      placeholder="Search request"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-black"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={event => setStatusFilter(event.target.value)}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold outline-none focus:border-black"
                  >
                    <option value="all">All Status</option>
                    {SUPPORT_TICKET_STATUSES.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-4 text-xs font-black text-gray-500 uppercase">ID</th>
                        <th className="px-5 py-4 text-xs font-black text-gray-500 uppercase">Subject</th>
                        <th className="px-5 py-4 text-xs font-black text-gray-500 uppercase">Created</th>
                        <th className="px-5 py-4 text-xs font-black text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ticketsLoading ? (
                        <tr>
                          <td colSpan={4} className="px-5 py-16 text-center">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-500" />
                          </td>
                        </tr>
                      ) : filteredTickets.length > 0 ? (
                        filteredTickets.map(ticket => (
                          <tr
                            key={ticket.id}
                            onClick={() => {
                              setSelectedTicket(ticket)
                              setCommentBody('')
                            }}
                            className="hover:bg-gray-50 cursor-pointer"
                          >
                            <td className="px-5 py-4 text-sm font-mono font-bold text-gray-800">{formatSupportTicketId(ticket.id)}</td>
                            <td className="px-5 py-4">
                              <div className="text-sm font-bold text-gray-950">{ticket.subject}</div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {getSupportOptionLabel(SUPPORT_TICKET_REQUEST_TYPES, ticket.request_type)}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-gray-600 whitespace-nowrap">{formatDate(ticket.created_at)}</td>
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-black capitalize ${getStatusBadgeClass(ticket.status)}`}>
                                {getSupportOptionLabel(SUPPORT_TICKET_STATUSES, ticket.status)}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-5 py-16 text-center">
                            <div className="flex flex-col items-center gap-3 text-gray-400">
                              <Inbox className="w-10 h-10" />
                              <p className="font-bold">No tickets found.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <Footer />
    </div>
  )
}
