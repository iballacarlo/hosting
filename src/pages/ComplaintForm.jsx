import React, { useEffect, useState, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import Button from '../components/Button'
import InputField from '../components/InputField'
import useCloseOnEscape from '../hooks/useCloseOnEscape'
import '../styles/form.css'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const getUserFullName = (user) => {
  if (!user) return ''
  if (user.name) return user.name
  const parts = [
    user.first_name || user.firstName || user.fname || '',
    user.middle_name || user.middleName || user.middle || '',
    user.last_name || user.lastName || user.lname || '',
    user.suffix || user.suf || ''
  ].map(part => part?.trim()).filter(Boolean)
  return parts.join(' ')
}

export default function ComplaintForm(){
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({
    resident_name: '',
    category: '',
    title: '',
    description: '',
    location: '',
    date: '',
    anonymous: false,
    images: [], // Changed from image to images array
    respondent_name: '',
  })

  const [errors, setErrors] = useState({})

  const formatMmDdYyyy = (value) => {
    const date = new Date(value)
    if(!value || Number.isNaN(date.getTime())) return ''
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`
  }
  // Allow current date and past dates, prevent future dates
  const today = new Date()
  const maxComplaintDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [previews, setPreviews] = useState([]) // Store preview URLs
  const [expandedPreview, setExpandedPreview] = useState(null) // For expanded view
  const confirmModalRef = useRef(null)
  const expandedPreviewRef = useRef(null)

  useEffect(() => {
    if (user && !form.resident_name) {
      setForm(prev => ({ ...prev, resident_name: getUserFullName(user) }))
    }
  }, [user])

  useCloseOnEscape(Boolean(expandedPreview), () => setExpandedPreview(null), expandedPreviewRef)
  useCloseOnEscape(confirmOpen, () => setConfirmOpen(false), confirmModalRef)

  const nav = useNavigate()

  useEffect(() => {
    setCategories([
      { id: 1, category_id: 1, name: 'Noise Complaint', category_name: 'Noise Complaint' },
      { id: 2, category_id: 2, name: 'Garbage Collection', category_name: 'Garbage Collection' },
      { id: 3, category_id: 3, name: 'Road/Drainage Issue', category_name: 'Road/Drainage Issue' },
      { id: 4, category_id: 4, name: 'Peace and Order', category_name: 'Peace and Order' },
      { id: 5, category_id: 5, name: 'Other', category_name: 'Other' },
    ])
  }, [])

  function setField(key, value){
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleFileChange(e){
    const files = Array.from(e.target.files || [])
    const validFiles = files.filter(file => {
      const isValidType = file.type.startsWith('image/') || file.type.startsWith('video/')
      const isValidSize = file.size <= 10 * 1024 * 1024 // 10MB limit
      return isValidType && isValidSize
    })

    if (validFiles.length !== files.length) {
      alert('Some files were skipped. Only images/videos under 10MB are allowed.')
    }

    // Create preview URLs
    const newPreviews = validFiles.map(file => ({
      url: URL.createObjectURL(file),
      type: file.type,
      name: file.name
    }))

    setField('images', [...form.images, ...validFiles])
    setPreviews([...previews, ...newPreviews])
    // Reset the input so the same file can be selected again if needed
    e.target.value = ''
  }

  function handleFileUploadKeyDown(e){
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault()
      e.currentTarget.click()
    }
  }

  function handlePreviewKeyDown(e, preview){
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault()
      setExpandedPreview(preview)
    }
  }

  function removeFile(index){
    // Clean up the preview URL
    if (previews[index]) {
      URL.revokeObjectURL(previews[index].url)
    }
    setField('images', form.images.filter((_, i) => i !== index))
    setPreviews(previews.filter((_, i) => i !== index))
  }

  function validate(){
    const e = {}
    if(!form.category) e.category = 'Category required'
    if(!form.title) e.title = 'Title required'
    if(!form.description) e.description = 'Description required'
    if(!form.date) {
      e.date = 'Date is required'
    } else {
      const selectedDate = new Date(form.date)
      const today = new Date()
      // Set to end of today to allow the current date
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)
      
      if(Number.isNaN(selectedDate.getTime())) {
        e.date = 'Date must be valid'
      } else if(selectedDate > endOfToday) {
        e.date = 'Date cannot be in the future. Only current date and past dates are allowed.'
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const normalizeUploadedMedia = (files) => {
    if(!Array.isArray(files)) return []
    return files.map((file) => {
      if(!file) return null
      if(typeof file === 'string') {
        return { url: file, type: 'image/*', name: 'Media file' }
      }
      if(file.url && typeof file.url === 'string') {
        return { url: file.url, type: file.type || 'image/*', name: file.name || 'Media file' }
      }
      if(file instanceof File) {
        return {
          name: file.name,
          type: file.type,
          size: file.size,
          url: URL.createObjectURL(file)
        }
      }
      return null
    }).filter(Boolean)
  }

  async function submitToApi(){
    const residentName = form.resident_name || ''
    const payload = {
      category_id: form.category,
      title: form.title,
      description: form.description,
      incident_location: form.location,
      incident_date: form.date || '',
      anonymous: form.anonymous,
      respondent_name: form.respondent_name,
      resident_name: residentName
    }
    return api.post('/complaints', payload)
  }

  async function handleSubmit(e){
    e?.preventDefault?.()
    if(!validate()) return

    try{
      const res = await submitToApi()
      if(res.data.success) nav('/complaint-history')
      else alert('Error: ' + res.data.message)
    } catch(err){
      alert('Error submitting complaint: ' + (err.response?.data?.message || err.message))
    }
  }

  function openConfirm(e){
    e.preventDefault()
    if(!validate()) return
    setConfirmOpen(true)
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header />

        <main>
          <h1 className="page-title">Submit Complaint</h1>

          <form className="form-card" onSubmit={openConfirm} noValidate>
            <div className="form-head">
              <h2 className="form-title">Complaint Details</h2>
              <p className="form-sub">
                Fill out the details below. Fields marked with <span className="req">*</span> are required.
              </p>
            </div>

            <div className="form-grid">
              {/* Category */}
              <label className="form-label">
                Category <span className="req">*</span>
              </label>
              <div className="form-field">
                <select
                  className={`ui-input ${errors.category ? 'ui-error' : ''}`}
                  value={form.category}
                  onChange={e => setField('category', e.target.value)}
                >
                  <option value="">Select Category</option>
                  {categories.length > 0 ? (
                    categories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))
                  ) : (
                    <option value="">No categories available</option>
                  )}
                </select>
                {errors.category && <div className="field-error">{errors.category}</div>}
              </div>

              {/* Title */}
              <label className="form-label">
                Title <span className="req">*</span>
              </label>
              <div className="form-field">
                <InputField
                  label={null}
                  value={form.title}
                  onChange={e => setField('title', e.target.value)}
                  error={errors.title}
                  placeholder="Short title (e.g., Loud music at night)"
                />
              </div>

              {/* Resident */}
              <label className="form-label">
                Resident <span className="req">*</span> 
              </label>
              <div className="form-field">
                <InputField
                  label={null}
                  value={form.resident_name}
                  onChange={e => setField('resident_name', e.target.value)}
                  placeholder="Resident name"
                />
              </div>

              {/* Respondent Name */}
              <label className="form-label">
                Respondent Name (Optional)
              </label>
              <div className="form-field">
                <InputField
                  label={null}
                  value={form.respondent_name}
                  onChange={e => setField('respondent_name', e.target.value)}
                  placeholder="Name of person being complained about (leave blank if N/A)"
                />
                <div className="helper">Optional. Who is this complaint about? Leave blank for general/area-based complaints.</div>
              </div>

              {/* Description */}
              <label className="form-label">
                Description <span className="req">*</span>
              </label>
              <div className="form-field">
                <textarea
                  className={`ui-input ui-textarea ${errors.description ? 'ui-error' : ''}`}
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="Write the full details of your complaint..."
                />
                {errors.description && <div className="field-error">{errors.description}</div>}
              </div>

              {/* Location */}
              <label className="form-label">Location</label>
              <div className="form-field">
                <InputField
                  label={null}
                  value={form.location}
                  onChange={e => setField('location', e.target.value)}
                  placeholder="Street / Purok / Landmark"
                />
              </div>

              {/* Date */}
              <label className="form-label">Date</label>
              <div className="form-field">
                <input
                  className={`ui-input ${errors.date ? 'ui-error' : ''}`}
                  type="date"
                  max={maxComplaintDate}
                  value={form.date}
                  onChange={e => setField('date', e.target.value)}
                />
                {errors.date && <div className="field-error">{errors.date}</div>}
              </div>

              {/* Upload */}
              <label className="form-label">Upload Image/Video</label>
              <div className="form-field">
                <div className="file-upload-container">
                  <input
                    id="file-upload"
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  <label
                    htmlFor="file-upload"
                    className="file-upload-btn-small"
                    tabIndex={0}
                    role="button"
                    aria-label="Choose images or videos to upload"
                    onKeyDown={handleFileUploadKeyDown}
                  >
                    <span className="upload-icon">📎</span>
                    <span className="upload-text-small">Choose</span>
                  </label>

                  {/* Display uploaded file previews beside button */}
                  {form.images.length > 0 && (
                    <div className="uploaded-files-horizontal">
                      {previews.map((preview, index) => (
                        <div key={index} className="preview-container">
                          <div 
                            className="preview-thumbnail"
                            onClick={() => setExpandedPreview(preview)}
                            onKeyDown={(e) => handlePreviewKeyDown(e, preview)}
                            tabIndex={0}
                            role="button"
                            title="Click to expand"
                            aria-label="Open file preview"
                          >
                            {preview.type.startsWith('image/') ? (
                              <img src={preview.url} alt={`Preview ${index}`} />
                            ) : (
                              <video src={preview.url} />
                            )}
                            <div className="preview-overlay">🔍</div>
                            <button
                              type="button"
                              className="remove-preview-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeFile(index)
                              }}
                              title="Remove file"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="helper">Optional. You can attach multiple evidence files (photos/videos). Max 10MB each.</div>
              </div>

              {/* Anonymous */}
              <label className="form-label">Anonymous</label>
              <div className="form-field">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={form.anonymous}
                    onChange={e => setField('anonymous', e.target.checked)}
                  />
                  <span>Submit anonymously</span>
                </label>
              </div>
            </div>

            <div className="form-actions">
              <Button type="submit">Submit</Button>
            </div>
          </form>

          {/* ✅ EXPANDED PREVIEW MODAL */}
          {expandedPreview && (
            <div
              className="modal-overlay"
              onClick={() => setExpandedPreview(null)}
            >
              <div className="modal-card expanded-preview-modal" ref={expandedPreviewRef} onClick={(e) => e.stopPropagation()}>
                <button 
                  className="close-preview-btn"
                  onClick={() => setExpandedPreview(null)}
                  type="button"
                >
                  ✕
                </button>
                {expandedPreview.type.startsWith('image/') ? (
                  <img src={expandedPreview.url} alt="Expanded preview" className="expanded-image" />
                ) : (
                  <video src={expandedPreview.url} controls className="expanded-video" />
                )}
                <p className="preview-filename">{expandedPreview.name}</p>
              </div>
            </div>
          )}

          {/* ✅ CONFIRM MODAL */}
          {confirmOpen && (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Confirm complaint submission"
              onClick={() => setConfirmOpen(false)}
            >
              <div className="modal-card" ref={confirmModalRef} onClick={(e) => e.stopPropagation()}>
                <h3>Confirm Submission</h3>
                <p>Are you sure you want to submit this complaint?</p>

                <div className="modal-actions">
                  <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                    Cancel
                  </Button>

                  <Button
                    onClick={() => {
                      setConfirmOpen(false)
                      handleSubmit()
                    }}
                  >
                    Yes, Submit
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
