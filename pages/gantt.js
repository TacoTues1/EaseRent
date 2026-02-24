import { useState, useEffect, useRef, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'

// ==========================================
// GANTT CHART DATA — Abalay Development
// ==========================================
const phases = [
    {
        id: 'planning',
        name: 'Planning & Design',
        category: 'foundation',
        start: '2025-10-15',
        end: '2025-10-27',
        progress: 100,
        color: '#6366f1',
        tasks: [
            'System requirements gathering',
            'Database schema design',
            'UI/UX wireframing',
            'Technology stack selection'
        ]
    },
    {
        id: 'auth',
        name: 'Authentication System',
        category: 'foundation',
        start: '2025-10-28',
        end: '2025-10-30',
        progress: 100,
        color: '#8b5cf6',
        tasks: [
            'Supabase Auth integration',
            'Login / Register pages',
            'Google OAuth setup',
            'Role-based access (Tenant/Landlord/Admin)'
        ]
    },
    {
        id: 'database',
        name: 'Database & API Setup',
        category: 'foundation',
        start: '2025-10-28',
        end: '2025-11-11',
        progress: 100,
        color: '#a78bfa',
        tasks: [
            'Supabase tables & RLS policies',
            'Profiles, properties, bookings tables',
            'Payment requests & occupancies tables',
            'Storage buckets for images'
        ]
    },
    {
        id: 'properties',
        name: 'Property Management',
        category: 'core',
        start: '2025-11-11',
        end: '2025-11-27',
        progress: 100,
        color: '#10b981',
        tasks: [
            'Property listing pages',
            'Image upload & gallery',
            'Search & filter functionality',
            'Map integration & directions',
            'Property detail pages'
        ]
    },
    {
        id: 'dashboards',
        name: 'User Dashboards',
        category: 'core',
        start: '2025-11-27',
        end: '2025-12-09',
        progress: 100,
        color: '#059669',
        tasks: [
            'Tenant Dashboard',
            'Landlord Dashboard',
            'Admin Dashboard',
            'Navbar & navigation',
            'Responsive design'
        ]
    },
    {
        id: 'bookings',
        name: 'Booking System',
        category: 'core',
        start: '2025-12-04',
        end: '2025-12-16',
        progress: 100,
        color: '#14b8a6',
        tasks: [
            'Viewing schedule booking',
            'Landlord approval workflow',
            'Calendar management',
            'Booking status tracking'
        ]
    },
    {
        id: 'messaging',
        name: 'Messaging System',
        category: 'core',
        start: '2025-12-08',
        end: '2025-12-24',
        progress: 100,
        color: '#06b6d4',
        tasks: [
            'Real-time chat (Supabase Realtime)',
            'Tenant-Landlord messaging',
            'Message notifications',
            'Unread message tracking'
        ]
    },
    {
        id: 'payments_basic',
        name: 'Payment System (Cash & QR)',
        category: 'payments',
        start: '2025-12-15',
        end: '2026-01-07',
        progress: 100,
        color: '#f59e0b',
        tasks: [
            'Payment request creation',
            'Cash payment flow',
            'QR code payment with proof upload',
            'Landlord confirmation workflow',
            'Payment history tracking'
        ]
    },
    {
        id: 'occupancy',
        name: 'Tenant Occupancy Management',
        category: 'core',
        start: '2025-12-22',
        end: '2026-01-12',
        progress: 100,
        color: '#0ea5e9',
        tasks: [
            'Assign tenant to property',
            'Move-in payment processing',
            'Contract dates management',
            'Security deposit tracking',
            'End occupancy workflow'
        ]
    },
    {
        id: 'stripe',
        name: 'Stripe Integration',
        category: 'payments',
        start: '2026-01-12',
        end: '2026-01-24',
        progress: 100,
        color: '#6366f1',
        tasks: [
            'Stripe payment intent creation',
            'Credit card payment form',
            'Payment processing & verification',
            'Excess amount to credit balance'
        ]
    },
    {
        id: 'paymongo',
        name: 'PayMongo Integration',
        category: 'payments',
        start: '2026-01-20',
        end: '2026-02-03',
        progress: 100,
        color: '#ec4899',
        tasks: [
            'PayMongo Checkout Sessions API',
            'GCash, Maya, GrabPay support',
            'Payment polling & verification',
            'Session recovery (localStorage)',
            'Webhook integration'
        ]
    },
    {
        id: 'notifications_email',
        name: 'Email Notifications (Brevo)',
        category: 'notifications',
        start: '2026-01-22',
        end: '2026-02-06',
        progress: 100,
        color: '#f97316',
        tasks: [
            'Brevo API integration',
            'Payment confirmation emails',
            'Booking notification emails',
            'Contract renewal emails',
            'Move-in notification emails'
        ]
    },
    {
        id: 'notifications_sms',
        name: 'SMS Notifications (Gateway)',
        category: 'notifications',
        start: '2026-01-29',
        end: '2026-02-08',
        progress: 100,
        color: '#ef4444',
        tasks: [
            'SMS Gateway API setup',
            'Payment SMS alerts',
            'Booking reminder SMS',
            'Contract expiry SMS',
            'Late fee SMS notifications'
        ]
    },
    {
        id: 'reminders',
        name: 'Automated Reminders',
        category: 'notifications',
        start: '2026-02-01',
        end: '2026-02-10',
        progress: 100,
        color: '#e11d48',
        tasks: [
            'Rent bill reminders (3 days before)',
            'WiFi bill reminders',
            'Electricity bill reminders',
            'Water bill reminders',
            'Contract expiry reminders (40 days)',
            'Late fee auto-generation'
        ]
    },
    {
        id: 'maintenance',
        name: 'Maintenance Request System',
        category: 'core',
        start: '2026-02-03',
        end: '2026-02-10',
        progress: 100,
        color: '#84cc16',
        tasks: [
            'Request submission with photos',
            'Status tracking (Pending/In Progress/Done)',
            'Landlord response workflow',
            'Notification integration'
        ]
    },
    {
        id: 'renewals',
        name: 'Contract Renewals',
        category: 'core',
        start: '2026-02-08',
        end: '2026-02-15',
        progress: 100,
        color: '#22d3ee',
        tasks: [
            'Renewal request by tenant',
            'Landlord approval/rejection',
            'Renewal payment creation',
            'Contract date updates',
            'Email + SMS notifications'
        ]
    },
    {
        id: 'review',
        name: 'Review & Rating System',
        category: 'features',
        start: '2026-02-13',
        end: '2026-02-19',
        progress: 100,
        color: '#fbbf24',
        tasks: [
            'Post-occupancy review prompt',
            'Star rating & comments',
            'Review dismissal (DB persistent)',
            'Property badges (Top Rated/Most Favorite)'
        ]
    },
    {
        id: 'ui_polish',
        name: 'UI/UX Polish & Animations',
        category: 'features',
        start: '2026-02-05',
        end: '2026-02-17',
        progress: 100,
        color: '#c084fc',
        tasks: [
            'Property card auto-sliding images',
            'Search bar improvements',
            'Responsive design fixes',
            'Loading states & transitions'
        ]
    },
    {
        id: 'admin',
        name: 'Admin Dashboard Features',
        category: 'features',
        start: '2026-02-17',
        end: '2026-02-20',
        progress: 100,
        color: '#a3e635',
        tasks: [
            'User management (CRUD)',
            'Property management',
            'Booking & payment overview',
            'System-wide reports'
        ]
    },
    {
        id: 'payment_adv',
        name: 'Advanced Payment Features',
        category: 'payments',
        start: '2026-02-17',
        end: '2026-02-23',
        progress: 100,
        color: '#fb923c',
        tasks: [
            'Cash payment confirmation modal',
            'Credit balance payments',
            'Advance payment calculation',
            'Security deposit deduction',
            'PayMongo QR PH support',
            'PayMongo webhook (real-time)'
        ]
    },
    {
        id: 'toast',
        name: 'Real-time Toast Notifications',
        category: 'notifications',
        start: '2026-02-23',
        end: '2026-02-23',
        progress: 100,
        color: '#f43f5e',
        tasks: [
            'NotificationToast component',
            'Supabase real-time subscription',
            'Slide-in animation (right to left)',
            'Auto-dismiss with progress bar'
        ]
    },
    {
        id: 'docs',
        name: 'Documentation & Flowcharts',
        category: 'features',
        start: '2026-02-23',
        end: '2026-02-25',
        progress: 75,
        color: '#818cf8',
        tasks: [
            'System flowchart page',
            'Complete workflow diagram',
            'Gantt chart visualization',
            'Technical architecture docs'
        ]
    },
    {
        id: 'testing',
        name: 'Testing & Bug Fixes',
        category: 'foundation',
        start: '2026-02-08',
        end: '2026-02-28',
        progress: 85,
        color: '#64748b',
        tasks: [
            'Payment flow testing',
            'Notification delivery testing',
            'Cross-browser compatibility',
            'Mobile responsiveness',
            'Edge case handling'
        ]
    },
    {
        id: 'deployment',
        name: 'Deployment & Optimization',
        category: 'foundation',
        start: '2025-10-29',
        end: '2026-02-28',
        progress: 90,
        color: '#475569',
        tasks: [
            'Vercel deployment setup',
            'Environment variables',
            'Domain configuration',
            'Performance optimization',
            'SEO setup'
        ]
    },
]

const categories = {
    foundation: { label: 'Foundation', color: '#8b5cf6' },
    core: { label: 'Core Features', color: '#10b981' },
    payments: { label: 'Payments', color: '#f59e0b' },
    notifications: { label: 'Notifications', color: '#ef4444' },
    features: { label: 'Additional Features', color: '#a78bfa' },
}

// ==========================================
// GANTT CHART COMPONENT
// ==========================================
function GanttChart({ data }) {
    const containerRef = useRef(null)
    const [hoveredTask, setHoveredTask] = useState(null)
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

    // Date calculations
    const projectStart = new Date('2025-10-15')
    const projectEnd = new Date('2026-02-28')
    const totalDays = Math.ceil((projectEnd - projectStart) / (1000 * 60 * 60 * 24))

    // Generate month labels
    const months = useMemo(() => {
        const result = []
        let current = new Date(projectStart)
        current.setDate(1)
        while (current <= projectEnd) {
            const monthStart = new Date(current)
            const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0)
            const startOffset = Math.max(0, (monthStart - projectStart) / (1000 * 60 * 60 * 24))
            const endOffset = Math.min(totalDays, (monthEnd - projectStart) / (1000 * 60 * 60 * 24))

            result.push({
                label: monthStart.toLocaleString('default', { month: 'short', year: 'numeric' }),
                startPercent: (startOffset / totalDays) * 100,
                widthPercent: ((endOffset - startOffset) / totalDays) * 100,
            })
            current.setMonth(current.getMonth() + 1)
        }
        return result
    }, [])

    // Generate week lines
    const weekLines = useMemo(() => {
        const lines = []
        let current = new Date(projectStart)
        // Align to next Monday
        const day = current.getDay()
        current.setDate(current.getDate() + ((7 - day) % 7 || 7))
        while (current <= projectEnd) {
            const offset = (current - projectStart) / (1000 * 60 * 60 * 24)
            lines.push((offset / totalDays) * 100)
            current.setDate(current.getDate() + 7)
        }
        return lines
    }, [])

    // Today marker
    const today = new Date()
    const todayOffset = Math.max(0, Math.min(100, ((today - projectStart) / (1000 * 60 * 60 * 24) / totalDays) * 100))

    // Filter by category
    const filtered = selectedCategory === 'all' ? data : data.filter(p => p.category === selectedCategory)

    const getBarStyle = (phase) => {
        const start = new Date(phase.start)
        const end = new Date(phase.end)
        const startOffset = (start - projectStart) / (1000 * 60 * 60 * 24)
        const duration = Math.max(1, (end - start) / (1000 * 60 * 60 * 24))
        return {
            left: `${(startOffset / totalDays) * 100}%`,
            width: `${(duration / totalDays) * 100}%`,
        }
    }

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    const getDuration = (phase) => {
        const start = new Date(phase.start)
        const end = new Date(phase.end)
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24))
        return days === 0 ? '1 day' : `${days} days`
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {/* Category Filters */}
            <div className="p-4 border-b border-gray-100 flex flex-wrap gap-2">
                <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${selectedCategory === 'all' ? 'bg-black text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                >
                    All Phases ({data.length})
                </button>
                {Object.entries(categories).map(([key, cat]) => {
                    const count = data.filter(p => p.category === key).length
                    return (
                        <button
                            key={key}
                            onClick={() => setSelectedCategory(key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${selectedCategory === key ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                            style={selectedCategory === key ? { backgroundColor: cat.color } : {}}
                        >
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                            {cat.label} ({count})
                        </button>
                    )
                })}
            </div>

            {/* Gantt Container */}
            <div ref={containerRef} className="overflow-x-auto">
                <div className="min-w-[1100px]">
                    {/* Header: Month Labels */}
                    <div className="flex border-b border-gray-200 bg-gray-50">
                        <div className="w-[260px] min-w-[260px] px-4 py-2 border-r border-gray-200">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Task</span>
                        </div>
                        <div className="flex-1 relative h-10">
                            {months.map((m, i) => (
                                <div
                                    key={i}
                                    className="absolute top-0 h-full flex items-center border-r border-gray-200"
                                    style={{ left: `${m.startPercent}%`, width: `${m.widthPercent}%` }}
                                >
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 truncate">{m.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Rows */}
                    {filtered.map((phase, index) => {
                        const barStyle = getBarStyle(phase)
                        const isHovered = hoveredTask === phase.id

                        return (
                            <div
                                key={phase.id}
                                className={`flex border-b border-gray-100 transition-colors ${isHovered ? 'bg-gray-50' : ''}`}
                                onMouseEnter={(e) => { setHoveredTask(phase.id); setTooltipPos({ x: e.clientX, y: e.clientY }) }}
                                onMouseLeave={() => setHoveredTask(null)}
                            >
                                {/* Task Name */}
                                <div className="w-[260px] min-w-[260px] px-4 py-3 border-r border-gray-100 flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: phase.color }} />
                                    <div className="min-w-0">
                                        <div className="text-xs font-bold text-gray-800 truncate">{phase.name}</div>
                                        <div className="text-[10px] text-gray-400">{formatDate(phase.start)} – {formatDate(phase.end)}</div>
                                    </div>
                                </div>

                                {/* Bar Area */}
                                <div className="flex-1 relative py-2">
                                    {/* Week grid lines */}
                                    {weekLines.map((pos, i) => (
                                        <div key={i} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: `${pos}%` }} />
                                    ))}

                                    {/* Today line */}
                                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10" style={{ left: `${todayOffset}%` }} />

                                    {/* Bar */}
                                    <div
                                        className="absolute top-2 bottom-2 rounded-lg overflow-hidden cursor-pointer transition-all group"
                                        style={{ ...barStyle, minWidth: '8px' }}
                                    >
                                        {/* Background */}
                                        <div className="absolute inset-0 rounded-lg opacity-20" style={{ backgroundColor: phase.color }} />
                                        {/* Progress fill */}
                                        <div
                                            className="absolute inset-y-0 left-0 rounded-lg transition-all"
                                            style={{ width: `${phase.progress}%`, backgroundColor: phase.color }}
                                        />
                                        {/* Label on bar */}
                                        <div className="relative h-full flex items-center px-2 z-10">
                                            <span className="text-[10px] font-bold text-white truncate drop-shadow-sm">
                                                {phase.progress}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Tooltip */}
            {hoveredTask && (() => {
                const phase = data.find(p => p.id === hoveredTask)
                if (!phase) return null
                return (
                    <div className="fixed z-50 pointer-events-none"
                        style={{ left: Math.min(tooltipPos.x + 16, typeof window !== 'undefined' ? window.innerWidth - 320 : 600), top: tooltipPos.y - 10 }}
                    >
                        <div className="bg-gray-900 text-white rounded-xl p-4 shadow-2xl max-w-[300px]">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: phase.color }} />
                                <span className="font-bold text-sm">{phase.name}</span>
                            </div>
                            <div className="flex items-center gap-4 mb-2 text-[11px] text-gray-400">
                                <span>{formatDate(phase.start)} – {formatDate(phase.end)}</span>
                                <span>{getDuration(phase)}</span>
                                <span className="text-emerald-400 font-bold">{phase.progress}%</span>
                            </div>
                            <div className="space-y-1">
                                {phase.tasks.map((task, i) => (
                                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-gray-300">
                                        <span className="text-gray-500 mt-0.5">•</span>
                                        {task}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Legend */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4 text-[10px] text-gray-400">
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-2 bg-red-400 rounded-sm" />
                        <span>Today</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-2 bg-emerald-500 rounded-sm" />
                        <span>Progress Fill</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-2 bg-emerald-200 rounded-sm" />
                        <span>Remaining</span>
                    </div>
                </div>
                <div className="text-[10px] text-gray-400">
                    Hover over any bar to see details
                </div>
            </div>
        </div>
    )
}

// ==========================================
// STATS COMPONENT
// ==========================================
function ProjectStats() {
    const totalTasks = phases.reduce((acc, p) => acc + p.tasks.length, 0)
    const completedPhases = phases.filter(p => p.progress === 100).length
    const avgProgress = Math.round(phases.reduce((acc, p) => acc + p.progress, 0) / phases.length)
    const projectStart = new Date('2025-10-15')
    const today = new Date()
    const totalDevDays = Math.ceil((today - projectStart) / (1000 * 60 * 60 * 24))

    const stats = [
        { label: 'Development Phases', value: phases.length, icon: '📋', color: '#6366f1' },
        { label: 'Total Sub-tasks', value: totalTasks, icon: '✅', color: '#10b981' },
        { label: 'Phases Completed', value: `${completedPhases}/${phases.length}`, icon: '🏆', color: '#f59e0b' },
        { label: 'Overall Progress', value: `${avgProgress}%`, icon: '📊', color: '#ef4444' },
        { label: 'Development Days', value: totalDevDays, icon: '📅', color: '#8b5cf6' },
        { label: 'Deployment', value: 'Live', icon: '🚀', color: '#22c55e' },
    ]

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {stats.map((stat, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:shadow-md transition-shadow">
                    <div className="text-2xl mb-1">{stat.icon}</div>
                    <div className="text-xl font-black" style={{ color: stat.color }}>{stat.value}</div>
                    <div className="text-[10px] text-gray-400 font-medium mt-0.5">{stat.label}</div>
                </div>
            ))}
        </div>
    )
}

// ==========================================
// MILESTONE TIMELINE
// ==========================================
function MilestoneTimeline() {
    const milestones = [
        { date: 'Oct 28', label: 'Project Kickoff', icon: '🚀', done: true },
        { date: 'Nov 27', label: 'Property System Live', icon: '🏠', done: true },
        { date: 'Dec 9', label: 'Dashboards Complete', icon: '📊', done: true },
        { date: 'Dec 24', label: 'Messaging System', icon: '💬', done: true },
        { date: 'Jan 7', label: 'Basic Payments', icon: '💵', done: true },
        { date: 'Jan 24', label: 'Stripe Integration', icon: '💳', done: true },
        { date: 'Feb 3', label: 'PayMongo Live', icon: '🏦', done: true },
        { date: 'Feb 10', label: 'All Notifications', icon: '🔔', done: true },
        { date: 'Feb 20', label: 'Admin Dashboard', icon: '⚙️', done: true },
        { date: 'Feb 23', label: 'QR PH + Webhooks', icon: '📱', done: true },
        { date: 'Feb 25', label: 'Documentation', icon: '📄', done: false },
        { date: 'Feb 28', label: 'Final Testing', icon: '✅', done: false },
    ]

    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
            <h3 className="text-sm font-black text-gray-900 mb-4">🏁 Key Milestones</h3>
            <div className="flex overflow-x-auto pb-2 gap-0">
                {milestones.map((m, i) => (
                    <div key={i} className="flex flex-col items-center min-w-[90px] relative">
                        {/* Connector line */}
                        {i < milestones.length - 1 && (
                            <div className={`absolute top-4 left-1/2 w-full h-0.5 ${m.done ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                        )}
                        {/* Dot */}
                        <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm ${m.done ? 'bg-emerald-100' : 'bg-gray-100'
                            }`}>
                            {m.icon}
                        </div>
                        <div className={`text-[10px] font-bold mt-1.5 ${m.done ? 'text-gray-800' : 'text-gray-400'}`}>{m.date}</div>
                        <div className={`text-[9px] text-center leading-tight mt-0.5 max-w-[80px] ${m.done ? 'text-gray-500' : 'text-gray-300'}`}>{m.label}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ==========================================
// MAIN PAGE
// ==========================================
export default function GanttChartPage() {
    const [animateIn, setAnimateIn] = useState(false)

    useEffect(() => {
        setAnimateIn(true)
    }, [])

    return (
        <>
            <Head>
                <title>Gantt Chart — Abalay Development Timeline</title>
                <meta name="description" content="Development timeline and Gantt chart for the Abalay rental management platform, showing all phases from planning to deployment." />
            </Head>

            <div className="min-h-screen bg-[#F3F4F5]">
                {/* Hero */}
                <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-black pt-24 pb-16">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
                        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
                        <div className="absolute inset-0" style={{
                            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
                            backgroundSize: '32px 32px'
                        }} />
                    </div>

                    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
                        <div className="flex justify-center gap-3 mb-6">
                            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                Dashboard
                            </Link>
                            <span className="text-gray-600">|</span>
                            <Link href="/flowchart" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                                View Flowcharts →
                            </Link>
                        </div>

                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 border border-white/10 rounded-full mb-6">
                            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                            <span className="text-xs font-medium text-gray-300">Project Timeline</span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-4 tracking-tight">
                            Development <span className="bg-gradient-to-r from-orange-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">Gantt Chart</span>
                        </h1>
                        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
                            Visual timeline of the Abalay platform development — from initial planning to production deployment.
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className={`max-w-6xl mx-auto px-4 sm:px-6 -mt-8 pb-20 transition-all duration-500 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    {/* Stats */}
                    <ProjectStats />

                    {/* Milestones */}
                    <MilestoneTimeline />

                    {/* Gantt Chart */}
                    <GanttChart data={phases} />

                    {/* Category Breakdown */}
                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(categories).map(([key, cat]) => {
                            const catPhases = phases.filter(p => p.category === key)
                            const totalTasks = catPhases.reduce((acc, p) => acc + p.tasks.length, 0)
                            const avgProgress = Math.round(catPhases.reduce((acc, p) => acc + p.progress, 0) / catPhases.length)

                            return (
                                <div key={key} className="bg-white rounded-2xl border border-gray-200 p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} />
                                            <h3 className="font-bold text-sm text-gray-900">{cat.label}</h3>
                                        </div>
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: cat.color + '20', color: cat.color }}>
                                            {avgProgress}%
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${avgProgress}%`, backgroundColor: cat.color }} />
                                    </div>
                                    <div className="space-y-1.5">
                                        {catPhases.map((p) => (
                                            <div key={p.id} className="flex items-center justify-between">
                                                <span className="text-[11px] text-gray-600 truncate">{p.name}</span>
                                                <span className="text-[10px] text-gray-400 font-mono ml-2">{p.progress}%</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                                        <span>{catPhases.length} phases</span>
                                        <span>{totalTasks} tasks</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Footer */}
                    <div className="mt-12 text-center">
                        <p className="text-xs text-gray-400">
                            Abalay Rental Management System — Development Timeline (Oct 2025 – Feb 2026)
                        </p>
                    </div>
                </div>
            </div>
        </>
    )
}
