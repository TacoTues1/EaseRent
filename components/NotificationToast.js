import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function NotificationToast() {
    const router = useRouter()
    const [toasts, setToasts] = useState([])
    const [session, setSession] = useState(null)

    // Get session
    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data?.session)
        })
        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })
        return () => listener.subscription.unsubscribe()
    }, [])

    // Remove a toast
    const removeToast = useCallback((id) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 400)
    }, [])

    // Navigate based on notification type (same logic as Navbar)
    const getNotificationRoute = (notif) => {
        if (notif.link) return notif.link

        const type = notif.type || ''

        if (['payment', 'payment_confirmed', 'payment_rejected', 'payment_request',
            'payment_bill', 'payment_confirmation_needed', 'cash_payment',
            'confirm_payment', 'cancel_bill', 'reject_payment',
            'rent_bill_reminder', 'security_deposit_deduction', 'payment_late_fee', 'payment_paid', 'late_fee_no_deposit'
        ].includes(type)) return '/payments'

        if (['maintenance', 'maintenance_status', 'maintenance_request'].includes(type)) return '/maintenance'

        if (['booking', 'booking_request', 'booking_approved', 'booking_rejected',
            'booking_cancelled', 'booking_status', 'new_booking', 'booking_new',
            'viewing_success'
        ].includes(type)) return '/bookings'

        if (type === 'message') return '/messages'

        if (['end_occupancy_request', 'end_request_approved', 'end_request_rejected',
            'occupancy_assigned'
        ].includes(type)) return '/dashboard'

        if (type === 'application' || type === 'assign_user' || type.includes('application_')) return '/applications'

        return '/notifications'
    }

    // Get icon for notification type
    const getNotificationIcon = (type) => {
        if (!type) return '🔔'
        if (type.includes('payment') || type.includes('bill') || type.includes('rent')) return '💰'
        if (type.includes('maintenance')) return '🔧'
        if (type.includes('booking') || type.includes('viewing')) return '📅'
        if (type.includes('message')) return '💬'
        if (type.includes('contract')) return '📄'
        if (type.includes('occupancy') || type.includes('end_')) return '🏠'
        if (type.includes('application') || type.includes('assign')) return '📋'
        if (type.includes('wifi')) return '📶'
        if (type.includes('electric')) return '⚡'
        if (type.includes('water')) return '💧'
        return '🔔'
    }

    // Handle clicking a toast
    const handleToastClick = async (toast) => {
        const route = getNotificationRoute(toast)
        removeToast(toast.id)

        // Mark as read
        await supabase.from('notifications').update({ read: true }).eq('id', toast.notifId)

        router.push(route)
    }

    // Subscribe to real-time notifications
    useEffect(() => {
        if (!session) return

        const userId = session.user.id

        const channel = supabase
            .channel('notification-toasts')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `recipient=eq.${userId}`
                },
                (payload) => {
                    const notif = payload.new

                    // Skip system notifications (daily_reminder_check, etc.)
                    if (notif.type === 'daily_reminder_check') return
                    if (notif.recipient === '00000000-0000-0000-0000-000000000000') return

                    const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`

                    const newToast = {
                        id: toastId,
                        notifId: notif.id,
                        message: notif.message,
                        type: notif.type,
                        link: notif.link,
                        created_at: notif.created_at,
                        exiting: false
                    }

                    setToasts(prev => {
                        // Max 3 toasts at a time
                        const updated = [newToast, ...prev]
                        if (updated.length > 3) return updated.slice(0, 3)
                        return updated
                    })

                    // Auto-dismiss after 6 seconds
                    setTimeout(() => {
                        removeToast(toastId)
                    }, 6000)
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [session, removeToast])

    if (toasts.length === 0) return null

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-3 max-w-sm w-full pointer-events-none">
            {toasts.map((toast, index) => (
                <div
                    key={toast.id}
                    className={`pointer-events-auto bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden cursor-pointer group transition-all duration-400 ${toast.exiting
                        ? 'animate-toast-exit'
                        : 'animate-toast-enter'
                        }`}
                    onClick={() => handleToastClick(toast)}
                    style={{ animationDelay: `${index * 50}ms` }}
                >
                    {/* Progress bar */}
                    <div className="h-0.5 bg-gray-100 w-full overflow-hidden">
                        <div
                            className="h-full bg-black animate-toast-progress"
                            style={{ animationDuration: '6s' }}
                        />
                    </div>

                    <div className="p-4">
                        <div className="flex items-start gap-3">
                            {/* Icon */}
                            <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-lg">
                                {getNotificationIcon(toast.type)}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                                    New Notification
                                </p>
                                <p className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-black">
                                    {toast.message}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-1.5">Just now • Click to view</p>
                            </div>

                            {/* Close button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    removeToast(toast.id)
                                }}
                                className="flex-shrink-0 p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            ))}

            <style jsx global>{`
        @keyframes toastEnter {
          0% {
            opacity: 0;
            transform: translateX(120%);
          }
          60% {
            opacity: 1;
            transform: translateX(-8px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes toastExit {
          0% {
            opacity: 1;
            transform: translateX(0);
          }
          100% {
            opacity: 0;
            transform: translateX(120%);
          }
        }

        @keyframes toastProgress {
          0% {
            width: 100%;
          }
          100% {
            width: 0%;
          }
        }

        .animate-toast-enter {
          animation: toastEnter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        .animate-toast-exit {
          animation: toastExit 0.4s cubic-bezier(0.4, 0, 1, 1) forwards;
        }

        .animate-toast-progress {
          animation: toastProgress linear forwards;
        }
      `}</style>
        </div>
    )
}
