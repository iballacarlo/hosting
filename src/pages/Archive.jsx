import React, { useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import Button from '../components/Button'
import api from '../api/axios'
import { formatComplaintId, formatDocumentId, formatResidentId } from '../utils/idFormat'
import useCloseOnEscape from '../hooks/useCloseOnEscape'
import '../styles/history.css'

const TYPE_LABELS = {
  complaint: 'Complaint',
  document: 'Document Request',
  resident: 'Resident'
}

export default function Archive(){
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [confirmModal, setConfirmModal] = useState({ show: false, action: '', item: null })
  const [messageModal, setMessageModal] = useState({ show: false, title: '', message: '' })
  const confirmRef = useRef(null)
  const messageRef = useRef(null)

  useCloseOnEscape(confirmModal.show, () => setConfirmModal({ show: false, action: '', item: null }), confirmRef)
  useCloseOnEscape(messageModal.show, () => setMessageModal({ show: false, title: '', message: '' }), messageRef)

  async function loadArchive(){
    setLoading(true)
    setError('')
    try{
      const res = await api.get('/archive')
      if(res.data?.success){
        setItems(res.data.data || [])
      } else {
        setError(res.data?.message || 'Failed to load archive')
      }
    }catch(err){
      setError(err?.response?.data?.message || err.message || 'Failed to load archive')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadArchive()
  }, [])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return items.filter(item => {
      const matchesType = typeFilter === 'All' || item.item_type === typeFilter
      if(!matchesType) return false
      if(!normalizedQuery) return true
      return [
        item.label,
        item.item_type,
        item.original_id,
        item.deleted_at,
        item.expires_at
      ].some(value => String(value || '').toLowerCase().includes(normalizedQuery))
    })
  }, [items, query, typeFilter])

  const formatDate = (value) => {
    if(!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US')
  }

  const formatOriginalId = (item) => {
    if(item.item_type === 'complaint') return formatComplaintId(item.original_id)
    if(item.item_type === 'document') return formatDocumentId(item.original_id)
    if(item.item_type === 'resident') return formatResidentId(item.original_id)
    return item.original_id
  }

  const openRestoreConfirm = (item) => {
    setConfirmModal({ show: true, action: 'restore', item })
  }

  const openDeleteConfirm = (item) => {
    setConfirmModal({ show: true, action: 'delete', item })
  }

  const showMessage = (title, message) => {
    setMessageModal({ show: true, title, message })
  }

  const handleRestore = async (item) => {
    setBusyId(item.archive_id)
    try{
      const res = await api.post(`/archive/${item.archive_id}/restore`)
      setItems(current => current.filter(entry => entry.archive_id !== item.archive_id))
      showMessage('Restored', res.data?.message || 'The archived item has been restored.')
    }catch(err){
      showMessage('Restore Failed', err?.response?.data?.message || 'Failed to restore item.')
    }
    setBusyId(null)
  }

  const handlePermanentDelete = async (item) => {
    setBusyId(item.archive_id)
    try{
      await api.delete(`/archive/${item.archive_id}`)
      setItems(current => current.filter(entry => entry.archive_id !== item.archive_id))
      showMessage('Deleted', 'The archived item has been permanently deleted.')
    }catch(err){
      showMessage('Delete Failed', err?.response?.data?.message || 'Failed to permanently delete item.')
    }
    setBusyId(null)
  }

  const confirmAction = () => {
    const { action, item } = confirmModal
    setConfirmModal({ show: false, action: '', item: null })
    if(!item) return
    if(action === 'restore') handleRestore(item)
    if(action === 'delete') handlePermanentDelete(item)
  }

  const modalItem = confirmModal.item
  const modalItemName = modalItem?.label || TYPE_LABELS[modalItem?.item_type] || 'item'

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header title="Archive" />

        <main>
          <h1 className="page-title">Archive</h1>

          <div className="history-controls">
            <div className="filter-group">
              <select
                className="ui-input"
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
              >
                <option value="All">All Types</option>
                <option value="complaint">Complaints</option>
                <option value="document">Document Requests</option>
                <option value="resident">Residents</option>
              </select>
              <input
                className="ui-input"
                type="search"
                placeholder="Search archive"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="field-error">{error}</div>}

          {loading ? (
            <div className="empty-state">Loading archive...</div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">No archived items found.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Record</th>
                    <th>Original ID</th>
                    <th>Deleted</th>
                    <th>Auto Delete</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => (
                    <tr key={item.archive_id}>
                      <td>{TYPE_LABELS[item.item_type] || item.item_type}</td>
                      <td>{item.label || '—'}</td>
                      <td>{formatOriginalId(item)}</td>
                      <td>{formatDate(item.deleted_at)}</td>
                      <td>{formatDate(item.expires_at)}</td>
                      <td>
                        <div className="table-actions-inline">
                          <Button
                            variant="secondary"
                            disabled={busyId === item.archive_id}
                            onClick={() => openRestoreConfirm(item)}
                          >
                            Restore
                          </Button>
                          <button
                            type="button"
                            className="table-action table-action-danger"
                            disabled={busyId === item.archive_id}
                            onClick={() => openDeleteConfirm(item)}
                          >
                            Delete Permanently
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {confirmModal.show && (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label={confirmModal.action === 'restore' ? 'Confirm restore' : 'Confirm permanent delete'}
              onClick={() => setConfirmModal({ show: false, action: '', item: null })}
            >
              <div className="modal-card confirm-delete-modal" ref={confirmRef} onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">
                  {confirmModal.action === 'restore' ? 'Restore Item?' : 'Delete Permanently?'}
                </h2>
                <p className="delete-modal-message">
                  {confirmModal.action === 'restore'
                    ? `Do you want to restore "${modalItemName}"?`
                    : `Do you want to permanently delete "${modalItemName}"? This cannot be undone.`}
                </p>
                <div className="modal-actions confirm-actions">
                  <button
                    type="button"
                    className="modal-action-btn modal-action-cancel"
                    onClick={() => setConfirmModal({ show: false, action: '', item: null })}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={confirmModal.action === 'restore' ? 'modal-action-btn modal-action-save' : 'modal-action-btn modal-action-delete'}
                    onClick={confirmAction}
                  >
                    {confirmModal.action === 'restore' ? 'Restore' : 'Delete Permanently'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {messageModal.show && (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label={messageModal.title}
              onClick={() => setMessageModal({ show: false, title: '', message: '' })}
            >
              <div className="modal-card confirm-delete-modal" ref={messageRef} onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">{messageModal.title}</h2>
                <p className="delete-modal-message">{messageModal.message}</p>
                <div className="modal-actions confirm-actions">
                  <button
                    type="button"
                    className="modal-action-btn"
                    onClick={() => setMessageModal({ show: false, title: '', message: '' })}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
