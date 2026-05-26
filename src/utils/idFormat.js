export function formatId(prefix, value, width = 4){
  if(value === undefined || value === null || value === '') return ''
  const text = String(value)
  if(/^[A-Z]+-\d{4,}$/i.test(text) || /^[A-Z]+-\d{4}-\d{3,}$/i.test(text)) return text
  const numeric = Number(text)
  if(Number.isFinite(numeric) && numeric > 0){
    return `${prefix}-${String(Math.trunc(numeric)).padStart(width, '0')}`
  }
  return text
}

export const formatResidentId = value => formatId('RES', value)
export const formatComplaintId = value => formatId('CMP', value)
export const formatDocumentId = value => formatId('DOC', value)

export function getComplaintReference(item){
  if(!item) return ''
  const formatted = formatComplaintId(item.complaint_id ?? item.id ?? item.numericId)
  if(formatted) return formatted
  return item.ref || item.reference_number || ''
}

export function getDocumentReference(item){
  if(!item) return ''
  return item.reference_number || item.ref || formatDocumentId(item.request_id ?? item.id ?? item.numericId)
}
