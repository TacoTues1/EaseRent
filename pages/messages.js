import { useEffect, useRef, useState } from 'react'
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
  const router = useRouter()

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

  useEffect(() => {
    supabase.auth.getSession().then(result => {
      if (result.data?.session) {
        setSession(result.data.session)
        loadProfile(result.data.session.user.id)
      } else {
        router.push('/')
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession(session)
        loadProfile(session.user.id)
      } else {
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
            loadUnreadCounts()
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

      return () => {
        supabase.removeChannel(channel)
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
    if (selectedConversation && session) {
      setMessages([])
      setMessagesLoading(true)
      setLoadingOlderMessages(false)
      setHasOlderMessages(false)
      loadingOlderMessagesRef.current = false
      oldestLoadedMessageRef.current = null
      loadMessages(selectedConversation.id)
      // Reset mobile details view when changing conversation
      setShowMobileDetails(false)

      const channel = supabase
        .channel(`messages-${selectedConversation.id}-${Date.now()}`, {
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

            if (error) return

            if (newMessage) {
              setMessages(prev => {
                const exists = prev.some(m => m.id === newMessage.id)
                if (exists) return prev
                return [...prev, newMessage]
              })
              scheduleScrollToBottom('smooth')

              if (newMessage.receiver_id === session.user.id) {
                await supabase
                  .from('messages')
                  .update({ read: true })
                  .eq('id', newMessage.id)

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
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [selectedConversation, session])

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
        if (allowedConversations.length === 0) return null
        if (prevSelected?.id) {
          const matchedConversation = allowedConversations.find(conv => conv.id === prevSelected.id)
          if (matchedConversation) return matchedConversation
        }
        return allowedConversations[0]
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

    const isKnownAllowedUser = allUsers.some(user => user.id === selectedConversation.other_user_id)

    const messageText = trimmedMessage
    const receiverId = selectedConversation.other_user_id

    try {
      if (!isKnownAllowedUser) {
        const otherUserForValidation = selectedConversation.other_user || {
          id: selectedConversation.other_user_id,
          role: selectedConversation.other_user?.role
        }
        const isAllowed = await isUserAllowedToMessage(otherUserForValidation)
        if (!isAllowed) {
          showToast.error('You are not allowed to message this user.')
          return
        }
      }

      let uploadedFiles = []
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const fileData = await uploadFile(file, selectedConversation.id)
          uploadedFiles.push(fileData)
        }
      }

      setNewMessage('')
      setSelectedFiles([])
      const fileInput = document.getElementById('file-input')
      if (fileInput) fileInput.value = ''

      if (uploadedFiles.length > 0) {
        for (let i = 0; i < uploadedFiles.length; i++) {
          const fileData = uploadedFiles[i]
          const includeText = i === 0 ? messageText : ''

          const optimisticMessage = {
            id: `temp-${Date.now()}-${Math.random()}`,
            conversation_id: selectedConversation.id,
            sender_id: session.user.id,
            receiver_id: receiverId,
            message: includeText,
            file_url: fileData.url,
            file_name: fileData.name,
            file_type: fileData.type,
            file_size: fileData.size,
            read: false,
            created_at: new Date().toISOString(),
            sender: {
              first_name: profile.first_name,
              last_name: profile.last_name,
              role: profile.role
            }
          }

          setMessages(prev => [...prev, optimisticMessage])
          scheduleScrollToBottom('smooth')

          const { data, error } = await supabase
            .from('messages')
            .insert({
              conversation_id: selectedConversation.id,
              sender_id: session.user.id,
              receiver_id: receiverId,
              message: includeText,
              file_url: fileData.url,
              file_name: fileData.name,
              file_type: fileData.type,
              file_size: fileData.size
            })
            .select()
            .single()

          if (error) {
            console.error('Error sending message:', error)
            setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id))
            showToast.error('Failed to send file: ' + fileData.name, {
              duration: 4000,
              progress: true,
              position: "top-center",
              transition: "bounceIn",
              icon: '',
              sound: true,
            });
          } else {
            setMessages(prev => {
              const updated = prev.map(m =>
                m.id === optimisticMessage.id ? { ...data, sender: { first_name: profile.first_name, last_name: profile.last_name, role: profile.role } } : m
              )
              return dedupeMessagesById(updated)
            })
          }
        }
      } else if (messageText) {
        const optimisticMessage = {
          id: `temp-${Date.now()}`,
          conversation_id: selectedConversation.id,
          sender_id: session.user.id,
          receiver_id: receiverId,
          message: messageText,
          file_url: null,
          file_name: null,
          file_type: null,
          file_size: null,
          read: false,
          created_at: new Date().toISOString(),
          sender: {
            first_name: profile.first_name,
            last_name: profile.last_name,
            role: profile.role
          }
        }

        setMessages(prev => [...prev, optimisticMessage])
        scheduleScrollToBottom('smooth')

        const { data, error } = await supabase
          .from('messages')
          .insert({
            conversation_id: selectedConversation.id,
            sender_id: session.user.id,
            receiver_id: receiverId,
            message: messageText,
            file_url: null,
            file_name: null,
            file_type: null,
            file_size: null
          })
          .select()
          .single()

        if (error) {
          console.error('Error sending message:', error)
          setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id))
          showToast.error('Failed to send message', {
            duration: 4000,
            progress: true,
            position: "top-center",
            transition: "bounceIn",
            icon: '',
            sound: true,
          });
          setNewMessage(messageText)
        } else {
          setMessages(prev => {
            const updated = prev.map(m =>
              m.id === optimisticMessage.id ? { ...data, sender: { first_name: profile.first_name, last_name: profile.last_name, role: profile.role } } : m
            )
            return dedupeMessagesById(updated)
          })
        }
      }

      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', selectedConversation.id)

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

  // Helper to get shared media
  const sharedImages = messages.filter(m => m.file_type?.startsWith('image/') && m.file_url)
  const sharedFiles = messages.filter(m => m.file_url && !m.file_type?.startsWith('image/'))
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
          <div className={`${selectedConversation ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r-1 border-black h-full bg-[#F3F4F5]`}>
            <div className="p-4 border-b border-black flex justify-between items-center flex-shrink-0">
              <h2 className="font-bold text-black text-sm">
                {showNewConversation ? 'Start Chat' : 'Inbox'}
              </h2>
              {!showNewConversation && (
                <button
                  onClick={() => setShowNewConversation(true)}
                  className="text-xs bg-black text-white px-3 py-1.5 rounded-full font-medium cursor-pointer"
                >
                  + New Chat
                </button>
              )}
              {showNewConversation && (
                <button
                  onClick={() => {
                    setShowNewConversation(false)
                    setSearchQuery('')
                  }}
                  className="text-xs text-gray-500 font-medium cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Search bar */}
            {showNewConversation && (
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
            )}

            {loading ? (
              renderConversationListSkeleton()
            ) : showNewConversation ? (
              <div className="flex-1 overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <div className="p-8 text-center"><p className="text-sm text-gray-500">No users found.</p></div>
                ) : (
                  filteredUsers.map(user => (
                    <div key={user.id} onClick={() => startNewConversation(user)} className="p-4 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        {/* Profile Circle */}
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
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-500 mb-2">No messages yet</p>
                <p className="text-xs text-gray-400">Start a new chat to connect.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {conversations.map(conv => {
                  const otherPerson = conv.other_user ? `${conv.other_user.first_name || ''} ${conv.other_user.last_name || ''}`.trim() : 'Unknown User'
                  const unreadCount = unreadCounts[conv.id] || 0
                  const hasUnread = unreadCount > 0
                  const isSelected = selectedConversation?.id === conv.id

                  return (
                    <div
                      key={conv.id}
                      onClick={() => {
                        setSelectedConversation(conv)
                        setShowNewConversation(false)
                      }}
                      className={`p-4 cursor-pointer border-b border-gray-50 transition-colors ${isSelected
                        ? 'bg-black text-white'
                        : 'bg-white text-black'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Profile Circle */}
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
                })}
              </div>
            )}
          </div>

          {/* Middle Column: Chat Area */}
          <div className={`${selectedConversation ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full bg-[#F3F4F5]`}>
            {selectedConversation ? (
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
                      {selectedConversation.property?.title && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          {selectedConversation.property?.title}
                        </div>
                      )}
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
                    <div className="h-full min-h-[220px] flex items-center justify-center">
                      <div className="flex flex-col items-center gap-2 text-gray-500">
                        <div className="animate-spin rounded-full h-7 w-7 border-2 border-gray-200 border-t-black"></div>
                        <p className="text-xs font-medium">Opening conversation...</p>
                      </div>
                    </div>
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

                    return (
                      <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
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
                        onChange={(e) => setNewMessage(e.target.value)}
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
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-300">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                </div>
                <h3 className="text-black font-bold mb-1">Your Messages</h3>
                <p className="text-sm text-gray-500">Select a conversation to start chatting</p>
              </div>
            )}
          </div>

          {/* Right Column: Settings & History */}
          {selectedConversation && (
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
        </div>
      </div>

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