import React, { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import '../styles/history.css'
import api from '../api/axios'
import StatusBadge from '../components/StatusBadge'
import DocumentPreview from '../components/DocumentPreview'
import { useAuth } from '../context/AuthContext'
import useCloseOnEscape from '../hooks/useCloseOnEscape'
import { sortTextAsc, withAllFirst } from '../utils/sortOptions'
import { formatResidentId, getDocumentReference } from '../utils/idFormat'
import Pagination, { paginateItems } from '../components/Pagination'

const EDIT_DOCUMENT_TYPES = sortTextAsc([
  'Barangay Clearance',
  'Certificate of Indigency',
  'Certificate of Residency'
])

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
  const [previewDocument, setPreviewDocument] = useState(null)
  const [activePage, setActivePage] = useState(1)
  const [completedPage, setCompletedPage] = useState(1)
  const selectedDocumentRef = useRef(null)
  const deleteConfirmRef = useRef(null)
  const previewDocumentRef = useRef(null)
  const { user: authUser, loading: authLoading } = useAuth()
  const currentUser = authUser
  const maxBirthdate = new Date().toISOString().split('T')[0]

  const isCompletedDocument = (status = '') => ['received', 'rejected', 'denied'].includes(String(status).toLowerCase())
  const isLockedDeleteStatus = (status = '') => ['released', 'received', 'rejected', 'denied'].includes(String(status).toLowerCase())
  const isReadyForPickup = (status = '') => {
    const value = String(status || '').toLowerCase()
    return value.includes('ready') || value.includes('released')
  }
  const list = data.filter(item => {
    const itemStatus = String(item.status || '').toLowerCase()
    const searchQuery = q.trim().toLowerCase()
    const matchesFilter = filter === 'All' || itemStatus === filter.toLowerCase()

    if(!matchesFilter) return false
    if(searchQuery === '') return true

    const reference = String(getDocumentReference(item) || item.reference_number || item.request_id || item.id || item.numericId || item.ref || '')
    const type = String(item.document_type || item.type || '')
    const name = String(item.name || item.full_name || item.resident_name || formatResidentId(item.resident_id) || item.user?.name || item.user?.full_name || '')
    const purpose = String(item.purpose || '')
    const status = String(item.status || '')
    const address = String(item.address || '')
    const business = String(item.business_name || '')
    const notes = String(item.notes || '')

    return [reference, type, name, purpose, status, address, business, notes]
      .some(field => field.toLowerCase().includes(searchQuery))
  })
  const activeList = list.filter(item => !isCompletedDocument(item.status))
  const completedList = list.filter(item => isCompletedDocument(item.status))
  const activePagination = paginateItems(activeList, activePage)
  const completedPagination = paginateItems(completedList, completedPage)

  useEffect(() => {
    setActivePage(1)
    setCompletedPage(1)
  }, [filter, q])

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
    return (isOwner || isAdmin) && !isLockedDeleteStatus(doc?.status)
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

    const currentUser = authUser

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
        setData([])
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
  }

  const isProcessStatus = (st) => {
    if(!st) return false
    const s = String(st).toLowerCase()
    return s !== 'submitted'
  }

  const closeModal = () => {
    setSelectedDocument(null)
    setIsEditingDocument(false)
  }

  const openDocumentPreview = (doc = selectedDocument) => {
    if(!doc || !isReadyForPickup(doc.status)) return
    setPreviewDocument(doc)
  }

  const handleDeleteDocument = (doc) => {
    const docId = getDocumentId(doc)
    if(!docId) return
    if(!canDeleteDocument(doc)) return
    setDeleteConfirmModal({show: true, docId, doc})
  }

  const confirmDeleteDocument = async () => {
    const { docId, doc: modalDoc } = deleteConfirmModal
    const currentUser = authUser
    if(!currentUser) return
    
    const docToDelete = modalDoc || data.find(item => documentIdToString(getDocumentId(item)) === documentIdToString(docId))
    if(!docToDelete) return
    
    const documentIdToDelete = getDocumentId(docToDelete)
    if(!documentIdToDelete) return

    try {
      await api.delete(`/docs/${documentIdToDelete}`)
      setData(prev => prev.filter(item => documentIdToString(getDocumentId(item)) !== documentIdToString(documentIdToDelete)))
      setSelectedDocument(null)
    } catch(err){
      alert(err?.response?.data?.message || 'Failed to delete document')
    }
    
    setDeleteConfirmModal({show: false, docId: null, doc: null})
  }

  const cancelDeleteDocument = () => {
    setDeleteConfirmModal({show: false, docId: null, doc: null})
  }

  useCloseOnEscape(Boolean(selectedDocument), closeModal, selectedDocumentRef)
  useCloseOnEscape(deleteConfirmModal.show, cancelDeleteDocument, deleteConfirmRef)
  useCloseOnEscape(Boolean(previewDocument), () => setPreviewDocument(null), previewDocumentRef)

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
    const currentUser = authUser
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
      await api.patch(`/docs/${getDocumentId(selectedDocument)}`, editFormData)
      const saved = { ...selectedDocument, ...editFormData, full_name: editFormData.name, birth_date: editFormData.birthdate }
      const updatedData = data.map(d => 
        documentIdToString(getDocumentId(d)) === documentIdToString(getDocumentId(selectedDocument)) ? saved : d
      )
      setData(updatedData)
      setSelectedDocument(saved)
      setIsEditingDocument(false)
    } catch(err){
      const message = err?.response?.data?.message || 'Failed to update document'
      if(message.toLowerCase().includes('15 minutes')){
        setEditTimeExceeded(true)
      }
      alert(message)
    }
  }

  const handleCancelEdit = () => {
    setIsEditingDocument(false)
    setEditFormData({})
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header title="Document History" />

        <main>
          <h1 className="page-title">Document History</h1>

          <div className="history-controls">
            <div className="filter-group">
              <select
                className="ui-input"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              >
                {withAllFirst(['Submitted', 'Released', 'Received', 'Rejected']).map(option => (
                  <option key={option} value={option}>{option === 'All' ? 'All Status' : option}</option>
                ))}
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
            <>
            {activeList.length > 0 && (
              <section className="active-section">
                <h2 className="section-title">Active Document Requests</h2>
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
                    {activePagination.pageItems.map(d => (
                      <tr key={documentIdToString(getDocumentId(d)) || d.reference_number || d.id}>
                        <td>{getDocumentReference(d)}</td>
                        <td>{d.name || d.full_name || formatResidentId(d.resident_id) || '—'}</td>
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
                <Pagination
                  page={activePagination.safePage}
                  totalPages={activePagination.totalPages}
                  totalItems={activeList.length}
                  start={activePagination.start}
                  end={activePagination.end}
                  onPageChange={setActivePage}
                />
              </section>
            )}
            {completedList.length > 0 && (
              <section className="completed-section">
                <h2 className="section-title">Released, Received, and Rejected Requests</h2>
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
                      {completedPagination.pageItems.map(d => (
                        <tr key={`completed-${documentIdToString(getDocumentId(d)) || d.reference_number || d.id}`}>
                          <td>{getDocumentReference(d)}</td>
                          <td>{d.name || d.full_name || formatResidentId(d.resident_id) || '—'}</td>
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
                <Pagination
                  page={completedPagination.safePage}
                  totalPages={completedPagination.totalPages}
                  totalItems={completedList.length}
                  start={completedPagination.start}
                  end={completedPagination.end}
                  onPageChange={setCompletedPage}
                />
              </section>
            )}
            </>
          )}

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
                      <span className="detail-value">{getDocumentReference(selectedDocument)}</span>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Resident:</span>
                      <span className="detail-value">{selectedDocument.name || selectedDocument.full_name || formatResidentId(selectedDocument.resident_id) || '—'}</span>
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

                    <div className="modal-actions document-detail-actions">
                      {isReadyForPickup(selectedDocument.status) && (
                        <button
                          className="modal-action-btn modal-action-edit modal-action-preview"
                          onClick={() => openDocumentPreview(selectedDocument)}
                          type="button"
                        >
                          View Document Preview
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
                        className="modal-action-btn modal-action-close"
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
                        {EDIT_DOCUMENT_TYPES.map(documentType => (
                          <option key={documentType} value={documentType}>{documentType}</option>
                        ))}
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

          {/* DOCUMENT PREVIEW MODAL */}
          {previewDocument && (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Document preview"
              onClick={() => setPreviewDocument(null)}
            >
              <div className="modal-card complaint-details-modal document-preview-modal" ref={previewDocumentRef} onClick={(e) => e.stopPropagation()}>
                <button
                  className="modal-close-btn"
                  onClick={() => setPreviewDocument(null)}
                  type="button"
                >
                  &times;
                </button>
                <h2 className="modal-title">Document Preview</h2>
                <DocumentPreview document={previewDocument} />
                <div className="modal-actions">
                  <button
                    className="modal-action-btn"
                    onClick={() => setPreviewDocument(null)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
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
                  Do you want to delete this document request? It will be moved to Archive.
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
                    Delete
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
