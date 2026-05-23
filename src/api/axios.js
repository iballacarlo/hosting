import axios from 'axios'

// Direct connection to your live InfinityFree backend URL
const api = axios.create({
  baseURL: 'http://brgymambogdos.infinityfreeapp.com/backend/api.php',
  timeout: 15000, // Itinaas sa 15 seconds dahil mas matagal mag-respond ang cloud sa localhost
  headers: { 'Content-Type': 'application/json' }
})

// Auto-attach token to requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if(token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default api
