import React, { useEffect, useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import Button from '../components/Button'
import StatusBadge from '../components/StatusBadge'
import '../styles/history.css'
import api from '../api/axios'
import useCloseOnEscape from '../hooks/useCloseOnEscape'
import { sortTextAsc, withAllFirst } from '../utils/sortOptions'
import { addressData } from '../data/addressData'

export default function ManageResidents(){

  const [items,setItems] = useState([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [addressFilterType, setAddressFilterType] = useState('All')
  const [addressFilterValue, setAddressFilterValue] = useState('')
  const [selectedResident, setSelectedResident] = useState(null)
  const [selectedForDelete, setSelectedForDelete] = useState(null)
  const [selectedForStatus, setSelectedForStatus] = useState(null)

  async function load(){
    setLoading(true)

    try{
      const res = await api.get('/residents')
      if(res.data?.success) setItems(res.data.data || [])
      else setError(res.data?.message || 'Failed to load')
    }catch(err){
      setError(err.message)
    }

    setLoading(false)
  }

  useEffect(()=>{ load() }, [])

  const statusOptions = sortTextAsc(['Active', 'Suspended', 'Banned'])
  const addressFilterTypes = ['All', 'Phase', 'Street', 'Block']
  const phaseOptions = sortTextAsc(Object.keys(addressData))
  const streetOptions = useMemo(() => {
    const streets = Object.values(addressData).flat()
    return sortTextAsc([...new Set(streets)])
  }, [])

  const parseResidentAddress = (address = '') => {
    const parts = String(address || '').split(',').map(part => part.trim()).filter(Boolean)
    const blockMatch = String(address || '').match(/\bBlock\s+([^,]+)/i)
    const lotMatch = String(address || '').match(/\bLot\s+([^,]+)/i)

    return {
      phase: parts[0] || '',
      street: parts[1] || '',
      block: blockMatch ? blockMatch[1].trim() : '',
      lot: lotMatch ? lotMatch[1].trim() : ''
    }
  }

  const formatDate = (value) => {
    if(!value) return 'N/A'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US')
  }

  const getResidentName = (item) => [item.first_name, item.middle_name, item.last_name].filter(Boolean).join(' ')

  const handleSearch = () => {
    setQuery(searchTerm.trim())
  }

  const handleAddressFilterTypeChange = (value) => {
    setAddressFilterType(value)
    setAddressFilterValue('')
  }

  const filteredItems = items.filter(item => {
    const statusMatch = statusFilter === 'All' || String(item.account_status || 'Unknown') === statusFilter
    if(!statusMatch) return false

    if(addressFilterType !== 'All' && addressFilterValue){
      const parsedAddress = parseResidentAddress(item.address)
      const field = addressFilterType.toLowerCase()
      if(String(parsedAddress[field] || '').toLowerCase() !== String(addressFilterValue).toLowerCase()){
        return false
      }
    }

    if(!query) return true

    const normalizedQuery = query.toLowerCase()
    const fullName = getResidentName(item).toLowerCase()
    return [
      String(item.resident_id || ''),
      item.email || '',
      item.address || '',
      fullName,
      (item.first_name || ''),
      (item.middle_name || ''),
      (item.last_name || '')
    ].some(value => String(value).toLowerCase().includes(normalizedQuery))
  })

  async function confirmChangeStatus(id, status, suspensionEndDate = null){
    try{
      setSelectedForStatus(prev => ({ ...prev, loading: true }))
      const payload = { account_status: status }
      if(status === 'Suspended'){
        payload.suspension_end_date = suspensionEndDate
      }
      await api.patch(`/residents/${id}`, payload)
      setSelectedForStatus(null)
      load()
    }catch(err){
      setSelectedForStatus(prev => ({ ...prev, loading: false }))
      alert('Update failed: '+(err?.response?.data?.message || err.message))
    }
  }

  function removeResident(id){
    setSelectedForDelete(id)
  }

  async function confirmRemoveResident(id){
    try{
      await api.delete(`/residents/${id}`)
      setSelectedForDelete(null)
      load()
    }catch(err){
      alert('Delete failed: '+(err?.response?.data?.message || err.message))
    }
  }

  function changeStatus(id, current){
    const today = new Date()
    const defaultSuspendUntil = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)
    setSelectedForStatus({
      id,
      current: current || 'Active',
      newStatus: current || 'Active',
      suspensionUntil: current === 'Suspended' ? (today.toISOString().slice(0,10)) : defaultSuspendUntil.toISOString().slice(0,10),
      loading: false
    })
  }

  useCloseOnEscape(Boolean(selectedForDelete), () => setSelectedForDelete(null))
  useCloseOnEscape(Boolean(selectedForStatus), () => setSelectedForStatus(null))
  useCloseOnEscape(Boolean(selectedResident), () => setSelectedResident(null))

  return(
    <div className="app-shell manage-residents-page">
      <Sidebar/>

      <div className="main-area">
        <Header/>

        <main>
          <h1 className="page-title">Manage Residents</h1>

          <div className="history-controls">
            <div className="filter-group">
              <input
                className="ui-input"
                type="search"
                placeholder="Search by ID, name, or email"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => { if(e.key === 'Enter') handleSearch() }}
                style={{ minWidth: 220, flex: '1 1 220px' }}
              />
              <select
                className="ui-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {withAllFirst(statusOptions).map(opt => (
                  <option key={opt} value={opt}>{opt === 'All' ? 'All Statuses' : opt}</option>
                ))}
              </select>
              <select
                className="ui-input"
                value={addressFilterType}
                onChange={(e) => handleAddressFilterTypeChange(e.target.value)}
              >
                {addressFilterTypes.map(opt => (
                  <option key={opt} value={opt}>{opt === 'All' ? 'All Addresses' : `By ${opt}`}</option>
                ))}
              </select>
              {addressFilterType === 'Phase' && (
                <select
                  className="ui-input"
                  value={addressFilterValue}
                  onChange={(e) => setAddressFilterValue(e.target.value)}
                >
                  <option value="">All Phases</option>
                  {phaseOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}
              {addressFilterType === 'Street' && (
                <select
                  className="ui-input"
                  value={addressFilterValue}
                  onChange={(e) => setAddressFilterValue(e.target.value)}
                >
                  <option value="">All Streets</option>
                  {streetOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}
              {addressFilterType === 'Block' && (
                <input
                  className="ui-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="Block"
                  value={addressFilterValue}
                  onChange={(e) => setAddressFilterValue(e.target.value)}
                  style={{ maxWidth: 140 }}
                />
              )}
            </div>
          </div>

          {error && <div className="field-error">{error}</div>}

          {loading ? (
            <div className="empty-state">Loading residents...</div>
          ) : (
            <>
              {filteredItems.length === 0 ? (
                <div className="empty-state">No residents match the current search or filter.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredItems.map(it=>(
                    <tr key={it.resident_id}>
                      <td>{it.resident_id}</td>
                      <td>{getResidentName(it)}</td>
                      <td>{it.email}</td>
                      <td>
                        <StatusBadge status={it.account_status}/>
                        {it.account_status === 'Suspended' && it.suspension_end_date && (
                          <div style={{ marginTop: 4, fontSize: '0.82rem', color: '#6b7280' }}>
                            Until {new Date(it.suspension_end_date).toLocaleDateString('en-US')}
                          </div>
                        )}
                      </td>
                      <td style={{display:'flex',gap:8, alignItems:'center'}}>
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedResident(it)}
                        >
                          View
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => changeStatus(it.resident_id, it.account_status)}
                        >
                          Change Status
                        </Button>

                        <Button
                          variant="danger"
                          className="resident-delete-btn"
                          onClick={()=>removeResident(it.resident_id)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>

                  </table>
                </div>
              )}
            </>
          )}

          {selectedForDelete !== null && (
            <div className="modal-overlay" onClick={() => setSelectedForDelete(null)}>
              <div className="modal-card" onClick={e => e.stopPropagation()}>
                <h3>Confirm Delete</h3>
                <p>Are you sure you want to delete this resident? This action cannot be undone.</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                  <Button type="button" variant="secondary" onClick={() => setSelectedForDelete(null)}>Cancel</Button>
                  <Button type="button" variant="danger" onClick={() => confirmRemoveResident(selectedForDelete)}>Delete</Button>
                </div>
              </div>
            </div>
          )}

          {selectedResident && (
            <div className="modal-overlay" onClick={() => setSelectedResident(null)}>
              <div className="modal-card complaint-details-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" type="button" onClick={() => setSelectedResident(null)}>
                  &times;
                </button>
                <h2 className="modal-title">Resident Details</h2>
                {(() => {
                  const parsedAddress = parseResidentAddress(selectedResident.address)
                  return (
                    <>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Resident ID:</span>
                        <span className="detail-value">{selectedResident.resident_id}</span>
                      </div>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Full Name:</span>
                        <span className="detail-value">{getResidentName(selectedResident) || 'N/A'}</span>
                      </div>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Email:</span>
                        <span className="detail-value">{selectedResident.email || 'N/A'}</span>
                      </div>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Birthdate:</span>
                        <span className="detail-value">{formatDate(selectedResident.birth_date)}</span>
                      </div>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Gender:</span>
                        <span className="detail-value">{selectedResident.gender || 'N/A'}</span>
                      </div>
                      <div className="complaint-detail-row full-width">
                        <span className="detail-label">Address:</span>
                        <span className="detail-value">{selectedResident.address || 'N/A'}</span>
                      </div>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Phase:</span>
                        <span className="detail-value">{parsedAddress.phase || 'N/A'}</span>
                      </div>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Street:</span>
                        <span className="detail-value">{parsedAddress.street || 'N/A'}</span>
                      </div>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Block:</span>
                        <span className="detail-value">{parsedAddress.block || 'N/A'}</span>
                      </div>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Lot:</span>
                        <span className="detail-value">{parsedAddress.lot || 'N/A'}</span>
                      </div>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Status:</span>
                        <span className="detail-value"><StatusBadge status={selectedResident.account_status}/></span>
                      </div>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Suspended Until:</span>
                        <span className="detail-value">{formatDate(selectedResident.suspension_end_date)}</span>
                      </div>
                      <div className="complaint-detail-row">
                        <span className="detail-label">Registered:</span>
                        <span className="detail-value">{formatDate(selectedResident.registration_date)}</span>
                      </div>
                    </>
                  )
                })()}
                <button className="modal-action-btn" type="button" onClick={() => setSelectedResident(null)}>
                  Close
                </button>
              </div>
            </div>
          )}
          
          {selectedForStatus && (
            <div className="modal-overlay" onClick={() => setSelectedForStatus(null)}>
              <div className="modal-card" onClick={e => e.stopPropagation()}>
                <h3>Change Account Status</h3>
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontWeight: 800, display: 'block', marginBottom: 12 }}>Choose status</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {statusOptions.map(opt => (
                      <Button
                        key={opt}
                        type="button"
                        variant={selectedForStatus.newStatus === opt ? 'primary' : 'secondary'}
                        onClick={() => {
                          if(opt === 'Suspended'){
                            setSelectedForStatus(prev => ({ ...prev, newStatus: 'Suspended' }))
                          } else {
                            confirmChangeStatus(selectedForStatus.id, opt)
                          }
                        }}
                        disabled={selectedForStatus.loading}
                      >
                        {selectedForStatus.loading && selectedForStatus.newStatus === opt ? 'Updating...' : opt}
                      </Button>
                    ))}
                  </div>

                  {selectedForStatus.newStatus === 'Suspended' && (
                    <div style={{ marginTop: 14 }}>
                      <label style={{ fontWeight: 800, display: 'block', marginBottom: 8 }}>Suspend until</label>
                      <input
                        type="date"
                        className="ui-input"
                        value={selectedForStatus.suspensionUntil}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setSelectedForStatus(prev => ({ ...prev, suspensionUntil: e.target.value }))}
                      />
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                        <Button type="button" variant="secondary" onClick={() => setSelectedForStatus(null)} disabled={selectedForStatus.loading}>Cancel</Button>
                        <Button
                          type="button"
                          onClick={() => confirmChangeStatus(selectedForStatus.id, 'Suspended', selectedForStatus.suspensionUntil)}
                          disabled={selectedForStatus.loading || !selectedForStatus.suspensionUntil}
                        >
                          {selectedForStatus.loading ? 'Updating...' : 'Suspend'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {selectedForStatus.newStatus !== 'Suspended' && (
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                    <Button type="button" variant="secondary" onClick={() => setSelectedForStatus(null)} disabled={selectedForStatus.loading}>Close</Button>
                  </div>
                )}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  )
}
