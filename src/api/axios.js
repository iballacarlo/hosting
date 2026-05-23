import axios from 'axios'

// Direct connection to your live Railway backend URL
const api = axios.create({
  baseURL: 'https://brgymambogdos.up.railway.app',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

// Auto-attach token to requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')

  if(token){
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export default api
