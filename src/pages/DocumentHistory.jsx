import React, { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import '../styles/history.css'
import api from '../api/axios'
import mockApi from '../api/mockApi'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import useCloseOnEscape from '../hooks/useCloseOnEscape'

export default function DocumentHistory(){

  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [q, setQ] = useState('')
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [isEditingDocument, setIsEditingDocument] = useState(false)
  const [editFormData, setEditFormData] = useState({})
  const [editTimeExceeded, setEditTimeExceeded] = useState(false)
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({show: false, docId: null, doc: null})
  const [receivedConfirmModal, setReceivedConfirmModal] = useState({show: false})
  const selectedDocumentRef = useRef(null)
  const deleteConfirmRef = useRef(null)
  const receivedConfirmRef = useRef(null)
  const { user: authUser, loading: authLoading } = useAuth()
  const currentUser = authUser || mockApi.getCurrentUser()
  const maxBirthdate = new Date().toISOString().split('T')[0]

  const list = data.filter(item => {
    const itemStatus = String(item.status || '').toLowerCase()
    const searchQuery = q.trim().toLowerCase()
    const matchesFilter = filter === 'All' || itemStatus === filter.toLowerCase()

    if(!matchesFilter) return false
    if(searchQuery === '') return true

    const reference = String(item.reference_number || item.request_id || item.id || item.numericId || item.ref || '')
    const type = String(item.document_type || item.type || '')
    const name = String(item.name || item.full_name || item.resident_name || item.resident_id || item.user?.name || item.user?.full_name || '')
    const purpose = String(item.purpose || '')
    const status = String(item.status || '')
    const address = String(item.address || '')
    const business = String(item.business_name || '')
    const notes = String(item.notes || '')

    return [reference, type, name, purpose, status, address, business, notes]
      .some(field => field.toLowerCase().includes(searchQuery))
  })

  const getOwnerId = (item) => {
    if(!item) return null
    const direct = Number(item.userId ?? item.resident_id ?? item.user_id ?? item.residentId ?? item.ownerId ?? item.owner_id)
    if(!Number.isNaN(direct) && direct > 0) return direct
    const nested = item.user?.id ?? item.user?.user_id ?? item.user?.userId ?? item.resident?.id ?? item.resident?.user_id ?? item.resident?.userId
    const normalized = Number(nested)
    return Number.isNaN(normalized) ? null : normalized
  }

  const canDeleteDocument = (doc) => {
    if(!currentUser) return false
    const ownerId = getOwnerId(doc)
    const currentUserId = Number(currentUser?.id ?? currentUser?.user_id ?? currentUser?.userId)
    const isOwner = !Number.isNaN(ownerId) && !Number.isNaN(currentUserId) && ownerId === currentUserId
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'staff'
    return isOwner || isAdmin
  }

  const getDocumentId = (doc) => {
    if(!doc) return null
    return doc.request_id ?? doc.id ?? doc.numericId ?? doc.reference_number ?? doc.ref ?? null
  }

  const documentIdToString = (value) => {
    if(value === undefined || value === null) return ''
    return String(value)
  }

  useEffect(() => {
    if(authLoading) return

    const currentUser = authUser || mockApi.getCurrentUser()
    const currentUserId = Number(currentUser?.id ?? currentUser?.user_id ?? currentUser?.userId)

    async function loadDocuments(){
      if(!currentUser){
        setData([])
        setLoading(false)
        return
      }

      try {
        const res = await api.get('/docs')
        if(res.data?.success && Array.isArray(res.data.data)){
          setData(res.data.data)
          setLoading(false)
          return
        }
        throw new Error(res.data?.message || 'Invalid document response')
      } catch(err){
        let mockData = []
        if(currentUser.role === 'admin' || currentUser.role === 'staff'){
          mockData = mockApi.listDocs()
        } else {
          mockData = mockApi.listDocsByUser(currentUserId)
        }
        setData(mockData)
        setLoading(false)
      }
    }

    loadDocuments()
  }, [authUser, authLoading])

  const handleViewDocument = (doc) => {
    setSelectedDocument(doc)
    setIsEditingDocument(false)
    setEditFormData({})
    setEditTimeExceeded(false)
    checkIfCanEdit(doc)
  }

  const checkIfCanEdit = (doc) => {
    const requestedTime = new Date(doc.date_requested).getTime()
    const currentTime = new Date().getTime()
    const minutesElapsed = (currentTime - requestedTime) / (1000 * 60)
    setEditTimeExceeded(minutesElapsed > 15)
  }

  const isProcessStatus = (st) => {
    if(!st) return false
    const s = String(st).toLowerCase()
    return ['pending', 'in process', 'inprocess', 'resolved', 'closed', 'released', 'received'].some(p => s.includes(p))
  }

  const closeModal = () => {
    setSelectedDocument(null)
    setIsEditingDocument(false)
  }

  const handleDeleteDocument = (doc) => {
    const docId = getDocumentId(doc)
    if(!docId) return
    if(!canDeleteDocument(doc)) return
    setDeleteConfirmModal({show: true, docId, doc})
  }

  const confirmDeleteDocument = () => {
    const { docId, doc: modalDoc } = deleteConfirmModal
    const currentUser = authUser || mockApi.getCurrentUser()
    if(!currentUser) return
    
    const docToDelete = modalDoc || data.find(item => documentIdToString(getDocumentId(item)) === documentIdToString(docId))
    if(!docToDelete) return
    
    const documentIdToDelete = getDocumentId(docToDelete)
    if(!documentIdToDelete) return

    const result = mockApi.deleteDoc(documentIdToDelete, currentUser)
    
    if(result.success){
      const currentUserId = Number(currentUser?.id ?? currentUser?.user_id ?? currentUser?.userId)
      let updatedData = []
      if(currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff')){
        updatedData = mockApi.listDocs()
      } else if(currentUser){
        updatedData = mockApi.listDocsByUser(currentUserId)
      }
      setData(updatedData.filter(item => item !== docToDelete && documentIdToString(getDocumentId(item)) !== documentIdToString(documentIdToDelete)))
      setSelectedDocument(null)
    } else {
      alert(result.message || 'Failed to delete document')
    }
    
    setDeleteConfirmModal({show: false, docId: null, doc: null})
  }

  const cancelDeleteDocument = () => {
    setDeleteConfirmModal({show: false, docId: null, doc: null})
  }

  useCloseOnEscape(Boolean(selectedDocument), closeModal, selectedDocumentRef)
  useCloseOnEscape(deleteConfirmModal.show, cancelDeleteDocument, deleteConfirmRef)
  useCloseOnEscape(receivedConfirmModal.show, () => setReceivedConfirmModal({show: false}), receivedConfirmRef)

  const handleEditClick = () => {
    const status = selectedDocument?.status || ''

    if(!editTimeExceeded && !isProcessStatus(status)){
      setEditFormData({
        document_type: selectedDocument.document_type || '',
        purpose: selectedDocument.purpose || '',
        name: selectedDocument.name || selectedDocument.full_name || '',
        birthdate: selectedDocument.birthdate || selectedDocument.birth_date || '',
        address: selectedDocument.address || '',
        business_name: selectedDocument.business_name || '',
        notes: selectedDocument.notes || ''
      })
      setIsEditingDocument(true)
    }
  }

  const handleEditFieldChange = (field, value) => {
    setEditFormData(prev => ({...prev, [field]: value}))
  }

  const handleSaveEdit = async () => {
    const currentUser = authUser || mockApi.getCurrentUser()
    if(!currentUser) {
      alert('Not authenticated')
      return
    }
    const status = selectedDocument?.status || ''

    if(isProcessStatus(status)){
      alert('Cannot edit a document that is already in process or completed.')
      return
    }

    try {
      await api.patch(`/docs/${selectedDocument.request_id}`, editFormData)
      const saved = { ...selectedDocument, ...editFormData, full_name: editFormData.name, birth_date: editFormData.birthdate }
      const updatedData = data.map(d => 
        d.request_id === selectedDocument.request_id ? saved : d
      )
      setData(updatedData)
      setSelectedDocument(saved)
      setIsEditingDocument(false)
    } catch(err){
      const result = mockApi.updateDoc(selectedDocument.request_id, editFormData, currentUser)
      if(result.success) {
        const saved = result.data || { ...selectedDocument, ...editFormData }
        const updatedData = data.map(d => 
          d.request_id === selectedDocument.request_id ? saved : d
        )
        setData(updatedData)
        setSelectedDocument(saved)
        setIsEditingDocument(false)
      } else {
        alert(err?.response?.data?.message || result.message || 'Failed to update document')
      }
    }
  }

  const handleCancelEdit = () => {
    setIsEditingDocument(false)
    setEditFormData({})
  }

  const openReceivedConfirm = () => {
    setReceivedConfirmModal({show: true})
  }

  const handleMarkReceived = () => {
    const currentUser = authUser || mockApi.getCurrentUser()
    if(!currentUser){
      alert('Not authenticated')
      setReceivedConfirmModal({show: false})
      return
    }

    const status = selectedDocument?.status || ''
    if(!String(status).toLowerCase().includes('released')){
      alert('Document is not released')
      setReceivedConfirmModal({show: false})
      return
    }

    const result = mockApi.updateDocStatus(selectedDocument.request_id, 'Received')
    if(result.success){
      const saved = result.data
      const updatedData = data.map(d => d.request_id === selectedDocument.request_id ? saved : d)
      setData(updatedData)
      setSelectedDocument(saved)

      try{
        mockApi.notifyAdmins({
          message: `Document ${saved.reference_number || saved.request_id} was marked as Received by ${currentUser.name || currentUser.email || 'a user'}`,
          category: 'document_received',
          data: { request_id: saved.request_id }
        })
      } catch(e){
        // ignore notification failure in mock
        console.warn('notifyAdmins failed', e)
      }

      setReceivedConfirmModal({show: false})
    } else {
      alert(result.message || 'Failed to mark as received')
      setReceivedConfirmModal({show: false})
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header title="Document History" />

        <main>
          <h1 className="page-title">Document History</h1>

          <div className="history-card">

            <div className="history-controls">
              <div className="filter-group">
                <select
                  className="ui-input"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                >
                  <option>All</option>
                  <option>Submitted</option>
                  <option>Released</option>
                  <option>Received</option>
                </select>

                <input
                  className="ui-input"
                  placeholder="Search by reference, type, or name"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="empty-state">Loading documents...</div>
            ) : list.length === 0 ? (
              <div className="empty-state">No document requests found.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Resident</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(d => (
                      <tr key={documentIdToString(getDocumentId(d)) || d.reference_number || d.id}>
                        <td>{d.reference_number}</td>
                        <td>{d.name || d.full_name || d.resident_id || '—'}</td>
                        <td>{d.document_type}</td>
                        <td>{new Date(d.date_requested).toLocaleDateString('en-US')}</td>
                        <td><StatusBadge status={d.status} /></td>
                        <td>
                          <button 
                            className="table-action"
                            onClick={() => handleViewDocument(d)}
                          >
                            View
                          </button>
                          {canDeleteDocument(d) && (
                            <button 
                              className="table-action table-action-danger"
                              onClick={() => handleDeleteDocument(d)}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>

          {/* DOCUMENT DETAILS MODAL */}
          {selectedDocument && (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Document details"
              onClick={closeModal}
            >
              <div className="modal-card complaint-details-modal" ref={selectedDocumentRef} onClick={(e) => e.stopPropagation()}>
                <button 
                  className="modal-close-btn"
                  onClick={closeModal}
                  type="button"
                >
                  ✕
                </button>

                <h2 className="modal-title">Document Request Details</h2>

                {!isEditingDocument ? (
                  <>
                    <div className="complaint-detail-row">
                      <span className="detail-label">Reference:</span>
                      <span className="detail-value">{selectedDocument.reference_number || `DOC-${selectedDocument.request_id}`}</span>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Resident:</span>
                      <span className="detail-value">{selectedDocument.name || selectedDocument.full_name || selectedDocument.resident_id || '—'}</span>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Document Type:</span>
                      <span className="detail-value">{selectedDocument.document_type || '—'}</span>
                    </div>

                    <div className="complaint-detail-row full-width">
                      <span className="detail-label">Purpose:</span>
                      <p className="detail-value description">{selectedDocument.purpose || '—'}</p>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Birthdate:</span>
                      <span className="detail-value">{selectedDocument.birthdate || selectedDocument.birth_date || '—'}</span>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Address:</span>
                      <span className="detail-value">{selectedDocument.address || '—'}</span>
                    </div>

                    {selectedDocument.business_name && (
                      <div className="complaint-detail-row">
                        <span className="detail-label">Business Name:</span>
                        <span className="detail-value">{selectedDocument.business_name}</span>
                      </div>
                    )}

                    <div className="complaint-detail-row">
                      <span className="detail-label">Date Requested:</span>
                      <span className="detail-value">{selectedDocument.date_requested ? new Date(selectedDocument.date_requested).toLocaleDateString('en-US') : '—'}</span>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Status:</span>
                      <span className="detail-value"><StatusBadge status={selectedDocument.status} /></span>
                    </div>

                    {selectedDocument.notes && selectedDocument.notes.trim() && (
                      <div className="complaint-detail-row full-width">
                        <span className="detail-label">Notes:</span>
                        <p className="detail-value description">{selectedDocument.notes}</p>
                      </div>
                    )}

                    {editTimeExceeded && (
                      <div className="edit-time-warning">
                        Cannot edit - 15 minutes have passed since request
                      </div>
                    )}

                    <div className="modal-actions">
                      {String(selectedDocument.status || '').toLowerCase().includes('released') && (
                        <button
                          className="modal-action-btn modal-action-received mobile-checkmark"
                          onClick={openReceivedConfirm}
                          type="button"
                          aria-label="Mark Received"
                        >
                          <span className="mobile-icon" aria-hidden="true">✓</span>
                          <span className="mobile-label">Mark Received</span>
                        </button>
                      )}

                      <button 
                        className="modal-action-btn modal-action-edit"
                        onClick={handleEditClick}
                        disabled={editTimeExceeded || isProcessStatus(selectedDocument?.status)}
                        type="button"
                      >
                        Edit
                      </button>
                      {canDeleteDocument(selectedDocument) && (
                        <button 
                          className="modal-action-btn modal-action-delete"
                          onClick={() => handleDeleteDocument(selectedDocument)}
                          type="button"
                        >
                          Delete
                        </button>
                      )}
                      <button 
                        className="modal-action-btn"
                        onClick={closeModal}
                        type="button"
                      >
                        Close
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="complaint-detail-row">
                      <span className="detail-label">Document Type:</span>
                      <select
                        className="edit-field"
                        value={editFormData.document_type || ''}
                        onChange={(e) => handleEditFieldChange('document_type', e.target.value)}
                      >
                        <option value="">Select Document Type</option>
                        <option value="Barangay Clearance">Barangay Clearance</option>
                        <option value="Residency">Certificate of Residency</option>
                        <option value="Indigency">Certificate of Indigency</option>
                      </select>
                    </div>

                    <div className="complaint-detail-row full-width">
                      <span className="detail-label">Purpose:</span>
                      <textarea
                        className="edit-field edit-textarea"
                        value={editFormData.purpose || ''}
                        onChange={(e) => handleEditFieldChange('purpose', e.target.value)}
                        placeholder="Purpose of request"
                        rows={3}
                      />
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Name:</span>
                      <input
                        type="text"
                        className="edit-field"
                        value={editFormData.name || ''}
                        onChange={(e) => handleEditFieldChange('name', e.target.value)}
                        placeholder="Full name"
                      />
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Birthdate:</span>
                      <input
                        type="date"
                        max={maxBirthdate}
                        className="edit-field"
                        value={editFormData.birthdate || ''}
                        onChange={(e) => handleEditFieldChange('birthdate', e.target.value)}
                      />
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Address:</span>
                      <input
                        type="text"
                        className="edit-field"
                        value={editFormData.address || ''}
                        onChange={(e) => handleEditFieldChange('address', e.target.value)}
                        placeholder="Address"
                      />
                    </div>

                    {/* Business name removed from edit modal per clearance policy */}

                    <div className="complaint-detail-row full-width">
                      <span className="detail-label">Notes:</span>
                      <textarea
                        className="edit-field edit-textarea"
                        value={editFormData.notes || ''}
                        onChange={(e) => handleEditFieldChange('notes', e.target.value)}
                        placeholder="Additional notes"
                        rows={3}
                      />
                    </div>

                    <div className="modal-actions">
                      <button 
                        className="modal-action-btn modal-action-save"
                        onClick={handleSaveEdit}
                        type="button"
                      >
                        Save Changes
                      </button>
                      <button 
                        className="modal-action-btn modal-action-cancel"
                        onClick={handleCancelEdit}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* DELETE CONFIRMATION MODAL */}
          {deleteConfirmModal.show && (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Confirm delete document request"
              onClick={cancelDeleteDocument}
            >
              <div className="modal-card confirm-delete-modal" ref={deleteConfirmRef} onClick={(e) => e.stopPropagation()}>
                <div className="delete-modal-icon"></div>
                <h2 className="modal-title">Delete Document Request?</h2>
                <p className="delete-modal-message">
                  Are you sure you want to delete this document request? This action cannot be undone.
                </p>
                
                <div className="modal-actions confirm-actions">
                  <button 
                    className="modal-action-btn modal-action-cancel"
                    onClick={cancelDeleteDocument}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button 
                    className="modal-action-btn modal-action-delete"
                    onClick={confirmDeleteDocument}
                    type="button"
                  >
                    Delete Permanently
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* RECEIVED CONFIRMATION MODAL */}
          {receivedConfirmModal.show && (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Confirm received document"
              onClick={() => setReceivedConfirmModal({show: false})}
            >
              <div className="modal-card confirm-delete-modal" ref={receivedConfirmRef} onClick={(e) => e.stopPropagation()}>
                <h2 className="modal-title">Mark Document as Received?</h2>
                <p className="delete-modal-message">Are you sure you want to mark this document as received? Administrators will be notified.</p>

                <div className="modal-actions confirm-actions">
                  <button 
                    className="modal-action-btn modal-action-cancel"
                    onClick={() => setReceivedConfirmModal({show: false})}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button 
                    className="modal-action-btn modal-action-received"
                    onClick={handleMarkReceived}
                    type="button"
                  >
                    Mark Received
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
