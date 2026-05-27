import React, { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import Button from '../components/Button'
import StatusBadge from '../components/StatusBadge'
import DocumentPreview from '../components/DocumentPreview'
import '../styles/history.css'
import '../styles/form.css'
import api from '../api/axios'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import BacoorLogo from '../assets/Bacoor.png'
import useCloseOnEscape from '../hooks/useCloseOnEscape'
import { withAllFirst } from '../utils/sortOptions'
import { formatResidentId, getDocumentReference } from '../utils/idFormat'
import { downloadTimestamp, safeDownloadPart } from '../utils/downloadNames'

const REQUEST_DOC_TYPES = [
  'Barangay Clearance',
  'Business Permit',
  'Residency Certificate',
  'Certificate of Indigency'
]

export default function ManageDocuments(){

  const location = useLocation()
  const [items,setItems] = useState([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [requestType, setRequestType] = useState('Barangay Clearance')
  const [highlightedRequestId, setHighlightedRequestId] = useState(null)
  const [documentStatuses, setDocumentStatuses] = useState([
    { name: 'Barangay Clearance', status: 'Active' },
    { name: 'Business Permit', status: 'Active' },
    { name: 'Residency Certificate', status: 'Disabled' }
  ])
  const [processingRequest, setProcessingRequest] = useState(null)
  const [rejectConfirm, setRejectConfirm] = useState({ show: false, request: null })
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, request: null })
  const processingModalRef = useRef(null)
  const rejectConfirmRef = useRef(null)
  const deleteConfirmRef = useRef(null)
  const [documentFields, setDocumentFields] = useState({
    name: '',
    birthdate: '',
    address: '',
    purpose: '',
    business_name: '',
    province: '',
    barangay: ''
  })
  const maxBirthdate = new Date().toISOString().split('T')[0]

  const toggleDocumentStatus = (idx) => {
    setDocumentStatuses(prev => prev.map((doc, i) =>
      i === idx
        ? { ...doc, status: doc.status === 'Active' ? 'Disabled' : 'Active' }
        : doc
    ))
  }

  async function load(){
    setLoading(true)
    setError(null)

    try{
      const res = await api.get('/docs')
      if(res.data?.success && Array.isArray(res.data.data)){
        setItems(res.data.data)
      } else {
        throw new Error(res.data?.message || 'Invalid document response')
      }
    }catch(err){
      setError(err?.response?.data?.message || err?.message || 'Failed to load')
      setItems([])
    }

    setLoading(false)
  }

  async function submitRequest(){
    try{
      await api.post('/docs', {
        document_type: requestType,
        purpose: `Request for ${requestType}`
      })

      load()
      alert(`${requestType} request submitted`)
    }catch(err){
      alert('Error submitting request: ' + (err?.message || 'Unknown error'))
    }
  }

  useEffect(()=>{ load() }, [])

  useEffect(() => {
    const highlight = location.state?.highlightId
    const type = location.state?.highlightType
    if(type && String(type).toLowerCase() !== 'document') return
    if(highlight != null){
      const parsed = Number(highlight)
      setHighlightedRequestId(Number.isNaN(parsed) ? highlight : parsed)
    }
  }, [location.state])

  useEffect(() => {
    if(highlightedRequestId == null) return
    const row = document.getElementById(`document-row-${highlightedRequestId}`)
    if(row){
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightedRequestId, items])

  async function handleUpdate(id){
    const item = items.find(i=>i.request_id===id)
    if(!item) return

    const status = prompt(
      'Set status (Submitted, Pending, Approved, Released):',
      item.status || 'Submitted'
    )

    if(status==null) return

    try{
      await api.put(`/docs/${id}`,{ status })
      load()
    }catch(err){
      alert('Update failed: '+(err?.response?.data?.message || err.message))
    }
  }

  const getTemplateForType = (value) => {
    const normalized = String(value || '').toLowerCase()
    if(normalized.includes('clearance')) return 'Barangay Clearance'
    if(normalized.includes('residency') || normalized.includes('residence')) return 'Certificate of Residency'
    if(normalized.includes('indigency')) return 'Certificate of Indigency'
    if(normalized.includes('business')) return 'Business Permit'
    return 'Barangay Clearance'
  }

  const getTemplateFields = (template) => {
    switch(template){
      case 'Certificate of Residency':
        return [
          { name: 'name', label: 'Full Name', type: 'text' },
          { name: 'birthdate', label: 'Birthdate', type: 'date' },
          { name: 'address', label: 'Address', type: 'text' },
          { name: 'purpose', label: 'Purpose', type: 'text' }
        ]
      case 'Certificate of Indigency':
        return [
          { name: 'name', label: 'Full Name', type: 'text' },
          { name: 'address', label: 'Address', type: 'text' },
          { name: 'purpose', label: 'Reason for Indigency', type: 'text' }
        ]
      case 'Business Permit':
        return [
          { name: 'name', label: 'Owner Name', type: 'text' },
          { name: 'business_name', label: 'Business Name', type: 'text' },
          { name: 'address', label: 'Business Address', type: 'text' },
          { name: 'purpose', label: 'Purpose', type: 'text' }
        ]
      default:
        return [
          { name: 'name', label: 'Full Name', type: 'text' },
          { name: 'birthdate', label: 'Birthdate', type: 'date' },
          { name: 'address', label: 'Address', type: 'text' },
          { name: 'purpose', label: 'Purpose', type: 'text' }
        ]
    }
  }

  const buildDocumentFields = (item) => ({
    name: item.name || item.full_name || item.resident_name || item.requester_name || '',
    birthdate: item.birthdate || item.birth_date || '',
    address: item.address || item.business_address || '',
    purpose: item.purpose || `Request for ${item.document_type || item.type || ''}`,
    business_name: item.business_name || item.document_name || '',
    province: 'Cavite',
    barangay: 'Mambog II'
  })

  const handleProcessRequest = (item) => {
    setProcessingRequest(item)
    setDocumentFields(buildDocumentFields(item))
  }

  const handleFieldChange = (field, value) => {
    setDocumentFields(prev => ({ ...prev, [field]: value }))
  }

  const closeProcessingModal = () => {
    setProcessingRequest(null)
  }

  useCloseOnEscape(Boolean(processingRequest), closeProcessingModal, processingModalRef)
  useCloseOnEscape(rejectConfirm.show, () => setRejectConfirm({ show: false, request: null }), rejectConfirmRef)
  useCloseOnEscape(deleteConfirm.show, () => setDeleteConfirm({ show: false, request: null }), deleteConfirmRef)

  const wrapTextToWidth = (text, font, size, maxWidth) => {
    return String(text || '').split('\n').flatMap(line => {
      const words = line.split(' ')
      const lines = []
      let current = ''

      words.forEach(word => {
        const next = (current + ' ' + word).trim()
        if(current && font.widthOfTextAtSize(next, size) > maxWidth){
          lines.push(current)
          current = word
        } else {
          current = next
        }
      })

      if(current) lines.push(current)
      return lines.length ? lines : ['']
    })
  }

  const createDocumentPdf = async (item, fields) => {
    const template = getTemplateForType(item.document_type || item.type)
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595, 842])
    const { width, height } = page.getSize()
    const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const issuedDate = new Date().toLocaleDateString('en-US')

    const logoBytes = await fetch(BacoorLogo).then((res) => res.arrayBuffer())
    const logoImage = await pdfDoc.embedPng(logoBytes)

    const paragraphs = [
      template === 'Barangay Clearance' ? [
        `This is to certify that ${fields.name || '[Name]'} of legal age, ${fields.address ? `a resident of ${fields.address}` : '[Address]'}, and a bonafide resident of this barangay.`,
        `This certification is issued upon the request of the above-named person for ${fields.purpose || 'official purposes'}.`
      ] : null,
      template === 'Certificate of Residency' ? [
        `This is to certify that ${fields.name || '[Name]'} is a bonafide resident of ${fields.address || '[Address]'}, Barangay Mambog II, Cavite.`,
        `This certificate is issued for the purpose of ${fields.purpose || 'official use'}.`
      ] : null,
      template === 'Certificate of Indigency' ? [
        `This is to certify that ${fields.name || '[Name]'} is a bonafide resident of ${fields.address || '[Address]'}, Barangay Mambog II, Cavite, and is considered indigent.`,
        `This certificate is issued for the purpose of ${fields.purpose || 'supporting indigency assistance'}.`
      ] : null,
      template === 'Business Permit' ? [
        `This is to certify that ${fields.business_name || '[Business Name]'}, owned and operated by ${fields.name || '[Owner Name]'}, is located at ${fields.address || '[Business Address]'}, Barangay Mambog II, Cavite.`,
        `This certificate is issued for the purpose of ${fields.purpose || 'business operation'}.`
      ] : null
    ].filter(Boolean).flat()

    let y = height - 120

    const drawCentered = (text, size, font, y) => {
      const textWidth = font.widthOfTextAtSize(text, size)
      page.drawText(text, {
        x: (width - textWidth) / 2,
        y,
        size,
        font,
        color: rgb(0, 0, 0)
      })
    }

    const bodyX = 96
    const bodyWidth = width - bodyX * 2

    const drawLeftBlock = (text, y, size = 12, font = normalFont, lineHeight = 18, maxWidth = bodyWidth) => {
      const lines = wrapTextToWidth(text, font, size, maxWidth)
      lines.forEach(line => {
        page.drawText(line, {
          x: bodyX,
          y,
          size,
          font,
          color: rgb(0, 0, 0)
        })
        y -= lineHeight
      })
      return y
    }

    const logoWidth = 430
    const logoHeight = (logoImage.height / logoImage.width) * logoWidth
    const logoX = (width - logoWidth) / 2
    const logoY = (height / 2) - (logoHeight / 2) + 20
    page.drawImage(logoImage, {
      x: logoX,
      y: logoY,
      width: logoWidth,
      height: logoHeight,
      opacity: 0.16
    })

    drawCentered('Republic of the Philippines', 16, boldFont, y)
    y -= 26
    drawCentered('Province of Cavite', 15, boldFont, y)
    y -= 24
    drawCentered('Barangay Mambog II', 15, boldFont, y)
    y -= 60

    const titleY = y
    drawCentered(template, 18, titleFont, titleY)

    let bodyY = titleY - 72
    paragraphs.forEach(paragraph => {
      bodyY = drawLeftBlock(paragraph, bodyY, 18, normalFont, 24, bodyWidth)
      bodyY -= 24
    })

    const issuedY = bodyY - 18
    drawCentered(`Date Issued: ${issuedDate}`, 14, normalFont, issuedY)

    const signatureY = issuedY - 56
    drawCentered('_________________________', 14, normalFont, signatureY)
    drawCentered('Barangay Captain', 14, normalFont, signatureY - 28)

    return pdfDoc.save()
  }

  const handleDownloadPdf = async () => {
    if(!processingRequest) return
    const pdfBytes = await createDocumentPdf(processingRequest, documentFields)
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const name = safeDownloadPart(getDocumentReference(processingRequest), 'document')
    const template = getTemplateForType(processingRequest.document_type || processingRequest.type)
    link.download = `${name}_${safeDownloadPart(template)}_${downloadTimestamp()}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handlePrintPdf = async () => {
    if(!processingRequest) return
    const pdfBytes = await createDocumentPdf(processingRequest, documentFields)
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const printWin = window.open(url)
    if(printWin){
      printWin.focus()
      printWin.onload = () => printWin.print()
    } else {
      alert('Unable to open document for printing. Please allow popups.')
    }
  }

  const handleFinalizeRequest = async () => {
    if(!processingRequest) return
    try {
      await api.put(`/docs/${processingRequest.request_id}`, { status: 'Released' })
    } catch(err) {
      alert('Failed to release document: ' + (err?.response?.data?.message || err.message))
      return
    }
    load()
    setProcessingRequest(null)
  }

  const handleRejectRequest = async (request = processingRequest) => {
    if(!request) return
    try {
      await api.put(`/docs/${request.request_id}`, { status: 'Rejected' })
    } catch(err) {
      alert('Failed to reject document: ' + (err?.response?.data?.message || err.message))
      return
    }
    load()
    setProcessingRequest(current => current?.request_id === request.request_id ? null : current)
    setRejectConfirm({ show: false, request: null })
  }

  const handleDeleteRequest = async (request) => {
    if(!request?.request_id) return

    try {
      await api.delete(`/docs/${request.request_id}`)
      setDeleteConfirm({ show: false, request: null })
      setProcessingRequest(current => current?.request_id === request.request_id ? null : current)
      load()
    } catch(err) {
      alert('Failed to delete document request: ' + (err?.response?.data?.message || err.message))
    }
  }

  const processingTemplate = processingRequest ? getTemplateForType(processingRequest.document_type || processingRequest.type) : 'Barangay Clearance'
  const documentStatusOptions = ['Submitted', 'Requested', 'Processing', 'Ready', 'Released', 'Received', 'Rejected']
  const activeStatuses = ['Submitted', 'Requested', 'Processing', 'Ready']
  const isCompletedDocument = (status = '') => ['released', 'received', 'rejected', 'denied'].includes(String(status).toLowerCase())
  const getVisibleDocuments = () => items.filter(item => {
    if(isCompletedDocument(item.status)) return false
    const matchesStatus = filterStatus === 'All' || item.status === filterStatus
    const matchesSearch = searchQuery === '' ||
      (item.reference_number || item.request_id || '').toString().includes(searchQuery) ||
      getDocumentReference(item).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.document_type || item.document || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.name || item.full_name || formatResidentId(item.resident_id) || '').toString().toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  })
  const getCompletedDocuments = () => items.filter(item => {
    if(!isCompletedDocument(item.status)) return false
    const matchesStatus = filterStatus === 'All' || item.status === filterStatus
    if(!matchesStatus) return false
    const matchesSearch = searchQuery === '' ||
      (item.reference_number || item.request_id || '').toString().includes(searchQuery) ||
      getDocumentReference(item).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.document_type || item.document || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.name || item.full_name || formatResidentId(item.resident_id) || '').toString().toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  return(
    <div className="app-shell">
      <Sidebar/>

      <div className="main-area">
        <Header/>

        <main>
          <h1 className="page-title">Manage Documents</h1>

          {error && <div className="field-error">{error}</div>}

          {loading ? (
            <div className="empty-state">Loading documents...</div>
          ) : (
            <>
            <div className="history-controls">
              <div className="filter-group">
                <select
                  className="ui-input"
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                >
                  {withAllFirst(documentStatusOptions).map(option => (
                    <option key={option} value={option}>{option === 'All' ? 'All Status' : option}</option>
                  ))}
                </select>

                <input
                  className="ui-input"
                  type="text"
                  placeholder="Search by Ref, Type, or Resident"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            {getVisibleDocuments().length > 0 && (
              <section className="active-section">
                <h2 className="section-title">Active Document Requests</h2>
                <div className="table-wrap">
                  <table>
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Type</th>
                    <th>Resident</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {getVisibleDocuments()
                    .map(it=>(
                    <tr
                      key={it.request_id}
                      id={`document-row-${it.request_id}`}
                      className={highlightedRequestId === it.request_id ? 'table-row-highlighted' : ''}
                    >
                      <td>{getDocumentReference(it)}</td>
                      <td>{it.document_type || it.document}</td>
                      <td>{it.name || it.full_name || formatResidentId(it.resident_id) || '—'}</td>
                      <td>{new Date(it.date_requested || Date.now()).toLocaleDateString('en-US')}</td>
                      <td><StatusBadge status={it.status}/></td>
                      <td>
                        <div className="table-actions-inline">
                          <Button
                            className="process-btn"
                            onClick={()=>handleProcessRequest(it)}
                          >
                            Process
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => setRejectConfirm({ show: true, request: it })}
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>

                  </table>
                </div>
              </section>
            )}

            {items.length > 0 && getVisibleDocuments().length === 0 && getCompletedDocuments().length === 0 && (
              <div className="empty-state">No document requests match your search criteria.</div>
            )}

            {getCompletedDocuments().length > 0 && (
              <section className="completed-section">
                <h2 className="section-title">Released, Received, and Rejected Requests</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ref</th>
                        <th>Type</th>
                        <th>Resident</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getCompletedDocuments().map(it => (
                        <tr key={`completed-${it.request_id}`}>
                          <td>{getDocumentReference(it)}</td>
                          <td>{it.document_type || it.document}</td>
                          <td>{it.name || it.full_name || formatResidentId(it.resident_id) || '—'}</td>
                          <td>{new Date(it.date_requested || Date.now()).toLocaleDateString('en-US')}</td>
                          <td><StatusBadge status={it.status}/></td>
                          <td>
                            <button
                              type="button"
                              className="table-action table-action-danger"
                              onClick={() => setDeleteConfirm({ show: true, request: it })}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {processingRequest && (
              <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Process document request" onClick={closeProcessingModal}>
                <div className="modal-card complaint-details-modal" ref={processingModalRef} onClick={e => e.stopPropagation()}>
                  <button className="modal-close-btn" type="button" onClick={closeProcessingModal}>
                    ✕
                  </button>

                  <h2 className="modal-title">Process Document Request</h2>

                  <div className="form-card process-modal-grid-single">
                    <div className="document-preview-shell-a4">
                      <DocumentPreview
                        document={{ ...processingRequest, document_type: processingTemplate }}
                        fields={documentFields}
                      />
                    </div>

                    <div className="document-edit-sidebar">
                      <div className="sidebar-card">
                        <h3 className="sidebar-title">Edit Information</h3>
                        <div className="form-field">
                          <label className="form-label">Full Name</label>
                          <input
                            className="ui-input"
                            value={documentFields.name || ''}
                            onChange={e => handleFieldChange('name', e.target.value)}
                          />
                        </div>
                        <div className="form-field">
                          <label className="form-label">Address</label>
                          <input
                            className="ui-input"
                            value={documentFields.address || ''}
                            onChange={e => handleFieldChange('address', e.target.value)}
                          />
                        </div>
                        {processingTemplate === 'Business Permit' && (
                          <div className="form-field">
                            <label className="form-label">Business Name</label>
                            <input
                              className="ui-input"
                              value={documentFields.business_name || ''}
                              onChange={e => handleFieldChange('business_name', e.target.value)}
                            />
                          </div>
                        )}
                        {processingTemplate !== 'Certificate of Indigency' && (
                          <div className="form-field">
                            <label className="form-label">Birthdate</label>
                            <input
                              type="date"
                              max={maxBirthdate}
                              className="ui-input"
                              value={documentFields.birthdate || ''}
                              onChange={e => handleFieldChange('birthdate', e.target.value)}
                            />
                          </div>
                        )}
                        <div className="form-field">
                          <label className="form-label">Purpose</label>
                          <input
                            className="ui-input"
                            value={documentFields.purpose || ''}
                            onChange={e => handleFieldChange('purpose', e.target.value)}
                          />
                        </div>
                        <div className="sidebar-actions-buttons">
                          <Button variant="secondary" onClick={closeProcessingModal} style={{ flex: 1 }}>Cancel</Button>
                          <Button variant="secondary" onClick={handlePrintPdf} style={{ flex: 1 }}>Print</Button>
                          <Button variant="secondary" onClick={handleDownloadPdf} style={{ flex: 1 }}>Download</Button>
                          <Button onClick={handleFinalizeRequest} style={{ flex: 1 }}>Finalize</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {rejectConfirm.show && (
              <div
                className="modal-overlay"
                role="dialog"
                aria-modal="true"
                aria-label="Confirm reject document request"
                onClick={() => setRejectConfirm({ show: false, request: null })}
              >
                <div className="modal-card confirm-delete-modal" ref={rejectConfirmRef} onClick={e => e.stopPropagation()}>
                  <h2 className="modal-title">Reject Document Request?</h2>
                  <p className="delete-modal-message">
                    Do you want to reject this document request? The resident will be notified.
                  </p>
                  <div className="modal-actions confirm-actions">
                    <button
                      type="button"
                      className="modal-action-btn modal-action-cancel"
                      onClick={() => setRejectConfirm({ show: false, request: null })}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="modal-action-btn modal-action-delete"
                      onClick={() => handleRejectRequest(rejectConfirm.request)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            )}
            {deleteConfirm.show && (
              <div
                className="modal-overlay"
                role="dialog"
                aria-modal="true"
                aria-label="Confirm delete document request"
                onClick={() => setDeleteConfirm({ show: false, request: null })}
              >
                <div className="modal-card confirm-delete-modal" ref={deleteConfirmRef} onClick={e => e.stopPropagation()}>
                  <h2 className="modal-title">Delete Document Request?</h2>
                  <p className="delete-modal-message">
                    Do you want to delete this completed document request? It will be moved to Archive.
                  </p>
                  <div className="modal-actions confirm-actions">
                    <button
                      type="button"
                      className="modal-action-btn modal-action-cancel"
                      onClick={() => setDeleteConfirm({ show: false, request: null })}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="modal-action-btn modal-action-delete"
                      onClick={() => handleDeleteRequest(deleteConfirm.request)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
            </>
          )}

        </main>
      </div>
    </div>
  )
}
