import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import { showToast } from 'nextjs-toast-notify'

const MESSAGE_PAGE_SIZE = 25

export default function Messages() {
  const sendInFlightRef = useRef(false)
  const lastSendSignatureRef = useRef({ signature: '', timestamp: 0 })
  const messagesContainerRef = useRef(null)
  const loadingOlderMessagesRef = useRef(false)
  const oldestLoadedMessageRef = useRef(null)
  const hasBootstrappedRef = useRef(false)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [conversations, setConversations] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [filteredUsers, setFilteredUsers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [unreadCounts, setUnreadCounts] = useState({}) // { conversationId: count }
  const [imageModal, setImageModal] = useState(null) // For viewing images
  const [showMobileDetails, setShowMobileDetails] = useState(false) // Toggle right panel on mobile

  // ─── GROUP CHAT STATE ───
  const [groupConversations, setGroupConversations] = useState([])
  const [selectedGroupConversation, setSelectedGroupConversation] = useState(null)
  const [groupMessages, setGroupMessages] = useState([])
  const [groupMessagesLoading, setGroupMessagesLoading] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [eligibleMembers, setEligibleMembers] = useState([])
  const [selectedMemberIds, setSelectedMemberIds] = useState([])
  const [eligibleMembersLoading, setEligibleMembersLoading] = useState(false)
  const [groupSearchQuery, setGroupSearchQuery] = useState('')
  const [groupCreating, setGroupCreating] = useState(false)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [addMemberSearchQuery, setAddMemberSearchQuery] = useState('')
  const [addingMembers, setAddingMembers] = useState(false)
  const [groupDeleteConfirmId, setGroupDeleteConfirmId] = useState(null)
  const [groupLeaveConfirmId, setGroupLeaveConfirmId] = useState(null)
  const [isEditingGroupName, setIsEditingGroupName] = useState(false)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [directTypingUserId, setDirectTypingUserId] = useState(null)
  const [groupTypingActive, setGroupTypingActive] = useState(false)
  const [memberRemoveConfirm, setMemberRemoveConfirm] = useState(null)
  const groupSendInFlightRef = useRef(false)
  const groupMessagesRef = useRef([])
  const groupMessagesCacheRef = useRef(new Map())
  const selectedGroupConversationRef = useRef(null)
  const directChannelRef = useRef(null)
  const groupChannelRef = useRef(null)
  const directTypingTimeoutRef = useRef(null)
  const groupTypingTimeoutRef = useRef(null)
  const typingEmitAtRef = useRef(0)
  const router = useRouter()

  useEffect(() => {
    setIsEditingGroupName(false)
    setGroupNameDraft(selectedGroupConversation?.name || '')
  }, [selectedGroupConversation?.id, selectedGroupConversation?.name])

  useEffect(() => {
    groupMessagesRef.current = groupMessages
  }, [groupMessages])

  useEffect(() => {
    selectedGroupConversationRef.current = selectedGroupConversation
  }, [selectedGroupConversation])

  useEffect(() => {
    if (selectedConversation?.id && selectedGroupConversation?.id) {
      // Keep group active when race conditions briefly select both.
      setSelectedConversation(null)
      setMessages([])
    }
  }, [selectedConversation?.id, selectedGroupConversation?.id])

  useEffect(() => {
    if (!selectedGroupConversation?.id) return
    groupMessagesCacheRef.current.set(selectedGroupConversation.id, groupMessages)
  }, [groupMessages, selectedGroupConversation?.id])

  useEffect(() => {
    if (!showAddMembers) return

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowAddMembers(false)
        setSelectedMemberIds([])
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showAddMembers])

  const scrollMessagesToBottom = (behavior = 'smooth') => {
    const messagesContainer = messagesContainerRef.current
    if (!messagesContainer) return

    try {
      messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior })
    } catch {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  }

  const scheduleScrollToBottom = (behavior = 'smooth') => {
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollMessagesToBottom(behavior)
      })
    })
  }

  const ChatOpeningSkeleton = ({ withSenderLabel = false }) => (
    <div className="h-full min-h-[220px] py-2">
      <div className="space-y-4">
        {[0, 1, 2, 3].map((index) => {
          const isOwn = index % 2 === 1

          return (
            <div key={index} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-end gap-2 max-w-[78%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className="w-7 h-7 rounded-full bg-gray-300/90 flex-shrink-0 skeleton-shimmer" />
                <div className="space-y-1.5">
                  {withSenderLabel && !isOwn && (
                    <div className="h-2.5 w-24 rounded-full bg-gray-300/80 skeleton-shimmer" />
                  )}
                  <div className={`rounded-2xl p-3 skeleton-shimmer ${isOwn ? 'bg-gray-300/80 rounded-tr-sm' : 'bg-gray-200 rounded-tl-sm'}`}>
                    <div className="space-y-2">
                      <div className="h-2.5 w-40 rounded-full bg-white/80 skeleton-shimmer" />
                      <div className="h-2.5 w-28 rounded-full bg-white/65 skeleton-shimmer" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const formatLastSeen = (dateString) => {
    if (!dateString) return 'No activity yet'

    const timestamp = new Date(dateString)
    if (Number.isNaN(timestamp.getTime())) return 'No activity yet'

    const now = new Date()
    const diffMs = now.getTime() - timestamp.getTime()
    const diffMinutes = Math.floor(diffMs / 60000)

    if (diffMinutes < 1) return 'Last seen just now'
    if (diffMinutes < 60) return `Last seen ${diffMinutes}m ago`

    const sameDay = now.toDateString() === timestamp.toDateString()
    if (sameDay) {
      return `Last seen ${timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`
    }

    return `Last seen ${timestamp.toLocaleDateString()}`
  }

  const formatMessageDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const diffDays = Math.round((today - messageDay) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: now.getFullYear() !== date.getFullYear() ? 'numeric' : undefined })
  }

  const shouldShowDateSeparator = (currentMsg, prevMsg) => {
    if (!prevMsg) return true
    const currentDate = new Date(currentMsg.created_at)
    const prevDate = new Date(prevMsg.created_at)
    return currentDate.toDateString() !== prevDate.toDateString()
  }

  const emitTypingSignal = () => {
    const now = Date.now()
    if (now - typingEmitAtRef.current < 900) return
    typingEmitAtRef.current = now

    if (selectedConversation && directChannelRef.current) {
      directChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          conversationId: selectedConversation.id,
          userId: session?.user?.id
        }
      })
    }

    if (selectedGroupConversation && groupChannelRef.current) {
      groupChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          groupId: selectedGroupConversation.id,
          userId: session?.user?.id
        }
      })
    }
  }

  const handleMessageInputChange = (value) => {
    setNewMessage(value)
    if (!value?.trim()) return
    emitTypingSignal()
  }

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
      } else {
        setSession(null)
        setProfile(null)
        router.push('/')
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session)
        loadProfile(session.user.id)
      } else {
        setSession(null)
        setProfile(null)
        setConversations([])
        setGroupConversations([])
        setSelectedConversation(null)
        setSelectedGroupConversation(null)
        setMessages([])
        setGroupMessages([])
        router.push('/')
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [router])

  useEffect(() => {
    if (profile?.id && session?.user?.id) {
      const shouldShowLoader = !hasBootstrappedRef.current && conversations.length === 0

      loadConversations({ showLoader: shouldShowLoader })
      loadAllUsers()
      loadUnreadCounts()
      loadGroupConversations()

      if (!hasBootstrappedRef.current) {
        hasBootstrappedRef.current = true
      }

      const channel = supabase
        .channel('global-messages')
        .on('postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${profile.id}`
          },
          async (payload) => {
            const hiddenField = profile.role === 'landlord' ? 'hidden_by_landlord' : 'hidden_by_tenant'

            await supabase
              .from('conversations')
              .update({ [hiddenField]: false, updated_at: new Date().toISOString() })
              .eq('id', payload.new.conversation_id)

            loadUnreadCounts()
            loadConversations({ showLoader: false })
            setConversations(prev => {
              return prev.map(conv => {
                if (conv.id === payload.new.conversation_id) {
                  return { ...conv, updated_at: new Date().toISOString() }
                }
                return conv
              }).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            })
          }
        )
        .subscribe()

      // Subscribe to all group message inserts via Supabase Realtime
      const groupChannel = supabase
        .channel('global-group-messages')
        .on('postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'group_messages'
          },
          async (payload) => {
            // Bump the affected group to the top of the list and refresh unread counts
            setGroupConversations(prev => {
              return prev.map(group => {
                if (group.id === payload.new.group_conversation_id) {
                  return {
                    ...group,
                    updated_at: new Date().toISOString(),
                    unread_count: payload.new.sender_id !== profile.id
                      ? (group.unread_count || 0) + 1
                      : group.unread_count
                  }
                }
                return group
              }).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            })
          }
        )
        // Also listen for member changes (added/removed) via Realtime
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'group_conversation_members'
          },
          async () => {
            loadGroupConversations()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
        supabase.removeChannel(groupChannel)
      }
    }
  }, [profile?.id, profile?.role, session?.user?.id])

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = allUsers.filter(user => {
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase()
        return fullName.includes(searchQuery.toLowerCase()) ||
          user.phone?.toLowerCase().includes(searchQuery.toLowerCase())
      })
      setFilteredUsers(filtered)
    } else {
      setFilteredUsers(allUsers)
    }
  }, [searchQuery, allUsers])

  useEffect(() => {
    if (selectedConversation?.id && session?.user?.id) {
      setMessages([])
      setDirectTypingUserId(null)
      setMessagesLoading(true)
      setLoadingOlderMessages(false)
      setHasOlderMessages(false)
      loadingOlderMessagesRef.current = false
      oldestLoadedMessageRef.current = null
      loadMessages(selectedConversation.id)
      // Reset mobile details view when changing conversation
      setShowMobileDetails(false)

      const channel = supabase
        .channel(`messages-${selectedConversation.id}`, {
          config: {
            broadcast: { self: true },
          },
        })
        .on('postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${selectedConversation.id}`
          },
          async (payload) => {
            const { data: newMessage, error } = await supabase
              .from('messages')
              .select(`
                *,
                sender:profiles!messages_sender_id_fkey(first_name, middle_name, last_name, role)
              `)
              .eq('id', payload.new.id)
              .single()

            const fallbackMessage = {
              ...payload.new,
              sender: payload.new.sender_id === session.user.id
                ? { first_name: profile?.first_name, last_name: profile?.last_name, role: profile?.role }
                : {
                  first_name: selectedConversation?.other_user?.first_name,
                  last_name: selectedConversation?.other_user?.last_name,
                  role: selectedConversation?.other_user?.role
                }
            }

            const incomingMessage = error ? fallbackMessage : newMessage

            if (incomingMessage) {
              setMessages(prev => {
                const exists = prev.some(m => m.id === incomingMessage.id)
                if (exists) return prev
                return [...prev, incomingMessage]
              })
              scheduleScrollToBottom('smooth')

              if (incomingMessage.receiver_id === session.user.id) {
                await supabase
                  .from('messages')
                  .update({ read: true })
                  .eq('id', incomingMessage.id)

                setUnreadCounts(prev => ({
                  ...prev,
                  [selectedConversation.id]: Math.max(0, (prev[selectedConversation.id] || 0) - 1)
                }))
              }
            }
          }
        )
        .on('postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${selectedConversation.id}`
          },
          async (payload) => {
            setMessages(prev => prev.map(msg =>
              msg.id === payload.new.id
                ? { ...msg, read: payload.new.read }
                : msg
            ))
          }
        )
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload?.conversationId !== selectedConversation.id) return
          if (payload?.userId === session.user.id) return

          setDirectTypingUserId(payload.userId || 'typing')
          if (directTypingTimeoutRef.current) clearTimeout(directTypingTimeoutRef.current)
          directTypingTimeoutRef.current = setTimeout(() => {
            setDirectTypingUserId(null)
          }, 2200)
        })
        .subscribe()

      directChannelRef.current = channel

      return () => {
        directChannelRef.current = null
        if (directTypingTimeoutRef.current) {
          clearTimeout(directTypingTimeoutRef.current)
          directTypingTimeoutRef.current = null
        }
        supabase.removeChannel(channel)
      }
    }
  }, [selectedConversation?.id, session?.user?.id])

  useEffect(() => {
    if (!selectedConversation?.id || !session?.user?.id) return

    const refreshNow = () => refreshMessagesSilently(selectedConversation.id)
    const intervalId = window.setInterval(refreshNow, 1200)

    const handleFocus = () => refreshNow()
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshNow()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [selectedConversation?.id, session?.user?.id])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*, avatar_url')
      .eq('id', userId)
      .single()

    if (data) setProfile(data)
  }

  async function loadConversations({ showLoader = false } = {}) {
    if (showLoader) {
      setLoading(true)
    }

    const { data: allConversations, error } = await supabase
      .from('conversations')
      .select('*, property:properties(title, address)')
      .or(`landlord_id.eq.${session.user.id},tenant_id.eq.${session.user.id}`)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error loading conversations:', error)
      if (showLoader) {
        setLoading(false)
      }
      return
    }

    const conversations = allConversations?.filter(conv => {
      const isLandlord = conv.landlord_id === session.user.id
      const isTenant = conv.tenant_id === session.user.id
      if (isLandlord && conv.hidden_by_landlord) return false
      if (isTenant && conv.hidden_by_tenant) return false
      return true
    }) || []

    if (conversations && conversations.length > 0) {
      const userIds = new Set()
      conversations.forEach(conv => {
        userIds.add(conv.landlord_id)
        userIds.add(conv.tenant_id)
      })

      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, middle_name, last_name, role, avatar_url')
        .in('id', Array.from(userIds))

      if (profileError) {
        console.error('Error loading profiles:', profileError)
      }

      const profileMap = {}
      profiles?.forEach(p => {
        profileMap[p.id] = p
      })

      const enrichedConversations = conversations.map(conv => {
        const isLandlord = conv.landlord_id === session.user.id
        const otherUserId = isLandlord ? conv.tenant_id : conv.landlord_id
        const otherUser = profileMap[otherUserId]

        return {
          ...conv,
          landlord_profile: profileMap[conv.landlord_id],
          tenant_profile: profileMap[conv.tenant_id],
          other_user: otherUser,
          other_user_id: otherUserId
        }
      })

      const accessContext = await getMessagingAccessContext()
      const allowedConversations = enrichedConversations.filter(conv =>
        canMessageUserWithContext(conv.other_user, accessContext)
      )

      setConversations(allowedConversations)
      setSelectedConversation(prevSelected => {
        if (selectedGroupConversationRef.current?.id) return null
        if (allowedConversations.length === 0) return null
        if (prevSelected?.id) {
          const matchedConversation = allowedConversations.find(conv => conv.id === prevSelected.id)
          return matchedConversation || null
        }
        return null
      })
    } else {
      setConversations([])
      setSelectedConversation(null)
    }

    if (showLoader) {
      setLoading(false)
    }
  }

  async function getTenantAllowedLandlordIds(userId) {
    const landlordIds = new Set()

    const { data: occupancies, error: occError } = await supabase
      .from('tenant_occupancies')
      .select('landlord_id')
      .eq('tenant_id', userId)
      .in('status', ['active', 'pending_end'])

    if (occError) {
      throw occError
    }

    ;(occupancies || []).forEach(occ => {
      if (occ?.landlord_id) landlordIds.add(occ.landlord_id)
    })

    try {
      const fmRes = await fetch(`/api/family-members?member_id=${userId}`, { cache: 'no-store' })
      if (fmRes.ok) {
        const fmData = await fmRes.json()
        const fmLandlordId = fmData?.occupancy?.landlord?.id || fmData?.occupancy?.landlord_id
        if (fmLandlordId) landlordIds.add(fmLandlordId)
      }
    } catch (err) {
      console.warn('Family-member landlord fallback failed:', err)
    }

    return Array.from(landlordIds)
  }

  async function getLandlordAllowedTenantIds(userId) {
    const tenantIds = new Set()

    const { data: occupancies, error: occError } = await supabase
      .from('tenant_occupancies')
      .select('id, tenant_id')
      .eq('landlord_id', userId)
      .in('status', ['active', 'pending_end'])

    if (occError) {
      throw occError
    }

    const occupancyIds = []
    ;(occupancies || []).forEach(occ => {
      if (occ?.tenant_id) tenantIds.add(occ.tenant_id)
      if (occ?.id) occupancyIds.push(occ.id)
    })

    if (occupancyIds.length > 0) {
      try {
        const familyLists = await Promise.all(
          occupancyIds.map(async occupancyId => {
            try {
              const res = await fetch(`/api/family-members?occupancy_id=${occupancyId}`, { cache: 'no-store' })
              if (!res.ok) return []
              const data = await res.json()
              return (data?.members || []).map(member => member.member_id || member.member_profile?.id).filter(Boolean)
            } catch {
              return []
            }
          })
        )

        familyLists.flat().forEach(memberId => tenantIds.add(memberId))
      } catch (err) {
        console.warn('Failed to include family-member tenants for landlord contacts:', err)
      }
    }

    return Array.from(tenantIds)
  }

  async function getMessagingAccessContext() {
    if (!profile || !session) {
      return {
        role: null,
        sessionUserId: null,
        allowedLandlordIds: new Set(),
        allowedTenantIds: new Set()
      }
    }

    if (profile.role === 'tenant') {
      const landlordIds = await getTenantAllowedLandlordIds(session.user.id)
      return {
        role: 'tenant',
        sessionUserId: session.user.id,
        allowedLandlordIds: new Set(landlordIds),
        allowedTenantIds: new Set()
      }
    }

    if (profile.role === 'landlord') {
      const tenantIds = await getLandlordAllowedTenantIds(session.user.id)
      return {
        role: 'landlord',
        sessionUserId: session.user.id,
        allowedLandlordIds: new Set(),
        allowedTenantIds: new Set(tenantIds)
      }
    }

    return {
      role: profile.role,
      sessionUserId: session.user.id,
      allowedLandlordIds: new Set(),
      allowedTenantIds: new Set()
    }
  }

  function canMessageUserWithContext(otherUser, accessContext) {
    if (!otherUser?.id || !accessContext?.sessionUserId) return false
    if (otherUser.id === accessContext.sessionUserId) return false

    if (accessContext.role === 'tenant') {
      return otherUser.role === 'landlord' && accessContext.allowedLandlordIds.has(otherUser.id)
    }

    if (accessContext.role === 'landlord') {
      if (otherUser.role === 'landlord') return true
      if (otherUser.role === 'tenant') return accessContext.allowedTenantIds.has(otherUser.id)
      return false
    }

    return false
  }

  async function isUserAllowedToMessage(otherUser) {
    if (!otherUser?.id) return false
    const accessContext = await getMessagingAccessContext()
    return canMessageUserWithContext(otherUser, accessContext)
  }

  async function loadAllUsers() {
    if (!profile || !session) return

    try {
      if (profile.role === 'landlord') {
        const tenantIds = await getLandlordAllowedTenantIds(session.user.id)

        let tenantProfiles = []
        if (tenantIds.length > 0) {
          const { data: tenants, error: tenantError } = await supabase
            .from('profiles')
            .select('id, first_name, middle_name, last_name, role, phone, avatar_url')
            .in('id', tenantIds)
            .eq('role', 'tenant')

          if (tenantError) throw tenantError
          tenantProfiles = tenants || []
        }

        const { data: otherLandlords, error: landlordError } = await supabase
          .from('profiles')
          .select('id, first_name, middle_name, last_name, role, phone, avatar_url')
          .eq('role', 'landlord')
          .neq('id', session.user.id)
          .order('first_name')

        if (landlordError) throw landlordError

        const usersMap = new Map()
        ;[...tenantProfiles, ...(otherLandlords || [])].forEach(user => {
          if (user?.id && user.id !== session.user.id) usersMap.set(user.id, user)
        })

        const allowedUsers = Array.from(usersMap.values()).sort((a, b) => {
          const aName = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase()
          const bName = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase()
          return aName.localeCompare(bName)
        })

        setAllUsers(allowedUsers)
        setFilteredUsers(allowedUsers)

      } else if (profile.role === 'tenant') {
        const landlordIds = await getTenantAllowedLandlordIds(session.user.id)

        if (landlordIds.length === 0) {
          setAllUsers([])
          setFilteredUsers([])
          return
        }

        const { data: landlords, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, middle_name, last_name, role, phone, avatar_url')
          .in('id', landlordIds)
          .eq('role', 'landlord')
          .order('first_name')

        if (profileError) throw profileError

        setAllUsers(landlords || [])
        setFilteredUsers(landlords || [])
      }
    } catch (error) {
      console.error('Error loading available contacts:', error)
      showToast.error('Could not load contacts list')
    }
  }

  async function loadUnreadCounts() {
    const { data: unreadMessages, error } = await supabase
      .from('messages')
      .select('conversation_id, id')
      .eq('receiver_id', session.user.id)
      .eq('read', false)

    if (error) {
      console.error('Error loading unread counts:', error)
      return
    }

    const counts = {}
    unreadMessages?.forEach(msg => {
      counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1
    })

    setUnreadCounts(counts)
  }

  function enrichConversationWithKnownUsers(conv, otherUser) {
    const currentUserProfile = {
      id: session?.user?.id,
      first_name: profile?.first_name,
      middle_name: profile?.middle_name,
      last_name: profile?.last_name,
      role: profile?.role,
      avatar_url: profile?.avatar_url
    }

    const isCurrentUserLandlord = conv.landlord_id === session?.user?.id
    return {
      ...conv,
      landlord_profile: isCurrentUserLandlord ? currentUserProfile : otherUser,
      tenant_profile: isCurrentUserLandlord ? otherUser : currentUserProfile,
      other_user: otherUser,
      other_user_id: otherUser?.id
    }
  }

  async function startNewConversation(otherUser) {
    const isKnownAllowedUser = allUsers.some(user => user.id === otherUser?.id)
    if (!isKnownAllowedUser) {
      const isAllowed = await isUserAllowedToMessage(otherUser)
      if (!isAllowed) {
        showToast.error('You can only message allowed contacts based on your account role.')
        return
      }
    }

    if (!otherUser?.id) {
      showToast.error('You can only message allowed contacts based on your account role.')
      return
    }

    const existingLocal = conversations.find(c =>
      (c.landlord_id === session.user.id && c.tenant_id === otherUser.id) ||
      (c.tenant_id === session.user.id && c.landlord_id === otherUser.id)
    )

    if (existingLocal) {
      setSelectedGroupConversation(null)
      setGroupMessages([])
      setSelectedConversation(existingLocal)
      setShowNewConversation(false)
      return
    }

    const { data: existingConversations, error: fetchError } = await supabase
      .from('conversations')
      .select('*, property:properties(title, address)')
      .or(`and(landlord_id.eq.${session.user.id},tenant_id.eq.${otherUser.id}),and(landlord_id.eq.${otherUser.id},tenant_id.eq.${session.user.id})`)

    if (fetchError) {
      console.error('Error checking existing conversations:', fetchError)
    }

    const existingDb = existingConversations?.find(conv => {
      const isLandlord = conv.landlord_id === session.user.id
      const isTenant = conv.tenant_id === session.user.id
      if (isLandlord && conv.hidden_by_landlord) return false
      if (isTenant && conv.hidden_by_tenant) return false
      return true
    })

    if (existingDb) {
      const enrichedConv = enrichConversationWithKnownUsers(existingDb, otherUser)

      const isCurrentUserLandlord = existingDb.landlord_id === session.user.id
      const updateField = isCurrentUserLandlord ? 'hidden_by_landlord' : 'hidden_by_tenant'

      if ((isCurrentUserLandlord && existingDb.hidden_by_landlord) ||
        (!isCurrentUserLandlord && existingDb.hidden_by_tenant)) {
        await supabase
          .from('conversations')
          .update({ [updateField]: false })
          .eq('id', existingDb.id)
      }

      setConversations(prev => {
        const alreadyInList = prev.find(c => c.id === enrichedConv.id)
        if (alreadyInList) return prev
        return [enrichedConv, ...prev]
      })
      setSelectedGroupConversation(null)
      setGroupMessages([])
      setSelectedConversation(enrichedConv)
      setShowNewConversation(false)
      return
    }

    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        property_id: null,
        landlord_id: profile.role === 'tenant' ? otherUser.id : session.user.id,
        tenant_id: profile.role === 'tenant' ? session.user.id : otherUser.id
      })
      .select('*, property:properties(title, address)')
      .single()

    if (error) {
      console.error('Error creating conversation:', error)
      const { data: retryConversations } = await supabase
        .from('conversations')
        .select('*, property:properties(title, address)')
        .or(`and(landlord_id.eq.${session.user.id},tenant_id.eq.${otherUser.id}),and(landlord_id.eq.${otherUser.id},tenant_id.eq.${session.user.id})`)

      const retryConv = retryConversations?.[0]

      if (retryConv) {
        const enrichedConv = enrichConversationWithKnownUsers(retryConv, otherUser)

        setConversations([enrichedConv, ...conversations])
        setSelectedGroupConversation(null)
        setGroupMessages([])
        setSelectedConversation(enrichedConv)
        setShowNewConversation(false)
        return
      }
      showToast.error('Failed to start conversation. Please try again.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
    } else {
      const enrichedConv = enrichConversationWithKnownUsers(newConv, otherUser)

      setConversations([enrichedConv, ...conversations])
      setSelectedGroupConversation(null)
      setGroupMessages([])
      setSelectedConversation(enrichedConv)
      setShowNewConversation(false)
    }
  }

  async function loadMessages(conversationId) {
    setMessagesLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey(first_name, middle_name, last_name, role)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_PAGE_SIZE)

    if (error) {
      console.error('Error loading messages:', error)
      setMessages([])
      setHasOlderMessages(false)
      setMessagesLoading(false)
    } else {
      const initialMessages = [...(data || [])].reverse()
      setMessages(initialMessages)
      oldestLoadedMessageRef.current = initialMessages[0] || null
      setHasOlderMessages((data || []).length === MESSAGE_PAGE_SIZE)

      const messagesFromOther = initialMessages.filter(msg => msg.receiver_id === session.user.id)
      if (messagesFromOther.length > 0) {
        await supabase
          .from('messages')
          .update({ read: true })
          .eq('conversation_id', conversationId)
          .eq('receiver_id', session.user.id)
          .eq('read', false)
      }

      setUnreadCounts(prev => ({
        ...prev,
        [conversationId]: 0
      }))

      scheduleScrollToBottom('auto')
      setMessagesLoading(false)
    }
  }

  async function refreshMessagesSilently(conversationId) {
    if (!conversationId || !session?.user?.id) return

    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey(first_name, middle_name, last_name, role)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200)

    if (error) return

    const latestMessages = data || []
    setMessages(prev => {
      const prevIds = new Set(prev.map(msg => msg.id))
      const incoming = latestMessages.filter(msg => !prevIds.has(msg.id))
      if (incoming.length === 0) return prev
      return dedupeMessagesById([...prev, ...incoming]).sort((a, b) =>
        new Date(a.created_at || 0) - new Date(b.created_at || 0)
      )
    })

    const hasUnreadIncoming = latestMessages.some(msg => msg.receiver_id === session.user.id && !msg.read)
    if (hasUnreadIncoming) {
      await supabase
        .from('messages')
        .update({ read: true })
        .eq('conversation_id', conversationId)
        .eq('receiver_id', session.user.id)
        .eq('read', false)

      loadUnreadCounts()
    }
  }

  async function loadOlderMessages() {
    if (!selectedConversation || messagesLoading || !hasOlderMessages || loadingOlderMessagesRef.current) {
      return
    }

    const oldestMessage = oldestLoadedMessageRef.current
    if (!oldestMessage?.created_at) {
      setHasOlderMessages(false)
      return
    }

    loadingOlderMessagesRef.current = true
    setLoadingOlderMessages(true)

    const container = messagesContainerRef.current
    const previousScrollHeight = container?.scrollHeight || 0
    const previousScrollTop = container?.scrollTop || 0

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey(first_name, middle_name, last_name, role)
        `)
        .eq('conversation_id', selectedConversation.id)
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE)

      if (error) {
        console.error('Error loading older messages:', error)
        return
      }

      const olderMessages = [...(data || [])].reverse()
      if (olderMessages.length === 0) {
        setHasOlderMessages(false)
        return
      }

      oldestLoadedMessageRef.current = olderMessages[0] || oldestLoadedMessageRef.current
      setHasOlderMessages((data || []).length === MESSAGE_PAGE_SIZE)
      setMessages(prev => dedupeMessagesById([...olderMessages, ...prev]))

      if (container) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const nextScrollHeight = container.scrollHeight
            container.scrollTop = nextScrollHeight - previousScrollHeight + previousScrollTop
          })
        })
      }
    } finally {
      loadingOlderMessagesRef.current = false
      setLoadingOlderMessages(false)
    }
  }

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current
    if (!container || messagesLoading || loadingOlderMessagesRef.current) return

    if (container.scrollTop <= 70) {
      loadOlderMessages()
    }
  }

  function handleFileSelect(e) {
    const newFiles = Array.from(e.target.files)
    const allFiles = [...selectedFiles, ...newFiles]
    if (allFiles.length > 5) {
      showToast.error('You can only upload up to 5 files at a time', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      e.target.value = ''
      return
    }
    const invalidFiles = newFiles.filter(file => file.size > 2 * 1024 * 1024)
    if (invalidFiles.length > 0) {
      showToast.error('Each file must be less than 2MB', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      e.target.value = ''
      return
    }
    setSelectedFiles(allFiles)
  }

  function removeSelectedFile(index) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    const fileInput = document.getElementById('file-input')
    if (fileInput) fileInput.value = ''
  }

  async function uploadFile(file, conversationId) {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`
    const filePath = `${session.user.id}/${conversationId}/${fileName}`

    const { data, error } = await supabase.storage
      .from('message-attachments')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) throw error

    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('message-attachments')
      .createSignedUrl(filePath, 31536000)

    if (urlError) {
      const { data: urlData } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(filePath)
      return {
        url: urlData.publicUrl,
        name: file.name,
        type: file.type,
        size: file.size
      }
    }

    return {
      url: signedUrlData.signedUrl,
      name: file.name,
      type: file.type,
      size: file.size
    }
  }

  function dedupeMessagesById(messageList) {
    return messageList.filter((msg, index, list) => list.findIndex(item => item.id === msg.id) === index)
  }

  async function sendMessage() {
    const trimmedMessage = newMessage.trim().replace(/\s+/g, ' ')
    if (!trimmedMessage && selectedFiles.length === 0) return
    if (!selectedConversation) return
    if (!session?.access_token) {
      showToast.error('Session expired. Please log in again.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      })
      return
    }

    if (sendInFlightRef.current) return

    const sendSignature = `${selectedConversation.id}|${trimmedMessage}|${selectedFiles.map(file => `${file.name}:${file.size}`).join(',')}`
    const now = Date.now()
    if (
      lastSendSignatureRef.current.signature === sendSignature &&
      now - lastSendSignatureRef.current.timestamp < 1200
    ) {
      return
    }

    sendInFlightRef.current = true
    lastSendSignatureRef.current = { signature: sendSignature, timestamp: now }
    setUploadingFile(true)

    const messageText = trimmedMessage

    try {
      let uploadedFiles = []
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const fileData = await uploadFile(file, selectedConversation.id)
          uploadedFiles.push(fileData)
        }
      }

      const response = await fetch('/api/direct-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'send',
          conversation_id: selectedConversation.id,
          message: messageText,
          files: uploadedFiles
        })
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success !== true) {
        throw new Error(payload?.error || 'Failed to send message')
      }

      setNewMessage('')
      setSelectedFiles([])
      const fileInput = document.getElementById('file-input')
      if (fileInput) fileInput.value = ''

      loadConversations({ showLoader: false })

      scheduleScrollToBottom('smooth')
    } catch (err) {
      console.error('Error in sendMessage:', err)
      showToast.error(err.message || 'Failed to send message', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
    } finally {
      sendInFlightRef.current = false
      setUploadingFile(false)
    }
  }

  function confirmDeleteConversation(conversationId) {
    setDeleteConfirmId(conversationId)
  }

  async function deleteConversation(conversationId) {
    setDeleteConfirmId(null)
    const conversation = conversations.find(c => c.id === conversationId)
    if (!conversation) {
      showToast.error('Conversation not found', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
      return
    }
    const isLandlord = conversation.landlord_id === session.user.id
    const isTenant = conversation.tenant_id === session.user.id
    const updateField = isLandlord ? 'hidden_by_landlord' : 'hidden_by_tenant'

    const { error } = await supabase
      .from('conversations')
      .update({ [updateField]: true })
      .eq('id', conversationId)

    if (error) {
      console.error('Error hiding conversation:', error)
      showToast.error('Failed to delete conversation. Please try again.', {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });
    } else {
      setConversations(prev => prev.filter(c => c.id !== conversationId))
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(null)
        setMessages([])
      }
      showToast.success("Conversation deleted successfully", {
        duration: 4000,
        progress: true,
        position: "top-center",
        transition: "bounceIn",
        icon: '',
        sound: true,
      });

    }
  }

  // Force download handler for files/images to bypass new tab opening
  const handleDownload = async (url, filename) => {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Network response was not ok')
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename || 'download'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Download failed:', error)
      // Fallback
      window.open(url, '_blank')
    }
  }

  // ─── GROUP CHAT FUNCTIONS ───
  async function loadGroupConversations() {
    if (!session?.access_token) {
      setGroupConversations([])
      return
    }

    setGroupsLoading(true)
    try {
      const res = await fetch('/api/group-chat', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })

      if (res.status === 401 || res.status === 403) {
        setGroupConversations([])
        return
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        console.warn('Unable to load groups:', payload?.error || res.statusText)
        return
      }

      const data = await res.json()
      setGroupConversations(data.groups || [])
    } catch (err) {
      console.warn('Error loading group conversations:', err)
    } finally {
      setGroupsLoading(false)
    }
  }

  async function loadEligibleMembers() {
    if (!session?.access_token) return
    setEligibleMembersLoading(true)
    try {
      const res = await fetch('/api/group-chat?action=eligible_members', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setEligibleMembers(data.members || [])
    } catch (err) {
      console.error('Error loading eligible members:', err)
      showToast.error('Failed to load eligible members')
    } finally {
      setEligibleMembersLoading(false)
    }
  }

  async function createGroupChat() {
    if (!newGroupName.trim() || selectedMemberIds.length === 0) return
    setGroupCreating(true)
    try {
      const res = await fetch('/api/group-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'create',
          name: newGroupName.trim(),
          member_ids: selectedMemberIds
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create group')
      }
      showToast.success('Group chat created!', {
        duration: 3000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
      setShowCreateGroup(false)
      setNewGroupName('')
      setSelectedMemberIds([])
      await loadGroupConversations()
    } catch (err) {
      showToast.error(err.message || 'Failed to create group chat', {
        duration: 4000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
    } finally {
      setGroupCreating(false)
    }
  }

  async function loadGroupMessages(groupId) {
    setGroupMessagesLoading(true)
    try {
      const res = await fetch(`/api/group-chat?action=messages&group_id=${groupId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      if (!res.ok) throw new Error('Failed to load group messages')

      const data = await res.json()
      const nextMessages = dedupeMessagesById(data.messages || []).sort((a, b) =>
        new Date(a.created_at || 0) - new Date(b.created_at || 0)
      )
      setGroupMessages(nextMessages)
      scheduleScrollToBottom('auto')

      // Mark messages as read
      if (session?.access_token) {
        fetch('/api/group-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ action: 'mark_read', group_id: groupId })
        }).then(() => loadGroupConversations()).catch(() => {})
      }
    } catch (err) {
      console.error('Error loading group messages:', err)
      setGroupMessages([])
    } finally {
      setGroupMessagesLoading(false)
    }
  }

  async function refreshGroupMessagesSilently(groupId) {
    if (!groupId || !session?.access_token) return

    try {
      const res = await fetch(`/api/group-chat?action=messages&group_id=${groupId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      if (!res.ok) return

      const payload = await res.json()
      const incoming = payload.messages || []
      const prevIds = new Set((groupMessagesRef.current || []).map(msg => msg.id))
      const hasNewIncoming = incoming.some(msg => !prevIds.has(msg.id))

      setGroupMessages(prev => {
        const prevIds = new Set(prev.map(msg => msg.id))
        const newOnes = incoming.filter(msg => !prevIds.has(msg.id))
        if (newOnes.length === 0) return prev
        return dedupeMessagesById([...prev, ...newOnes]).sort((a, b) =>
          new Date(a.created_at || 0) - new Date(b.created_at || 0)
        )
      })

      if (hasNewIncoming) {
        scheduleScrollToBottom('smooth')
      }

      fetch('/api/group-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'mark_read', group_id: groupId })
      }).then(() => loadGroupConversations()).catch(() => {})
    } catch {
      // Silent fallback refresh should not interrupt chat UI.
    }
  }

  async function sendGroupMessage() {
    const trimmedMessage = newMessage.trim().replace(/\s+/g, ' ')
    if (!trimmedMessage && selectedFiles.length === 0) return
    if (!selectedGroupConversation) return
    if (!session?.access_token) {
      showToast.error('Session expired. Please log in again.', {
        duration: 4000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
      return
    }
    if (groupSendInFlightRef.current) return

    groupSendInFlightRef.current = true
    setUploadingFile(true)
    const filesBackup = [...selectedFiles]

    try {
      let uploadedFiles = []
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const fileData = await uploadFile(file, selectedGroupConversation.id)
          uploadedFiles.push(fileData)
        }
      }

      const optimisticMessages = uploadedFiles.length > 0
        ? uploadedFiles.map((file, index) => ({
          id: `temp-group-${Date.now()}-${index}-${Math.random()}`,
          group_conversation_id: selectedGroupConversation.id,
          sender_id: session.user.id,
          message: index === 0 ? trimmedMessage : '',
          file_url: file.url,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          created_at: new Date().toISOString(),
          sender: {
            id: session.user.id,
            first_name: profile?.first_name,
            last_name: profile?.last_name,
            role: profile?.role,
            avatar_url: profile?.avatar_url
          }
        }))
        : [{
          id: `temp-group-${Date.now()}-${Math.random()}`,
          group_conversation_id: selectedGroupConversation.id,
          sender_id: session.user.id,
          message: trimmedMessage,
          file_url: null,
          file_name: null,
          file_type: null,
          file_size: null,
          created_at: new Date().toISOString(),
          sender: {
            id: session.user.id,
            first_name: profile?.first_name,
            last_name: profile?.last_name,
            role: profile?.role,
            avatar_url: profile?.avatar_url
          }
        }]

      setGroupMessages(prev => [...prev, ...optimisticMessages])
      setNewMessage('')
      setSelectedFiles([])
      const fileInput = document.getElementById('file-input')
      if (fileInput) fileInput.value = ''
      scheduleScrollToBottom('smooth')

      const res = await fetch('/api/group-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'send_message',
          group_id: selectedGroupConversation.id,
          message: trimmedMessage,
          files: uploadedFiles
        })
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.success !== true) {
        throw new Error(payload?.error || 'Failed to send message')
      }

      const sentMessages = Array.isArray(payload?.messages) ? payload.messages : []
      setGroupMessages(prev => {
        const withoutTemps = prev.filter(msg => !String(msg.id).startsWith('temp-group-'))
        if (sentMessages.length === 0) return withoutTemps
        return dedupeMessagesById([...withoutTemps, ...sentMessages]).sort((a, b) =>
          new Date(a.created_at || 0) - new Date(b.created_at || 0)
        )
      })

      if (sentMessages.length === 0) {
        await refreshGroupMessagesSilently(selectedGroupConversation.id)
      }

      loadGroupConversations()
      scheduleScrollToBottom('smooth')
    } catch (err) {
      console.error('Error sending group message:', err)
      setGroupMessages(prev => prev.filter(msg => !String(msg.id).startsWith('temp-group-')))
      setNewMessage(trimmedMessage)
      setSelectedFiles(filesBackup || [])
      showToast.error('Failed to send message', {
        duration: 4000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
    } finally {
      groupSendInFlightRef.current = false
      setUploadingFile(false)
    }
  }

  async function removeMemberFromGroup(groupId, memberId) {
    try {
      const res = await fetch('/api/group-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'remove_member', group_id: groupId, member_id: memberId })
      })
      if (!res.ok) throw new Error('Failed')
      const isSelfLeave = memberId === session?.user?.id
      showToast.success(isSelfLeave ? 'You left the group chat' : 'Member removed', {
        duration: 3000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
      setMemberRemoveConfirm(null)
      setGroupLeaveConfirmId(null)
      await loadGroupConversations()

      if (isSelfLeave) {
        setSelectedGroupConversation(null)
        setGroupMessages([])
        return
      }

      // Refresh the selected group
      const { data: updatedMembers } = await supabase
        .from('group_conversation_members')
        .select('user_id, role, user:profiles!group_conversation_members_user_id_fkey(id, first_name, middle_name, last_name, role, avatar_url)')
        .eq('group_conversation_id', groupId)
      setSelectedGroupConversation(prev => prev ? { ...prev, members: updatedMembers || [] } : null)
    } catch (err) {
      showToast.error('Failed to remove member', {
        duration: 4000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
    }
  }

  async function addMembersToGroup(groupId, memberIds) {
    if (!groupId || !Array.isArray(memberIds) || memberIds.length === 0 || addingMembers) return

    setAddingMembers(true)
    try {
      const res = await fetch('/api/group-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'add_members', group_id: groupId, member_ids: memberIds })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to add members')

      if ((data?.added || 0) > 0) {
        showToast.success(`Added ${data.added} member${data.added !== 1 ? 's' : ''}!`, {
          duration: 3000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
        })
      } else {
        showToast.success(data?.message || 'Selected users are already in this group', {
          duration: 3000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
        })
      }

      setShowAddMembers(false)
      setSelectedMemberIds([])
      setAddMemberSearchQuery('')
      await loadGroupConversations()
      // Refresh the selected group
      const { data: updatedMembers } = await supabase
        .from('group_conversation_members')
        .select('user_id, role, user:profiles!group_conversation_members_user_id_fkey(id, first_name, middle_name, last_name, role, avatar_url)')
        .eq('group_conversation_id', groupId)
      setSelectedGroupConversation(prev => prev ? { ...prev, members: updatedMembers || [] } : null)
    } catch (err) {
      showToast.error(err.message || 'Failed to add members', {
        duration: 4000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
    } finally {
      setAddingMembers(false)
    }
  }

  async function renameGroupConversation(groupId, name) {
    const trimmedName = (name || '').trim()
    if (!trimmedName) {
      showToast.error('Group name is required', {
        duration: 3000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
      return
    }

    try {
      const res = await fetch('/api/group-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'update', group_id: groupId, name: trimmedName })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to rename group')

      setSelectedGroupConversation(prev => prev ? { ...prev, name: trimmedName } : prev)
      setGroupConversations(prev => prev.map(group =>
        group.id === groupId ? { ...group, name: trimmedName } : group
      ))
      setIsEditingGroupName(false)

      showToast.success('Group name updated', {
        duration: 3000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
    } catch (err) {
      showToast.error(err.message || 'Failed to rename group', {
        duration: 4000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
    }
  }

  async function deleteGroupConversation(groupId) {
    try {
      const res = await fetch('/api/group-chat', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ group_id: groupId })
      })
      if (!res.ok) throw new Error('Failed')
      showToast.success('Group chat deleted', {
        duration: 3000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
      setSelectedGroupConversation(null)
      setGroupMessages([])
      setGroupDeleteConfirmId(null)
      await loadGroupConversations()
    } catch (err) {
      showToast.error('Failed to delete group', {
        duration: 4000, progress: true, position: 'top-center', transition: 'bounceIn', icon: '', sound: true
      })
    }
  }

  // Subscribe to group messages in real-time when a group is selected
  useEffect(() => {
    if (selectedGroupConversation?.id && session?.user?.id) {
      setGroupTypingActive(false)
      setShowAddMembers(false)
      setSelectedMemberIds([])
      setAddMemberSearchQuery('')

      const cachedMessages = groupMessagesCacheRef.current.get(selectedGroupConversation.id)
      if (cachedMessages && cachedMessages.length > 0) {
        setGroupMessages(cachedMessages)
        setGroupMessagesLoading(false)
        scheduleScrollToBottom('auto')
        refreshGroupMessagesSilently(selectedGroupConversation.id)
      } else {
        setGroupMessages([])
        setGroupMessagesLoading(true)
        loadGroupMessages(selectedGroupConversation.id)
      }

      setShowMobileDetails(false)

      const channel = supabase
        .channel(`group-messages-${selectedGroupConversation.id}`, {
          config: {
            broadcast: { self: true },
          },
        })
        // Real-time INSERT: new messages appear instantly for all group members
        .on('postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'group_messages',
            filter: `group_conversation_id=eq.${selectedGroupConversation.id}`
          },
          async (payload) => {
            const inserted = payload?.new
            if (inserted?.group_conversation_id !== selectedGroupConversation.id) return

            const senderFromMembers = (selectedGroupConversation.members || []).find(member => member.user_id === inserted.sender_id)?.user || null
            const fallbackSender = inserted.sender_id === session.user.id
              ? {
                id: session.user.id,
                first_name: profile?.first_name,
                last_name: profile?.last_name,
                role: profile?.role,
                avatar_url: profile?.avatar_url
              }
              : senderFromMembers

            const incomingMessage = {
              ...inserted,
              sender: fallbackSender
            }

            setGroupMessages(prev => {
              const exists = prev.some(message => message.id === incomingMessage.id)
              if (exists) return prev

              const tempMatchIndex = prev.findIndex(message =>
                String(message.id).startsWith('temp-group-') &&
                message.sender_id === inserted.sender_id &&
                (message.message || '') === (inserted.message || '') &&
                (message.file_url || null) === (inserted.file_url || null) &&
                (message.file_name || null) === (inserted.file_name || null)
              )

              const next = [...prev]
              if (tempMatchIndex !== -1) {
                next[tempMatchIndex] = incomingMessage
              } else {
                next.push(incomingMessage)
              }

              return dedupeMessagesById(next).sort((a, b) =>
                new Date(a.created_at || 0) - new Date(b.created_at || 0)
              )
            })

            if (!senderFromMembers && inserted.sender_id !== session.user.id) {
              refreshGroupMessagesSilently(selectedGroupConversation.id)
            }

            if (inserted.sender_id !== session.user.id && session?.access_token) {
              fetch('/api/group-chat', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ action: 'mark_read', group_id: selectedGroupConversation.id })
              }).then(() => loadGroupConversations()).catch(() => {})
            }

            scheduleScrollToBottom('smooth')
          }
        )
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload?.groupId !== selectedGroupConversation.id) return
          if (payload?.userId === session.user.id) return

          setGroupTypingActive(true)
          if (groupTypingTimeoutRef.current) clearTimeout(groupTypingTimeoutRef.current)
          groupTypingTimeoutRef.current = setTimeout(() => {
            setGroupTypingActive(false)
          }, 2200)
        })
        .subscribe()

      groupChannelRef.current = channel

      return () => {
        groupChannelRef.current = null
        if (groupTypingTimeoutRef.current) {
          clearTimeout(groupTypingTimeoutRef.current)
          groupTypingTimeoutRef.current = null
        }
        supabase.removeChannel(channel)
      }
    }
  }, [selectedGroupConversation?.id, session?.user?.id])

  useEffect(() => {
    if (!selectedGroupConversation?.id || !session?.user?.id) return

    const refreshNow = () => refreshGroupMessagesSilently(selectedGroupConversation.id)
    const intervalId = window.setInterval(refreshNow, 1200)

    const handleFocus = () => refreshNow()
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshNow()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [selectedGroupConversation?.id, session?.user?.id])

  // Filtered eligible members for group creation
  const filteredEligibleMembers = eligibleMembers.filter(m => {
    if (!groupSearchQuery.trim()) return true
    const fullName = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase()
    return fullName.includes(groupSearchQuery.toLowerCase())
  })

  const existingGroupMemberIds = new Set((selectedGroupConversation?.members || []).map(member => member.user_id))
  const filteredAddableMembers = eligibleMembers
    .filter(member => !existingGroupMemberIds.has(member.id))
    .filter(member => {
      if (!addMemberSearchQuery.trim()) return true
      const fullName = `${member.first_name || ''} ${member.last_name || ''}`.toLowerCase()
      return fullName.includes(addMemberSearchQuery.toLowerCase())
    })

  // Helper to get shared media
  const activeMessages = selectedGroupConversation ? groupMessages : messages
  const sharedImages = activeMessages.filter(m => m.file_type?.startsWith('image/') && m.file_url)
  const sharedFiles = activeMessages.filter(m => m.file_url && !m.file_type?.startsWith('image/'))
  const directLastSeenAt = selectedConversation
    ? messages.reduce((latest, msg) => {
      if (msg.sender_id !== selectedConversation.other_user_id) return latest
      const currentTs = new Date(msg.created_at || 0).getTime()
      const latestTs = latest ? new Date(latest).getTime() : 0
      return currentTs > latestTs ? msg.created_at : latest
    }, null)
    : null
  const directStatusText = directTypingUserId ? 'typing...' : formatLastSeen(directLastSeenAt)
  const getGroupSystemEventText = (msg) => {
    const rawMessage = (msg?.message || '').trim()
    if (!rawMessage || msg?.file_url || msg?.file_name) return null

    const normalizeSubject = (subject) => {
      const cleaned = (subject || '').trim()
      return cleaned || 'A member'
    }

    const normalizedKickMatch = rawMessage.match(/^System kick\s+(.+?)\s+from the group\.?$/i)
    if (normalizedKickMatch) {
      return `System kick ${normalizeSubject(normalizedKickMatch[1])} to the group.`
    }

    const landlordKickMatch = rawMessage.match(/^Landlord kick\s+(.+?)\s+to the group\.?$/i)
    if (landlordKickMatch) {
      return `Landlord kick ${normalizeSubject(landlordKickMatch[1])} to the group.`
    }

    const kickedMatch = rawMessage.match(/^System kicked\s+(.+?)\s+from the chat\.?$/i)
    if (kickedMatch) {
      return `System kick ${normalizeSubject(kickedMatch[1])} to the group.`
    }

    const kickedGroupMatch = rawMessage.match(/^System kicked\s+(.+?)\s+from the group\.?$/i)
    if (kickedGroupMatch) {
      return `System kick ${normalizeSubject(kickedGroupMatch[1])} to the group.`
    }

    const systemKickToGroupMatch = rawMessage.match(/^System kick\s+(.+?)\s+to the group\.?$/i)
    if (systemKickToGroupMatch) {
      return `System kick ${normalizeSubject(systemKickToGroupMatch[1])} to the group.`
    }

    const landlordAddedMatch = rawMessage.match(/^Landlord added\s+(.+?)\s+to the group\.?$/i)
    if (landlordAddedMatch) {
      return `Landlord added ${normalizeSubject(landlordAddedMatch[1])} to the group.`
    }

    const systemAddedMatch = rawMessage.match(/^System added\s+(.+?)\s+to the group\.?$/i)
    if (systemAddedMatch) {
      return `Landlord added ${normalizeSubject(systemAddedMatch[1])} to the group.`
    }

    const leftChatMatch = rawMessage.match(/^(.+?)\s+left the chat\.?$/i)
    if (leftChatMatch) {
      return `${normalizeSubject(leftChatMatch[1])} left the group.`
    }

    const leftGroupMatch = rawMessage.match(/^(.+?)\s+left the group\.?$/i)
    if (leftGroupMatch) {
      return `${normalizeSubject(leftGroupMatch[1])} left the group.`
    }

    return null
  }
  const inboxItems = [
    ...conversations.map(conv => ({
      type: 'direct',
      id: conv.id,
      updated_at: conv.updated_at,
      unread_count: unreadCounts[conv.id] || 0,
      data: conv
    })),
    ...groupConversations.map(group => ({
      type: 'group',
      id: group.id,
      updated_at: group.updated_at,
      unread_count: group.unread_count || 0,
      data: group
    }))
  ].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
  const conversationSkeletonIndices = Array.from({ length: 8 }, (_, index) => index)

  const renderConversationListSkeleton = () => (
    <div className="flex-1 overflow-y-auto">
      {conversationSkeletonIndices.map((index) => (
        <div key={`conversation-skeleton-${index}`} className="p-4 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-200 skeleton-shimmer flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-28 rounded bg-slate-200 skeleton-shimmer" />
              <div className="h-3 w-36 rounded bg-slate-200 skeleton-shimmer" />
            </div>
            <div className="h-5 w-6 rounded-full bg-slate-200 skeleton-shimmer" />
          </div>
        </div>
      ))}
    </div>
  )

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-black"></div>
      </div>
    )
  }

  const isAnyChatSelected = !!selectedConversation || !!selectedGroupConversation

  return (
    <div className="h-[calc(100vh-64px)] bg-[#F3F4F5] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-[#F3F4F5] border-b border-black flex-shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-black tracking-tight">Messages</h1>
          <p className="text-sm text-gray-500 mt-1">
            {profile.role === 'landlord'
              ? 'Connect with your tenants'
              : 'Contact landlords directly'}
          </p>
        </div>
      </div>

      {/* Main Content (3 Column Layout) */}
      <div className="flex-1 flex overflow-hidden bg-[#F3F4F5]">
        <div className="flex w-full h-full bg-[#F3F4F5] relative">

          {/* Left Column: Conversations List */}
          <div className={`${isAnyChatSelected ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r-1 border-black h-full bg-[#F3F4F5]`}>
            <div className="p-4 border-b border-black flex justify-between items-center gap-3 flex-shrink-0">
              <h2 className="font-bold text-black text-sm">
                {showNewConversation ? 'Start Chat' : showCreateGroup ? 'Create Group' : 'Inbox'}
              </h2>
              {showNewConversation || showCreateGroup ? (
                <button
                  onClick={() => {
                    setShowNewConversation(false)
                    setShowCreateGroup(false)
                    setSearchQuery('')
                    setGroupSearchQuery('')
                    setNewGroupName('')
                    setSelectedMemberIds([])
                  }}
                  className="text-xs text-gray-500 font-medium cursor-pointer"
                >
                  Cancel
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowNewConversation(true)
                      setShowCreateGroup(false)
                    }}
                    className="text-xs bg-black text-white px-3 py-1.5 rounded-full font-medium cursor-pointer"
                  >
                    + New Chat
                  </button>
                  {profile.role === 'landlord' && (
                    <button
                      onClick={() => {
                        setShowCreateGroup(true)
                        setShowNewConversation(false)
                        loadEligibleMembers()
                      }}
                      className="text-xs bg-black text-white px-3 py-1.5 rounded-full font-medium cursor-pointer"
                    >
                      + New Group
                    </button>
                  )}
                </div>
              )}
            </div>

            {showNewConversation ? (
              <>
                <div className="p-3 border-b border-gray-100 flex-shrink-0">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 pl-9 bg-gray-50 border-0 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black"
                    />
                    <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {filteredUsers.length === 0 ? (
                    <div className="p-8 text-center"><p className="text-sm text-gray-500">No users found.</p></div>
                  ) : (
                    filteredUsers.map(user => (
                      <div key={user.id} onClick={() => startNewConversation(user)} className="p-4 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {user.avatar_url ? (
                              <img
                                src={user.avatar_url}
                                alt={`${user.first_name} ${user.last_name}`}
                                className="w-10 h-10 rounded-full object-cover border-2 border-gray-100"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600">
                                {(user.first_name?.[0] || '?').toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-black truncate">{user.first_name} {user.last_name}</div>
                            {user.phone && <div className="text-xs text-gray-500 mt-0.5 truncate">{user.phone}</div>}
                          </div>
                          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{user.role}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : showCreateGroup ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Group Name</label>
                  <input
                    type="text"
                    placeholder="Enter group name..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black"
                    maxLength={50}
                  />
                </div>

                <div className="mb-3">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Select Members ({selectedMemberIds.length} selected)
                  </label>
                  <div className="relative mb-2">
                    <input
                      type="text"
                      placeholder="Search tenants..."
                      value={groupSearchQuery}
                      onChange={(e) => setGroupSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 pl-9 bg-gray-50 border-0 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black"
                    />
                    <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                {selectedMemberIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {selectedMemberIds.map(id => {
                      const member = eligibleMembers.find(m => m.id === id)
                      if (!member) return null
                      return (
                        <span key={id} className="inline-flex items-center gap-1 bg-black text-white text-[10px] font-medium px-2 py-1 rounded-full">
                          {member.first_name} {member.last_name}
                          <button
                            onClick={() => setSelectedMemberIds(prev => prev.filter(mId => mId !== id))}
                            className="text-white/70 hover:text-white cursor-pointer"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                {eligibleMembersLoading ? (
                  <div className="py-8 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-black mx-auto"></div>
                    <p className="text-xs text-gray-400 mt-2">Loading tenants...</p>
                  </div>
                ) : filteredEligibleMembers.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-xs text-gray-400">
                      {eligibleMembers.length === 0
                        ? 'No tenants under your active occupancies'
                        : 'No matching tenants found'
                      }
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredEligibleMembers.map(member => {
                      const isChecked = selectedMemberIds.includes(member.id)
                      return (
                        <div
                          key={member.id}
                          onClick={() => {
                            setSelectedMemberIds(prev =>
                              isChecked ? prev.filter(id => id !== member.id) : [...prev, member.id]
                            )
                          }}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                            isChecked ? 'bg-black text-white' : 'bg-white hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {member.avatar_url ? (
                              <img src={member.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-gray-100" />
                            ) : (
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                                isChecked ? 'bg-white text-black' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {(member.first_name?.[0] || '?').toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{member.first_name} {member.last_name}</div>
                            {member.property_title && (
                              <div className={`text-[10px] truncate mt-0.5 ${isChecked ? 'text-gray-300' : 'text-gray-400'}`}>
                                {member.property_title}
                              </div>
                            )}
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            isChecked ? 'border-white bg-white' : 'border-gray-300'
                          }`}>
                            {isChecked && (
                              <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <button
                  onClick={createGroupChat}
                  disabled={!newGroupName.trim() || selectedMemberIds.length === 0 || groupCreating}
                  className={`w-full mt-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    !newGroupName.trim() || selectedMemberIds.length === 0 || groupCreating
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-black text-white cursor-pointer active:scale-[0.98]'
                  }`}
                >
                  {groupCreating ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                      Creating...
                    </span>
                  ) : (
                    `Create Group (${selectedMemberIds.length} member${selectedMemberIds.length !== 1 ? 's' : ''})`
                  )}
                </button>
              </div>
            ) : (loading || groupsLoading) && inboxItems.length === 0 ? (
              renderConversationListSkeleton()
            ) : inboxItems.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-500 mb-2">No messages yet</p>
                <p className="text-xs text-gray-400">Start a new chat to connect.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {inboxItems.map(item => {
                  if (item.type === 'direct') {
                    const conv = item.data
                    const otherPerson = conv.other_user ? `${conv.other_user.first_name || ''} ${conv.other_user.last_name || ''}`.trim() : 'Unknown User'
                    const unreadCount = item.unread_count
                    const hasUnread = unreadCount > 0
                    const isSelected = selectedConversation?.id === conv.id

                    return (
                      <div
                        key={`direct-${conv.id}`}
                        onClick={() => {
                          setSelectedConversation(conv)
                          setSelectedGroupConversation(null)
                          setGroupMessages([])
                          setShowNewConversation(false)
                          setShowCreateGroup(false)
                        }}
                        className={`p-4 cursor-pointer border-b border-gray-50 transition-colors ${isSelected
                          ? 'bg-black text-white'
                          : 'bg-white text-black'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {conv.other_user?.avatar_url ? (
                              <img
                                src={conv.other_user.avatar_url}
                                alt={otherPerson}
                                className="w-10 h-10 rounded-full object-cover border-2 border-gray-100"
                              />
                            ) : (
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${isSelected ? 'bg-white text-black' : 'bg-gray-100 text-gray-600'}`}>
                                {(conv.other_user?.first_name?.[0] || '?').toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm truncate ${hasUnread ? 'font-bold' : 'font-medium'}`}>
                              {otherPerson}
                            </div>
                            <div className={`text-xs mt-0.5 truncate ${isSelected ? 'text-gray-400' : 'text-gray-500'}`}>
                              {conv.property?.title || (conv.other_user?.role === 'landlord' ? 'Landlord' : 'Tenant')}
                            </div>
                          </div>
                          {hasUnread && (
                            <div className="flex-shrink-0">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white text-black' : 'bg-black text-white'}`}>
                                {unreadCount}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  }

                  const group = item.data
                  const hasUnread = item.unread_count > 0
                  const isSelected = selectedGroupConversation?.id === group.id

                  return (
                    <div
                      key={`group-${group.id}`}
                      onClick={() => {
                        setSelectedGroupConversation(group)
                        setSelectedConversation(null)
                        setMessages([])
                        setShowNewConversation(false)
                        setShowCreateGroup(false)
                      }}
                      className={`p-4 cursor-pointer border-b border-gray-50 transition-colors ${isSelected
                        ? 'bg-black text-white'
                        : 'bg-white text-black'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                          isSelected ? 'bg-white text-black' : 'bg-gray-900 text-white'
                        }`}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm truncate ${hasUnread ? 'font-bold' : 'font-medium'}`}>
                            {group.name}
                          </div>
                          <div className={`text-xs mt-0.5 truncate ${isSelected ? 'text-gray-400' : 'text-gray-500'}`}>
                            {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                          </div>
                        </div>
                        {hasUnread && (
                          <div className="flex-shrink-0">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white text-black' : 'bg-black text-white'}`}>
                              {item.unread_count}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Middle Column: Chat Area */}
          <div className={`${isAnyChatSelected ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full bg-[#F3F4F5]`}>
            {/* ─── DIRECT MESSAGE CHAT ─── */}
            {selectedConversation && !selectedGroupConversation ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-black flex justify-between items-center flex-shrink-0 bg-[#F3F4F5]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => setSelectedConversation(null)}
                      className="md:hidden flex-shrink-0 text-black cursor-pointer"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    {/* Profile Circle in Chat Header */}
                    <div className="flex-shrink-0">
                      {selectedConversation.other_user?.avatar_url ? (
                        <img
                          src={selectedConversation.other_user.avatar_url}
                          alt="Profile"
                          className="w-10 h-10 rounded-full object-cover border-2 border-gray-100"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600">
                          {(selectedConversation.other_user?.first_name?.[0] || '?').toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-black text-sm truncate">
                        {selectedConversation.other_user ? `${selectedConversation.other_user.first_name || ''} ${selectedConversation.other_user.last_name || ''}`.trim() : 'Unknown User'}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {directStatusText}
                      </div>
                    </div>
                  </div>
                  {/* Info Button for Mobile */}
                  <button
                    onClick={() => setShowMobileDetails(true)}
                    className="lg:hidden p-2 text-gray-500 hover:bg-gray-50 rounded-full cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>

                {/* Messages */}
                <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto p-4 space-y-4 messages-container bg-[#F3F4F5]">
                  {messagesLoading ? (
                    <ChatOpeningSkeleton />
                  ) : (
                    <div>
                    {(loadingOlderMessages || hasOlderMessages) && (
                      <div className="py-1 text-center">
                        {loadingOlderMessages ? (
                          <div className="inline-flex items-center gap-2 text-[11px] text-gray-500">
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-gray-200 border-t-black"></div>
                            Loading older messages...
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-400">Scroll up to load older messages</p>
                        )}
                      </div>
                    )}
                    {messages.map((msg, index) => {
                    const isOwn = msg.sender_id === session.user.id
                    const hasFile = msg.file_url && msg.file_name
                    const isImage = msg.file_type?.startsWith('image/')

                    const myMessages = messages.filter(m => m.sender_id === session.user.id)
                    const latestMyMessage = myMessages.length > 0 ? myMessages[myMessages.length - 1] : null
                    const isLatestFromMe = latestMyMessage && msg.id === latestMyMessage.id

                    // Get avatar for the message sender
                    const senderAvatar = isOwn ? profile?.avatar_url : selectedConversation?.other_user?.avatar_url
                    const senderInitial = isOwn
                      ? (profile?.first_name?.[0] || '?').toUpperCase()
                      : (selectedConversation?.other_user?.first_name?.[0] || '?').toUpperCase()

                    const prevMsg = index > 0 ? messages[index - 1] : null
                    const showDateSep = shouldShowDateSeparator(msg, prevMsg)

                    return (
                      <div key={msg.id}>
                        {showDateSep && (
                          <div className="flex items-center justify-center my-4">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                              {formatMessageDate(msg.created_at)}
                            </span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                        )}
                      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`flex gap-2 max-w-[75%] sm:max-w-[60%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>

                          {/* Profile Circle for Messages */}
                          <div className="flex-shrink-0 self-end mb-1">
                            {senderAvatar ? (
                              <img
                                src={senderAvatar}
                                alt="Profile"
                                className="w-7 h-7 rounded-full object-cover border border-gray-200"
                              />
                            ) : (
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${isOwn ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                {senderInitial}
                              </div>
                            )}
                          </div>

                          <div className={`flex flex-col rounded-2xl p-3 text-sm transition-all duration-200 ${isOwn
                            ? 'bg-gray-900 text-white rounded-tr-sm shadow-md hover:shadow-lg hover:bg-gray-800'
                            : 'bg-gray-100 text-black rounded-tl-sm shadow-sm'
                            }`}>

                            {msg.message && (
                              <div style={{ wordBreak: 'break-word' }}>
                                {msg.message.trim()}
                              </div>
                            )}

                            {hasFile && (
                              <div className={`mt-2 ${msg.message ? 'pt-2 border-t border-white/10' : ''}`}>
                                {isImage ? (
                                  <div className="relative group">
                                    <img
                                      src={msg.file_url}
                                      alt={msg.file_name}
                                      className="rounded-lg object-cover w-full cursor-pointer bg-gray-200"
                                      style={{ maxHeight: '100px', width: 'auto' }}
                                      onClick={() => setImageModal(msg.file_url)}
                                    />
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleDownload(msg.file_url, msg.file_name)
                                      }}
                                      className={`absolute bottom-1 right-1 p-1 rounded-full shadow-sm cursor-pointer ${isOwn ? 'bg-[#F3F4F5]text-black' : 'bg-black text-white'}`}
                                      title="Download"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    </button>
                                  </div>
                                ) : (
                                  <div className={`flex items-center gap-3 p-2 rounded-lg border ${isOwn ? 'border-white/20 bg-white/10' : 'border-gray-200 bg-white'}`}>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium truncate text-xs">{msg.file_name}</p>
                                      <p className={`text-[10px] ${isOwn ? 'text-gray-400' : 'text-gray-500'}`}>{(msg.file_size / 1024).toFixed(0)} KB</p>
                                    </div>
                                    <button
                                      onClick={() => handleDownload(msg.file_url, msg.file_name)}
                                      className="cursor-pointer"
                                      title="Download"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className={`text-[10px] text-gray-400 mt-1 flex items-center gap-1 ${isOwn ? 'pr-1' : 'pl-1'}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()}
                          {isOwn && isLatestFromMe && (
                            <span>- {msg.read ? 'Seen' : 'Sent'}</span>
                          )}
                        </div>
                      </div>
                      </div>
                    )
                  })}
                  </div>
                  )}
                </div>

                {/* Message Input */}
                <div className="p-4 border-t border-black bg-[#F3F4F5] flex-shrink-0">
                  {selectedFiles.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="flex items-center gap-2 bg-gray-50 border border-gray-200 pl-3 pr-2 py-1.5 rounded-full">
                          <span className="text-xs font-medium text-gray-700 max-w-[100px] truncate">{file.name}</span>
                          <button onClick={() => removeSelectedFile(index)} className="text-gray-400 cursor-pointer">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <input
                      type="file"
                      id="file-input"
                      onChange={handleFileSelect}
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx,.txt"
                      multiple
                    />
                    <label
                      htmlFor="file-input"
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-500 cursor-pointer border border-transparent active:border-black transition-colors mb-0.5"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </label>

                    <div className="flex-1 bg-gray-50 rounded-3xl flex items-center px-4 py-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => handleMessageInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (!uploadingFile) {
                              sendMessage()
                            }
                          }
                        }}
                        placeholder="Type a message..."
                        disabled={uploadingFile}
                        className="flex-1 bg-transparent border-none text-sm focus:outline-none placeholder-gray-400"
                      />
                    </div>

                    <button
                      onClick={sendMessage}
                      disabled={(!newMessage.trim() && selectedFiles.length === 0) || uploadingFile}
                      className={`w-10 h-10 flex items-center justify-center rounded-full shadow-sm mb-0.5 transition-all cursor-pointer ${(!newMessage.trim() && selectedFiles.length === 0) || uploadingFile
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-black text-white active:scale-95'
                        }`}
                    >
                      <svg className="w-4 h-4 translate-x-0.5 -translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                  </div>
                </div>
              </>

            ) : selectedGroupConversation && !selectedConversation ? (
              /* ─── GROUP CHAT VIEW ─── */
              <>
                {/* Group Chat Header */}
                <div className="p-4 border-b border-black flex justify-between items-center flex-shrink-0 bg-[#F3F4F5]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => { setSelectedGroupConversation(null); setGroupMessages([]) }}
                      className="md:hidden flex-shrink-0 text-black cursor-pointer"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-black text-sm truncate">
                        {selectedGroupConversation.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {groupTypingActive
                          ? 'Someone is typing...'
                          : `${selectedGroupConversation.members?.length || selectedGroupConversation.member_count} member${(selectedGroupConversation.members?.length || selectedGroupConversation.member_count) !== 1 ? 's' : ''}`
                        }
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowMobileDetails(true)}
                    className="lg:hidden p-2 text-gray-500 hover:bg-gray-50 rounded-full cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>

                {/* Group Messages */}
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 messages-container bg-[#F3F4F5]">
                  {groupMessagesLoading ? (
                    <ChatOpeningSkeleton withSenderLabel />
                  ) : groupMessages.length === 0 ? (
                    <div className="h-full min-h-[220px] flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-sm text-gray-400">No messages yet</p>
                        <p className="text-xs text-gray-300 mt-1">Send the first message to the group</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {groupMessages.map((msg, index) => {
                        const isOwn = msg.sender_id === session.user.id
                        const systemEventText = getGroupSystemEventText(msg)

                        const prevMsg = index > 0 ? groupMessages[index - 1] : null
                        const showDateSep = shouldShowDateSeparator(msg, prevMsg)

                        if (systemEventText) {
                          return (
                            <div key={msg.id}>
                              {showDateSep && (
                                <div className="flex items-center justify-center my-4">
                                  <div className="flex-1 h-px bg-gray-200" />
                                  <span className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                    {formatMessageDate(msg.created_at)}
                                  </span>
                                  <div className="flex-1 h-px bg-gray-200" />
                                </div>
                              )}
                              <div className="flex items-center justify-center my-3 animate-in fade-in duration-200">
                                <p className="text-xs text-gray-500 text-center font-medium">
                                  {systemEventText}
                                </p>
                              </div>
                            </div>
                          )
                        }

                        const hasFile = msg.file_url && msg.file_name
                        const isImage = msg.file_type?.startsWith('image/')
                        const senderAvatar = isOwn ? profile?.avatar_url : msg.sender?.avatar_url
                        const senderInitial = isOwn
                          ? (profile?.first_name?.[0] || '?').toUpperCase()
                          : (msg.sender?.first_name?.[0] || '?').toUpperCase()
                        const senderName = isOwn
                          ? null
                          : `${msg.sender?.first_name || ''} ${msg.sender?.last_name || ''}`.trim() || 'Unknown'
                        const senderPrimaryTenantFirstName = msg.sender?.primary_tenant_first_name || msg.sender?.family_primary_first_name
                        const senderIsPrimaryTenant = Boolean(msg.sender?.is_primary_tenant)
                        const senderFamilyPrimaryLabel = !senderIsPrimaryTenant && senderPrimaryTenantFirstName
                          ? `under ${senderPrimaryTenantFirstName}`
                          : null

                        return (
                          <div key={msg.id}>
                            {showDateSep && (
                              <div className="flex items-center justify-center my-4">
                                <div className="flex-1 h-px bg-gray-200" />
                                <span className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                  {formatMessageDate(msg.created_at)}
                                </span>
                                <div className="flex-1 h-px bg-gray-200" />
                              </div>
                            )}
                          <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} mb-3 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                            {/* Show sender name for non-own messages in group */}
                            {!isOwn && senderName && (
                              <div className="text-[10px] text-gray-500 font-medium mb-0.5 pl-9">
                                {senderName}
                                {senderFamilyPrimaryLabel && <span className="ml-1 text-blue-500">({senderFamilyPrimaryLabel})</span>}
                              </div>
                            )}
                            <div className={`flex gap-2 max-w-[75%] sm:max-w-[60%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                              <div className="flex-shrink-0 self-end mb-1">
                                {senderAvatar ? (
                                  <img src={senderAvatar} alt="" className="w-7 h-7 rounded-full object-cover border border-gray-200" />
                                ) : (
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${isOwn ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                    {senderInitial}
                                  </div>
                                )}
                              </div>

                              <div className={`flex flex-col rounded-2xl p-3 text-sm transition-all duration-200 ${isOwn
                                ? 'bg-gray-900 text-white rounded-tr-sm shadow-md hover:shadow-lg hover:bg-gray-800'
                                : 'bg-gray-100 text-black rounded-tl-sm shadow-sm'
                              }`}>
                                {msg.message && (
                                  <div style={{ wordBreak: 'break-word' }}>
                                    {msg.message.trim()}
                                  </div>
                                )}
                                {hasFile && (
                                  <div className={`mt-2 ${msg.message ? 'pt-2 border-t border-white/10' : ''}`}>
                                    {isImage ? (
                                      <div className="relative group">
                                        <img
                                          src={msg.file_url}
                                          alt={msg.file_name}
                                          className="rounded-lg object-cover w-full cursor-pointer bg-gray-200"
                                          style={{ maxHeight: '100px', width: 'auto' }}
                                          onClick={() => setImageModal(msg.file_url)}
                                        />
                                      </div>
                                    ) : (
                                      <div className={`flex items-center gap-3 p-2 rounded-lg border ${isOwn ? 'border-white/20 bg-white/10' : 'border-gray-200 bg-white'}`}>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium truncate text-xs">{msg.file_name}</p>
                                          <p className={`text-[10px] ${isOwn ? 'text-gray-400' : 'text-gray-500'}`}>{(msg.file_size / 1024).toFixed(0)} KB</p>
                                        </div>
                                        <button onClick={() => handleDownload(msg.file_url, msg.file_name)} className="cursor-pointer" title="Download">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className={`text-[10px] text-gray-400 mt-1 ${isOwn ? 'pr-1' : 'pl-9'}`}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()}
                            </div>
                          </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Group Message Input */}
                <div className="p-4 border-t border-black bg-[#F3F4F5] flex-shrink-0">
                  {selectedFiles.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="flex items-center gap-2 bg-gray-50 border border-gray-200 pl-3 pr-2 py-1.5 rounded-full">
                          <span className="text-xs font-medium text-gray-700 max-w-[100px] truncate">{file.name}</span>
                          <button onClick={() => removeSelectedFile(index)} className="text-gray-400 cursor-pointer">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <input
                      type="file"
                      id="file-input"
                      onChange={handleFileSelect}
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx,.txt"
                      multiple
                    />
                    <label
                      htmlFor="file-input"
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-500 cursor-pointer border border-transparent active:border-black transition-colors mb-0.5"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </label>

                    <div className="flex-1 bg-gray-50 rounded-3xl flex items-center px-4 py-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => handleMessageInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (!uploadingFile) sendGroupMessage()
                          }
                        }}
                        placeholder="Type a message..."
                        disabled={uploadingFile}
                        className="flex-1 bg-transparent border-none text-sm focus:outline-none placeholder-gray-400"
                      />
                    </div>

                    <button
                      onClick={sendGroupMessage}
                      disabled={(!newMessage.trim() && selectedFiles.length === 0) || uploadingFile}
                      className={`w-10 h-10 flex items-center justify-center rounded-full shadow-sm mb-0.5 transition-all cursor-pointer ${(!newMessage.trim() && selectedFiles.length === 0) || uploadingFile
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-black text-white active:scale-95'
                      }`}
                    >
                      <svg className="w-4 h-4 translate-x-0.5 -translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                  </div>
                </div>
              </>

            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-300">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                </div>
                <h3 className="text-black font-bold mb-1">Your Messages</h3>
                <p className="text-sm text-gray-500">
                  Select a conversation to start chatting
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Settings & History */}
          {/* ─── DIRECT MESSAGE DETAILS PANEL ─── */}
          {selectedConversation && !selectedGroupConversation && (
            <div className={`
                absolute inset-0 z-20 bg-[#F3F4F5] w-full h-full flex flex-col
                lg:static lg:flex lg:w-72 lg:border-l-1 lg:border-black lg:inset-auto lg:z-auto
                ${showMobileDetails ? 'flex' : 'hidden'}
              `}>
              <div className="p-4 border-b border-black flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowMobileDetails(false)}
                    className="lg:hidden p-1 -ml-1 text-gray-500 cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h2 className="font-bold text-black text-sm">Details</h2>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {/* Actions / Settings */}
                <div className="mb-6">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Settings</h3>
                  {deleteConfirmId === selectedConversation.id ? (
                    <div className="p-3 bg-red-50 rounded-lg">
                      <p className="text-xs text-red-600 mb-2 font-medium">Delete this conversation?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => deleteConversation(selectedConversation.id)}
                          className="text-xs bg-red-600 text-white px-3 py-1.5 rounded font-bold hover:bg-red-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-xs bg-white text-gray-700 border border-gray-200 px-3 py-1.5 rounded font-bold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => confirmDeleteConversation(selectedConversation.id)}
                      className="w-full text-left text-xs font-bold text-red-600 hover:bg-red-50 p-2.5 rounded transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete Conversation
                    </button>
                  )}
                </div>

                {/* Shared Photos */}
                <div className="mb-6">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Shared Photos</h3>
                  {sharedImages.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {sharedImages.map(m => (
                        <div key={m.id} className="relative aspect-square group">
                          <img
                            src={m.file_url}
                            className="w-full h-full object-cover rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setImageModal(m.file_url)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No photos shared yet.</p>
                  )}
                </div>

                {/* Shared Files */}
                <div>
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Shared Files</h3>
                  {sharedFiles.length > 0 ? (
                    <div className="space-y-2">
                      {sharedFiles.map(m => (
                        <div
                          key={m.id}
                          onClick={() => handleDownload(m.file_url, m.file_name)}
                          className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group cursor-pointer"
                        >
                          <div className="w-8 h-8 rounded bg-white flex items-center justify-center text-gray-500 border border-gray-100">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-700 truncate group-hover:text-black">{m.file_name}</p>
                            <p className="text-[10px] text-gray-400">{(m.file_size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No files shared yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── GROUP CHAT DETAILS PANEL ─── */}
          {selectedGroupConversation && !selectedConversation && (
            <div className={`
                absolute inset-0 z-20 bg-[#F3F4F5] w-full h-full flex flex-col
                lg:static lg:flex lg:w-72 lg:border-l-1 lg:border-black lg:inset-auto lg:z-auto
                ${showMobileDetails ? 'flex' : 'hidden'}
              `}>
              <div className="p-4 border-b border-black flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowMobileDetails(false)}
                    className="lg:hidden p-1 -ml-1 text-gray-500 cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h2 className="font-bold text-black text-sm">Group Details</h2>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {/* Group Info */}
                <div className="mb-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-3">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  {isEditingGroupName ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={groupNameDraft}
                        onChange={(e) => setGroupNameDraft(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-center focus:outline-none focus:ring-1 focus:ring-black"
                        maxLength={60}
                      />
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => renameGroupConversation(selectedGroupConversation.id, groupNameDraft)}
                          className="text-[11px] bg-black text-white px-3 py-1.5 rounded font-bold cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingGroupName(false)
                            setGroupNameDraft(selectedGroupConversation.name || '')
                          }}
                          className="text-[11px] bg-white text-gray-700 border border-gray-200 px-3 py-1.5 rounded font-bold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <h3 className="font-bold text-sm text-black">{selectedGroupConversation.name}</h3>
                      {selectedGroupConversation.created_by === session?.user?.id && (
                        <button
                          onClick={() => setIsEditingGroupName(true)}
                          className="text-gray-400 hover:text-black cursor-pointer"
                          title="Edit group name"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Created {new Date(selectedGroupConversation.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Members List */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Members ({selectedGroupConversation.members?.length || 0})
                    </h3>
                    {profile.role === 'landlord' && selectedGroupConversation.created_by === session?.user?.id && (
                      <button
                        onClick={() => {
                          setShowAddMembers(true)
                          setSelectedMemberIds([])
                          setAddMemberSearchQuery('')
                          loadEligibleMembers()
                        }}
                        className="text-[10px] font-bold text-black hover:underline cursor-pointer"
                      >
                        + Add
                      </button>
                    )}
                  </div>

                  {/* Current Members */}
                  <div className="space-y-1">
                    {(selectedGroupConversation.members || []).map(member => {
                      const user = member.user || {}
                      const isAdmin = member.role === 'admin'
                      const isSelf = member.user_id === session?.user?.id
                      const isCreator = selectedGroupConversation.created_by === session?.user?.id
                      const userPrimaryTenantFirstName = user.primary_tenant_first_name || user.family_primary_first_name
                      const userIsPrimaryTenant = Boolean(user.is_primary_tenant)
                      const familyPrimaryLabel = !isSelf && !userIsPrimaryTenant && userPrimaryTenantFirstName ? `under ${userPrimaryTenantFirstName}` : null

                      return (
                        <div key={member.user_id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 transition-colors group">
                          <div className="flex-shrink-0">
                            {user.avatar_url ? (
                              <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-100" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600">
                                {(user.first_name?.[0] || '?').toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-black truncate">
                              {user.first_name} {user.last_name}
                              {isSelf && <span className="text-gray-400 ml-1">(You)</span>}
                              {familyPrimaryLabel && <span className="text-blue-500 ml-1">({familyPrimaryLabel})</span>}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {isAdmin ? 'Admin' : (user.role || 'Member')}
                            </div>
                          </div>
                          {/* Remove button (only for creator, not for self) */}
                          {isCreator && !isSelf && !isAdmin && (
                            <>
                              {memberRemoveConfirm === member.user_id ? (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => removeMemberFromGroup(selectedGroupConversation.id, member.user_id)}
                                    className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-bold cursor-pointer"
                                  >
                                    Remove
                                  </button>
                                  <button
                                    onClick={() => setMemberRemoveConfirm(null)}
                                    className="text-[10px] text-gray-400 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setMemberRemoveConfirm(member.user_id)}
                                  className="hidden group-hover:block text-gray-300 hover:text-red-500 cursor-pointer transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Shared Photos */}
                <div className="mb-6">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Shared Photos</h3>
                  {sharedImages.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {sharedImages.map(m => (
                        <div key={m.id} className="relative aspect-square group">
                          <img
                            src={m.file_url}
                            className="w-full h-full object-cover rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setImageModal(m.file_url)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No photos shared yet.</p>
                  )}
                </div>

                {/* Shared Files */}
                <div className="mb-6">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Shared Files</h3>
                  {sharedFiles.length > 0 ? (
                    <div className="space-y-2">
                      {sharedFiles.map(m => (
                        <div
                          key={m.id}
                          onClick={() => handleDownload(m.file_url, m.file_name)}
                          className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group cursor-pointer"
                        >
                          <div className="w-8 h-8 rounded bg-white flex items-center justify-center text-gray-500 border border-gray-100">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-700 truncate group-hover:text-black">{m.file_name}</p>
                            <p className="text-[10px] text-gray-400">{(m.file_size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No files shared yet.</p>
                  )}
                </div>

                {/* Delete Group (Creator Only) */}
                {selectedGroupConversation.created_by === session?.user?.id && (
                  <div className="mb-6">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Settings</h3>
                    {groupDeleteConfirmId === selectedGroupConversation.id ? (
                      <div className="p-3 bg-red-50 rounded-lg">
                        <p className="text-xs text-red-600 mb-2 font-medium">Delete this group chat?</p>
                        <p className="text-[10px] text-red-500 mb-2">All messages will be permanently removed.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => deleteGroupConversation(selectedGroupConversation.id)}
                            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded font-bold hover:bg-red-700 cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setGroupDeleteConfirmId(null)}
                            className="text-xs bg-white text-gray-700 border border-gray-200 px-3 py-1.5 rounded font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setGroupDeleteConfirmId(selectedGroupConversation.id)}
                        className="w-full text-left text-xs font-bold text-red-600 hover:bg-red-50 p-2.5 rounded transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Delete Group Chat
                      </button>
                    )}
                  </div>
                )}

                {profile.role === 'tenant' && (
                  <div className="mb-6">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Settings</h3>
                    {groupLeaveConfirmId === selectedGroupConversation.id ? (
                      <div className="p-3 bg-red-50 rounded-lg">
                        <p className="text-xs text-red-600 mb-2 font-medium">Leave this group chat?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => removeMemberFromGroup(selectedGroupConversation.id, session.user.id)}
                            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded font-bold hover:bg-red-700 cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setGroupLeaveConfirmId(null)}
                            className="text-xs bg-white text-gray-700 border border-gray-200 px-3 py-1.5 rounded font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setGroupLeaveConfirmId(selectedGroupConversation.id)}
                        className="w-full text-left text-xs font-bold text-red-600 hover:bg-red-50 p-2.5 rounded transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" /></svg>
                        Leave Group Chat
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Members Modal */}
      {showAddMembers && selectedGroupConversation && (
        <div
          className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => {
            setShowAddMembers(false)
            setSelectedMemberIds([])
            setAddMemberSearchQuery('')
          }}
        >
          <div
            className="w-full max-w-md bg-[#F3F4F5] border border-black rounded-2xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4 border-b border-black flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-black">Add Members</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {selectedGroupConversation.name}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAddMembers(false)
                  setSelectedMemberIds([])
                  setAddMemberSearchQuery('')
                }}
                className="w-7 h-7 rounded-full text-gray-500 hover:bg-gray-100 hover:text-black cursor-pointer"
                aria-label="Close add members modal"
              >
                <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <input
                  type="text"
                  value={addMemberSearchQuery}
                  onChange={(event) => setAddMemberSearchQuery(event.target.value)}
                  placeholder="Search tenants..."
                  className="w-full px-3 py-2 pl-9 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black"
                />
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {selectedMemberIds.length > 0 && (
                <p className="text-[11px] text-gray-500 mt-2">
                  {selectedMemberIds.length} member{selectedMemberIds.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>

            <div className="p-4 max-h-72 overflow-y-auto custom-scrollbar">
              {eligibleMembersLoading ? (
                <div className="py-8 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-black mx-auto"></div>
                  <p className="text-xs text-gray-400 mt-2">Loading eligible members...</p>
                </div>
              ) : filteredAddableMembers.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-gray-500">
                    {eligibleMembers.length === 0 ? 'No eligible members available for this group.' : 'No matching eligible members found.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredAddableMembers.map(member => {
                    const isChecked = selectedMemberIds.includes(member.id)
                    const primaryTenantFirstName = member.primary_tenant_first_name || member.family_primary_first_name
                    const isPrimaryTenant = Boolean(member.is_primary_tenant)
                    const familyPrimaryLabel = !isPrimaryTenant && primaryTenantFirstName
                      ? `under ${primaryTenantFirstName}`
                      : null

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setSelectedMemberIds(prev =>
                            isChecked ? prev.filter(id => id !== member.id) : [...prev, member.id]
                          )
                        }}
                        className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg transition-all cursor-pointer ${
                          isChecked ? 'bg-black text-white' : 'bg-white hover:bg-gray-50 border border-gray-100'
                        }`}
                      >
                        <div className="flex-shrink-0">
                          {member.avatar_url ? (
                            <img src={member.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-100" />
                          ) : (
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isChecked ? 'bg-white text-black' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {(member.first_name?.[0] || '?').toUpperCase()}
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{member.first_name} {member.last_name}</p>
                          {member.property_title && (
                            <p className={`text-[10px] truncate mt-0.5 ${isChecked ? 'text-gray-300' : 'text-gray-400'}`}>
                              {member.property_title}
                            </p>
                          )}
                          {familyPrimaryLabel && (
                            <p className={`text-[10px] truncate mt-0.5 ${isChecked ? 'text-blue-200' : 'text-blue-500'}`}>
                              ({familyPrimaryLabel})
                            </p>
                          )}
                        </div>

                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isChecked ? 'border-white bg-white' : 'border-gray-300'
                        }`}>
                          {isChecked && (
                            <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-black bg-[#F3F4F5] flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddMembers(false)
                  setSelectedMemberIds([])
                  setAddMemberSearchQuery('')
                }}
                className="px-3 py-2 text-xs font-bold border border-gray-300 rounded-lg text-gray-700 bg-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => addMembersToGroup(selectedGroupConversation.id, selectedMemberIds)}
                disabled={selectedMemberIds.length === 0 || addingMembers}
                className={`px-3 py-2 text-xs font-bold rounded-lg ${selectedMemberIds.length === 0 || addingMembers
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-black text-white cursor-pointer active:scale-[0.98]'
                }`}
              >
                {addingMembers
                  ? 'Adding...'
                  : selectedMemberIds.length > 0
                    ? `Add ${selectedMemberIds.length} Member${selectedMemberIds.length !== 1 ? 's' : ''}`
                    : 'Add Members'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {imageModal && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setImageModal(null)}
        >
          <button
            onClick={() => setImageModal(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white text-4xl font-light cursor-pointer"
          >
            ×
          </button>
          <img
            src={imageModal}
            alt="Full size"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}