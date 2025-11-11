import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast, { Toaster } from 'react-hot-toast'

export default function Messages() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [conversations, setConversations] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [filteredUsers, setFilteredUsers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [unreadCounts, setUnreadCounts] = useState({}) // { conversationId: count }
  const router = useRouter()

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
    if (profile) {
      loadConversations()
      loadAllUsers()
      loadUnreadCounts()
      
      // Subscribe to new messages globally to update unread counts
      const channel = supabase
        .channel('global-messages')
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages',
            filter: `receiver_id=eq.${profile.id}`
          }, 
          (payload) => {
            // Update unread count for this conversation
            loadUnreadCounts()
            // If not viewing this conversation, refresh list to show updated order
            if (!selectedConversation || selectedConversation.id !== payload.new.conversation_id) {
              loadConversations()
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [profile])

  useEffect(() => {
    // Filter users based on search query
    if (searchQuery.trim()) {
      const filtered = allUsers.filter(user => 
        user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.phone?.toLowerCase().includes(searchQuery.toLowerCase())
      )
      setFilteredUsers(filtered)
    } else {
      setFilteredUsers(allUsers)
    }
  }, [searchQuery, allUsers])

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id)
      
      // Subscribe to new messages
      const channel = supabase
        .channel(`messages:${selectedConversation.id}`)
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages',
            filter: `conversation_id=eq.${selectedConversation.id}`
          }, 
          (payload) => {
            setMessages(prev => [...prev, payload.new])
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [selectedConversation])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (data) setProfile(data)
  }

  async function loadConversations() {
    setLoading(true)
    
    // Get conversations where user is either participant
    const { data: allConversations, error } = await supabase
      .from('conversations')
      .select('*, property:properties(title, address)')
      .or(`landlord_id.eq.${session.user.id},tenant_id.eq.${session.user.id}`)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error loading conversations:', error)
      setLoading(false)
      return
    }

    // Filter out conversations hidden by current user
    const conversations = allConversations?.filter(conv => {
      const isLandlord = conv.landlord_id === session.user.id
      const isTenant = conv.tenant_id === session.user.id
      
      // Hide if current user deleted it
      if (isLandlord && conv.hidden_by_landlord) return false
      if (isTenant && conv.hidden_by_tenant) return false
      
      return true
    }) || []

    if (conversations && conversations.length > 0) {
      // Get all unique user IDs (both participants)
      const userIds = new Set()
      conversations.forEach(conv => {
        userIds.add(conv.landlord_id)
        userIds.add(conv.tenant_id)
      })

      // Fetch all profiles at once
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', Array.from(userIds))

      if (profileError) {
        console.error('Error loading profiles:', profileError)
      }

      // Create profile map
      const profileMap = {}
      profiles?.forEach(p => {
        profileMap[p.id] = p
      })

      // Attach profiles to conversations and determine the other user
      const enrichedConversations = conversations.map(conv => {
        const isLandlord = conv.landlord_id === session.user.id
        const otherUserId = isLandlord ? conv.tenant_id : conv.landlord_id
        const otherUser = profileMap[otherUserId]

        return {
          ...conv,
          landlord_profile: profileMap[conv.landlord_id],
          tenant_profile: profileMap[conv.tenant_id],
          other_user: otherUser, // The user you're chatting with
          other_user_id: otherUserId
        }
      })

      setConversations(enrichedConversations)
      if (enrichedConversations.length > 0) {
        setSelectedConversation(enrichedConversations[0])
      }
    } else {
      setConversations([])
    }
    
    setLoading(false)
  }

  async function loadAllUsers() {
    console.log('Current session user ID:', session.user.id) // Debug log
    
    // Load all users except the current user
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, phone')
      .neq('id', session.user.id)
      .order('full_name')

    if (error) {
      console.error('Error loading users:', error)
      return
    }

    console.log('Loaded users:', users) // Debug log
    console.log('Total users found:', users?.length || 0) // Debug log
    
    setAllUsers(users || [])
    setFilteredUsers(users || [])
  }

  async function loadUnreadCounts() {
    // Get unread message counts for all conversations
    const { data: unreadMessages, error } = await supabase
      .from('messages')
      .select('conversation_id, id')
      .eq('receiver_id', session.user.id)
      .eq('read', false)

    if (error) {
      console.error('Error loading unread counts:', error)
      return
    }

    // Count messages per conversation
    const counts = {}
    unreadMessages?.forEach(msg => {
      counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1
    })

    setUnreadCounts(counts)
  }

  async function startNewConversation(otherUser) {
    // Check if conversation already exists in local state
    const existingLocal = conversations.find(c => 
      (c.landlord_id === session.user.id && c.tenant_id === otherUser.id) ||
      (c.tenant_id === session.user.id && c.landlord_id === otherUser.id)
    )

    if (existingLocal) {
      setSelectedConversation(existingLocal)
      setShowNewConversation(false)
      return
    }

    // Check in database for any existing conversation between these two users
    const { data: existingConversations, error: fetchError } = await supabase
      .from('conversations')
      .select('*, property:properties(title, address)')
      .or(`and(landlord_id.eq.${session.user.id},tenant_id.eq.${otherUser.id}),and(landlord_id.eq.${otherUser.id},tenant_id.eq.${session.user.id})`)

    if (fetchError) {
      console.error('Error checking existing conversations:', fetchError)
    }

    // Find a conversation that's not hidden by current user
    const existingDb = existingConversations?.find(conv => {
      const isLandlord = conv.landlord_id === session.user.id
      const isTenant = conv.tenant_id === session.user.id
      
      // Skip if hidden by current user
      if (isLandlord && conv.hidden_by_landlord) return false
      if (isTenant && conv.hidden_by_tenant) return false
      
      return true
    })

    if (existingDb) {
      // Get profiles for this conversation
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', [existingDb.landlord_id, existingDb.tenant_id])

      const profileMap = {}
      profiles?.forEach(p => { profileMap[p.id] = p })

      const isLandlord = existingDb.landlord_id === session.user.id
      const otherUserId = isLandlord ? existingDb.tenant_id : existingDb.landlord_id

      const enrichedConv = {
        ...existingDb,
        landlord_profile: profileMap[existingDb.landlord_id],
        tenant_profile: profileMap[existingDb.tenant_id],
        other_user: profileMap[otherUserId],
        other_user_id: otherUserId
      }

      // If conversation was hidden, unhide it
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

    // Create new conversation
    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        property_id: null,
        landlord_id: session.user.id,
        tenant_id: otherUser.id
      })
      .select('*, property:properties(title, address)')
      .single()

    if (error) {
      console.error('Error creating conversation:', error)
      
      // Try to fetch the conversation that might have been created by the other user
      const { data: retryConversations } = await supabase
        .from('conversations')
        .select('*, property:properties(title, address)')
        .or(`and(landlord_id.eq.${session.user.id},tenant_id.eq.${otherUser.id}),and(landlord_id.eq.${otherUser.id},tenant_id.eq.${session.user.id})`)

      const retryConv = retryConversations?.[0]
      
      if (retryConv) {
        // Get profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('id', [retryConv.landlord_id, retryConv.tenant_id])

        const profileMap = {}
        profiles?.forEach(p => { profileMap[p.id] = p })

        const isLandlord = retryConv.landlord_id === session.user.id
        const otherUserId = isLandlord ? retryConv.tenant_id : retryConv.landlord_id

        const enrichedConv = {
          ...retryConv,
          landlord_profile: profileMap[retryConv.landlord_id],
          tenant_profile: profileMap[retryConv.tenant_id],
          other_user: profileMap[otherUserId],
          other_user_id: otherUserId
        }

        setConversations([enrichedConv, ...conversations])
        setSelectedConversation(enrichedConv)
        setShowNewConversation(false)
        return
      }
      
      toast.error('Failed to start conversation. Please try again.')
    } else {
      // Get profiles for the new conversation
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', [newConv.landlord_id, newConv.tenant_id])

      const profileMap = {}
      profiles?.forEach(p => { profileMap[p.id] = p })

      const isLandlord = newConv.landlord_id === session.user.id
      const otherUserId = isLandlord ? newConv.tenant_id : newConv.landlord_id

      const enrichedConv = {
        ...newConv,
        landlord_profile: profileMap[newConv.landlord_id],
        tenant_profile: profileMap[newConv.tenant_id],
        other_user: profileMap[otherUserId],
        other_user_id: otherUserId
      }

      setConversations([enrichedConv, ...conversations])
      setSelectedConversation(enrichedConv)
      setShowNewConversation(false)
    }
  }

  async function loadMessages(conversationId) {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey(full_name, role)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading messages:', error)
    } else {
      setMessages(data || [])
      // Mark messages as read
      await supabase
        .from('messages')
        .update({ read: true })
        .eq('conversation_id', conversationId)
        .eq('receiver_id', session.user.id)
      
      // Clear unread count for this conversation
      setUnreadCounts(prev => ({
        ...prev,
        [conversationId]: 0
      }))
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedConversation) return

    const messageText = newMessage.trim()
    // Receiver is the OTHER person in the conversation (not me!)
    const receiverId = selectedConversation.other_user_id

    // Clear input immediately for better UX
    setNewMessage('')

    // Create optimistic message object
    const optimisticMessage = {
      id: `temp-${Date.now()}`, // Temporary ID
      conversation_id: selectedConversation.id,
      sender_id: session.user.id,
      receiver_id: receiverId,
      message: messageText,
      read: false,
      created_at: new Date().toISOString(),
      sender: {
        full_name: profile.full_name,
        role: profile.role
      }
    }

    // Add message to UI immediately (optimistic update)
    setMessages(prev => [...prev, optimisticMessage])

    // Scroll to bottom
    setTimeout(() => {
      const messagesContainer = document.querySelector('.messages-container')
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight
      }
    }, 50)

    // Send to database
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: selectedConversation.id,
        sender_id: session.user.id,
        receiver_id: receiverId,
        message: messageText
      })
      .select()
      .single()

    if (error) {
      console.error('Error sending message:', error)
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id))
      toast.error('Failed to send message')
      // Restore the message text
      setNewMessage(messageText)
    } else {
      // Replace optimistic message with real one
      setMessages(prev => prev.map(m => 
        m.id === optimisticMessage.id ? data : m
      ))
      
      // Update conversation timestamp
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', selectedConversation.id)
    }
  }

  function confirmDeleteConversation(conversationId) {
    setDeleteConfirmId(conversationId)
  }

  async function deleteConversation(conversationId) {
    setDeleteConfirmId(null)
    
    // Find the conversation to determine user's role in it
    const conversation = conversations.find(c => c.id === conversationId)
    if (!conversation) {
      toast.error('Conversation not found')
      return
    }
    
    // Soft delete: hide based on which participant is the current user
    const isLandlord = conversation.landlord_id === session.user.id
    const isTenant = conversation.tenant_id === session.user.id
    const updateField = isLandlord ? 'hidden_by_landlord' : 'hidden_by_tenant'
    
    const { error } = await supabase
      .from('conversations')
      .update({ [updateField]: true })
      .eq('id', conversationId)

    if (error) {
      console.error('Error hiding conversation:', error)
      toast.error('Failed to delete conversation. Please try again.')
    } else {
      // Remove from local state
      setConversations(prev => prev.filter(c => c.id !== conversationId))
      
      // Clear selection if this was the selected conversation
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(null)
        setMessages([])
      }
      
      toast.success('Conversation deleted successfully')
    }
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="inline-block animate-spin h-12 w-12 border-b-2 border-black"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white ">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <h1 className="text-xl sm:text-5xl font-bold text-black">Messages</h1>
          <p className="text-xs sm:text-sm text-black">
            {profile.role === 'landlord' 
              ? 'Chat with your tenants' 
              : 'Chat with landlords about properties'}
          </p>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="bg-white border-2 border-black overflow-hidden" style={{ height: 'calc(95vh - 190px)' }}>
          <div className="flex flex-col md:flex-row h-full">
            {/* Conversations List */}
            <div className={`${selectedConversation ? 'hidden md:block' : 'block'} w-full md:w-70 border-b md:border-b-0 md:border-r border-black overflow-y-auto`}>
              <div className="p-2 sm:p-5 border-b border-black bg-white flex justify-between items-center">
                <h2 className="font-semibold text-black text-sm sm:text-base">
                  {showNewConversation ? 'Start New Chat' : 'Conversations'}
                </h2>
                {!showNewConversation && (
                  <button
                    onClick={() => setShowNewConversation(true)}
                    className="text-black text-xs sm:text-sm font-medium"
                  >
                    + New
                  </button>
                )}
                {showNewConversation && (
                  <button
                    onClick={() => {
                      setShowNewConversation(false)
                      setSearchQuery('')
                    }}
                    className="text-black text-xs sm:text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Search bar for new conversations */}
              {showNewConversation && (
                <div className="p-2 sm:p-3 border-b border-black">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search users by name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 pl-9 sm:pl-10 border-2 border-black focus:outline-none text-xs sm:text-sm"
                    />
                    <svg 
                      className="absolute left-2 sm:left-3 top-2 sm:top-2.5 w-4 h-4 sm:w-5 sm:h-5 text-black" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center p-6 sm:p-8">
                  <div className="inline-block animate-spin h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-black"></div>
                </div>
              ) : showNewConversation ? (
                // Show all users list with search
                <div>
                  {filteredUsers.length === 0 ? (
                    <div className="p-4 sm:p-8 text-center text-black">
                      {searchQuery ? (
                        <div>
                          <p className="mb-2 text-sm sm:text-base">No users found matching your search</p>
                          <p className="text-xs">Try a different search term</p>
                        </div>
                      ) : (
                        <div>
                          <p className="mb-2 text-sm sm:text-base">No other users registered yet</p>
                          <p className="text-xs mb-4">You need at least one other user to start chatting</p>
                          <div className="text-xs bg-white text-black p-2 sm:p-3">
                            💡 Tip: Create another account or ask someone to register to test the chat feature!
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    filteredUsers.map(user => (
                      <div
                        key={user.id}
                        onClick={() => startNewConversation(user)}
                        className="p-3 sm:p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-xs sm:text-sm text-black truncate">{user.full_name}</div>
                            {user.phone && (
                              <div className="text-xs text-black mt-1 truncate">📱 {user.phone}</div>
                            )}
                          </div>
                          <span className={`px-2 py-1 text-xs font-medium ml-2 flex-shrink-0 ${
                            user.role === 'landlord' 
                              ? 'bg-white text-black' 
                              : 'bg-black text-white'
                          }`}>
                            {user.role}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-4 sm:p-8 text-center text-black">
                  <p className="mb-2 text-sm sm:text-base">No conversations yet</p>
                  <p className="text-xs sm:text-sm">
                    Click "+ New" to start chatting with any user
                  </p>
                </div>
              ) : (
                <div>
                  {conversations.map(conv => {
                    const otherPerson = conv.other_user?.full_name || 'Unknown User'
                    const unreadCount = unreadCounts[conv.id] || 0
                    const hasUnread = unreadCount > 0
                    
                    return (
                      <div
                        key={conv.id}
                        onClick={() => {
                          setSelectedConversation(conv)
                          setShowNewConversation(false)
                        }}
                        className={`p-3 sm:p-4 border-b border-gray-100 cursor-pointer relative ${
                          selectedConversation?.id === conv.id 
                            ? 'bg-white border-l-4 border-l-black' 
                            : hasUnread
                            ? 'bg-gray-50 border-l-4 border-l-black font-semibold'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs sm:text-sm text-black truncate ${hasUnread ? 'font-bold' : 'font-semibold'}`}>
                              {otherPerson}
                            </div>
                            <div className="text-xs text-black mt-1">
                              {conv.other_user?.role === 'landlord' ? '🏠 Landlord' : '👤 Tenant'}
                            </div>
                            {conv.property && (
                              <div className="text-xs text-black mt-1 truncate">{conv.property?.title}</div>
                            )}
                          </div>
                          {hasUnread && (
                            <div className="ml-2 flex-shrink-0">
                              <span className="bg-black text-white text-xs w-6 h-6 flex items-center justify-center border border-black font-bold">
                                {unreadCount > 9 ? '9+' : unreadCount}
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

            {/* Messages Area */}
            <div className={`${selectedConversation ? 'flex' : 'hidden md:flex'} flex-1 flex-col w-full md:w-auto`}>
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-3 sm:p-4 border-b border-black bg-white flex justify-between items-center">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {/* Back button for mobile */}
                      <button
                        onClick={() => setSelectedConversation(null)}
                        className="md:hidden flex-shrink-0 text-black"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-black text-sm sm:text-base truncate">
                          {selectedConversation.other_user?.full_name || 'Unknown User'}
                        </div>
                        {selectedConversation.property?.title && (
                          <div className="text-xs sm:text-sm text-black truncate">
                            {selectedConversation.property?.title}
                          </div>
                        )}
                      </div>
                    </div>
                    {deleteConfirmId === selectedConversation.id ? (
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <span className="text-xs sm:text-sm text-black mr-1 sm:mr-2 hidden sm:inline">Delete conversation?</span>
                        <button
                          onClick={() => deleteConversation(selectedConversation.id)}
                          className="text-white bg-black text-xs font-medium px-2 sm:px-3 py-1"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-black bg-white text-xs font-medium px-2 sm:px-3 py-1"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => confirmDeleteConversation(selectedConversation.id)}
                        className="text-black text-xs sm:text-sm font-medium px-2 sm:px-3 py-1 flex-shrink-0"
                        title="Delete conversation"
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 messages-container">
                    {messages.map(msg => {
                      const isOwn = msg.sender_id === session.user.id
                      
                      return (
                        <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div 
                            style={{ 
                              borderRadius: '16px',
                              overflow: 'hidden'
                            }}
                            className={`max-w-[85%] sm:max-w-xs lg:max-w-md px-3 sm:px-4 py-2 ${
                              isOwn 
                                ? 'bg-black text-white' 
                                : 'bg-black text-white'
                            }`}
                          >
                            <div className="text-xs sm:text-sm break-words">{msg.message}</div>
                            <div className="text-xs mt-1 text-white opacity-70">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Message Input */}
                  <div className="p-2 sm:p-4 border-t border-black bg-white">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Type a message..."
                        className="flex-1 border-2 border-black px-2 sm:px-4 py-2 focus:outline-none text-xs sm:text-sm"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim()}
                        className="px-3 sm:px-6 py-2 bg-black text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm flex-shrink-0 rounded-[8px]"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-black text-sm sm:text-base px-4 text-center">
                  Select a conversation to start chatting
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
