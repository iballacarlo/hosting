import React, { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import Button from '../components/Button'
import '../styles/form.css'
import { Settings, Tags, Save, RotateCcw, Accessibility } from 'lucide-react'
import { useSettings } from '../context/SettingsContext'
import api from '../api/axios'

const DEFAULT_CATEGORIES = ['Noise', 'Garbage', 'Traffic', 'Water Supply', 'Electricity', 'Public Safety', 'Other']
const DEFAULT_SYSTEM_NAME = 'Barangay Service & Complaint Management System'
const DEFAULT_CONTACT_EMAIL = 'brgy.mambog.ii@gmail.com'
const DEFAULT_DOCUMENT_TYPES = [
  'Barangay Clearance',
  'Certificate of Residency',
  'Certificate of Indigency'
]

export default function AdminSettings(){
  const {
    dark, setDark,
    contrast, setContrast,
    fontSize, setFontSize,
    screenReader, setScreenReader,
    saveSettings,
    resetSettings
  } = useSettings()

  const [categories, setCategories] = useState([])
  const [newCat, setNewCat] = useState('')
  const [systemName, setSystemName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [notice, setNotice] = useState('')
  const [documentStatuses, setDocumentStatuses] = useState({})

  useEffect(() => {
    let cancelled = false

    async function loadSettings(){
      setSystemName(DEFAULT_SYSTEM_NAME)
      setContactEmail(DEFAULT_CONTACT_EMAIL)

      try {
        const [categoryRes, documentTypeRes] = await Promise.all([
          api.get('/categories'),
          api.get('/document-types')
        ])

        if(cancelled) return

        if(categoryRes.data?.success && Array.isArray(categoryRes.data.data)){
          setCategories(categoryRes.data.data.map(category => category.category_name || category.name).filter(Boolean))
        } else {
          setCategories(DEFAULT_CATEGORIES)
        }

        if(documentTypeRes.data?.success && Array.isArray(documentTypeRes.data.data)){
          const statuses = {}
          documentTypeRes.data.data.forEach(item => {
            statuses[item.document_name || item.name] = item.status === 'disabled' ? 'disabled' : 'enabled'
          })
          setDocumentStatuses(statuses)
        } else {
          const statuses = {}
          DEFAULT_DOCUMENT_TYPES.forEach(doc => {
            statuses[doc] = 'enabled'
          })
          setDocumentStatuses(statuses)
        }
      } catch {
        if(cancelled) return
        setCategories(DEFAULT_CATEGORIES)
        const statuses = {}
        DEFAULT_DOCUMENT_TYPES.forEach(doc => {
          statuses[doc] = 'enabled'
        })
        setDocumentStatuses(statuses)
      }
    }

    loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if(!notice) return
    const timer = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  function addCategory(){
    const v = newCat.trim()
    if(!v) return
    if(categories.some(c => c.toLowerCase() === v.toLowerCase())) return
    setCategories(prev => [...prev, v])
    setNewCat('')
  }

  function removeCategory(idx){
    setCategories(prev => prev.filter((_, i) => i !== idx))
  }

  async function resetDefaults(){
    setCategories(DEFAULT_CATEGORIES)
    setNewCat('')
    setSystemName(DEFAULT_SYSTEM_NAME)
    setContactEmail(DEFAULT_CONTACT_EMAIL)
    const defaultDocStatuses = {}
    DEFAULT_DOCUMENT_TYPES.forEach(doc => {
      defaultDocStatuses[doc] = 'enabled'
    })
    setDocumentStatuses(defaultDocStatuses)
    try {
      await Promise.all([
        api.put('/categories', { categories: DEFAULT_CATEGORIES }),
        api.put('/document-types', {
          document_types: DEFAULT_DOCUMENT_TYPES.map(document_name => ({ document_name, status: 'enabled' }))
        }),
        resetSettings()
      ])
      setNotice('System and accessibility settings reset to default.')
    } catch {
      setNotice('Settings were reset on this device, but could not be saved to the server.')
    }
  }

  function toggleDocumentStatus(docType){
    setDocumentStatuses(prev => ({
      ...prev,
      [docType]: prev[docType] === 'enabled' ? 'disabled' : 'enabled'
    }))
  }

  async function save(){
    try {
      await Promise.all([
        api.put('/categories', { categories }),
        api.put('/document-types', {
          document_types: Object.entries(documentStatuses).map(([document_name, status]) => ({
            document_name,
            status
          }))
        }),
        saveSettings()
      ])
      setNotice('System and accessibility settings saved.')
    } catch {
      setNotice('Some settings could not be saved to the server.')
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header title="System Settings" />

        <main>
          <h1 className="page-title">System Settings</h1>

          <section className="form-card">
            <div className="form-head">
              <h2
                className="form-title"
                style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}
              >
                <Settings size={18} strokeWidth={2} />
                Configuration
              </h2>

              <p className="form-sub">
                Manage categories, system configuration, and admin-level settings.
              </p>
            </div>

            <div className="form-grid">
              <label className="form-label">System Name</label>
              <div className="form-field">
                <input
                  className="ui-input"
                  value={systemName}
                  onChange={(e) => setSystemName(e.target.value)}
                  placeholder="System name"
                />
                <div className="helper">Shown in headers and branding areas.</div>
              </div>

              <label className="form-label">Contact Email</label>
              <div className="form-field">
                <input
                  className="ui-input"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Contact email"
                />
                <div className="helper">Used for notifications and support.</div>
              </div>

              <label className="form-label" style={{ paddingTop: 10 }}>
                Complaint Categories
              </label>

              <div className="form-field">
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    marginBottom: 10
                  }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      gap: 8,
                      alignItems: 'center',
                      fontWeight: 900,
                      color: 'var(--text, #111827)'
                    }}
                  >
                    <Tags size={16} strokeWidth={2} />
                    Categories
                  </div>

                  <div style={{ flex: 1 }} />
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center'
                  }}
                >
                  <input
                    className="ui-input"
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    placeholder="Add new category (e.g., Water Supply)"
                    onKeyDown={(e) => {
                      if(e.key === 'Enter'){
                        e.preventDefault()
                        addCategory()
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={addCategory}>
                    Add
                  </Button>
                </div>

                <div className="type-chips" style={{ marginTop: 12 }}>
                  {categories.map((c, idx) => (
                    <div
                      key={c + idx}
                      className="type-chip"
                      role="group"
                      aria-label={`Category ${c}`}
                    >
                      <span>{c}</span>
                      <button
                        type="button"
                        onClick={() => removeCategory(idx)}
                        aria-label={`Remove ${c}`}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontWeight: 900,
                          opacity: 0.8
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <div className="helper" style={{ marginTop: 10 }}>
                  These categories will appear in the complaint form across all resident devices.
                </div>
              </div>

              <label className="form-label" style={{ paddingTop: 10 }}>
                Document Types
              </label>

              <div className="form-field">
                <div
                  style={{
                    display: 'inline-flex',
                    gap: 8,
                    alignItems: 'center',
                    fontWeight: 900,
                    color: 'var(--text, #111827)',
                    marginBottom: 10
                  }}
                >
                  <Tags size={16} strokeWidth={2} />
                  Available Documents
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(documentStatuses).map(([docType, status]) => {
                    const isDisabled = status === 'disabled'
                    return (
                      <div
                        key={docType}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          border: '1px solid var(--border, #d1d5db)',
                          borderRadius: 8,
                          backgroundColor: isDisabled ? '#d1d5db' : 'transparent'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: isDisabled ? '#000' : 'var(--text, #111827)' }}>
                            {docType}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: isDisabled ? '#000' : 'var(--text-muted, #6b7280)', marginTop: 2 }}>
                            {status === 'enabled' ? 'Available for request' : 'Frozen - Residents cannot request'}
                          </div>
                        </div>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={status === 'enabled'}
                            onChange={() => toggleDocumentStatus(docType)}
                          />
                          <span className="slider"></span>
                        </label>
                      </div>
                    )
                  })}
                </div>

                <div className="helper" style={{ marginTop: 10 }}>
                  Toggle document types to freeze/unfreeze them. When frozen, residents will not be able to request these documents.
                </div>
              </div>
            </div>

            <div className="form-head" style={{ marginTop: 32 }}>
              <h2
                className="form-title"
                style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}
              >
                <Accessibility size={18} strokeWidth={2} />
                Accessibility Settings
              </h2>

              <p className="form-sub">
                Control dark mode, contrast, font size, and assistive features from the same admin settings page.
              </p>
            </div>

            <div className="settings-grid">
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Dark Mode</div>
                  <div className="setting-desc">Switch to darker interface colors.</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={dark}
                    onChange={(e) => setDark(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">High Contrast</div>
                  <div className="setting-desc">Increase contrast for better readability.</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={contrast}
                    onChange={(e) => setContrast(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-title">Screen Reader Mode</div>
                  <div className="setting-desc">Enable spoken labels and roles while navigating.</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={screenReader}
                    onChange={(e) => setScreenReader(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="font-size-section">
                <div className="setting-title">Font Size</div>
                <div className="font-size-options">
                  {['small','medium','large','xlarge'].map(size => (
                    <button
                      key={size}
                      type="button"
                      className={`font-chip ${fontSize === size ? 'active' : ''}`}
                      aria-label={
                        size === 'xlarge' ? 'Extra Large' :
                        size === 'large' ? 'Large' :
                        size === 'medium' ? 'Medium' :
                        'Small'
                      }
                      onClick={() => setFontSize(size)}
                    >
                      {size.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {notice && <div className="form-notice">{notice}</div>}

            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={resetDefaults}>
                <RotateCcw size={16} strokeWidth={2} />
                Reset
              </Button>

              <Button type="button" onClick={save}>
                <Save size={16} strokeWidth={2} />
                Save Changes
              </Button>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
