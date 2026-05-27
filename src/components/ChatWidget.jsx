import React, { useEffect, useMemo, useRef, useState } from 'react'
import { HelpCircle, MessageCircle, Search, Send, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { playNotificationSound } from '../utils/notificationSound'
import './chatWidget.css'

const faqs = [
  {
    question: 'Paano mag-request ng document?',
    answer: 'Pumunta sa Document Request, piliin ang document type, ilagay ang purpose at details, tapos i-submit ang request.'
  },
  {
    question: 'Kailan pwede kunin ang document?',
    answer: 'Kapag Ready o Released na ang status, pwede nang pumunta sa barangay para kunin ang document.'
  },
  {
    question: 'Pwede bang i-edit ang request?',
    answer: 'Pwede lang i-edit habang Submitted pa ang status at hindi pa lumalagpas sa allowed edit window.'
  },
  {
    question: 'Paano mag-file ng complaint?',
    answer: 'Pumunta sa Submit Complaint, punan ang category, description, location, at iba pang detalye, pagkatapos ay i-submit.'
  }
]

const getResidentName = (item) => {
  return item?.resident_name || [item?.first_name, item?.middle_name, item?.last_name].filter(Boolean).join(' ') || item?.email || 'Resident'
}

export default function ChatWidget(){
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('messages')
  const [conversations, setConversations] = useState([])
  const [selectedResidentId, setSelectedResidentId] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const panelRef = useRef(null)
  const messagesEndRef = useRef(null)
  const lastUnreadTotalRef = useRef(null)

  const isAdmin = user?.role === 'admin' || user?.role === 'staff'
  const selectedConversation = useMemo(() => {
    return conversations.find(item => Number(item.resident_id) === Number(selectedResidentId))
  }, [conversations, selectedResidentId])
  const unreadTotal = conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0)
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredConversations = useMemo(() => {
    if(!normalizedSearch) return conversations
    return conversations.filter(item => {
      return [
        getResidentName(item),
        item.email,
        item.last_message
      ].some(value => String(value || '').toLowerCase().includes(normalizedSearch))
    })
  }, [conversations, normalizedSearch])
  const filteredMessages = useMemo(() => {
    if(isAdmin || !normalizedSearch) return messages
    return messages.filter(item => String(item.message || '').toLowerCase().includes(normalizedSearch))
  }, [isAdmin, messages, normalizedSearch])
  const filteredFaqs = useMemo(() => {
    if(!normalizedSearch) return faqs
    return faqs.filter(item => `${item.question} ${item.answer}`.toLowerCase().includes(normalizedSearch))
  }, [normalizedSearch])

  useEffect(() => {
    function onKeyDown(e){
      if(e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if(!user) return
    loadConversations()
    const chatTimer = window.setInterval(() => {
      loadConversations()
      if(open && activeTab === 'messages' && (!isAdmin || selectedResidentId)){
        loadMessages({ silent: true })
      }
    }, 12000)

    return () => window.clearInterval(chatTimer)
  }, [user, open, activeTab, isAdmin, selectedResidentId])

  useEffect(() => {
    if(!open || activeTab !== 'messages') return
    if(isAdmin && !selectedResidentId) return
    loadMessages()
  }, [open, activeTab, selectedResidentId, user])

  useEffect(() => {
    setSearchQuery('')
  }, [activeTab])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  async function loadConversations(){
    if(!user) return
    try {
      const res = await api.get('/chat/conversations')
      const list = Array.isArray(res.data?.data) ? res.data.data : []
      const nextUnreadTotal = list.reduce((sum, item) => sum + Number(item.unread_count || 0), 0)
      if(lastUnreadTotalRef.current !== null && nextUnreadTotal > lastUnreadTotalRef.current){
        playNotificationSound()
      }
      lastUnreadTotalRef.current = nextUnreadTotal
      setConversations(list)
      if(isAdmin && !selectedResidentId && list.length > 0){
        setSelectedResidentId(list[0].resident_id)
      }
    } catch (error) {
      setConversations([])
      lastUnreadTotalRef.current = 0
    }
  }

  async function loadMessages({ silent = false } = {}){
    if(!user) return
    if(!silent) setLoadingMessages(true)
    try {
      const params = isAdmin ? { resident_id: selectedResidentId } : {}
      const res = await api.get('/chat/messages', { params })
      setMessages(Array.isArray(res.data?.data) ? res.data.data : [])
      loadConversations()
    } catch (error) {
      setMessages([])
    }
    if(!silent) setLoadingMessages(false)
  }

  async function sendMessage(e){
    e.preventDefault()
    const message = draft.trim()
    if(!message) return
    if(isAdmin && !selectedResidentId) return

    const optimistic = {
      chat_message_id: `local-${Date.now()}`,
      sender_role: isAdmin ? 'staff' : 'resident',
      message,
      date_created: new Date().toISOString()
    }
    setMessages(prev => [...prev, optimistic])
    setDraft('')

    try {
      await api.post('/chat/messages', {
        message,
        ...(isAdmin ? { resident_id: selectedResidentId } : {})
      })
      await loadMessages()
    } catch (error) {
      setMessages(prev => prev.filter(item => item.chat_message_id !== optimistic.chat_message_id))
      setDraft(message)
    }
  }

  if(!user) return null

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel" ref={panelRef} role="dialog" aria-label="Messages and FAQs">
          <div className="chat-panel-header">
            <div>
              <div className="chat-panel-title">Support</div>
              <div className="chat-panel-subtitle">{isAdmin ? 'Admin messages' : 'Message the admin'}</div>
            </div>
            <button type="button" className="chat-icon-btn" onClick={() => setOpen(false)} aria-label="Close chat">
              <X size={18} />
            </button>
          </div>

          <div className="chat-tabs" role="tablist" aria-label="Support tabs">
            <button type="button" className={activeTab === 'messages' ? 'active' : ''} onClick={() => setActiveTab('messages')}>
              <MessageCircle size={16} /> Messages
            </button>
            <button type="button" className={activeTab === 'faq' ? 'active' : ''} onClick={() => setActiveTab('faq')}>
              <HelpCircle size={16} /> FAQs
            </button>
          </div>

          {activeTab === 'messages' ? (
            <div className="chat-body">
              {isAdmin && (
                <div className="chat-conversation-pane">
                  <label className="chat-search">
                    <Search size={15} />
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search residents"
                    />
                  </label>
                  <div className="chat-conversation-list">
                  {conversations.length === 0 ? (
                    <div className="chat-empty-small">No residents yet.</div>
                  ) : filteredConversations.length === 0 ? (
                    <div className="chat-empty-small">No matching residents.</div>
                  ) : filteredConversations.map(item => (
                    <button
                      key={item.resident_id}
                      type="button"
                      className={`chat-conversation ${Number(selectedResidentId) === Number(item.resident_id) ? 'active' : ''}`}
                      onClick={() => setSelectedResidentId(item.resident_id)}
                    >
                      <span>{getResidentName(item)}</span>
                      {Number(item.unread_count) > 0 && <strong>{item.unread_count}</strong>}
                    </button>
                  ))}
                  </div>
                </div>
              )}

              <div className="chat-thread">
                {isAdmin && !selectedResidentId ? (
                  <div className="chat-empty">Select a resident to start chatting.</div>
                ) : (
                  <>
                    {isAdmin && selectedConversation && (
                      <div className="chat-thread-title">{getResidentName(selectedConversation)}</div>
                    )}
                    {!isAdmin && (
                      <div className="chat-thread-search-row">
                        <label className="chat-search">
                          <Search size={15} />
                          <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search messages"
                          />
                        </label>
                      </div>
                    )}
                    <div className="chat-messages">
                      {loadingMessages ? (
                        <div className="chat-empty">Loading messages...</div>
                      ) : messages.length === 0 ? (
                        <div className="chat-empty">No messages yet.</div>
                      ) : filteredMessages.length === 0 ? (
                        <div className="chat-empty">No matching messages.</div>
                      ) : filteredMessages.map(item => {
                        const mine = isAdmin ? item.sender_role === 'staff' : item.sender_role === 'resident'
                        return (
                          <div key={item.chat_message_id} className={`chat-message ${mine ? 'mine' : 'theirs'}`}>
                            <div className="chat-bubble">{item.message}</div>
                            <div className="chat-time">{item.date_created ? new Date(item.date_created).toLocaleString() : ''}</div>
                          </div>
                        )
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                    <form className="chat-compose" onSubmit={sendMessage}>
                      <input
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        placeholder={isAdmin ? 'Reply to resident' : 'Type your message'}
                        maxLength={1000}
                      />
                      <button type="submit" aria-label="Send message" disabled={!draft.trim()}>
                        <Send size={18} />
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="faq-list">
              <label className="chat-search faq-search">
                <Search size={15} />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search FAQs"
                />
              </label>
              {filteredFaqs.length === 0 ? (
                <div className="chat-empty">No matching FAQs.</div>
              ) : filteredFaqs.map(item => (
                <details key={item.question} className="faq-item">
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      <button type="button" className="chat-fab" onClick={() => setOpen(v => !v)} aria-label="Open messages">
        <MessageCircle size={24} />
        {unreadTotal > 0 && (
          <span className="chat-fab-badge" aria-hidden="true">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>
    </div>
  )
}
