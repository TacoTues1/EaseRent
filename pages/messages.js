import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'

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
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [unreadCounts, setUnreadCounts] = useState({}) // { conversationId: count }
  const [imageModal, setImageModal] = useState(null) // For viewing images
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
          async (payload) => {
            // Update unread count for this conversation
            loadUnreadCounts()
            
            // Update conversation timestamp without full reload
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
  }, [profile])

  useEffect(() => {
    // Filter users based on search query
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
      loadMessages(selectedConversation.id)
      
      // Subscribe to new messages with better error handling
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
            // Fetch the complete message with sender details
            const { data: newMessage, error } = await supabase
              .from('messages')
              .select(`
                *,
                sender:profiles!messages_sender_id_fkey(first_name, middle_name, last_name, role)
              `)
              .eq('id', payload.new.id)
              .single()
            
            if (error) {
              return
            }
            
            if (newMessage) {
              setMessages(prev => {
                // Check if message already exists (avoid duplicates)
                const exists = prev.some(m => m.id === newMessage.id)
                if (exists) {
                  return prev
                }
                return [...prev, newMessage]
              })
              
              // Auto-scroll to bottom on new message
              setTimeout(() => {
                const messagesContainer = document.querySelector('.messages-container')
                if (messagesContainer) {
                  messagesContainer.scrollTop = messagesContainer.scrollHeight
                }
              }, 100)
              
              // Mark as read if current user is the receiver
              if (newMessage.receiver_id === session.user.id) {
                await supabase
                  .from('messages')
                  .update({ read: true })
                  .eq('id', newMessage.id)
                
                // Update unread count
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
            // Update the message in the local state
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
        .select('id, first_name, middle_name, last_name, role')
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
    
    // Load all users except the current user
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, first_name, middle_name, last_name, role, phone')
      .neq('id', session.user.id)
      .order('first_name')

    if (error) {
      console.error('Error loading users:', error)
      return
    }

    
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
        .select('id, first_name, middle_name, last_name, role')
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
          .select('id, first_name, middle_name, last_name, role')
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
        .select('id, first_name, middle_name, last_name, role')
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
        sender:profiles!messages_sender_id_fkey(first_name, middle_name, last_name, role)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading messages:', error)
    } else {
      setMessages(data || [])
      
      // Find the latest message from the other user (where current user is receiver)
      const messagesFromOther = (data || []).filter(msg => msg.receiver_id === session.user.id)
      if (messagesFromOther.length > 0) {
        const latestMessage = messagesFromOther[messagesFromOther.length - 1]
        
        // Only mark the latest message as read
        await supabase
          .from('messages')
          .update({ read: true })
          .eq('id', latestMessage.id)
      }
      
      // Clear unread count for this conversation
      setUnreadCounts(prev => ({
        ...prev,
        [conversationId]: 0
      }))
      
      // Scroll to bottom after loading messages
      setTimeout(() => {
        const messagesContainer = document.querySelector('.messages-container')
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight
        }
      }, 100)
    }
  }

  function handleFileSelect(e) {
    const newFiles = Array.from(e.target.files)
    
    // Combine with existing files
    const allFiles = [...selectedFiles, ...newFiles]
    
    // Limit to 5 files total
    if (allFiles.length > 5) {
      toast.error('You can only upload up to 5 files at a time')
      // Reset the input
      e.target.value = ''
      return
    }
    
    // Check each file size (max 10MB per file)
    const invalidFiles = newFiles.filter(file => file.size > 10 * 1024 * 1024)
    if (invalidFiles.length > 0) {
      toast.error('Each file must be less than 10MB')
      // Reset the input
      e.target.value = ''
      return
    }
    
    setSelectedFiles(allFiles)
  }

  function removeSelectedFile(index) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    // Reset file input
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

    if (error) {
      throw error
    }

    // Create a signed URL that expires in 1 year
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('message-attachments')
      .createSignedUrl(filePath, 31536000) // 1 year in seconds

    if (urlError) {
      // Fallback to public URL if signed URL fails
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

  async function sendMessage() {
    // Trim and clean the message to remove extra whitespace
    const trimmedMessage = newMessage.trim().replace(/\s+/g, ' ')
    
    if (!trimmedMessage && selectedFiles.length === 0) return
    if (!selectedConversation) return

    const messageText = trimmedMessage
    const receiverId = selectedConversation.other_user_id
    
    setUploadingFile(true)
    
    try {
      let uploadedFiles = []
      
      // Upload all selected files
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const fileData = await uploadFile(file, selectedConversation.id)
          uploadedFiles.push(fileData)
        }
      }

      // Clear inputs immediately for better UX
      setNewMessage('')
      const tempFiles = [...selectedFiles]
      setSelectedFiles([])
      
      // Reset file input
      const fileInput = document.getElementById('file-input')
      if (fileInput) fileInput.value = ''

      // Send message with text or files
      if (uploadedFiles.length > 0) {
        // Send a message for each file
        for (let i = 0; i < uploadedFiles.length; i++) {
          const fileData = uploadedFiles[i]
          // Only include message text with the first file
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

          // Add message to UI immediately
          setMessages(prev => [...prev, optimisticMessage])

          // Send to database
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
            toast.error('Failed to send file: ' + fileData.name)
          } else {
            // Replace optimistic message with real one
            setMessages(prev => prev.map(m => 
              m.id === optimisticMessage.id ? { ...data, sender: { first_name: profile.first_name, last_name: profile.last_name, role: profile.role } } : m
            ))
          }
        }
      } else if (messageText) {
        // Send text-only message
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
          toast.error('Failed to send message')
          setNewMessage(messageText)
        } else {
          setMessages(prev => prev.map(m => 
            m.id === optimisticMessage.id ? { ...data, sender: { first_name: profile.first_name, last_name: profile.last_name, role: profile.role } } : m
          ))
        }
      }

      // Update conversation timestamp
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', selectedConversation.id)
      
      // Scroll to bottom after sending
      setTimeout(() => {
        const messagesContainer = document.querySelector('.messages-container')
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight
        }
      }, 100)
    } catch (err) {
      console.error('Error in sendMessage:', err)
      toast.error(err.message || 'Failed to send message')
    } finally {
      setUploadingFile(false)
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
      <div className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-0 sm:py-6">
        <div className="bg-white border-0 sm:border-2 border-black overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
          <div className="flex flex-col md:flex-row h-full">
            {/* Conversations List */}
            <div className={`${selectedConversation ? 'hidden md:block' : 'flex flex-col'} w-full md:w-1/3 border-b md:border-b-0 md:border-r border-black h-full`}>
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
                <div className="flex-1 overflow-y-auto">
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
                            <div className="font-semibold text-xs sm:text-sm text-black truncate">{user.first_name} {user.last_name}</div>
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
                <div className="flex-1 overflow-y-auto">
                  {conversations.map(conv => {
                    const otherPerson = conv.other_user ? `${conv.other_user.first_name || ''} ${conv.other_user.last_name || ''}`.trim() : 'Unknown User'
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
            <div className={`${selectedConversation ? 'flex' : 'hidden md:flex'} flex-1 flex-col w-full md:w-auto h-full`}>
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-3 sm:p-4 border-b border-black bg-white flex justify-between items-center flex-shrink-0">
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
                          {selectedConversation.other_user ? `${selectedConversation.other_user.first_name || ''} ${selectedConversation.other_user.last_name || ''}`.trim() : 'Unknown User'}
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
                  <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2 messages-container" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
                    {messages.map((msg, index) => {
                      const isOwn = msg.sender_id === session.user.id
                      const hasFile = msg.file_url && msg.file_name
                      const isImage = msg.file_type?.startsWith('image/')
                      const getSenderFullName = (sender) => sender ? `${sender.first_name || ''} ${sender.last_name || ''}`.trim() : null
                      const senderName = getSenderFullName(msg.sender) || (isOwn ? `${profile.first_name} ${profile.last_name}` : getSenderFullName(selectedConversation.other_user)) || 'Unknown'
                      const senderInitials = senderName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
                      
                      // Find the latest message sent by current user (for "Seen" status)
                      const myMessages = messages.filter(m => m.sender_id === session.user.id)
                      const latestMyMessage = myMessages.length > 0 ? myMessages[myMessages.length - 1] : null
                      const isLatestFromMe = latestMyMessage && msg.id === latestMyMessage.id
                      
                      return (
                        <div key={msg.id} className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                          {/* Profile Avatar - Only show for receiver */}
                          {!isOwn && (
                            <div className="flex-shrink-0">
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white text-xs font-bold bg-gray-600">
                                {senderInitials}
                              </div>
                            </div>
                          )}
                          
                          {/* Message Bubble */}
                          <div className="flex flex-col max-w-[50%] sm:max-w-md">
                            <div 
                              style={{ 
                                borderRadius: '12px',
                                overflow: 'hidden'
                              }}
                              className="px-3 py-1.5 bg-gray-800 text-white"
                            >
                              {msg.message && (
                                <div className="text-xs sm:text-sm" style={{ wordBreak: 'break-word' }}>
                                  {msg.message.trim().replace(/\s+/g, ' ')}
                                </div>
                              )}
                              
                              {hasFile && (
                                <div className="mt-1.5">
                                  {isImage ? (
                                    <div>
                                      <img 
                                        src={msg.file_url} 
                                        alt={msg.file_name}
                                        className="max-w-full rounded border border-white/20 cursor-pointer hover:opacity-90"
                                        style={{ maxHeight: '150px' }}
                                        onClick={() => setImageModal(msg.file_url)}
                                      />
                                      <div className="flex items-center justify-between mt-1">
                                        <div className="text-xs opacity-70 truncate flex-1">
                                          {msg.file_name}
                                        </div>
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation()
                                            try {
                                              const response = await fetch(msg.file_url)
                                              const blob = await response.blob()
                                              const url = window.URL.createObjectURL(blob)
                                              const link = document.createElement('a')
                                              link.href = url
                                              link.download = msg.file_name
                                              document.body.appendChild(link)
                                              link.click()
                                              document.body.removeChild(link)
                                              window.URL.revokeObjectURL(url)
                                              toast.success('Downloaded')
                                            } catch (err) {
                                              console.error('Download failed:', err)
                                              toast.error('Failed to download')
                                            }
                                          }}
                                          className="ml-2 p-1 hover:bg-white/20 rounded flex-shrink-0"
                                          title="Download"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-2 border border-white/20 rounded">
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs truncate font-medium">{msg.file_name}</div>
                                          <div className="text-xs opacity-70 mt-0.5">
                                            {msg.file_size ? `${(msg.file_size / 1024).toFixed(1)} KB` : 'File'}
                                          </div>
                                        </div>
                                        <button
                                          onClick={async () => {
                                            try {
                                              const response = await fetch(msg.file_url)
                                              const blob = await response.blob()
                                              const url = window.URL.createObjectURL(blob)
                                              const link = document.createElement('a')
                                              link.href = url
                                              link.download = msg.file_name
                                              document.body.appendChild(link)
                                              link.click()
                                              document.body.removeChild(link)
                                              window.URL.revokeObjectURL(url)
                                              toast.success('Downloaded')
                                            } catch (err) {
                                              console.error('Download failed:', err)
                                              toast.error('Failed to download')
                                            }
                                          }}
                                          className="ml-2 p-1.5 hover:bg-white/20 rounded flex-shrink-0"
                                          title="Download"
                                        >
                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className={`text-xs mt-0.5 px-1 opacity-60 flex items-center gap-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                              <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {isOwn && isLatestFromMe && (
                                <span className="text-xs">
                                  {msg.read ? '✓✓ Seen' : '✓ Sent'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Message Input */}
                  <div className="p-2 sm:p-4 border-t border-black bg-white flex-shrink-0">
                    {/* File Preview - Compact */}
                    {selectedFiles.length > 0 && (
                      <div className="mb-2">
                        <div className="text-xs text-gray-600 mb-1 font-medium">
                          {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} • Max 5
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {selectedFiles.map((file, index) => {
                            const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
                            return (
                            <div key={index} className="p-1.5 bg-gray-50 border border-gray-300 flex items-center justify-between text-xs w-25">
                              <div className="flex-1 min-w-0 mr-2">
                                <div className="font-medium text-black truncate">{fileNameWithoutExt}</div>
                                <div className="text-gray-500">{(file.size / 1024).toFixed(1)} KB</div>
                              </div>
                              <button
                                onClick={() => removeSelectedFile(index)}
                                className="text-gray-600 hover:text-red-600 flex-shrink-0"
                                title="Remove file"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      {/* File Upload Button */}
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
                        className="px-3 py-2 border-2 border-black cursor-pointer hover:bg-gray-50 flex-shrink-0"
                        title="Attach files (max 5)"
                      >
                        <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      </label>
                      
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !uploadingFile && sendMessage()}
                        placeholder="Type a message..."
                        disabled={uploadingFile}
                        className="flex-1 border-2 border-black px-2 sm:px-4 py-2 focus:outline-none text-xs sm:text-sm disabled:bg-gray-100"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={(!newMessage.trim() && selectedFiles.length === 0) || uploadingFile}
                        className="px-3 sm:px-6 py-2 bg-black text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm flex-shrink-0 rounded-[8px]"
                      >
                        {uploadingFile ? (
                          <div className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="hidden sm:inline">Sending...</span>
                          </div>
                        ) : (
                          'Send'
                        )}
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

      {/* Image Modal */}
      {imageModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setImageModal(null)}
        >
          <button
            onClick={() => setImageModal(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 text-4xl font-light"
            title="Close"
          >
            ×
          </button>
          <img 
            src={imageModal} 
            alt="Full size" 
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
