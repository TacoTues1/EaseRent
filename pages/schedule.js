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
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedDateSlots, setSelectedDateSlots] = useState({}) // { 'date': 'morning' or 'afternoon' or null }
  const [activeDate, setActiveDate] = useState(null) // Currently clicked date to show time options
  const [submitting, setSubmitting] = useState(false)
  const [searchDate, setSearchDate] = useState('') // Date filter for searching

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
      showToast.error("Failed to load time slots", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

    } else {
      setTimeSlots(data || [])
    }
  }

  async function addTimeSlot() {
    const selectedDates = Object.keys(selectedDateSlots).filter(date => selectedDateSlots[date])
    
    if (selectedDates.length === 0) {
      showToast.warning('Please select at least one date with a time slot', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
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
      showToast.warning('All selected dates are in the past', {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });
      setSubmitting(false)
      return
    }

    const { data, error } = await supabase
      .from('available_time_slots')
      .insert(slotsToCreate)
      .select()

    if (error) {
      console.error('Error adding time slots:', error)
      showToast.error("Failed to add time slots", {
    duration: 4000,
    progress: true,
    position: "top-center",
    transition: "bounceIn",
    icon: '',
    sound: true,
  });

    } else {
      showToast.success(`${slotsToCreate.length} time slot(s) added successfully`, {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
      setShowAddModal(false)
      setSelectedDateSlots({})
      loadTimeSlots()
    }

    setSubmitting(false)
  }

  function toggleDateTimeSlot(dateStr, timeSlot) {
    setSelectedDateSlots(prev => {
      const newState = { ...prev }
      
      // Set the time slot for this date (allows changing from morning to afternoon or vice versa)
      newState[dateStr] = timeSlot
      setActiveDate(null)
      
      return newState
    })
  }

  function toggleActiveDate(dateStr) {
    // If clicking the same date and it already has a time slot, allow editing
    if (activeDate === dateStr) {
      setActiveDate(null)
    } else {
      setActiveDate(dateStr)
    }
  }

  function clearDateSelection(dateStr) {
    setSelectedDateSlots(prev => {
      const newState = { ...prev }
      delete newState[dateStr]
      return newState
    })
    setActiveDate(null)
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
      showToast.error('Failed to delete time slot', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
    } else {
      showToast.success('Time slot deleted successfully', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      loadTimeSlots()
    }
  }

  function getTimeSlotLabel(startTime, endTime) {
    const start = new Date(startTime)
    const startHour = start.getHours()
    
    // Morning: 8-11
    if (startHour === 8) {
      return { label: 'Morning', time: '8:00 AM - 11:00 AM', color: 'border border-black text-black' }
    }
  }

  function getTimeSlotLabel(startTime, endTime) {
    const start = new Date(startTime)
    const startHour = start.getHours()
    
    // Morning: 8-11
    if (startHour === 8) {
      return { label: 'Morning', time: '8:00 AM - 11:00 AM', color: 'border border-black text-black' }
    }
    // Afternoon: 13-17
    else if (startHour === 13) {
      return { label: 'Afternoon', time: '1:00 PM - 5:30 PM', color: 'border border-black text-black' }
    }
    // Fallback for custom times
    else {
      return { 
        label: 'Custom', 
        time: `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        color: 'border border-gray-400 text-gray-600'
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
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-black tracking-tight">Availability</h1>
            <p className="text-sm text-gray-500 mt-1">Manage viewing times for your properties</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-2 bg-black text-white text-sm font-bold rounded-full cursor-pointer hover:shadow-lg transition-shadow"
          >
            + Add Times
          </button>
        </div>

        {/* Date Search Filter */}
        {timeSlots.length > 0 && (
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-xs">
              <input
                type="date"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-black cursor-pointer"
              />
            </div>
            {searchDate && (
              <button
                onClick={() => setSearchDate('')}
                className="px-3 py-2 text-xs font-bold text-black border-b border-black cursor-pointer"
              >
                Clear Filter
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {(() => {
                const filtered = timeSlots.filter(slot => {
                  if (!searchDate) return true
                  const slotDate = new Date(slot.start_time).toISOString().split('T')[0]
                  return slotDate === searchDate
                })
                return `${filtered.length} slots found`
              })()}
            </span>
          </div>
        )}

        {/* Time Slots List */}
        <div className="space-y-4">
          {timeSlots.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-gray-100 rounded-2xl">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-black mb-1">No Available Times</h3>
              <p className="text-sm text-gray-400 mb-6">Start by adding your first time slot.</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="text-sm font-bold text-black border-b-2 border-black pb-0.5 cursor-pointer"
              >
                Add Time Slot
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {timeSlots
                .filter(slot => {
                  if (!searchDate) return true
                  const slotDate = new Date(slot.start_time).toISOString().split('T')[0]
                  return slotDate === searchDate
                })
                .map((slot) => {
                const timeSlotInfo = getTimeSlotLabel(slot.start_time, slot.end_time)
                const dateStr = new Date(slot.start_time).toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric'
                })
                
                return (
                  <div 
                    key={slot.id} 
                    className={`p-4 border rounded-xl flex items-center justify-between gap-4 transition-all ${
                        slot.is_booked ? 'bg-gray-50 border-gray-200' : 'bg-white border-black shadow-sm'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                         <span className="text-sm font-bold text-black">{dateStr}</span>
                         {slot.is_booked && (
                            <span className="text-[10px] uppercase font-bold bg-black text-white px-2 py-0.5 rounded">Booked</span>
                         )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${timeSlotInfo.color}`}>
                          {timeSlotInfo.label}
                        </span>
                        <span className="text-xs text-gray-500">{timeSlotInfo.time}</span>
                      </div>
                    </div>

                    {!slot.is_booked && (
                      <button
                        onClick={() => deleteTimeSlot(slot.id)}
                        className="text-gray-300 hover:text-black p-2 cursor-pointer transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Time Slot Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-5xl w-full p-6 max-h-[90vh] overflow-hidden flex flex-col rounded-2xl shadow-xl">
            <div className="flex justify-between items-start mb-6 flex-shrink-0">
               <div>
                  <h3 className="text-2xl font-bold text-black">Select Availability</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Click dates to toggle times. Selected: {Object.keys(selectedDateSlots).filter(d => selectedDateSlots[d]).length}
                  </p>
               </div>
               <button onClick={() => setShowAddModal(false)} className="text-black text-2xl font-light cursor-pointer leading-none">&times;</button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
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
                        className={`relative border transition-all duration-200 overflow-hidden rounded-xl min-h-[140px] ${
                          selectedTimeSlot 
                            ? 'border-black bg-black text-white' 
                            : isActive
                            ? 'border-black ring-1 ring-black'
                            : 'border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {/* Date Content */}
                        <button
                          type="button"
                          onClick={() => toggleActiveDate(dateStr)}
                          className={`w-full h-full p-4 flex flex-col items-center justify-center cursor-pointer transition-opacity ${
                             isActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
                          }`}
                        >
                          <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${selectedTimeSlot ? 'text-gray-400' : 'text-gray-400'}`}>{dayName}</div>
                          <div className="font-bold text-3xl mb-1">{dayNum}</div>
                          
                          {selectedTimeSlot ? (
                             <div className="mt-2 px-2 py-1 bg-white/20 rounded text-[10px] font-bold uppercase tracking-wide">
                                {selectedTimeSlot === 'morning' ? 'Morning' : 'Afternoon'}
                             </div>
                          ) : (
                             <div className="text-xs text-gray-400">{monthName}</div>
                          )}
                        </button>
                        
                        {/* Overlay Options (Show on click) */}
                        <div 
                          className={`absolute inset-0 bg-white flex flex-col p-2 gap-2 transition-opacity duration-200 ${
                            isActive ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleDateTimeSlot(dateStr, 'morning')}
                            className={`flex-1 flex flex-col items-center justify-center rounded-lg border cursor-pointer ${
                               selectedTimeSlot === 'morning' 
                               ? 'bg-black text-white border-black' 
                               : 'bg-white text-black border-gray-200 hover:border-black'
                            }`}
                          >
                             <span className="text-xs font-bold">Morning</span>
                             <span className="text-[9px] opacity-60">8-11 AM</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => toggleDateTimeSlot(dateStr, 'afternoon')}
                            className={`flex-1 flex flex-col items-center justify-center rounded-lg border cursor-pointer ${
                               selectedTimeSlot === 'afternoon' 
                               ? 'bg-black text-white border-black' 
                               : 'bg-white text-black border-gray-200 hover:border-black'
                            }`}
                          >
                             <span className="text-xs font-bold">Afternoon</span>
                             <span className="text-[9px] opacity-60">1-5:30 PM</span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
            </div>

            {/* Footer Actions */}
            <div className="mt-6 pt-6 border-t border-gray-100 flex flex-col gap-4">
               {/* Bulk Selectors */}
               <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-2 self-center">Quick Select:</span>
                  <button
                    type="button"
                    onClick={() => {
                      selectAllDates('morning', (date) => {
                        const day = date.getDay()
                        return day !== 0 && day !== 6 
                      })
                    }}
                    className="text-[10px] font-bold px-3 py-1.5 border border-gray-200 rounded-full hover:border-black hover:bg-black hover:text-white transition-colors cursor-pointer"
                  >
                    Weekdays Morning
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      selectAllDates('afternoon', (date) => {
                        const day = date.getDay()
                        return day !== 0 && day !== 6
                      })
                    }}
                    className="text-[10px] font-bold px-3 py-1.5 border border-gray-200 rounded-full hover:border-black hover:bg-black hover:text-white transition-colors cursor-pointer"
                  >
                    Weekdays Afternoon
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      selectAllDates('morning', (date) => {
                        const day = date.getDay()
                        return day === 0 || day === 6
                      })
                    }}
                    className="text-[10px] font-bold px-3 py-1.5 border border-gray-200 rounded-full hover:border-black hover:bg-black hover:text-white transition-colors cursor-pointer"
                  >
                    Weekends Morning
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      selectAllDates('afternoon', (date) => {
                        const day = date.getDay()
                        return day === 0 || day === 6
                      })
                    }}
                    className="text-[10px] font-bold px-3 py-1.5 border border-gray-200 rounded-full hover:border-black hover:bg-black hover:text-white transition-colors cursor-pointer"
                  >
                    Weekends Afternoon
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDateSlots({})}
                    className="text-[10px] font-bold px-3 py-1.5 border border-red-200 text-red-600 rounded-full hover:bg-red-50 transition-colors cursor-pointer ml-auto"
                  >
                    Clear Selection
                  </button>
               </div>

               <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowAddModal(false)
                      setSelectedDateSlots({})
                      setActiveDate(null)
                    }}
                    disabled={submitting}
                    className="flex-1 py-3 border border-gray-300 text-black font-bold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addTimeSlot}
                    disabled={submitting || Object.keys(selectedDateSlots).filter(d => selectedDateSlots[d]).length === 0}
                    className="flex-1 py-3 bg-black text-white font-bold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all"
                  >
                    {submitting ? 'Saving...' : `Confirm & Add Slots`}
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}