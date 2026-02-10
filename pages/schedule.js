import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'

export default function SchedulePage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeSlots, setTimeSlots] = useState([])
  const [submitting, setSubmitting] = useState(false)

  // New UI State
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [viewMode, setViewMode] = useState('calendar') // 'calendar' | 'timeSelection'
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTimesForAdd, setSelectedTimesForAdd] = useState([]) // ['am1', 'pm2']

  // Define time slots
  const TIME_SLOTS = {
    am1: { label: 'AM 1', time: '8:30 AM - 10:00 AM', start: '08:30', end: '10:00' },
    am2: { label: 'AM 2', time: '10:00 AM - 11:30 AM', start: '10:00', end: '11:30' },
    pm1: { label: 'PM 1', time: '1:00 PM - 2:30 PM', start: '13:00', end: '14:30' },
    pm2: { label: 'PM 2', time: '2:30 PM - 4:00 PM', start: '14:30', end: '16:00' }
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
  }, [router])

  useEffect(() => {
    if (session && profile) {
      if (profile.role !== 'landlord') {
        showToast.warning("Only landlords can access this page", {
          duration: 4000,
          progress: true,
          position: "top-center",
          transition: "bounceIn",
          icon: '',
          sound: true,
        });
        router.push('/dashboard')
        return
      }
      loadTimeSlots()
    }
  }, [session, profile])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (data) {
      setProfile(data)
    }
    setLoading(false)
  }

  async function loadTimeSlots() {
    if (!session) return

    const { data, error } = await supabase
      .from('available_time_slots')
      .select('*')
      .eq('landlord_id', session.user.id)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error loading time slots:', error)
      showToast.error("Failed to load time slots", { duration: 4000 })
    } else {
      setTimeSlots(data || [])
    }
  }

  // --- Calendar Logic ---
  function getDaysInMonth(date) {
    const year = date.getFullYear()
    const month = date.getMonth()
    return new Date(year, month + 1, 0).getDate()
  }

  function getFirstDayOfMonth(date) {
    const year = date.getFullYear()
    const month = date.getMonth()
    return new Date(year, month, 1).getDay()
  }

  function prevMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  function nextMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  function handleDateClick(day) {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const date = new Date(year, month, day)

    // Prevent selecting past dates
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (date < today) {
      showToast.warning("Cannot schedule in the past", { duration: 2000, position: "top-center" })
      return
    }

    setSelectedDate(date)
    setSelectedTimesForAdd([]) // Reset selection
    setViewMode('timeSelection')
  }

  function toggleTimeSelection(slotKey) {
    setSelectedTimesForAdd(prev =>
      prev.includes(slotKey)
        ? prev.filter(k => k !== slotKey)
        : [...prev, slotKey]
    )
  }

  async function handleAddSchedule() {
    if (selectedTimesForAdd.length === 0) {
      showToast.warning("Please select at least one time slot", { duration: 3000 })
      return
    }

    setSubmitting(true)
    const slotsToCreate = []

    for (const slotKey of selectedTimesForAdd) {
      const config = TIME_SLOTS[slotKey]
      const [startHour, startMinute] = config.start.split(':')
      const [endHour, endMinute] = config.end.split(':')

      const startDateTime = new Date(selectedDate)
      startDateTime.setHours(parseInt(startHour), parseInt(startMinute), 0, 0)

      const endDateTime = new Date(selectedDate)
      endDateTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0)

      // Check availability strictly client-side first to avoid simple dupes (optional)
      const isDuplicate = timeSlots.some(s =>
        new Date(s.start_time).getTime() === startDateTime.getTime()
      )
      if (isDuplicate) continue // Skip duplicates

      slotsToCreate.push({
        property_id: null,
        landlord_id: session.user.id,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        is_booked: false
      })
    }

    if (slotsToCreate.length === 0) {
      showToast.info("Selected slots already exist", { duration: 3000 })
      setSubmitting(false)
      return
    }

    const { error } = await supabase
      .from('available_time_slots')
      .insert(slotsToCreate)

    if (error) {
      console.error(error)
      showToast.error("Failed to add slots", { duration: 4000 })
    } else {
      showToast.success(`${slotsToCreate.length} slots added`, { duration: 4000 })
      loadTimeSlots()
      setViewMode('calendar')
      setSelectedDate(null)
    }
    setSubmitting(false)
  }

  async function deleteTimeSlot(slotId) {
    if (!confirm('Are you sure you want to delete this slot?')) return

    const { error } = await supabase
      .from('available_time_slots')
      .delete()
      .eq('id', slotId)

    if (error) {
      showToast.error("Failed to delete", { duration: 3000 })
    } else {
      showToast.success("Slot deleted", { duration: 3000 })
      loadTimeSlots()
    }
  }

  function getTimeSlotLabel(startTime, endTime) {
    const start = new Date(startTime)
    const startHour = start.getHours()
    const startMinute = start.getMinutes()

    if (startHour === 8 && startMinute === 30) return { label: 'AM 1', time: '8:30-10:00' }
    if (startHour === 10 && startMinute === 0) return { label: 'AM 2', time: '10:00-11:30' }
    if (startHour === 13 && startMinute === 0) return { label: 'PM 1', time: '1:00-2:30' }
    if (startHour === 14 && startMinute === 30) return { label: 'PM 2', time: '2:30-4:00' }

    return {
      label: 'Custom',
      time: `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  if (!profile || profile.role !== 'landlord') return null

  // Render Helpers
  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth)
    const firstDay = getFirstDayOfMonth(currentMonth)
    const blanks = Array(firstDay).fill(null)
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    const calendarDays = [...blanks, ...days]

    return (
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs font-bold text-gray-400 uppercase tracking-wide">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {calendarDays.map((day, idx) => {
            if (!day) return <div key={idx} />

            // Check if date has slots
            const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
            const dateStr = dateObj.toDateString()
            const hasSlots = timeSlots.some(s => new Date(s.start_time).toDateString() === dateStr)
            const isToday = new Date().toDateString() === dateStr

            return (
              <button
                key={idx}
                onClick={() => handleDateClick(day)}
                className={`
                                aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-all cursor-pointer border
                                ${isToday ? 'bg-black text-white border-black' : 'hover:bg-gray-50 border-transparent hover:border-gray-200'}
                                ${hasSlots && !isToday ? 'bg-gray-50 font-bold' : ''}
                            `}
              >
                {day}
                {hasSlots && (
                  <div className={`w-1 h-1 rounded-full mt-1 ${isToday ? 'bg-white' : 'bg-green-500'}`} />
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderTimeSelection = () => {
    const dateStr = selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

    // Check which slots already exist for this date
    const existingSlots = timeSlots.filter(s => new Date(s.start_time).toDateString() === selectedDate.toDateString())
    const existingSlotLabels = existingSlots.map(s => {
      const h = new Date(s.start_time).getHours()
      const m = new Date(s.start_time).getMinutes()
      if (h === 8 && m === 30) return 'am1'
      if (h === 10 && m === 0) return 'am2'
      if (h === 13 && m === 0) return 'pm1'
      if (h === 14 && m === 30) return 'pm2'
      return ''
    })

    return (
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setViewMode('calendar')} className="p-2 hover:bg-gray-100 rounded-full cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <h2 className="text-xl font-bold leading-tight">Select Time<br /><span className="text-sm font-normal text-gray-500">{dateStr}</span></h2>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {['am1', 'am2', 'pm1', 'pm2'].map(slotKey => {
            const isSelected = selectedTimesForAdd.includes(slotKey)
            const isExisting = existingSlotLabels.includes(slotKey)
            const config = TIME_SLOTS[slotKey]

            return (
              <button
                key={slotKey}
                disabled={isExisting}
                onClick={() => toggleTimeSelection(slotKey)}
                className={`
                                p-4 rounded-xl border-2 text-left transition-all cursor-pointer
                                ${isExisting ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed' :
                    isSelected ? 'border-black bg-black text-white' : 'border-gray-100 hover:border-gray-300'}
                            `}
              >
                <div className="text-sm font-bold uppercase mb-1">{config.label}</div>
                <div className={`text-xs ${isSelected ? 'text-gray-400' : 'text-gray-500'}`}>{config.time}</div>
                {isExisting && <div className="text-[10px] text-green-600 font-bold mt-1">✓ Added</div>}
              </button>
            )
          })}
        </div>

        <button
          onClick={handleAddSchedule}
          disabled={submitting || selectedTimesForAdd.length === 0}
          className="w-full py-4 bg-black text-white font-bold rounded-xl mt-auto shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {submitting ? 'Saving...' : 'Add Schedule'}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F3F4F5]">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Schedule Availability</h1>
          <p className="text-gray-500">Manage your viewing slots</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left Panel: Calendar OR Time Selection */}
          <div className="lg:col-span-4 lg:sticky lg:top-8">
            {viewMode === 'calendar' ? renderCalendar() : renderTimeSelection()}
          </div>

          {/* Right Panel: Upcoming Schedule List */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 min-h-[500px]">
              <h2 className="text-xl font-bold mb-6">Upcoming Schedule</h2>

              {timeSlots.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <h3 className="text-gray-900 font-bold">No slots added</h3>
                  <p className="text-gray-500 text-sm">Select a date on the calendar to add times.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                  {timeSlots.map(slot => {
                    const date = new Date(slot.start_time)
                    const label = getTimeSlotLabel(slot.start_time, slot.end_time)

                    return (
                      <div key={slot.id} className="group flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-gray-300 transition-all bg-white">
                        <div className="flex items-center gap-4">
                          <div className={`
                                                    w-16 h-16 rounded-2xl flex flex-col items-center justify-center border font-bold text-xl shadow-sm
                                                    ${slot.is_booked ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-900'}
                                                `}>
                            <span>{date.getDate()}</span>
                            <span className="uppercase text-xs font-medium">{date.toLocaleDateString('en-US', { month: 'short' })}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-bold text-gray-900">{label.label}</span>
                              {slot.is_booked && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">BOOKED</span>}
                            </div>
                            <div className="text-sm text-gray-500">{label.time}</div>
                          </div>
                        </div>

                        {!slot.is_booked && (
                          <button
                            onClick={() => deleteTimeSlot(slot.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer"
                            title="Delete Slot"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}