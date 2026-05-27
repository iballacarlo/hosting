import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCheck, Copy, Edit3, HelpCircle, MessageCircle, MoreHorizontal, Reply, Search, Send, Trash2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { playNotificationSound } from '../utils/notificationSound'
import './chatWidget.css'

const EDIT_WINDOW_MS = 5 * 60 * 1000
const reactions = [
  { key: 'heart', label: 'Heart', icon: '❤️' },
  { key: 'like', label: 'Like', icon: '👍' },
  { key: 'haha', label: 'Haha', icon: '😂' },
  { key: 'wow', label: 'Wow', icon: '😮' },
  { key: 'sad', label: 'Sad', icon: '😢' },
  { key: 'angry', label: 'Angry', icon: '😡' }
]

const faqs = [
  {
    question: 'How do I request a document?',
    answer: 'Go to Document Request, choose the document type, enter the purpose and required details, then submit the request.'
  },
  {
    question: 'When can I pick up my document?',
    answer: 'You can pick it up at the barangay once the request status is Ready or Released.'
  },
  {
    question: 'Can I edit my request?',
    answer: 'You can edit a request only while it is still Submitted and still within the allowed edit window.'
  },
  {
    question: 'How do I file a complaint?',
    answer: 'Go to Submit Complaint, fill in the category, description, location, and other details, then submit it.'
  }
]

const getResidentName = (item) => {
  return item?.resident_name || [item?.first_name, item?.middle_name, item?.last_name].filter(Boolean).join(' ') || item?.email || 'Resident'
}

const formatPresence = (lastSeenAt, isOnline) => {
  if(isOnline) return 'Online'
  if(!lastSeenAt) return 'Offline'

  const date = new Date(lastSeenAt)
  if(Number.isNaN(date.getTime())) return 'Offline'

  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000))
  if(diffMinutes < 60) return `Online ${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if(diffHours < 24) return `Online ${diffHours} hr${diffHours === 1 ? '' : 's'} ago`

  return `Online ${Math.floor(diffHours / 24)} day${diffHours < 48 ? '' : 's'} ago`
}

const isDeleted = (message) => Boolean(message?.deleted_at)
const getReactionIcon = (key) => reactions.find(item => item.key === key)?.icon || key
const parseReactionSummary = (summary = '') => {
  return String(summary || '').split(',').filter(Boolean).map(item => {
    const [reaction, count] = item.split(':')
    return { reaction, count: Number(count || 0) }
  }).filter(item => item.reaction && item.count > 0)
}

export default function ChatWidget(){
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('messages')
  const [conversations, setConversations] = useState([])
  const [selectedResidentId, setSelectedResidentId] = useState(null)
  const [showConversationPicker, setShowConversationPicker] = useState(false)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [activeMenuId, setActiveMenuId] = useState(null)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [replyToMessage, setReplyToMessage] = useState(null)
  const [searchMatchIndex, setSearchMatchIndex] = useState(0)
  const panelRef = useRef(null)
  const messagesEndRef = useRef(null)
  const messageRefs = useRef({})
  const longPressTimerRef = useRef(null)
  const lastUnreadTotalRef = useRef(null)

  const isAdmin = user?.role === 'admin' || user?.role === 'staff'
  const selectedConversation = useMemo(() => {
    return conversations.find(item => Number(item.resident_id) === Number(selectedResidentId))
  }, [conversations, selectedResidentId])
  const unreadTotal = conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0)
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const selectedPresence = isAdmin
    ? formatPresence(selectedConversation?.last_seen_at, Number(selectedConversation?.is_online) === 1)
    : formatPresence(selectedConversation?.staff_last_seen_at, Number(selectedConversation?.staff_is_online) === 1)

  const filteredConversations = useMemo(() => {
    if(!normalizedSearch) return conversations
    return conversations.filter(item => {
      return [
        getResidentName(item),
        item.email,
        item.last_message_deleted_at ? 'Message deleted' : item.last_message
      ].some(value => String(value || '').toLowerCase().includes(normalizedSearch))
    })
  }, [conversations, normalizedSearch])

  const messageMatches = useMemo(() => {
    if(!normalizedSearch || activeTab !== 'messages' || showConversationPicker) return []
    return messages
      .filter(item => !isDeleted(item) && String(item.message || '').toLowerCase().includes(normalizedSearch))
      .map(item => item.chat_message_id)
  }, [activeTab, messages, normalizedSearch, showConversationPicker])

  const filteredFaqs = useMemo(() => {
    if(!normalizedSearch) return faqs
    return faqs.filter(item => `${item.question} ${item.answer}`.toLowerCase().includes(normalizedSearch))
  }, [normalizedSearch])

  useEffect(() => {
    function onKeyDown(e){
      if(e.key === 'Escape'){
        if(activeMenuId) setActiveMenuId(null)
        else setOpen(false)
      }
    }
    function onPointerDown(e){
      if(activeMenuId && panelRef.current && !panelRef.current.contains(e.target)){
        setActiveMenuId(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [activeMenuId])

  useEffect(() => {
    if(!user) return
    loadConversations()
    touchPresence()
    const chatTimer = window.setInterval(() => {
      touchPresence()
      loadConversations()
      if(open && activeTab === 'messages' && selectedResidentReady()){
        loadMessages({ silent: true })
      }
    }, 12000)

    return () => window.clearInterval(chatTimer)
  }, [user, open, activeTab, isAdmin, selectedResidentId])

  useEffect(() => {
    if(!open || activeTab !== 'messages') return
    if(!selectedResidentReady()) return
    setShowConversationPicker(false)
    loadMessages()
  }, [open, activeTab, selectedResidentId, user])

  useEffect(() => {
    setSearchQuery('')
    setActiveMenuId(null)
  }, [activeTab])

  useEffect(() => {
    if(normalizedSearch) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, normalizedSearch])

  useEffect(() => {
    setSearchMatchIndex(0)
  }, [normalizedSearch, selectedResidentId])

  useEffect(() => {
    if(messageMatches.length === 0) return
    const boundedIndex = Math.min(searchMatchIndex, messageMatches.length - 1)
    const targetId = messageMatches[boundedIndex]
    messageRefs.current[targetId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [messageMatches, searchMatchIndex])

  const selectedResidentReady = () => !isAdmin || selectedResidentId

  async function touchPresence(){
    if(!user) return
    try {
      await api.post('/chat/presence')
    } catch (error) {}
  }

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
        setShowConversationPicker(false)
      }
    } catch (error) {
      setConversations([])
      lastUnreadTotalRef.current = 0
    }
  }

  async function loadMessages({ silent = false } = {}){
    if(!user || !selectedResidentReady()) return
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
      sender_id: user?.id,
      reply_to_message_id: replyToMessage?.chat_message_id || null,
      reply_message: replyToMessage?.message || '',
      reply_sender_role: replyToMessage?.sender_role || '',
      message,
      is_read: false,
      date_created: new Date().toISOString()
    }
    setMessages(prev => [...prev, optimistic])
    setDraft('')
    setReplyToMessage(null)

    try {
      await api.post('/chat/messages', {
        message,
        reply_to_message_id: replyToMessage?.chat_message_id,
        ...(isAdmin ? { resident_id: selectedResidentId } : {})
      })
      await loadMessages()
    } catch (error) {
      setMessages(prev => prev.filter(item => item.chat_message_id !== optimistic.chat_message_id))
      setDraft(message)
      setReplyToMessage(replyToMessage)
    }
  }

  const messageIsMine = (message) => isAdmin ? message.sender_role === 'staff' : message.sender_role === 'resident'
  const canEditMessage = (message) => {
    if(!messageIsMine(message) || isDeleted(message)) return false
    const createdAt = new Date(message.date_created).getTime()
    return !Number.isNaN(createdAt) && Date.now() - createdAt <= EDIT_WINDOW_MS
  }

  async function saveEditedMessage(message){
    const nextMessage = editDraft.trim()
    if(!nextMessage) return
    try {
      await api.patch(`/chat/messages/${message.chat_message_id}`, { message: nextMessage })
      setEditingMessageId(null)
      setEditDraft('')
      await loadMessages()
    } catch (error) {
      alert(error?.response?.data?.message || 'Failed to edit message')
    }
  }

  async function deleteMessage(message){
    if(!messageIsMine(message)) return
    try {
      await api.delete(`/chat/messages/${message.chat_message_id}`)
      setActiveMenuId(null)
      await loadMessages()
    } catch (error) {
      alert(error?.response?.data?.message || 'Failed to delete message')
    }
  }

  async function copyMessage(message){
    if(isDeleted(message)) return
    try {
      await navigator.clipboard.writeText(message.message || '')
    } catch (error) {}
    setActiveMenuId(null)
  }

  async function reactToMessage(message, reaction){
    if(isDeleted(message)) return
    try {
      if(message.my_reaction === reaction){
        await api.delete(`/chat/messages/${message.chat_message_id}/reaction`)
      } else {
        await api.post(`/chat/messages/${message.chat_message_id}/reaction`, { reaction })
      }
      setActiveMenuId(null)
      await loadMessages()
    } catch (error) {
      alert(error?.response?.data?.message || 'Failed to react to message')
    }
  }

  function startEdit(message){
    if(!canEditMessage(message)) return
    setEditingMessageId(message.chat_message_id)
    setEditDraft(message.message || '')
    setActiveMenuId(null)
  }

  function startReply(message){
    if(isDeleted(message)) return
    setReplyToMessage(message)
    setActiveMenuId(null)
  }

  function startLongPress(messageId){
    window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = window.setTimeout(() => {
      setActiveMenuId(messageId)
    }, 520)
  }

  function clearLongPress(){
    window.clearTimeout(longPressTimerRef.current)
  }

  function jumpSearch(direction){
    if(messageMatches.length === 0) return
    setSearchMatchIndex(prev => {
      const next = direction === 'next' ? prev + 1 : prev - 1
      if(next < 0) return messageMatches.length - 1
      if(next >= messageMatches.length) return 0
      return next
    })
  }

  if(!user) return null

  const showPicker = isAdmin && (showConversationPicker || !selectedResidentId)
  const title = isAdmin
    ? (selectedConversation ? getResidentName(selectedConversation) : 'Residents')
    : 'Admin'

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel" ref={panelRef} role="dialog" aria-label="Messages and FAQs">
          <div className="chat-panel-header">
            <div className="chat-title-block">
              <div className="chat-panel-title">{activeTab === 'faq' ? 'FAQs' : title}</div>
              <div className={`chat-panel-subtitle ${selectedPresence === 'Online' ? 'online' : ''}`}>
                {activeTab === 'faq' ? 'Frequently asked questions' : selectedPresence}
              </div>
            </div>
            <div className="chat-header-actions">
              {isAdmin && activeTab === 'messages' && selectedResidentId && (
                <button type="button" className="chat-icon-btn wide" onClick={() => setShowConversationPicker(v => !v)}>
                  Residents
                </button>
              )}
              <button type="button" className="chat-icon-btn" onClick={() => setOpen(false)} aria-label="Close chat">
                <X size={18} />
              </button>
            </div>
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
            <div className="chat-body one-column">
              {showPicker ? (
                <div className="chat-picker">
                  <label className="chat-search">
                    <Search size={15} />
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search residents"
                    />
                  </label>
                  <div className="chat-conversation-list full">
                    {conversations.length === 0 ? (
                      <div className="chat-empty-small">No residents yet.</div>
                    ) : filteredConversations.length === 0 ? (
                      <div className="chat-empty-small">No matching residents.</div>
                    ) : filteredConversations.map(item => (
                      <button
                        key={item.resident_id}
                        type="button"
                        className={`chat-conversation ${Number(selectedResidentId) === Number(item.resident_id) ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedResidentId(item.resident_id)
                          setShowConversationPicker(false)
                          setSearchQuery('')
                        }}
                      >
                        <span>
                          <strong className={`presence-dot ${Number(item.is_online) === 1 ? 'online' : ''}`} />
                          <span className="conversation-name">{getResidentName(item)}</span>
                          <small>{formatPresence(item.last_seen_at, Number(item.is_online) === 1)}</small>
                        </span>
                        {Number(item.unread_count) > 0 && <b>{item.unread_count}</b>}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="chat-thread">
                  {!selectedResidentReady() ? (
                    <div className="chat-empty">Select a resident to start chatting.</div>
                  ) : (
                    <>
                      <div className="chat-thread-search-row">
                        <label className="chat-search">
                          <Search size={15} />
                          <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search messages"
                          />
                        </label>
                        {normalizedSearch && (
                          <div className="chat-search-nav">
                            <span>{messageMatches.length ? `${Math.min(searchMatchIndex + 1, messageMatches.length)} / ${messageMatches.length}` : '0 / 0'}</span>
                            <button type="button" onClick={() => jumpSearch('prev')}>Prev</button>
                            <button type="button" onClick={() => jumpSearch('next')}>Next</button>
                          </div>
                        )}
                      </div>

                      <div className="chat-messages">
                        {loadingMessages ? (
                          <div className="chat-empty">Loading messages...</div>
                        ) : messages.length === 0 ? (
                          <div className="chat-empty">No messages yet.</div>
                        ) : messages.map(item => {
                          const mine = messageIsMine(item)
                          const match = messageMatches.includes(item.chat_message_id)
                          const activeMatch = messageMatches[searchMatchIndex] === item.chat_message_id

                          return (
                            <div
                              key={item.chat_message_id}
                              ref={node => {
                                if(node) messageRefs.current[item.chat_message_id] = node
                              }}
                              className={`chat-message ${mine ? 'mine' : 'theirs'} ${match ? 'search-match' : ''} ${activeMatch ? 'active-search-match' : ''}`}
                              onPointerDown={() => startLongPress(item.chat_message_id)}
                              onPointerUp={clearLongPress}
                              onPointerCancel={clearLongPress}
                              onPointerLeave={clearLongPress}
                            >
                              <div className="chat-message-row">
                                {!mine && (
                                  <button type="button" className="chat-message-more" onClick={() => setActiveMenuId(item.chat_message_id)} aria-label="Message options">
                                    <MoreHorizontal size={16} />
                                  </button>
                                )}
                                <div className="chat-bubble">
                                  {item.reply_to_message_id && (
                                    <div className="reply-preview">
                                      <span>{item.reply_sender_role === (isAdmin ? 'staff' : 'resident') ? 'You' : (item.reply_sender_role === 'staff' ? 'Admin' : 'Resident')}</span>
                                      <p>{item.reply_deleted_at ? 'Message deleted' : item.reply_message}</p>
                                    </div>
                                  )}
                                  {editingMessageId === item.chat_message_id ? (
                                    <form className="edit-message-form" onSubmit={e => { e.preventDefault(); saveEditedMessage(item) }}>
                                      <input value={editDraft} onChange={e => setEditDraft(e.target.value)} maxLength={1000} />
                                      <div>
                                        <button type="submit">Save</button>
                                        <button type="button" onClick={() => setEditingMessageId(null)}>Cancel</button>
                                      </div>
                                    </form>
                                  ) : (
                                    <>{isDeleted(item) ? <em>Message deleted</em> : item.message}</>
                                  )}
                                </div>
                                {mine && (
                                  <button type="button" className="chat-message-more" onClick={() => setActiveMenuId(item.chat_message_id)} aria-label="Message options">
                                    <MoreHorizontal size={16} />
                                  </button>
                                )}
                                {activeMenuId === item.chat_message_id && (
                                  <div className={`message-menu ${mine ? 'right' : 'left'}`}>
                                    {!isDeleted(item) && (
                                      <div className="reaction-picker" role="group" aria-label="React to message">
                                        {reactions.map(reaction => (
                                          <button
                                            key={reaction.key}
                                            type="button"
                                            className={item.my_reaction === reaction.key ? 'active' : ''}
                                            onClick={() => reactToMessage(item, reaction.key)}
                                            title={reaction.label}
                                            aria-label={reaction.label}
                                          >
                                            {reaction.icon}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {canEditMessage(item) && (
                                      <button type="button" onClick={() => startEdit(item)}><Edit3 size={14} /> Edit</button>
                                    )}
                                    {mine && !isDeleted(item) && (
                                      <button type="button" onClick={() => deleteMessage(item)}><Trash2 size={14} /> Delete</button>
                                    )}
                                    {!isDeleted(item) && (
                                      <button type="button" onClick={() => startReply(item)}><Reply size={14} /> Reply</button>
                                    )}
                                    {!isDeleted(item) && (
                                      <button type="button" onClick={() => copyMessage(item)}><Copy size={14} /> Copy</button>
                                    )}
                                  </div>
                                )}
                              </div>
                              {parseReactionSummary(item.reaction_summary).length > 0 && (
                                <div className="message-reactions">
                                  {parseReactionSummary(item.reaction_summary).map(reaction => (
                                    <button
                                      key={reaction.reaction}
                                      type="button"
                                      className={item.my_reaction === reaction.reaction ? 'active' : ''}
                                      onClick={() => reactToMessage(item, reaction.reaction)}
                                      aria-label={`React ${reaction.reaction}`}
                                    >
                                      <span>{getReactionIcon(reaction.reaction)}</span>
                                      <strong>{reaction.count}</strong>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div className="chat-time">
                                <span>{item.date_created ? new Date(item.date_created).toLocaleString() : ''}</span>
                                {item.edited_at && !isDeleted(item) && <span>Edited</span>}
                                {mine && (
                                  <span className="seen-state">
                                    <CheckCheck size={13} /> {item.is_read ? 'Seen' : 'Sent'}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        <div ref={messagesEndRef} />
                      </div>

                      {replyToMessage && (
                        <div className="reply-compose-preview">
                          <div>
                            <span>Replying to {messageIsMine(replyToMessage) ? 'your message' : (replyToMessage.sender_role === 'staff' ? 'Admin' : 'Resident')}</span>
                            <p>{replyToMessage.message}</p>
                          </div>
                          <button type="button" onClick={() => setReplyToMessage(null)} aria-label="Cancel reply">
                            <X size={16} />
                          </button>
                        </div>
                      )}

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
              )}
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
