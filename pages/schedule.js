import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast, { Toaster } from 'react-hot-toast'

export default function SchedulePage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeSlots, setTimeSlots] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedDateSlots, setSelectedDateSlots] = useState({}) // { 'date': 'morning' or 'afternoon' or null }
  const [activeDate, setActiveDate] = useState(null) // Currently clicked date to show time options
  const [submitting, setSubmitting] = useState(false)

  // Define time slots
  const TIME_SLOTS = {
    morning: { label: 'Morning (8:00 AM - 11:00 AM)', start: '08:00', end: '11:00' },
    afternoon: { label: 'Afternoon (1:00 PM - 5:30 PM)', start: '13:00', end: '17:30' }
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
        toast.error('Only landlords can access this page')
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
      .single()
    
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
      toast.error('Failed to load time slots')
    } else {
      setTimeSlots(data || [])
    }
  }

  async function addTimeSlot() {
    const selectedDates = Object.keys(selectedDateSlots).filter(date => selectedDateSlots[date])
    
    if (selectedDates.length === 0) {
      toast.error('Please select at least one date with a time slot')
      return
    }

    setSubmitting(true)

    const slotsToCreate = []

    // Create time slots for each selected date with its chosen time
    for (const dateStr of selectedDates) {
      const timeSlotType = selectedDateSlots[dateStr]
      const timeSlotConfig = TIME_SLOTS[timeSlotType]
      const date = new Date(dateStr)
      
      // Create start datetime
      const [startHour, startMinute] = timeSlotConfig.start.split(':')
      const startDateTime = new Date(date)
      startDateTime.setHours(parseInt(startHour), parseInt(startMinute), 0, 0)

      // Create end datetime
      const [endHour, endMinute] = timeSlotConfig.end.split(':')
      const endDateTime = new Date(date)
      endDateTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0)

      // Check if it's in the past
      if (startDateTime < new Date()) {
        continue // Skip past dates
      }

      slotsToCreate.push({
        property_id: null,
        landlord_id: session.user.id,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        is_booked: false
      })
    }

    if (slotsToCreate.length === 0) {
      toast.error('All selected dates are in the past')
      setSubmitting(false)
      return
    }

    const { data, error } = await supabase
      .from('available_time_slots')
      .insert(slotsToCreate)
      .select()

    if (error) {
      console.error('Error adding time slots:', error)
      toast.error('Failed to add time slots')
    } else {
      toast.success(`${slotsToCreate.length} time slot(s) added successfully`)
      setShowAddModal(false)
      setSelectedDateSlots({})
      loadTimeSlots()
    }

    setSubmitting(false)
  }

  function toggleDateTimeSlot(dateStr, timeSlot) {
    setSelectedDateSlots(prev => {
      const newState = { ...prev }
      
      // If clicking the same time slot, deselect the date
      if (newState[dateStr] === timeSlot) {
        delete newState[dateStr]
        setActiveDate(null)
      } else {
        // Set the time slot for this date
        newState[dateStr] = timeSlot
        setActiveDate(null) // Close the time slot picker after selection
      }
      
      return newState
    })
  }

  function toggleActiveDate(dateStr) {
    // If clicking the same date, close it
    if (activeDate === dateStr) {
      setActiveDate(null)
    } else {
      setActiveDate(dateStr)
    }
  }

  function selectAllDates(timeSlot, filterFn) {
    const dates = getNextDays(60).filter(filterFn)
    const newState = {}
    
    dates.forEach(date => {
      const dateStr = date.toISOString().split('T')[0]
      newState[dateStr] = timeSlot
    })
    
    setSelectedDateSlots(newState)
  }

  function getNextDays(count = 60) {
    const days = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    for (let i = 0; i < count; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      days.push(date)
    }
    return days
  }

  async function deleteTimeSlot(slotId) {
    if (!confirm('Are you sure you want to delete this time slot?')) return

    const { error } = await supabase
      .from('available_time_slots')
      .delete()
      .eq('id', slotId)

    if (error) {
      console.error('Error deleting time slot:', error)
      toast.error('Failed to delete time slot')
    } else {
      toast.success('Time slot deleted successfully')
      loadTimeSlots()
    }
  }

  function getTimeSlotLabel(startTime, endTime) {
    const start = new Date(startTime)
    const startHour = start.getHours()
    
    // Morning: 8-11
    if (startHour === 8) {
      return { label: 'Morning', time: '8:00 AM - 11:00 AM', color: 'bg-yellow-100 text-yellow-800' }
    }
    // Afternoon: 13-17
    else if (startHour === 13) {
      return { label: 'Afternoon', time: '1:00 PM - 5:30 PM', color: 'bg-orange-100 text-orange-800' }
    }
    // Fallback for custom times
    else {
      return { 
        label: 'Custom', 
        time: `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        color: 'bg-purple-100 text-purple-800'
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto"></div>
            <p className="mt-4 text-black">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!profile || profile.role !== 'landlord') {
    return null
  }

  return (
    <div className="min-h-screen bg-white">
      <Toaster position="top-center" />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-black">My Availability</h1>
            <p className="text-sm sm:text-base text-black mt-1">Set when you're available for property viewings</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-black text-white hover:bg-gray-800 font-medium border-2 border-black"
          >
            + Add Available Time
          </button>
        </div>

        {/* Time Slots List */}
        <div className="space-y-4">
          {timeSlots.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-black mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-bold text-black mb-2">No Available Times Set</h3>
              <p className="text-black mb-4">Add your first available time slot for property viewings</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {timeSlots.map((slot) => {
                const timeSlotInfo = getTimeSlotLabel(slot.start_time, slot.end_time)
                const dateStr = new Date(slot.start_time).toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric',
                  year: 'numeric'
                })
                
                return (
                  <div 
                    key={slot.id} 
                    className={`border-2 border-black p-4 ${slot.is_booked ? 'bg-gray-100' : 'bg-white'}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          {slot.is_booked ? (
                            <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold">
                              Booked
                            </span>
                          ) : (
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-semibold">
                              Available
                            </span>
                          )}
                          <span className={`px-3 py-1 text-sm font-semibold ${timeSlotInfo.color}`}>
                            {timeSlotInfo.label}
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <svg className="w-4 h-4 text-black flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium">Date:</span>
                            <span>{dateStr}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <svg className="w-4 h-4 text-black flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-medium">Time:</span>
                            <span>{timeSlotInfo.time}</span>
                          </div>
                        </div>
                      </div>

                      {!slot.is_booked && (
                        <button
                          onClick={() => deleteTimeSlot(slot.id)}
                          className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 font-medium text-sm self-start"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Time Slot Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-black mb-2">Add Available Times</h3>
            <p className="text-sm text-black mb-4">
              Click on each date and choose Morning or Afternoon for that specific date
            </p>
            
            <div className="space-y-6">
              {/* Date Selection with Individual Time Slots */}
              <div>
                <label className="block text-sm font-medium text-black mb-3">
                  Select Dates & Time Slots * ({Object.keys(selectedDateSlots).filter(d => selectedDateSlots[d]).length} selected)
                </label>
                <p className="text-xs text-gray-600 mb-2">Click on a date to show Morning/Afternoon options</p>
                <div className="border-2 border-black p-4 max-h-96 overflow-y-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {getNextDays(60).map((date) => {
                      const dateStr = date.toISOString().split('T')[0]
                      const selectedTimeSlot = selectedDateSlots[dateStr]
                      const isActive = activeDate === dateStr
                      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
                      const dayNum = date.getDate()
                      const monthName = date.toLocaleDateString('en-US', { month: 'short' })
                      
                      return (
                        <div
                          key={dateStr}
                          className={`relative border-2 transition-all duration-300 ease-in-out overflow-visible min-h-[140px] ${
                            selectedTimeSlot 
                              ? 'border-black bg-gray-50' 
                              : isActive
                              ? 'border-blue-500 bg-blue-50 shadow-lg'
                              : 'border-gray-300 hover:border-gray-400 hover:shadow-md'
                          } ${isActive ? 'transform scale-105 z-10' : ''}`}
                        >
                          {/* Date Display - Blurred/Faded when time slots are shown */}
                          <button
                            type="button"
                            onClick={() => toggleActiveDate(dateStr)}
                            className={`w-full p-4 text-center transition-all duration-300 min-h-[140px] flex flex-col items-center justify-center ${
                              selectedTimeSlot === 'morning'
                                ? 'bg-yellow-100'
                                : selectedTimeSlot === 'afternoon'
                                ? 'bg-orange-100'
                                : isActive
                                ? 'bg-blue-100'
                                : 'hover:bg-gray-50'
                            } ${isActive && !selectedTimeSlot ? 'blur-sm opacity-40' : 'blur-0 opacity-100'}`}
                          >
                            <div className="text-xs text-gray-600 font-medium">{dayName}</div>
                            <div className="font-bold text-3xl my-2">{dayNum}</div>
                            <div className="text-xs text-gray-600 font-medium">{monthName}</div>
                            {selectedTimeSlot && (
                              <div className={`text-[10px] font-semibold mt-3 px-2 py-1 rounded ${
                                selectedTimeSlot === 'morning' 
                                  ? 'bg-yellow-200 text-yellow-800' 
                                  : 'bg-orange-200 text-orange-800'
                              }`}>
                                {selectedTimeSlot === 'morning' ? '🌅 Morning' : '☀️ Afternoon'}
                              </div>
                            )}
                          </button>
                          
                          {/* Time Slot Options - Replace date when active */}
                          <div 
                            className={`absolute inset-0 transition-all duration-300 ease-in-out flex flex-col items-center justify-center p-3 space-y-2 bg-white ${
                              isActive && !selectedTimeSlot
                                ? 'opacity-100 pointer-events-auto z-20' 
                                : 'opacity-0 pointer-events-none'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleDateTimeSlot(dateStr, 'morning')}
                              className="w-full px-3 py-3 text-sm font-semibold border-2 rounded transition-all duration-200 transform hover:scale-105 bg-white text-black border-yellow-400 hover:bg-yellow-50 hover:border-yellow-600 hover:shadow-md"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>🌅</span>
                                <span>Morning</span>
                              </div>
                              <div className="text-[10px] opacity-80 mt-1">8:00 AM - 11:00 AM</div>
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => toggleDateTimeSlot(dateStr, 'afternoon')}
                              className="w-full px-3 py-3 text-sm font-semibold border-2 rounded transition-all duration-200 transform hover:scale-105 bg-white text-black border-orange-400 hover:bg-orange-50 hover:border-orange-600 hover:shadow-md"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>☀️</span>
                                <span>Afternoon</span>
                              </div>
                              <div className="text-[10px] opacity-80 mt-1">1:00 PM - 5:30 PM</div>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      selectAllDates('morning', (date) => {
                        const day = date.getDay()
                        return day !== 0 && day !== 6 // Weekdays
                      })
                    }}
                    className="text-xs px-3 py-1.5 bg-yellow-100 border border-yellow-500 hover:bg-yellow-200 font-medium"
                  >
                    🌅 All Weekdays - Morning
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      selectAllDates('afternoon', (date) => {
                        const day = date.getDay()
                        return day !== 0 && day !== 6 // Weekdays
                      })
                    }}
                    className="text-xs px-3 py-1.5 bg-orange-100 border border-orange-500 hover:bg-orange-200 font-medium"
                  >
                    ☀️ All Weekdays - Afternoon
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      selectAllDates('morning', (date) => {
                        const day = date.getDay()
                        return day === 0 || day === 6 // Weekends
                      })
                    }}
                    className="text-xs px-3 py-1.5 bg-yellow-100 border border-yellow-500 hover:bg-yellow-200 font-medium"
                  >
                    🌅 All Weekends - Morning
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      selectAllDates('afternoon', (date) => {
                        const day = date.getDay()
                        return day === 0 || day === 6 // Weekends
                      })
                    }}
                    className="text-xs px-3 py-1.5 bg-orange-100 border border-orange-500 hover:bg-orange-200 font-medium"
                  >
                    ☀️ All Weekends - Afternoon
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDateSlots({})}
                    className="text-xs px-3 py-1.5 border border-black hover:bg-gray-100 font-medium"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 border-2 border-blue-400 p-3">
                <p className="text-sm text-black">
                  💡 <strong>How to use:</strong> Click on a date to open time options, then choose Morning or Afternoon. 
                  Selected dates will show a colored indicator (🌅 Yellow = Morning, ☀️ Orange = Afternoon).
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-6">
              <button
                onClick={addTimeSlot}
                disabled={submitting || Object.keys(selectedDateSlots).filter(d => selectedDateSlots[d]).length === 0}
                className="flex-1 px-4 py-2 bg-black text-white hover:bg-gray-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Adding...' : `Add ${Object.keys(selectedDateSlots).filter(d => selectedDateSlots[d]).length} Time Slot(s)`}
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setSelectedDateSlots({})
                  setActiveDate(null)
                }}
                disabled={submitting}
                className="flex-1 px-4 py-2 border-2 border-black text-black hover:bg-gray-100 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
