import React, { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  FilePlus,
  History,
  Accessibility,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  Archive
} from 'lucide-react'
import './sidebar.css'
import { useAuth } from '../context/AuthContext'
import useCloseOnEscape from '../hooks/useCloseOnEscape'

export default function Sidebar(){
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  // Collapsible state (remember)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1')

  // Logout modal
  const [confirmOpen, setConfirmOpen] = useState(false)
  const modalRef = useRef(null)
  const logoutModalRef = useRef(null)
  const navRef = useRef(null)

  useCloseOnEscape(confirmOpen, () => setConfirmOpen(false), logoutModalRef)

  // Sidebar keyboard navigation
  function onSidebarNavKeyDown(e){
    if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const nav = navRef.current
    if(!nav) return
    const items = Array.from(nav.querySelectorAll('a, button.linklike'))
    if(items.length === 0) return

    const currentIndex = items.indexOf(document.activeElement)
    const nextIndex = e.key === 'ArrowDown'
      ? (currentIndex === -1 ? 0 : Math.min(currentIndex + 1, items.length - 1))
      : (currentIndex === -1 ? items.length - 1 : Math.max(currentIndex - 1, 0))

    items[nextIndex].focus()
    e.preventDefault()
  }

  // Apply collapsed class to <html> so CSS can shift main content too
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('sidebar-collapsed', collapsed)
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0')
  }, [collapsed])

  function handleLogout(){
    logout()
    navigate('/login')
  }

  // Close modal by clicking outside
  function onOverlayClick(e){
    if(modalRef.current && !modalRef.current.contains(e.target)){
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Main navigation">
        {/* TOP AREA: municipality name + collapse toggle */}
        <div className="sidebar-top">
          <div className="sidebar-brand" aria-label="Municipality name">
            Barangay Mambog II
          </div>

          <button
            type="button"
            className="collapse-btn"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(v => !v)}
          >
            {collapsed ? <ChevronsRight size={18} strokeWidth={2} /> : <ChevronsLeft size={18} strokeWidth={2} />}
          </button>
        </div>

        <nav ref={navRef} onKeyDown={onSidebarNavKeyDown}>
          <ul>
            {/* ADMIN LINKS */}
            {user?.role === 'staff' || user?.role === 'admin' ? (
              <>
                <li>
                  <NavLink to="/admin" end title="Dashboard">
                    <LayoutDashboard size={18} strokeWidth={2} />
                    <span>Dashboard</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/manage-complaints" title="Manage Complaints">
                    <ClipboardList size={18} strokeWidth={2} />
                    <span>Manage Complaints</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/manage-documents" title="Manage Document Requests">
                    <FileText size={18} strokeWidth={2} />
                    <span>Manage Document Requests</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/manage-residents" title="Manage Residents">
                    <Users size={18} strokeWidth={2} />
                    <span>Manage Residents</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/admin/reports" title="Reports & Analytics">
                    <BarChart3 size={18} strokeWidth={2} />
                    <span>Reports &amp; Analytics</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/admin/settings" title="System Settings">
                    <Settings size={18} strokeWidth={2} />
                    <span>System Settings</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/archive" title="Archive">
                    <Archive size={18} strokeWidth={2} />
                    <span>Archive</span>
                  </NavLink>
                </li>
              </>
            ) : (
              /* USER LINKS */
              <>
                <li>
                  <NavLink to="/dashboard" end title="Dashboard">
                    <LayoutDashboard size={18} strokeWidth={2} />
                    <span>Dashboard</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/submit-complaint" title="Submit Complaint">
                    <FilePlus size={18} strokeWidth={2} />
                    <span>Submit Complaint</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/document-request" title="Request Document">
                    <FileText size={18} strokeWidth={2} />
                    <span>Request Document</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/complaint-history" title="Complaint History">
                    <History size={18} strokeWidth={2} />
                    <span>Complaint History</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/document-history" title="Document History">
                    <History size={18} strokeWidth={2} />
                    <span>Document History</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/accessibility" title="Accessibility Settings">
                    <Accessibility size={18} strokeWidth={2} />
                    <span>Accessibility Settings</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink to="/archive" title="Archive">
                    <Archive size={18} strokeWidth={2} />
                    <span>Archive</span>
                  </NavLink>
                </li>
              </>
            )}

            {/* LOGOUT */}
            <li className="logout">
              <button
                type="button"
                className="linklike"
                onClick={() => setConfirmOpen(true)}
                title="Logout"
                aria-label="Logout"
              >
                <LogOut size={18} strokeWidth={2} />
                <span>Logout</span>
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      {/* LOGOUT CONFIRMATION MODAL */}
      {confirmOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Logout confirmation"
          onMouseDown={onOverlayClick}
        >
          <div className="modal-card" ref={logoutModalRef}>
            <h3>Confirm Logout</h3>
            <p>Are you sure you want to logout?</p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn danger"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
