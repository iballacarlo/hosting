import React, { useEffect, useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import Button from '../components/Button'
import api from '../api/axios'
import { formatComplaintId, formatDocumentId, formatResidentId } from '../utils/idFormat'
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

  const handleRestore = async (item) => {
    if(!window.confirm(`Restore "${item.label || TYPE_LABELS[item.item_type] || 'item'}"?`)) return
    setBusyId(item.archive_id)
    try{
      await api.post(`/archive/${item.archive_id}/restore`)
      setItems(current => current.filter(entry => entry.archive_id !== item.archive_id))
    }catch(err){
      alert(err?.response?.data?.message || 'Failed to restore item')
    }
    setBusyId(null)
  }

  const handlePermanentDelete = async (item) => {
    if(!window.confirm(`Permanently delete "${item.label || TYPE_LABELS[item.item_type] || 'item'}"? This cannot be undone.`)) return
    setBusyId(item.archive_id)
    try{
      await api.delete(`/archive/${item.archive_id}`)
      setItems(current => current.filter(entry => entry.archive_id !== item.archive_id))
    }catch(err){
      alert(err?.response?.data?.message || 'Failed to permanently delete item')
    }
    setBusyId(null)
  }

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
                            onClick={() => handleRestore(item)}
                          >
                            Restore
                          </Button>
                          <button
                            type="button"
                            className="table-action table-action-danger"
                            disabled={busyId === item.archive_id}
                            onClick={() => handlePermanentDelete(item)}
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
        </main>
      </div>
    </div>
  )
}
