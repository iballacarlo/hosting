// mockApi.js
// Simple frontend-only mock API backed by localStorage

const KEY_USERS = 'mock_users'
const KEY_COMPLAINTS = 'mock_complaints'
const KEY_DOCS = 'mock_docs'
const KEY_NOTIFICATIONS = 'mock_notifications'
const KEY_CATEGORIES = 'mock_categories'
const KEY_SYSTEM_SETTINGS = 'mock_system_settings'
const KEY_DOCUMENT_STATUSES = 'mock_document_statuses'

function load(key){
  return JSON.parse(localStorage.getItem(key) || '[]')
}

function save(key, data){
  localStorage.setItem(key, JSON.stringify(data))
}

function loadJson(key, defaultValue){
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue))
  } catch {
    return defaultValue
  }
}

function nowIso(){
  return new Date().toISOString()
}

function todayYmd(){
  return new Date().toISOString().slice(0, 10)
}

function getNextNumericId(list, field = 'numericId'){
  const ids = list
    .map(item => Number(item?.[field] || 0))
    .filter(id => !Number.isNaN(id))

  return ids.length ? Math.max(...ids) + 1 : 1
}

function generateComplaintRef(list){
  const next = String(getNextNumericId(list, 'numericId')).padStart(4, '0')
  return `CMP-${next}`
}

function generateDocRef(list){
  const year = new Date().getFullYear()
  const next = String(getNextNumericId(list, 'numericId')).padStart(4, '0')
  return `DOC-${year}-${next}`
}

function normalizeUserId(value){
  if(value === undefined || value === null) return null
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

function getAnyIdFromObject(obj, excludePatterns = [], seen = new Set()){
  if(!obj || typeof obj !== 'object' || seen.has(obj)) return null

  seen.add(obj)

  for(const key of Object.keys(obj)){
    const lower = String(key).toLowerCase()

    if(excludePatterns.some(pattern => lower.includes(pattern))){
      continue
    }

    const value = obj[key]

    if(lower === 'id' || lower.endsWith('id') || lower.includes('_id')){
      const normalized = normalizeUserId(value)
      if(normalized !== null) return normalized
    }

    if(typeof value === 'object' && value !== null){
      const nested = getAnyIdFromObject(value, excludePatterns, seen)
      if(nested !== null) return nested
    }
  }

  return null
}

function getUserId(user){
  const direct = normalizeUserId(
    user?.id ??
    user?.user_id ??
    user?.userId ??
    user?.resident_id ??
    user?.residentId ??
    user?.owner_id ??
    user?.ownerId
  )

  if(direct !== null) return direct

  return getAnyIdFromObject(
    user,
    ['complaint', 'request', 'document', 'numeric', 'ref']
  )
}

function getItemOwnerId(item){
  const direct = normalizeUserId(
    item?.userId ??
    item?.resident_id ??
    item?.user_id ??
    item?.residentId ??
    item?.ownerId ??
    item?.owner_id ??
    item?.user?.id ??
    item?.user?.user_id ??
    item?.user?.userId ??
    item?.resident?.id ??
    item?.resident?.user_id ??
    item?.resident?.userId
  )

  if(direct !== null) return direct

  return getAnyIdFromObject(
    item,
    ['complaint', 'request', 'document', 'numeric', 'ref']
  )
}

function getUsers(){
  return load(KEY_USERS)
}

function getAdminUsers(){
  return getUsers().filter(
    u => u?.role === 'admin' || u?.role === 'staff'
  )
}

function getNotificationTargetUserId(notification){
  return normalizeUserId(
    notification.targetUserId ??
    notification.target_user_id ??
    notification.userId ??
    notification.user_id
  )
}

function getNotificationTargetEmail(notification){
  const email = (
    notification.targetUserEmail ??
    notification.target_user_email ??
    notification.userEmail ??
    notification.user_email ??
    notification.email ??
    notification.user_email_address
  )

  return typeof email === 'string'
    ? email.trim().toLowerCase()
    : null
}

function normalizeNotificationRecipient(value){
  if(value && typeof value === 'object'){
    return {
      id: getUserId(value),
      email:
        getNotificationTargetEmail(value) ||
        (
          value.email ||
          value.user_email ||
          value.username ||
          ''
        )
          ?.toString()
          .trim()
          .toLowerCase() ||
        null
    }
  }

  if(typeof value === 'number'){
    return {
      id: normalizeUserId(value),
      email: null
    }
  }

  if(typeof value === 'string'){
    const trimmed = value.trim()

    if(trimmed.includes('@')){
      return {
        id: null,
        email: trimmed.toLowerCase()
      }
    }

    const numeric = normalizeUserId(trimmed)

    if(numeric !== null){
      return {
        id: numeric,
        email: null
      }
    }
  }

  return {
    id: null,
    email: null
  }
}

function addNotification(notification){
  const list = load(KEY_NOTIFICATIONS)

  const nextId = getNextNumericId(list, 'id')

  const targetUserId = getNotificationTargetUserId(notification)

  const targetUserEmail = getNotificationTargetEmail(notification)

  const item = {
    id: nextId,
    notification_id: nextId,

    userId: targetUserId,
    user_id: targetUserId,

    targetUserId,
    target_user_id: targetUserId,

    targetUserEmail,
    target_user_email: targetUserEmail,

    message: notification.message || '',
    category: notification.category || '',
    data: notification.data || {},

    read: false,

    created_at: nowIso(),
    updated_at: nowIso()
  }

  list.unshift(item)

  save(KEY_NOTIFICATIONS, list)

  return item
}

function listNotificationsByUser(user){
  const normalized = normalizeNotificationRecipient(user)

  if(normalized.id === null && !normalized.email){
    return []
  }

  return load(KEY_NOTIFICATIONS)
    .filter(notification => {
      const targetId = getNotificationTargetUserId(notification)
      const targetEmail = getNotificationTargetEmail(notification)

      return (
        (normalized.id !== null && targetId === normalized.id) ||
        (normalized.email && targetEmail === normalized.email)
      )
    })
    .sort(
      (a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
    )
}

function getUnreadNotificationCount(user){
  return listNotificationsByUser(user)
    .filter(notification => !notification.read)
    .length
}

function markNotificationRead(id){
  const list = load(KEY_NOTIFICATIONS)

  const idx = list.findIndex(
    item =>
      String(item.notification_id) === String(id) ||
      String(item.id) === String(id)
  )

  if(idx === -1) return null

  list[idx] = {
    ...list[idx],
    read: true,
    updated_at: nowIso()
  }

  save(KEY_NOTIFICATIONS, list)

  return list[idx]
}

function markAllNotificationsRead(user){
  const normalized = normalizeNotificationRecipient(user)

  if(normalized.id === null && !normalized.email){
    return []
  }

  const list = load(KEY_NOTIFICATIONS)

  const updated = list.map(item => {
    const targetId = getNotificationTargetUserId(item)
    const targetEmail = getNotificationTargetEmail(item)

    const matched =
      (normalized.id !== null &&
        targetId === normalized.id) ||
      (normalized.email &&
        targetEmail === normalized.email)

    if(matched && !item.read){
      return {
        ...item,
        read: true,
        updated_at: nowIso()
      }
    }

    return item
  })

  save(KEY_NOTIFICATIONS, updated)

  return updated.filter(item => {
    const targetId = getNotificationTargetUserId(item)
    const targetEmail = getNotificationTargetEmail(item)

    return (
      (normalized.id !== null &&
        targetId === normalized.id) ||
      (normalized.email &&
        targetEmail === normalized.email)
    )
  })
}

function removeNotificationsByDataKey(key, value){
  if(!key) return []
  const list = load(KEY_NOTIFICATIONS)
  const filtered = list.filter(item => {
    if(!item || !item.data) return true
    return String(item.data[key]) !== String(value)
  })
  save(KEY_NOTIFICATIONS, filtered)
  return filtered
}

function removeNotificationsForComplaint(complaintId){
  return removeNotificationsByDataKey('complaint_id', complaintId)
}

function removeNotificationsForDocumentRequest(requestId){
  return removeNotificationsByDataKey('request_id', requestId)
}

function isOwnedBy(item, currentUser){
  if(!item || !currentUser) return false

  const ownerId = normalizeUserId(
    item.userId ??
    item.user_id ??
    item.resident_id ??
    item.residentId ??
    item.ownerId ??
    item.owner_id
  )

  const currentUserId = normalizeUserId(
    currentUser.id ??
    currentUser.user_id ??
    currentUser.userId
  )

  return (
    ownerId !== null &&
    currentUserId !== null &&
    ownerId === currentUserId
  )
}

function seed(){
  if(!localStorage.getItem(KEY_USERS)){
    const users = [
      {
        id: 1,
        name: 'Admin',
        first_name: 'Admin',
        last_name: '',
        email: 'admin@gmail.com',
        password: '123',
        address: 'Barangay Hall, Mambog II',
        role: 'admin'
      },
      {
        id: 2,
        name: 'Carlo',
        first_name: 'Carlo',
        last_name: '',
        email: 'carlo@gmail.com',
        password: '123',
        address: 'Phase 1, Block 5, Lot 12, Mambog II',
        role: 'resident'
      }
    ]

    save(KEY_USERS, users)
  }

  if(!localStorage.getItem(KEY_COMPLAINTS)){
    save(KEY_COMPLAINTS, [])
  }

  if(!localStorage.getItem(KEY_DOCS)){
    save(KEY_DOCS, [])
  }

  if(!localStorage.getItem(KEY_NOTIFICATIONS)){
    save(KEY_NOTIFICATIONS, [])
  }

  const REQUIRED_DEFAULT_CATEGORIES = [
    'Noise',
    'Garbage',
    'Traffic',
    'Water Supply',
    'Electricity',
    'Public Safety',
    'Other'
  ]

  if(!localStorage.getItem(KEY_CATEGORIES)){
    save(KEY_CATEGORIES, REQUIRED_DEFAULT_CATEGORIES)
  } else {
    try {
      const existing = JSON.parse(
        localStorage.getItem(KEY_CATEGORIES) || '[]'
      )

      if(Array.isArray(existing)){
        const merged = [...existing]

        REQUIRED_DEFAULT_CATEGORIES.forEach(cat => {
          if(
            !merged.some(
              e =>
                String(e).toLowerCase() ===
                String(cat).toLowerCase()
            )
          ){
            merged.push(cat)
          }
        })

        save(KEY_CATEGORIES, merged)
      }
    } catch {
      save(KEY_CATEGORIES, REQUIRED_DEFAULT_CATEGORIES)
    }
  }

  if(!localStorage.getItem(KEY_SYSTEM_SETTINGS)){
    save(KEY_SYSTEM_SETTINGS, {
      systemName:
        'Barangay Service & Complaint Management System',
      contactEmail: 'brgy.mambog.ii@gmail.com'
    })
  }
}

seed()

function findUserByEmail(email){
  const users = load(KEY_USERS)

  return users.find(
    u => u.email?.toLowerCase() === email?.toLowerCase()
  )
}

const api = {
  // =========================
  // AU
  register(data){
    const users = load(KEY_USERS)

    if(findUserByEmail(data.email)){
      return {
        success: false,
        message: 'Email already used'
      }
    }

    const id = getNextNumericId(users, 'id')

    const first_name = data.first_name || ''
    const last_name = data.last_name || ''

    const name =
      data.name ||
      `${first_name}${last_name ? ' ' + last_name : ''}`.trim() ||
      data.email

    const user = {
      id,
      name,

      first_name,
      middle_name: data.middle_name || '',
      last_name,
      suffix: data.suffix || '',

      gender: data.gender || '',
      birthdate: data.birthdate || '',

      phase: data.phase || '',
      street: data.street || '',
      block: data.block || '',
      lot: data.lot || '',

      address: data.address || '',

      email: data.email,
      password: data.password,

      role: 'resident',

      created_at: nowIso()
    }

    users.push(user)

    save(KEY_USERS, users)

    getAdminUsers().forEach(admin => {
      addNotification({
        targetUserId: admin.id,
        targetUserEmail: admin.email,
        message: `New resident registration: ${user.name || user.email}`,
        category: 'registration',
        data: {
          user_id: user.id,
          userId: user.id
        }
      })
    })

    const token = 'tok_' + id

    return {
      success: true,
      token,
      user
    }
  },

  login(email, password){
    const user = findUserByEmail(email)

    if(!user || user.password !== password){
      return {
        success: false,
        message: 'Invalid credentials'
      }
    }

    const token = 'tok_' + user.id

    return {
      success: true,
      token,
      user
    }
  },

  getCurrentUser(){
    let token = localStorage.getItem('token')

    if(!token){
      token = sessionStorage.getItem('token')
    }

    if(!token) return null

    const id = parseInt(token.split('_')[1], 10)

    if(Number.isNaN(id)) return null

    const users = load(KEY_USERS)

    return users.find(u => u.id === id) || null
  },

  updateUser(id, updates){
    const users = load(KEY_USERS)

    const idx = users.findIndex(
      u => String(u.id) === String(id)
    )

    if(idx === -1) return null

    users[idx] = {
      ...users[idx],
      ...updates,
      updated_at: nowIso()
    }

    save(KEY_USERS, users)

    return users[idx]
  },

  // =========================
  // NOTIFICATIONS
  // =========================

  listNotificationsByUser(userId){
    return listNotificationsByUser(userId)
  },

  getUnreadNotificationCount(userId){
    return getUnreadNotificationCount(userId)
  },

  markNotificationRead(id){
    return markNotificationRead(id)
  },

  markAllNotificationsRead(userId){
    return markAllNotificationsRead(userId)
  },

  notifyAdmins(notification){
    const admins = getAdminUsers()

    admins.forEach(admin => {
      addNotification({
        targetUserId: admin.id,
        targetUserEmail: admin.email,
        message: notification.message || '',
        category: notification.category || '',
        data: notification.data || {}
      })
    })

    return { success: true }
  },

  // =========================
  // COMPLAINTS
  // =========================

  listComplaints(){
    return load(KEY_COMPLAINTS)
  },

  listComplaintsByUser(userId){
    const normalizedUserId = normalizeUserId(userId)

    if(normalizedUserId === null){
      return []
    }

    return load(KEY_COMPLAINTS).filter(
      complaint =>
        getItemOwnerId(complaint) === normalizedUserId
    )
  },

  addComplaint(c){
    const list = load(KEY_COMPLAINTS)

    const currentUser = api.getCurrentUser()

    const numericId = getNextNumericId(list, 'numericId')

    const reference = generateComplaintRef(list)

    const residentName =
      c.resident_name ||
      c.name ||
      currentUser?.name ||
      ''

    const userId = normalizeUserId(
      c.userId ?? getUserId(currentUser)
    )

    const timestamp = nowIso()

    const item = {
      numericId,

      id: reference,
      ref: reference,
      complaint_id: numericId,

      userId,
      user_id: userId,
      resident_id: userId,
      residentId: userId,
      ownerId: userId,
      owner_id: userId,

      resident_name: residentName,
      name: residentName,

      respondent_name: c.respondent_name || '',
      respondent_contact: c.respondent_contact || '',

      category: c.category || c.category_id || '',
      category_id: c.category || c.category_id || '',

      title: c.title || '',
      description: c.description || '',
      location: c.location || '',

      anonymous: !!c.anonymous,

      notes: c.notes || '',
      images: Array.isArray(c.images)
        ? c.images.map((image) => {
            if(!image) return null
            if(typeof image === 'string') {
              return { url: image, type: 'image/*', name: 'Media file' }
            }
            if(image.url && typeof image.url === 'string') {
              return {
                url: image.url,
                type: image.type || 'image/*',
                name: image.name || 'Media file',
                size: image.size || 0
              }
            }
            if(image instanceof File) {
              return {
                name: image.name,
                type: image.type,
                size: image.size,
                url: URL.createObjectURL(image)
              }
            }
            return null
          }).filter(Boolean)
        : [],

      status: c.status || 'Submitted',

      date: c.date || todayYmd(),

      created: timestamp,
      created_at: timestamp,
      date_submitted: timestamp
    }

    list.unshift(item)

    save(KEY_COMPLAINTS, list)

    const authorName =
      currentUser?.name ||
      currentUser?.first_name ||
      currentUser?.email ||
      'Resident'

    getAdminUsers().forEach(admin => {
      addNotification({
        targetUserId: admin.id,
        targetUserEmail: admin.email,
        message: `New complaint submitted by ${authorName}: ${item.title || item.category || item.ref}`,
        category: 'complaint',
        data: {
          complaint_id: item.complaint_id,
          ref: item.ref
        }
      })
    })

    return item
  },

  updateComplaintStatus(id, status){
    const list = load(KEY_COMPLAINTS)

    const idx = list.findIndex(item => {
      const isEqual = value =>
        value === id ||
        String(value) === String(id)

      return (
        isEqual(item.id) ||
        isEqual(item.complaint_id) ||
        isEqual(item.numericId)
      )
    })

    if(idx === -1){
      return {
        success: false,
        message: 'Complaint not found'
      }
    }

    list[idx].status = status
    list[idx].updated_at = nowIso()

    const ownerId = list[idx].resident_id || list[idx].user_id || list[idx].owner_id
    if(ownerId){
      const title = list[idx].title || list[idx].category || list[idx].ref || 'Complaint'
      addNotification({
        targetUserId: ownerId,
        message: `Your complaint "${title}" status is now ${status}.`, 
        category: 'complaint_status',
        data: {
          complaint_id: list[idx].complaint_id,
          status
        }
      })
    }

    save(KEY_COMPLAINTS, list)

    return {
      success: true,
      data: list[idx]
    }
  },

  updateComplaint(id, updates, currentUser){
    const list = load(KEY_COMPLAINTS)

    const idx = list.findIndex(item => {
      const isEqual = value =>
        value === id ||
        String(value) === String(id)

      return (
        isEqual(item.id) ||
        isEqual(item.complaint_id) ||
        isEqual(item.numericId)
      )
    })

    if(idx === -1){
      return {
        success: false,
        message: 'Complaint not found'
      }
    }

    currentUser = currentUser || api.getCurrentUser()

    if(!currentUser){
      return {
        success: false,
        message: 'Not authenticated'
      }
    }

    const complaint = list[idx]

    const isAdmin =
      currentUser.role === 'admin' ||
      currentUser.role === 'staff'

    if(!isAdmin && !isOwnedBy(complaint, currentUser)){
      return {
        success: false,
        message: 'Unauthorized to update this complaint'
      }
    }

    list[idx] = {
      ...list[idx],
      ...updates,
      updated_at: nowIso()
    }

    save(KEY_COMPLAINTS, list)

    return {
      success: true,
      data: list[idx]
    }
  },

  deleteComplaint(id, currentUser){
    currentUser = currentUser || api.getCurrentUser()

    const list = load(KEY_COMPLAINTS)

    const foundIdx = list.findIndex(complaint => {
      return (
        String(complaint.complaint_id) === String(id) ||
        String(complaint.numericId) === String(id) ||
        String(complaint.id) === String(id)
      )
    })

    if(foundIdx === -1){
      return {
        success: false,
        message: 'Complaint not found'
      }
    }

    if(!currentUser){
      return {
        success: false,
        message: 'Not authenticated'
      }
    }

    const complaint = list[foundIdx]

    const isAdmin =
      currentUser.role === 'admin' ||
      currentUser.role === 'staff'

    if(!isAdmin && !isOwnedBy(complaint, currentUser)){
      return {
        success: false,
        message: 'Unauthorized to delete this complaint'
      }
    }

    list.splice(foundIdx, 1)

    save(KEY_COMPLAINTS, list)
    removeNotificationsForComplaint(complaint.complaint_id || complaint.id || complaint.numericId)

    return {
      success: true
    }
  },

  // =========================
  // CATEGORIES & SETTINGS
  // =========================

  listCategories(){
    return load(KEY_CATEGORIES)
  },

  saveCategories(categories){
    save(KEY_CATEGORIES, categories)
    return categories
  },

  getSystemSettings(){
    return loadJson(KEY_SYSTEM_SETTINGS, {
      systemName:
        'Barangay Service & Complaint Management System',
      contactEmail: 'brgy.mambog.ii@gmail.com'
    })
  },

  saveSystemSettings(settings){
    const existing = loadJson(KEY_SYSTEM_SETTINGS, {})

    const merged = {
      ...existing,
      ...settings
    }

    save(KEY_SYSTEM_SETTINGS, merged)

    return merged
  },

  getDocumentStatuses(){
    const defaultStatuses = {
      'Barangay Clearance': 'enabled',
      'Certificate of Residency': 'enabled',
      'Certificate of Indigency': 'enabled'
    }
    return loadJson(KEY_DOCUMENT_STATUSES, defaultStatuses)
  },

  saveDocumentStatuses(statuses){
    save(KEY_DOCUMENT_STATUSES, statuses)
    return statuses
  },

  toggleDocumentStatus(docType){
    const statuses = this.getDocumentStatuses()
    const current = statuses[docType] || 'enabled'
    statuses[docType] = current === 'enabled' ? 'disabled' : 'enabled'
    save(KEY_DOCUMENT_STATUSES, statuses)
    return statuses
  },

  // =========================
  // DOCUMENTS
  // =========================

  listDocs(){
    return load(KEY_DOCS)
  },

  listDocsByUser(userId){
    const normalizedUserId = normalizeUserId(userId)

    if(normalizedUserId === null){
      return []
    }

    return load(KEY_DOCS).filter(
      doc => getItemOwnerId(doc) === normalizedUserId
    )
  },

  addDoc(d){
    const list = load(KEY_DOCS)

    const currentUser = api.getCurrentUser()

    const numericId = getNextNumericId(list, 'numericId')

    const reference = generateDocRef(list)

    const userId = normalizeUserId(
      d.userId ?? getUserId(currentUser)
    )

    const timestamp = nowIso()

    const item = {
      numericId,

      id: reference,
      ref: reference,

      request_id: numericId,
      reference_number: reference,

      userId,
      user_id: userId,
      resident_id: userId,
      residentId: userId,
      ownerId: userId,
      owner_id: userId,

      type: d.type || d.document_type || '',
      document_type: d.document_type || d.type || '',

      purpose: d.purpose || '',
      name: d.name || '',
      birthdate: d.birthdate || '',
      address: d.address || '',
      notes: d.notes || '',

      status: d.status || 'Submitted',

      date: todayYmd(),

      created: timestamp,
      created_at: timestamp,
      date_requested: timestamp
    }

    list.unshift(item)

    save(KEY_DOCS, list)

    const authorName =
      currentUser?.name ||
      currentUser?.first_name ||
      currentUser?.email ||
      'Resident'

    getAdminUsers().forEach(admin => {
      addNotification({
        targetUserId: admin.id,
        targetUserEmail: admin.email,
        message: `New document request submitted by ${authorName}: ${item.document_type || item.type || item.reference_number}`,
        category: 'document_request',
        data: {
          request_id: item.request_id,
          reference_number: item.reference_number
        }
      })
    })

    return item
  },

  updateDocStatus(id, status){
    const list = load(KEY_DOCS)

    const idx = list.findIndex(item => {
      const isEqual = value =>
        value === id ||
        String(value) === String(id)

      return (
        isEqual(item.id) ||
        isEqual(item.request_id) ||
        isEqual(item.numericId)
      )
    })

    if(idx === -1){
      return {
        success: false,
        message: 'Document request not found'
      }
    }

    list[idx].status = status
    list[idx].updated_at = nowIso()

    const ownerId = list[idx].resident_id || list[idx].user_id || list[idx].owner_id
    if(ownerId){
      const label = list[idx].document_type || list[idx].type || list[idx].reference_number || 'Document request'
      const message = status === 'Released'
        ? `Your document request "${label}" has been released and is ready for pickup at the barangay.`
        : `Your document request "${label}" status is now ${status}.`

      addNotification({
        targetUserId: ownerId,
        message,
        category: 'document_status',
        data: {
          request_id: list[idx].request_id,
          status
        }
      })
    }

    save(KEY_DOCS, list)

    return {
      success: true,
      data: list[idx]
    }
  },

  updateDoc(id, updates, currentUser){
    const list = load(KEY_DOCS)

    const idx = list.findIndex(item => {
      const isEqual = value =>
        value === id ||
        String(value) === String(id)

      return (
        isEqual(item.id) ||
        isEqual(item.request_id) ||
        isEqual(item.numericId)
      )
    })

    if(idx === -1){
      return {
        success: false,
        message: 'Document not found'
      }
    }

    currentUser = currentUser || api.getCurrentUser()

    if(!currentUser){
      return {
        success: false,
        message: 'Not authenticated'
      }
    }

    const doc = list[idx]

    const isAdmin =
      currentUser.role === 'admin' ||
      currentUser.role === 'staff'

    if(!isAdmin && !isOwnedBy(doc, currentUser)){
      return {
        success: false,
        message: 'Unauthorized to update this document'
      }
    }

    list[idx] = {
      ...list[idx],
      ...updates,
      updated_at: nowIso()
    }

    save(KEY_DOCS, list)

    return {
      success: true,
      data: list[idx]
    }
  },

  deleteDoc(id, currentUser){
    currentUser = currentUser || api.getCurrentUser()

    const list = load(KEY_DOCS)

    const foundIdx = list.findIndex(doc => {
      return (
        String(doc.request_id) === String(id) ||
        String(doc.numericId) === String(id) ||
        String(doc.id) === String(id)
      )
    })

    if(foundIdx === -1){
      return {
        success: false,
        message: 'Document not found'
      }
    }

    if(!currentUser){
      return {
        success: false,
        message: 'Not authenticated'
      }
    }

    const doc = list[foundIdx]

    const isAdmin =
      currentUser.role === 'admin' ||
      currentUser.role === 'staff'

    if(!isAdmin && !isOwnedBy(doc, currentUser)){
      return {
        success: false,
        message: 'Unauthorized to delete this document'
      }
    }

    list.splice(foundIdx, 1)

    save(KEY_DOCS, list)
    removeNotificationsForDocumentRequest(doc.request_id || doc.id || doc.numericId)

    return {
      success: true
    }
  }
}

export default api
