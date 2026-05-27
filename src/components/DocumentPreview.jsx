import React from 'react'
import BacoorLogo from '../assets/Bacoor.png'
import './documentPreview.css'

export function getDocumentTemplate(value){
  const normalized = String(value || '').toLowerCase()
  if(normalized.includes('clearance')) return 'Barangay Clearance'
  if(normalized.includes('residency') || normalized.includes('residence')) return 'Certificate of Residency'
  if(normalized.includes('indigency')) return 'Certificate of Indigency'
  if(normalized.includes('business')) return 'Business Permit'
  return 'Barangay Clearance'
}

export function getDocumentPreviewFields(doc = {}){
  return {
    name: doc.name || doc.full_name || doc.resident_name || doc.requester_name || '',
    birthdate: doc.birthdate || doc.birth_date || '',
    address: doc.address || doc.business_address || '',
    purpose: doc.purpose || `Request for ${doc.document_type || doc.type || ''}`,
    business_name: doc.business_name || doc.document_name || ''
  }
}

export default function DocumentPreview({ document, fields: suppliedFields }){
  const template = getDocumentTemplate(document?.document_type || document?.type)
  const fields = suppliedFields || getDocumentPreviewFields(document)

  return (
    <div className="resident-doc-preview-shell">
      <div className="resident-doc-preview-page">
        <img className="resident-doc-preview-watermark" src={BacoorLogo} alt="" aria-hidden="true" />
        <div className="resident-doc-preview-header">
          <div className="resident-doc-preview-republic">Republic of the Philippines</div>
          <div className="resident-doc-preview-province">Province of Cavite</div>
          <div className="resident-doc-preview-barangay">Barangay Mambog II</div>
        </div>

        <div className="resident-doc-preview-body">
          <div className="resident-doc-preview-title">{template}</div>

          <div className="resident-doc-preview-copy">
            {template === 'Barangay Clearance' && (
              <>
                <p>This is to certify that <strong>{fields.name || '[Name]'}</strong> of legal age, {fields.address ? `a resident of ${fields.address}` : '[Address]'}, and a bonafide resident of this barangay.</p>
                <p>This certification is issued upon the request of the above-named person for {fields.purpose || 'official purposes'}.</p>
              </>
            )}
            {template === 'Certificate of Residency' && (
              <>
                <p>This is to certify that <strong>{fields.name || '[Name]'}</strong> is a bonafide resident of {fields.address || '[Address]'}, Barangay Mambog II, Cavite.</p>
                <p>This certificate is issued for the purpose of {fields.purpose || 'official use'}.</p>
              </>
            )}
            {template === 'Certificate of Indigency' && (
              <>
                <p>This is to certify that <strong>{fields.name || '[Name]'}</strong> is a bonafide resident of {fields.address || '[Address]'}, Barangay Mambog II, Cavite, and is considered indigent.</p>
                <p>This certificate is issued for the purpose of {fields.purpose || 'supporting indigency assistance'}.</p>
              </>
            )}
            {template === 'Business Permit' && (
              <>
                <p>This is to certify that <strong>{fields.business_name || '[Business Name]'}</strong>, owned and operated by <strong>{fields.name || '[Owner Name]'}</strong>, is located at {fields.address || '[Business Address]'}, Barangay Mambog II, Cavite.</p>
                <p>This certificate is issued for the purpose of {fields.purpose || 'business operation'}.</p>
              </>
            )}
          </div>

          <div className="resident-doc-preview-footer">
            <div>Date Issued: {new Date().toLocaleDateString('en-US')}</div>
            <div className="resident-doc-preview-signature">
              <div>_________________________</div>
              <div>Barangay Captain</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
