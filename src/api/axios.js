import axios from 'axios'

const api = axios.create({
  baseURL: 'https://brgymambogdos.up.railway.app',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use(config => {
  const token =
    localStorage.getItem('token') ||
    sessionStorage.getItem('token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export default api
