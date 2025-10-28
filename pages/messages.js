import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/router'

export default function Messages() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [conversations, setConversations] = useState([])
  const [allTenants, setAllTenants] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [selectedTenant, setSelectedTenant] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNewConversation, setShowNewConversation] = useState(false)
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
      if (profile.role === 'landlord') {
        loadAllTenants()
      }
    }
  }, [profile])

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
    
    // Get conversations where user is either landlord or tenant
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*, property:properties(title, address)')
      .or(`landlord_id.eq.${session.user.id},tenant_id.eq.${session.user.id}`)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error loading conversations:', error)
      setLoading(false)
      return
    }

    if (conversations && conversations.length > 0) {
      // Get all unique user IDs (both landlords and tenants)
      const userIds = new Set()
      conversations.forEach(conv => {
        userIds.add(conv.landlord_id)
        userIds.add(conv.tenant_id)
      })

      // Fetch all profiles at once
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(userIds))

      if (profileError) {
        console.error('Error loading profiles:', profileError)
      }

      // Create profile map
      const profileMap = {}
      profiles?.forEach(p => {
        profileMap[p.id] = p
      })

      // Attach profiles to conversations
      const enrichedConversations = conversations.map(conv => ({
        ...conv,
        landlord_profile: profileMap[conv.landlord_id],
        tenant_profile: profileMap[conv.tenant_id]
      }))

      setConversations(enrichedConversations)
      if (enrichedConversations.length > 0) {
        setSelectedConversation(enrichedConversations[0])
      }
    } else {
      setConversations([])
    }
    
    setLoading(false)
  }

  async function loadAllTenants() {
    // Load all tenants who have applied to landlord's properties
    const { data: myProperties } = await supabase
      .from('properties')
      .select('id')
      .eq('landlord', session.user.id)

    if (myProperties && myProperties.length > 0) {
      const propertyIds = myProperties.map(p => p.id)
      
      // First get all applications
      const { data: applicants, error: appError } = await supabase
        .from('applications')
        .select('tenant, property_id, property:properties(title, address)')
        .in('property_id', propertyIds)

      if (appError) {
        console.error('Error loading applications:', appError)
        return
      }

      if (applicants && applicants.length > 0) {
        // Get unique tenant IDs
        const tenantIds = [...new Set(applicants.map(a => a.tenant))]
        
        // Fetch tenant profiles
        const { data: tenantProfiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', tenantIds)

        if (profileError) {
          console.error('Error loading tenant profiles:', profileError)
          return
        }

        // Create a map of tenant profiles
        const profileMap = {}
        tenantProfiles?.forEach(profile => {
          profileMap[profile.id] = profile
        })

        // Combine data and remove duplicates
        const uniqueTenants = Array.from(
          new Map(applicants.map(a => [a.tenant, {
            id: a.tenant,
            full_name: profileMap[a.tenant]?.full_name || 'Unknown Tenant',
            property_id: a.property_id,
            property: a.property
          }])).values()
        )
        
        console.log('Loaded tenants:', uniqueTenants)
        setAllTenants(uniqueTenants)
      }
    }
  }

  async function startNewConversation(tenant) {
    // Check if conversation already exists in local state
    const existingLocal = conversations.find(c => 
      c.tenant_id === tenant.id && c.landlord_id === session.user.id
    )

    if (existingLocal) {
      setSelectedConversation(existingLocal)
      setShowNewConversation(false)
      return
    }

    // Also check in database for any existing conversation
    const { data: existingDb } = await supabase
      .from('conversations')
      .select('*, property:properties(title, address)')
      .eq('landlord_id', session.user.id)
      .eq('tenant_id', tenant.id)
      .maybeSingle()

    if (existingDb) {
      // Get profiles for this conversation
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', [existingDb.landlord_id, existingDb.tenant_id])

      const profileMap = {}
      profiles?.forEach(p => { profileMap[p.id] = p })

      const enrichedConv = {
        ...existingDb,
        landlord_profile: profileMap[existingDb.landlord_id],
        tenant_profile: profileMap[existingDb.tenant_id]
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
        property_id: tenant.property_id,
        landlord_id: session.user.id,
        tenant_id: tenant.id
      })
      .select('*, property:properties(title, address)')
      .single()

    if (error) {
      console.error('Error creating conversation:', error)
      // If still getting conflict, try to fetch the conversation that was created
      if (error.code === '23505') { // Unique constraint violation
        const { data: conflictConv } = await supabase
          .from('conversations')
          .select('*, property:properties(title, address)')
          .eq('landlord_id', session.user.id)
          .eq('tenant_id', tenant.id)
          .single()
        
        if (conflictConv) {
          // Get profiles
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', [conflictConv.landlord_id, conflictConv.tenant_id])

          const profileMap = {}
          profiles?.forEach(p => { profileMap[p.id] = p })

          const enrichedConv = {
            ...conflictConv,
            landlord_profile: profileMap[conflictConv.landlord_id],
            tenant_profile: profileMap[conflictConv.tenant_id]
          }

          setConversations([enrichedConv, ...conversations])
          setSelectedConversation(enrichedConv)
          setShowNewConversation(false)
          return
        }
      }
      alert('Failed to start conversation. Please try again.')
    } else {
      // Get profiles for the new conversation
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', [newConv.landlord_id, newConv.tenant_id])

      const profileMap = {}
      profiles?.forEach(p => { profileMap[p.id] = p })

      const enrichedConv = {
        ...newConv,
        landlord_profile: profileMap[newConv.landlord_id],
        tenant_profile: profileMap[newConv.tenant_id]
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
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedConversation) return

    const receiverId = profile.role === 'landlord' 
      ? selectedConversation.tenant_id 
      : selectedConversation.landlord_id

    const { error } = await supabase
      .from('messages')
      .insert({
        conversation_id: selectedConversation.id,
        sender_id: session.user.id,
        receiver_id: receiverId,
        message: newMessage.trim()
      })

    if (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message')
    } else {
      setNewMessage('')
      // Update conversation timestamp
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', selectedConversation.id)
    }
  }

  async function deleteConversation(conversationId) {
    if (!confirm('Are you sure you want to delete this conversation? This will delete all messages.')) {
      return
    }

    // First, manually delete all messages in the conversation
    const { error: messagesError } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId)

    if (messagesError) {
      console.error('Error deleting messages:', messagesError)
    }

    // Then delete the conversation
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)

    if (error) {
      console.error('Error deleting conversation:', error)
      alert('Failed to delete conversation. Please try again.')
    } else {
      // Remove from local state using functional update to ensure latest state
      setConversations(prev => prev.filter(c => c.id !== conversationId))
      
      // Clear selection if this was the selected conversation
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(null)
        setMessages([])
      }
      
      console.log('Conversation deleted successfully')
    }
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-sm text-gray-600">
            {profile.role === 'landlord' 
              ? 'Chat with your tenants' 
              : 'Chat with landlords about properties'}
          </p>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden" style={{ height: 'calc(100vh - 250px)' }}>
          <div className="flex h-full">
            {/* Conversations List */}
            <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h2 className="font-semibold text-gray-900">
                  {showNewConversation ? 'Select User to Chat' : 'Conversations'}
                </h2>
                {profile.role === 'landlord' && !showNewConversation && (
                  <button
                    onClick={() => setShowNewConversation(true)}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    + New
                  </button>
                )}
                {showNewConversation && (
                  <button
                    onClick={() => setShowNewConversation(false)}
                    className="text-gray-600 hover:text-gray-700 text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : showNewConversation ? (
                // Show all tenants list
                <div>
                  {allTenants.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm">
                      No tenants have applied to your properties yet
                    </div>
                  ) : (
                    allTenants.map(tenant => (
                      <div
                        key={tenant.id}
                        onClick={() => startNewConversation(tenant)}
                        className="p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition"
                      >
                        <div className="font-semibold text-sm text-gray-900">{tenant.full_name}</div>
                        <div className="text-xs text-gray-600 mt-1">{tenant.property?.title}</div>
                        <div className="text-xs text-gray-500 mt-1">{tenant.property?.address}</div>
                      </div>
                    ))
                  )}
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p className="mb-2">No conversations yet</p>
                  <p className="text-sm">
                    {profile.role === 'tenant' 
                      ? 'Apply to a property to start chatting with landlords' 
                      : 'Click "+ New" to start a conversation with a tenant'}
                  </p>
                </div>
              ) : (
                <div>
                  {conversations.map(conv => {
                    const otherPerson = profile.role === 'landlord' 
                      ? conv.tenant_profile?.full_name 
                      : conv.landlord_profile?.full_name
                    
                    return (
                      <div
                        key={conv.id}
                        onClick={() => {
                          setSelectedConversation(conv)
                          setShowNewConversation(false)
                        }}
                        className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition ${
                          selectedConversation?.id === conv.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="font-semibold text-sm text-gray-900">{otherPerson}</div>
                        <div className="text-xs text-gray-600 mt-1">{conv.property?.title}</div>
                        <div className="text-xs text-gray-500 mt-1">{conv.property?.address}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 flex flex-col">
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {profile.role === 'landlord' 
                          ? selectedConversation.tenant_profile?.full_name 
                          : selectedConversation.landlord_profile?.full_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {selectedConversation.property?.title}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteConversation(selectedConversation.id)}
                      className="text-red-600 hover:text-red-700 text-sm font-medium px-3 py-1 rounded hover:bg-red-50 transition"
                      title="Delete conversation"
                    >
                      🗑️ Delete
                    </button>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map(msg => {
                      const isOwn = msg.sender_id === session.user.id
                      
                      return (
                        <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                            isOwn 
                              ? 'bg-blue-600 text-white' 
                              : 'bg-gray-200 text-gray-900'
                          }`}>
                            <div className="text-sm">{msg.message}</div>
                            <div className={`text-xs mt-1 ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Message Input */}
                  <div className="p-4 border-t border-gray-200 bg-white">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Type a message..."
                        className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim()}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
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
