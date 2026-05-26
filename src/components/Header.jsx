import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import './header.css'

export default function Header(){
  const { dark, setDark, contrast, setContrast, screenReader, setScreenReader } = useSettings()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationsViewed, setNotificationsViewed] = useState(false)
  const [lastSeenUnreadCount, setLastSeenUnreadCount] = useState(0)
  const menuRef = useRef(null)
  const settingsRef = useRef(null)
  const notificationsRef = useRef(null)

  // Close dropdowns on outside click + Esc
  useEffect(() => {
    function onDown(e){
      if(menuOpen && menuRef.current && !menuRef.current.contains(e.target)){
        setMenuOpen(false)
      }
      if(settingsOpen && settingsRef.current && !settingsRef.current.contains(e.target)){
        setSettingsOpen(false)
      }
      if(notificationsOpen && notificationsRef.current && !notificationsRef.current.contains(e.target)){
        setNotificationsOpen(false)
      }
    }
    function onEsc(e){
      if(e.key === 'Escape'){
        setMenuOpen(false)
        setSettingsOpen(false)
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [menuOpen, settingsOpen, notificationsOpen])

  const isNotificationRead = (notification) => notification?.is_read ?? notification?.read ?? false

  async function loadNotifications(){
    if(!user){
      setNotifications([])
      setUnreadCount(0)
      return 0
    }

    try {
      const res = await api.get('/notifications')
      if(res.data && res.data.success){
        const list = Array.isArray(res.data.data) ? res.data.data : []
        const count = list.filter(notification => !isNotificationRead(notification)).length
        setNotifications(list)
        setUnreadCount(count)
        return count
      }
    } catch (error) {
      setNotifications([])
      setUnreadCount(0)
    }
    return 0
  }

  useEffect(() => {
    let isMounted = true
    async function init(){
      if(!isMounted) return
      await loadNotifications()
    }
    init()

    const handleStorage = (e) => {
      if(!e.key){
        loadNotifications()
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      isMounted = false
      window.removeEventListener('storage', handleStorage)
    }
  }, [user])

  function goProfile(){
    setMenuOpen(false)
    navigate('/profile')
  }

  function doLogout(){
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  function toggleDark(){
    setDark(!dark)
    setMenuOpen(false)
    setSettingsOpen(false)
  }

  function toggleContrast(){
    setContrast(!contrast)
    setMenuOpen(false)
    setSettingsOpen(false)
    setNotificationsOpen(false)
  }

  function toggleScreenReader(){
    setScreenReader(!screenReader)
    setMenuOpen(false)
    setSettingsOpen(false)
    setNotificationsOpen(false)
  }

  async function markAllAsRead(){
    if(!user) return

    try {
      await api.post('/notifications/mark-all-read')
    } catch (error) {}

    await loadNotifications()
  }

  async function markNotificationRead(notificationId){
    if(!user) return

    try {
      await api.post(`/notifications/${notificationId}/read`)
    } catch (error) {}
  }

  async function handleNotificationClick(notification){
    const notificationId = notification.id || notification.notification_id
    const currentUser = user
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'staff'
    const payload = notification.data || {}
    const rawCategory = String(notification.category || notification.type || payload.category || payload.type || '').toLowerCase()
    const rawMessage = String(notification.message || '').toLowerCase()
    const isComplaint = /complaint/.test(rawCategory) || /complaint/.test(rawMessage) || payload.complaint_id || payload.complaintId || payload.id
    const isDocument = /doc|document|request/.test(rawCategory) || /doc|document|request/.test(rawMessage) || payload.request_id || payload.requestId || payload.reference_number
    const isRegistration = /register|registration|new resident|new user|account/.test(rawCategory) || /register|registration|new resident|new user|account/.test(rawMessage)

    let destination = ''
    let navState = {}

    if(isComplaint){
      destination = isAdmin ? '/manage-complaints' : '/complaint-history'
      navState = { highlightId: payload.complaint_id || payload.complaintId || payload.id, highlightType: 'complaint' }
    } else if(isDocument){
      destination = isAdmin ? '/manage-documents' : '/document-history'
      navState = { highlightId: payload.request_id || payload.requestId || payload.id, highlightType: 'document' }
    } else if(isRegistration){
      destination = isAdmin ? '/manage-residents' : '/dashboard'
      navState = { highlightId: payload.user_id || payload.userId || payload.id, highlightType: 'resident' }
    } else {
      destination = isAdmin ? '/admin' : '/dashboard'
    }

    setNotificationsOpen(false)
    setMenuOpen(false)
    setSettingsOpen(false)

    if(notificationId){
      const wasUnread = !isNotificationRead(notification)
      setNotifications(prev => prev.map(item => {
        const id = item.id || item.notification_id
        return id === notificationId ? { ...item, read: true, is_read: true } : item
      }))
      if(wasUnread){
        setUnreadCount(count => {
          const nextCount = Math.max(0, count - 1)
          setLastSeenUnreadCount(nextCount)
          return nextCount
        })
      }
      markNotificationRead(notificationId)
        .then(() => loadNotifications())
        .catch(() => loadNotifications())
    }

    navigate(destination, { state: navState })
  }

  const isMobile = () => typeof window !== 'undefined' && window.innerWidth <= 700
  const hasNewAfterViewed = unreadCount > lastSeenUnreadCount
  const showNotificationBadge = unreadCount > 0 && (!notificationsViewed || hasNewAfterViewed) && !notificationsOpen
  const showAvatarBadge = isMobile() && unreadCount > 0 && (!notificationsViewed || hasNewAfterViewed) && !menuOpen

  async function toggleNotifications(){
    const next = !notificationsOpen
    setNotificationsOpen(next)
    if(next){
      const count = await loadNotifications()
      setNotificationsViewed(true)
      setLastSeenUnreadCount(count)
    }
    setMenuOpen(false)
    setSettingsOpen(false)
  }

  async function toggleAvatarMenu(){
    const next = !menuOpen
    setMenuOpen(next)
    if(next && isMobile()){
      const count = await loadNotifications()
      setNotificationsViewed(true)
      setLastSeenUnreadCount(count)
    }
  }

  // first-letter of first name (fallbacks to email first char or 'U')
  const firstName = user?.first_name || (user?.name || '').split(' ')[0] || ''
  const initials = firstName
    ? firstName[0].toUpperCase()
    : ((user?.email || user?.username) ? (user?.email || user?.username)[0].toUpperCase() : 'U')

  // parse name parts for avatar modal display
  function parseName(obj){
    const raw = obj?.name || ''
    const first = obj?.first_name || raw.split(' ')[0] || ''
    const middle = obj?.middle_name || (() => {
      const parts = raw.trim().split(/\s+/)
      return parts.length > 2 ? parts.slice(1, -1).join(' ') : ''
    })()
    const last = obj?.last_name || (() => {
      const parts = raw.trim().split(/\s+/)
      return parts.length > 1 ? parts[parts.length - 1] : ''
    })()
    const suffix = obj?.suffix || (() => {
      const s = raw.trim().split(' ').pop().replace('.','').toUpperCase()
      return ['JR','SR','II','III','IV','V'].includes(s) ? s : ''
    })()
    return { first, middle, last, suffix }
  }
  const profileEmail =
    user?.email ||
    user?.username ||
    user?.user_email ||
    user?.email_address ||
    ''

  const nameParts = parseName(user || {})
  const fullName = [nameParts.first, nameParts.middle, nameParts.last, nameParts.suffix]
    .filter(Boolean)
    .join(' ')

  return (
    <header className="top-header">
      <div className="top-left">
        <div className="barangay-name">Barangay Service & Complaint Management System</div>
        <div className="header-sub">
          {user?.role ? (user.role === 'admin' || user.role === 'staff' ? 'Admin' : 'Resident') : ''}
        </div>
      </div>

      <div className="top-middle" />

      <div className="top-right">
        <div className="mobile-settings-wrapper" ref={settingsRef}>
          <button
            type="button"
            className="settings-btn mobile-only"
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(v => !v)}
            title="Display settings"
          >
            <span className="settings-gear">⚙</span>
            <span className="settings-text">Settings</span>
          </button>

          {settingsOpen && (
            <div className="settings-dropdown" role="menu" aria-label="Mobile display settings">
              <button
                type="button"
                className="settings-item"
                onClick={toggleDark}
                aria-label={dark ? 'Disable dark mode' : 'Enable dark mode'}
              >
                {dark ? 'Disable dark' : 'Enable dark'}
              </button>
              <button
                type="button"
                className="settings-item"
                onClick={toggleContrast}
                aria-label={contrast ? 'Disable high contrast mode' : 'Enable high contrast mode'}
              >
                {contrast ? 'Disable contrast' : 'Enable contrast'}
              </button>
              <button
                type="button"
                className="settings-item"
                onClick={toggleScreenReader}
                aria-label={screenReader ? 'Disable screen reader mode' : 'Enable screen reader mode'}
              >
                {screenReader ? 'Disable screen reader' : 'Enable screen reader'}
              </button>
            </div>
          )}
        </div>

        <div className="header-controls">
          <button
            type="button"
            onClick={toggleDark}
            aria-pressed={dark}
            className="small"
            aria-label={dark ? 'Disable dark mode' : 'Enable dark mode'}
          >
            {dark ? 'Dark' : 'Light'}
          </button>

          <button
            type="button"
            onClick={toggleContrast}
            aria-pressed={contrast}
            className="small"
            aria-label={contrast ? 'Disable high contrast mode' : 'Enable high contrast mode'}
          >
            {contrast ? 'HighC' : 'Contrast'}
          </button>

          <button
            type="button"
            onClick={toggleScreenReader}
            aria-pressed={screenReader}
            className="small"
            aria-label={screenReader ? 'Disable screen reader mode' : 'Enable screen reader mode'}
          >
            {screenReader ? 'SR On' : 'SR'}
          </button>
        </div>

        <div className="notification-wrap" ref={notificationsRef}>
          <button
            type="button"
            className="notification-btn"
            aria-haspopup="dialog"
            aria-expanded={notificationsOpen}
            onClick={toggleNotifications}
            title="Notifications"
          >
            <span className="notification-icon">🔔</span>
            {showNotificationBadge && (
              <span className="notification-badge" aria-hidden="true">
                {unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="notification-modal" role="dialog" aria-label="Notifications">
              <div className="notification-modal-header">
                <span>Notifications</span>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    className="mark-all-read-btn"
                    onClick={markAllAsRead}
                    disabled={unreadCount === 0}
                  >
                    Mark all as read
                  </button>
                )}
              </div>
              <div className="notification-modal-content">
                {notifications.length === 0 ? (
                  <div className="notification-empty">No notifications.</div>
                ) : (
                  <div className="notification-list">
                    {notifications.map(notification => (
                      <button
                        key={notification.id}
                        type="button"
                        className={`notification-item ${isNotificationRead(notification) ? 'read' : 'unread'} clickable`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); handleNotificationClick(notification) }}
                      >
                        <div className="notification-message">{notification.message}</div>
                        <div className="notification-meta">{new Date(notification.created_at).toLocaleString()}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Avatar + Dropdown */}
        <div className="avatar-wrap" ref={menuRef}>
          <button
            type="button"
            className="avatar-btn"
            onClick={toggleAvatarMenu}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Account menu"
          >
            <span className="avatar-circle">{initials}</span>
            {showAvatarBadge && (
              <span className="avatar-badge mobile-only" aria-hidden="true">
                {unreadCount}
              </span>
            )}
          </button>

          {menuOpen && (
            <div className="avatar-menu" role="menu" aria-label="Account menu">
              <div className="avatar-menu-head">
                <div className="avatar-menu-name">{fullName}</div>
                <div className="avatar-menu-email">{profileEmail}</div>
              </div>

              <div className="mobile-notifications mobile-only">
                <div className="notification-modal-header">
                  <span>Notifications</span>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      className="mark-all-read-btn"
                      onClick={markAllAsRead}
                      disabled={unreadCount === 0}
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="notification-modal-content">
                  {notifications.length === 0 ? (
                    <div className="notification-empty">No new notifications.</div>
                  ) : (
                    <div className="notification-list">
                      {notifications.map(notification => (
                        <button
                          key={notification.id}
                          type="button"
                          className={`notification-item ${isNotificationRead(notification) ? 'read' : 'unread'} clickable`}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); handleNotificationClick(notification) }}
                        >
                          <div className="notification-message">{notification.message}</div>
                          <div className="notification-meta">{new Date(notification.created_at).toLocaleString()}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button type="button" className="avatar-item" role="menuitem" onClick={goProfile}>
                Profile
              </button>

              <button type="button" className="avatar-item danger" role="menuitem" onClick={doLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
