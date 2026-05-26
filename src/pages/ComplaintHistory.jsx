import React, { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import '../styles/history.css'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import useCloseOnEscape from '../hooks/useCloseOnEscape'
import { sortCategories, withAllFirst } from '../utils/sortOptions'
import { formatResidentId, getComplaintReference } from '../utils/idFormat'

export default function ComplaintHistory(){

  const [filter, setFilter] = useState('All')
  const [q, setQ] = useState('')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedComplaint, setSelectedComplaint] = useState(null)
  const [selectedComplaintMedia, setSelectedComplaintMedia] = useState([])
  const [expandedMediaPreview, setExpandedMediaPreview] = useState(null)
  const [isEditingComplaint, setIsEditingComplaint] = useState(false)
  const [editFormData, setEditFormData] = useState({})
  const [editMediaPreviews, setEditMediaPreviews] = useState([])
  const [editRemovedAttachmentIds, setEditRemovedAttachmentIds] = useState([])
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({show: false, complaintId: null, complaint: null})
  const [categories, setCategories] = useState([])
  const selectedComplaintRef = useRef(null)
  const expandedMediaPreviewRef = useRef(null)
  const deleteConfirmRef = useRef(null)
  const { user: authUser, loading: authLoading } = useAuth()
  const currentUser = authUser

  const parseServerDate = (value) => {
    if(!value) return null
    const text = String(value)
    const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(text)
    const normalized = text.includes(' ') ? text.replace(' ', 'T') : text
    return new Date(hasTimezone ? normalized : `${normalized}Z`)
  }

  const resolveMediaUrl = (url) => {
    if(!url) return ''
    if(/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
    return new URL(url, api.defaults.baseURL).toString()
  }

  const getOwnerId = (item) => {
    if(!item) return null
    const direct = Number(item.userId ?? item.resident_id ?? item.user_id ?? item.residentId ?? item.ownerId ?? item.owner_id)
    if(!Number.isNaN(direct) && direct > 0) return direct
    const nested = item.user?.id ?? item.user?.user_id ?? item.user?.userId ?? item.resident?.id ?? item.resident?.user_id ?? item.resident?.userId
    const normalized = Number(nested)
    return Number.isNaN(normalized) ? null : normalized
  }

  const canDeleteComplaint = (complaint) => {
    if(!currentUser) return false
    const ownerId = getOwnerId(complaint)
    const currentUserId = Number(currentUser?.id ?? currentUser?.user_id ?? currentUser?.userId)
    const isOwner = !Number.isNaN(ownerId) && !Number.isNaN(currentUserId) && ownerId === currentUserId
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'staff'
    return isOwner || isAdmin
  }

  const getComplaintId = (complaint) => {
    if(!complaint) return null
    return complaint.complaint_id ?? complaint.id ?? complaint.numericId ?? complaint.request_id ?? complaint.reference_number ?? complaint.ref ?? null
  }

  const complaintIdToString = (value) => {
    if(value === undefined || value === null) return ''
    return String(value)
  }

  useEffect(() => {
    if(authLoading) return

    const currentUser = authUser

    const loadComplaints = async () => {
      if(!currentUser){
        setData([])
        setLoading(false)
        return
      }

      try {
        const res = await api.get('/complaints')
        if(res?.data?.success && Array.isArray(res.data.data)){
          setData(res.data.data)
          setLoading(false)
          return
        }
        throw new Error(res?.data?.message || 'Invalid complaints response')
      } catch(err) {
        setData([])
        if(err && err.message){
          console.log('Complaint backend unavailable, using local mock data:', err.message)
        }
        setLoading(false)
      }
    }

    loadComplaints()
  }, [authUser, authLoading])

  useEffect(() => {
    let cancelled = false
    async function loadCategories(){
      try {
        const res = await api.get('/categories')
        if(!cancelled && res.data?.success && Array.isArray(res.data.data)){
          setCategories(sortCategories(res.data.data, category => category.category_name || category.name))
        }
      } catch {
        if(!cancelled) setCategories([])
      }
    }
    loadCategories()
    return () => {
      cancelled = true
    }
  }, [])

  const normalizeComplaintMedia = (images = []) => {
    if(!Array.isArray(images)) return []
    return images.map((media) => {
      if(!media) return null
      if(typeof media === 'string') {
        return { url: resolveMediaUrl(media), type: media.startsWith('data:video') ? 'video/*' : 'image/*', name: 'Media file' }
      }
      if(media.url && typeof media.url === 'string') {
        return {
          attachment_id: media.attachment_id || media.id || null,
          complaint_id: media.complaint_id || null,
          file_path: media.file_path || media.url,
          url: resolveMediaUrl(media.url),
          type: media.type || 'image/*',
          name: media.name || 'Media file'
        }
      }
      if(media instanceof File) {
        return {
          name: media.name,
          type: media.type,
          url: URL.createObjectURL(media)
        }
      }
      if(media.previewUrl && typeof media.previewUrl === 'string') {
        return {
          url: media.previewUrl,
          type: media.type || 'image/*',
          name: media.name || 'Media file'
        }
      }
      return null
    }).filter(Boolean)
  }

  const createMediaPreview = (file) => {
    if(!file) return null
    return {
      name: file.name || 'Media file',
      type: file.type || 'image/*',
      url: URL.createObjectURL(file),
      file,
      isNew: true
    }
  }

  const handleEditFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    const validFiles = files.filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'))
    if(validFiles.length !== files.length) {
      alert('Only images and videos can be added to complaint media.')
    }
    const newMedia = validFiles.map(createMediaPreview).filter(Boolean)
    setEditMediaPreviews(prev => [...prev, ...newMedia])
    setEditFormData(prev => ({
      ...prev,
      images: [...(prev.images || []), ...newMedia]
    }))
    e.target.value = ''
  }

  const removeEditMedia = (index) => {
    const removed = editMediaPreviews[index]
    if(removed?.attachment_id){
      setEditRemovedAttachmentIds(prev => [...prev, removed.attachment_id])
    }
    if(removed?.isNew && removed?.url){
      URL.revokeObjectURL(removed.url)
    }
    setEditMediaPreviews(prev => prev.filter((_, i) => i !== index))
    setEditFormData(prev => ({
      ...prev,
      images: (prev.images || []).filter((_, i) => i !== index)
    }))
  }

  const openMediaPreview = (media) => {
    setExpandedMediaPreview(media)
  }

  const handleViewComplaint = (complaint) => {
    setSelectedComplaint(complaint)
    setSelectedComplaintMedia(normalizeComplaintMedia(complaint.images || complaint.attachments))
    setExpandedMediaPreview(null)
    setIsEditingComplaint(false)
    setEditFormData({})
    setEditMediaPreviews([])
    setEditRemovedAttachmentIds([])
  }

  const isEditableStatus = (st) => String(st || '').trim().toLowerCase() === 'submitted'

  const isWithinEditWindow = (complaint) => {
    const submittedDate = parseServerDate(complaint?.date_submitted)
    if(!submittedDate || Number.isNaN(submittedDate.getTime())) return true
    return new Date().getTime() - submittedDate.getTime() <= 15 * 60 * 1000
  }

  const canEditComplaint = (complaint) => isEditableStatus(complaint?.status) && isWithinEditWindow(complaint)

  const handleDeleteComplaint = (complaint) => {
    const complaintId = getComplaintId(complaint)
    if(!complaintId) return
    if(!canDeleteComplaint(complaint)) return
    setDeleteConfirmModal({show: true, complaintId, complaint})
  }

  const confirmDeleteComplaint = async () => {
    const { complaintId, complaint: modalComplaint } = deleteConfirmModal
    const currentUser = authUser
    if(!currentUser) return

    const complaintToDelete = modalComplaint || data.find(item => complaintIdToString(getComplaintId(item)) === complaintIdToString(complaintId))
    if(!complaintToDelete) return

    const complaintIdToDelete = getComplaintId(complaintToDelete)
    if(!complaintIdToDelete) return

    try {
      await api.delete(`/complaints/${complaintIdToDelete}`)
      setData(prevData => prevData.filter(item => item !== complaintToDelete && complaintIdToString(getComplaintId(item)) !== complaintIdToString(complaintIdToDelete)))
      setSelectedComplaint(null)
    } catch(err){
      alert(err?.response?.data?.message || 'Failed to delete complaint')
    }

    setDeleteConfirmModal({show: false, complaintId: null, complaint: null})
  }

  const cancelDeleteComplaint = () => {
    setDeleteConfirmModal({show: false, complaintId: null, complaint: null})
  }

  const handleEditClick = () => {
    if(canEditComplaint(selectedComplaint)){
      const normalizedMedia = normalizeComplaintMedia(selectedComplaint.images || selectedComplaint.attachments)
      setEditFormData({
        title: selectedComplaint.title || '',
        category: selectedComplaint.category_id || '',
        description: selectedComplaint.description || '',
        location: selectedComplaint.location || selectedComplaint.incident_location || '',
        notes: selectedComplaint.notes || '',
        resident_name: selectedComplaint.resident_name || selectedComplaint.name || formatResidentId(selectedComplaint.resident_id) || '',
        respondent_name: selectedComplaint.respondent_name || '',
        date: selectedComplaint.date || selectedComplaint.incident_date || '',
        images: normalizedMedia
      })
      setEditMediaPreviews(normalizedMedia)
      setEditRemovedAttachmentIds([])
      setIsEditingComplaint(true)
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
    const status = selectedComplaint?.status || ''
    if(!isEditableStatus(status)){
      alert('Cannot edit this complaint because only Submitted complaints can be edited.')
      return
    }
    if(!isWithinEditWindow(selectedComplaint)){
      alert('Cannot edit - 15 minutes have passed since submission.')
      return
    }

    try {
      const payload = new FormData()
      payload.append('title', editFormData.title || '')
      payload.append('description', editFormData.description || '')
      payload.append('location', editFormData.location || '')
      payload.append('incident_date', editFormData.date || '')
      if(editFormData.category) payload.append('category_id', editFormData.category)
      payload.append('removed_attachment_ids', JSON.stringify(editRemovedAttachmentIds))
      editMediaPreviews
        .filter(media => media?.isNew && media?.file)
        .forEach(media => payload.append('attachments[]', media.file))

      const res = await api.post(`/complaints/${selectedComplaint.complaint_id}`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const selectedCategory = categories.find(category => String(category.category_id || category.id) === String(editFormData.category))
      const saved = res.data?.data ? res.data.data : {
        ...selectedComplaint,
        ...editFormData,
        category_id: editFormData.category,
        category: selectedCategory?.category_name || selectedCategory?.name || selectedComplaint.category,
        incident_location: editFormData.location,
        location: editFormData.location,
        incident_date: editFormData.date
      }
      const updatedData = data.map(c => 
        c.complaint_id === selectedComplaint.complaint_id ? saved : c
      )
      setData(updatedData)
      setSelectedComplaint(saved)
      setSelectedComplaintMedia(normalizeComplaintMedia(saved.images || saved.attachments))
      setEditMediaPreviews(normalizeComplaintMedia(saved.images || saved.attachments))
      setEditRemovedAttachmentIds([])
      setIsEditingComplaint(false)
    } catch(err){
      alert(err?.response?.data?.message || 'Failed to update complaint')
    }
  }

  const handleCancelEdit = () => {
    setIsEditingComplaint(false)
    setEditFormData({})
    setEditMediaPreviews([])
    setEditRemovedAttachmentIds([])
  }

  const closeModal = () => {
    setSelectedComplaint(null)
    setSelectedComplaintMedia([])
    setEditMediaPreviews([])
    setEditRemovedAttachmentIds([])
    setExpandedMediaPreview(null)
    setIsEditingComplaint(false)
  }

  useCloseOnEscape(Boolean(selectedComplaint), closeModal, selectedComplaintRef)
  useCloseOnEscape(Boolean(expandedMediaPreview), () => setExpandedMediaPreview(null), expandedMediaPreviewRef)
  useCloseOnEscape(deleteConfirmModal.show, cancelDeleteComplaint, deleteConfirmRef)

  const getStatusEmoji = (status) => {
    const normalized = (status || '').toLowerCase()
    if(normalized.includes('processed') || normalized.includes('resolved') || normalized.includes('approved')) return '🟢'
    if(normalized.includes('processing') || normalized.includes('in progress')) return '🟡'
    if(normalized.includes('pending') || normalized.includes('submitted')) return '⚪'
    return '⚪'
  }

  const summaryItems = data.slice(0, 3).map(item => ({
    complaint: item.title || item.category || getComplaintReference(item),
    statusText: `${item.status || 'Pending'} ${getStatusEmoji(item.status)}`
  }))

  const doesComplaintMatchQuery = (complaint, query) => {
    if(!query) return true
    const lowerQuery = query.toLowerCase()
    const fieldsToSearch = [
      complaint.ref,
      getComplaintReference(complaint),
      complaint.complaint_id?.toString(),
      complaint.title,
      complaint.category,
      complaint.category_name,
      complaint.description,
      complaint.location,
      complaint.incident_location,
      complaint.status,
      complaint.notes,
      complaint.resident_name,
      complaint.name,
      complaint.resident_id?.toString(),
      complaint.respondent_name,
      complaint.reference_number,
      complaint.request_id?.toString(),
      complaint.numericId?.toString()
    ]

    return fieldsToSearch.some(value =>
      value !== undefined && value !== null &&
      String(value).toLowerCase().includes(lowerQuery)
    )
  }

  const list = data.filter(item =>
    (filter === 'All' || item.status === filter) &&
    doesComplaintMatchQuery(item, q)
  )

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header title="Complaint History" />

        <main>
          <h1 className="page-title">Complaint History</h1>

          <div className="history-controls">
            <div className="filter-group">
              <select
                className="ui-input"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              >
                {withAllFirst(['Submitted', 'Pending', 'Resolved', 'Closed']).map(option => (
                  <option key={option} value={option}>{option === 'All' ? 'All Status' : option}</option>
                ))}
              </select>

              <input
                className="ui-input"
                placeholder="Search by ID, Title, or Resident"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Loading complaints...</div>
          ) : list.length === 0 ? (
            <div className="empty-state">No complaints found.</div>
          ) : (
            <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Resident</th>
                      <th>Category</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(r => (
                      <tr key={complaintIdToString(getComplaintId(r)) || r.ref || r.id}>
                        <td>{getComplaintReference(r)}</td>
                        <td>{r.resident_name || r.name || formatResidentId(r.resident_id) || '—'}</td>
                        <td>{r.category || r.category_name || r.category_id || '—'}</td>
                        <td>{r.date_submitted ? parseServerDate(r.date_submitted).toLocaleDateString('en-US') : '—'}</td>
                        <td><StatusBadge status={r.status} /></td>
                        <td>
                          <button 
                            className="table-action"
                            onClick={() => handleViewComplaint(r)}
                          >
                            View
                          </button>
                          {canDeleteComplaint(r) && (
                            <button 
                              className="table-action table-action-danger"
                              onClick={() => handleDeleteComplaint(r)}
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

          {/* COMPLAINT DETAILS MODAL */}
          {selectedComplaint && (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Complaint details"
              onClick={closeModal}
            >
              <div className="modal-card complaint-details-modal" ref={selectedComplaintRef} onClick={(e) => e.stopPropagation()}>
                <button 
                  className="modal-close-btn"
                  onClick={closeModal}
                  type="button"
                >
                  ✕
                </button>

                <h2 className="modal-title">Complaint Details</h2>

                {!isEditingComplaint ? (
                  <>
                    <div className="complaint-detail-row">
                      <span className="detail-label">Reference:</span>
                      <span className="detail-value">{getComplaintReference(selectedComplaint)}</span>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Resident:</span>
                      <span className="detail-value">{selectedComplaint.resident_name || selectedComplaint.name || formatResidentId(selectedComplaint.resident_id) || '—'}</span>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Category:</span>
                      <span className="detail-value">{selectedComplaint.category || selectedComplaint.category_name || selectedComplaint.category_id || '—'}</span>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Title:</span>
                      <span className="detail-value">{selectedComplaint.title || '—'}</span>
                    </div>

                    <div className="complaint-detail-row full-width">
                      <span className="detail-label">Description:</span>
                      <p className="detail-value description">{selectedComplaint.description || '—'}</p>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Location:</span>
                      <span className="detail-value">{selectedComplaint.location || selectedComplaint.incident_location || '—'}</span>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Date Submitted:</span>
                      <span className="detail-value">{selectedComplaint.date_submitted ? parseServerDate(selectedComplaint.date_submitted).toLocaleDateString('en-US') : '—'}</span>
                    </div>

                    {selectedComplaint.respondent_name && (
                      <div className="complaint-detail-row">
                        <span className="detail-label">Respondent:</span>
                        <span className="detail-value">{selectedComplaint.respondent_name}</span>
                      </div>
                    )}

                    <div className="complaint-detail-row">
                      <span className="detail-label">Status:</span>
                      <span className="detail-value"><StatusBadge status={selectedComplaint.status} /></span>
                    </div>

                    {selectedComplaint.notes && selectedComplaint.notes.trim() && (
                      <div className="complaint-detail-row full-width">
                        <span className="detail-label">Notes:</span>
                        <p className="detail-value description">{selectedComplaint.notes}</p>
                      </div>
                    )}

                    {(selectedComplaint.date || selectedComplaint.incident_date) && (
                      <div className="complaint-detail-row">
                        <span className="detail-label">Incident Date:</span>
                        <span className="detail-value">{selectedComplaint.date || selectedComplaint.incident_date}</span>
                      </div>
                    )}

                    {selectedComplaintMedia.length > 0 && (
                      <div className="complaint-detail-row full-width">
                        <span className="detail-label">Attached Media:</span>
                        <div className="complaint-media-grid">
                          {selectedComplaintMedia.map((media, index) => (
                            <button
                              key={index}
                              type="button"
                              className="complaint-media-card complaint-media-clickable"
                              onClick={() => openMediaPreview(media)}
                            >
                              {media.type?.startsWith('image/') ? (
                                <img src={media.url} alt={media.name || `Media ${index + 1}`} />
                              ) : (
                                <video src={media.url} />
                              )}
                              <span className="media-name">{media.name || `Attachment ${index + 1}`}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="complaint-detail-row">
                      <span className="detail-label">Anonymous:</span>
                      <span className="detail-value">{Number(selectedComplaint.anonymous) === 1 || selectedComplaint.anonymous === true ? 'Yes' : 'No'}</span>
                    </div>

                    {!isEditableStatus(selectedComplaint.status) && (
                      <div className="edit-time-warning">
                        Cannot edit - only Submitted complaints can be edited.
                      </div>
                    )}

                    {isEditableStatus(selectedComplaint.status) && !isWithinEditWindow(selectedComplaint) && (
                      <div className="edit-time-warning">
                        Cannot edit - 15 minutes have passed since submission.
                      </div>
                    )}

                    <div className="modal-actions">
                      <button 
                        className="modal-action-btn modal-action-edit"
                        onClick={handleEditClick}
                        disabled={!canEditComplaint(selectedComplaint)}
                        type="button"
                      >
                        Edit
                      </button>
                      {canDeleteComplaint(selectedComplaint) && (
                        <button 
                          className="modal-action-btn modal-action-delete"
                          onClick={() => handleDeleteComplaint(selectedComplaint)}
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
                      <span className="detail-label">Category:</span>
                      <select
                        className="edit-field"
                        value={editFormData.category || ''}
                        onChange={(e) => handleEditFieldChange('category', e.target.value)}
                      >
                        <option value="">Select Category</option>
                        {sortCategories(categories, category => category.category_name || category.name).map(category => (
                          <option
                            key={category.category_id || category.id || category.category_name || category.name}
                            value={category.category_id || category.id}
                          >
                            {category.category_name || category.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Resident:</span>
                      <input
                        type="text"
                        className="edit-field"
                        value={editFormData.resident_name || ''}
                        onChange={(e) => handleEditFieldChange('resident_name', e.target.value)}
                        placeholder="Resident name"
                      />
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Respondent:</span>
                      <input
                        type="text"
                        className="edit-field"
                        value={editFormData.respondent_name || ''}
                        onChange={(e) => handleEditFieldChange('respondent_name', e.target.value)}
                        placeholder="Respondent name"
                      />
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Incident Date:</span>
                      <input
                        type="date"
                        className="edit-field"
                        value={editFormData.date || ''}
                        onChange={(e) => handleEditFieldChange('date', e.target.value)}
                        placeholder="Incident date"
                      />
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Title:</span>
                      <input
                        type="text"
                        className="edit-field"
                        value={editFormData.title || ''}
                        onChange={(e) => handleEditFieldChange('title', e.target.value)}
                        placeholder="Complaint title"
                      />
                    </div>

                    <div className="complaint-detail-row full-width">
                      <span className="detail-label">Description:</span>
                      <textarea
                        className="edit-field edit-textarea"
                        value={editFormData.description || ''}
                        onChange={(e) => handleEditFieldChange('description', e.target.value)}
                        placeholder="Complaint description"
                        rows={4}
                      />
                    </div>

                    <div className="complaint-detail-row">
                      <span className="detail-label">Location:</span>
                      <input
                        type="text"
                        className="edit-field"
                        value={editFormData.location || ''}
                        onChange={(e) => handleEditFieldChange('location', e.target.value)}
                        placeholder="Location"
                      />
                    </div>

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

                    <div className="complaint-detail-row full-width">
                      <span className="detail-label">Edit Media:</span>
                      <div className="media-upload-section">
                        <input
                          id="complaint-history-media-upload"
                          type="file"
                          accept="image/*,video/*"
                          multiple
                          onChange={handleEditFileChange}
                          style={{ display: 'none' }}
                        />
                        <label
                          htmlFor="complaint-history-media-upload"
                          className="file-upload-btn-small"
                          tabIndex={0}
                          role="button"
                          onKeyDown={(e) => {
                            if(e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              document.getElementById('complaint-history-media-upload')?.click()
                            }
                          }}
                        >
                          Add media
                        </label>

                        {editMediaPreviews.length > 0 && (
                          <div className="complaint-media-grid complaint-edit-media-grid">
                            {editMediaPreviews.map((media, index) => (
                              <div key={index} className="complaint-media-card complaint-media-edit-card">
                                <button
                                  type="button"
                                  className="complaint-media-clickable"
                                  onClick={() => openMediaPreview(media)}
                                >
                                  {media.type?.startsWith('image/') ? (
                                    <img src={media.url} alt={media.name || `Attachment ${index + 1}`} />
                                  ) : (
                                    <video src={media.url} />
                                  )}
                                </button>
                                <div className="media-edit-actions">
                                  <span className="media-name">{media.name || `Attachment ${index + 1}`}</span>
                                  <button
                                    type="button"
                                    className="remove-preview-btn"
                                    onClick={() => removeEditMedia(index)}
                                    aria-label="Remove media"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
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

          {expandedMediaPreview && (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Expanded media preview"
              onClick={() => setExpandedMediaPreview(null)}
            >
              <div className="modal-card expanded-preview-modal" ref={expandedMediaPreviewRef} onClick={(e) => e.stopPropagation()}>
                <button
                  className="modal-close-btn"
                  onClick={() => setExpandedMediaPreview(null)}
                  type="button"
                >
                  ✕
                </button>
                {expandedMediaPreview.type?.startsWith('image/') ? (
                  <img src={expandedMediaPreview.url} alt={expandedMediaPreview.name || 'Preview'} className="expanded-image" />
                ) : (
                  <video src={expandedMediaPreview.url} controls className="expanded-video" />
                )}
                <p className="preview-filename">{expandedMediaPreview.name}</p>
              </div>
            </div>
          )}

          {/* DELETE CONFIRMATION MODAL */}
          {deleteConfirmModal.show && (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Confirm delete complaint"
              onClick={cancelDeleteComplaint}
            >
              <div className="modal-card confirm-delete-modal" ref={deleteConfirmRef} onClick={(e) => e.stopPropagation()}>
                <p className="delete-modal-message">
                  Are you sure you want to delete this complaint? This action cannot be undone.
                </p>
                
                <div className="modal-actions confirm-actions">
                  <button 
                    className="modal-action-btn modal-action-cancel"
                    onClick={cancelDeleteComplaint}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button 
                    className="modal-action-btn modal-action-delete"
                    onClick={confirmDeleteComplaint}
                    type="button"
                  >
                    Delete Permanently
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
