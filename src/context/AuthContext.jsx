import React, { createContext, useContext, useEffect, useState } from 'react'
import api from '../api/axios'
import mockApi from '../api/mockApi'

const AuthContext = createContext()

export function AuthProvider({ children }){
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    if(token){
      api.get('/me').then(res=>{
        if(res.data && res.data.success){
          setUser(res.data.user)
        } else {
          localStorage.removeItem('token')
          sessionStorage.removeItem('token')
        }
        setLoading(false)
      }).catch(()=>{
        localStorage.removeItem('token')
        sessionStorage.removeItem('token')
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
  },[])

  async function login(email, password, remember = true){
    try{
      const res = await api.post('/login', { email, password })
      if(res.data && res.data.success){
        const returnedStatus = String(res.data.user?.account_status || res.data.status || '').toLowerCase()
        const inferredStatus = returnedStatus || (typeof res.data.message === 'string' && /banned/i.test(res.data.message) ? 'banned' : (typeof res.data.message === 'string' && /suspended/i.test(res.data.message) ? 'suspended' : ''))
        if(inferredStatus === 'banned' || inferredStatus === 'suspended'){
          return {
            ok:false,
            message: res.data.message || (inferredStatus === 'banned' ? 'Your account has been banned.' : 'Your account is suspended.'),
            status: inferredStatus,
            suspensionEnd: res.data.user?.suspension_end_date || res.data.suspension_end_date
          }
        }
        if(remember){
          sessionStorage.removeItem('token')
          localStorage.setItem('token', res.data.token)
        } else {
          localStorage.removeItem('token')
          sessionStorage.setItem('token', res.data.token)
        }
        const loggedUser = {
          ...res.data.user,
          email: res.data.user?.email || email,
          username: res.data.user?.username || email
        }
        setUser(loggedUser)
        return { ok:true, role: loggedUser?.role, status: loggedUser?.account_status, suspensionEnd: loggedUser?.suspension_end_date }
      }
      return { ok:false, message: res.data.message || 'Login failed', status: res.data.status, suspensionEnd: res.data.suspension_end_date, retryAfter: res.data.retry_after }
    }catch(err){
      // Axios "Network Error" means the request never reached the backend
      if(err.message === 'Network Error'){
        return { ok:false, message: 'Unable to contact backend API. Make sure the PHP server is running and the URL is correct.' }
      }
      return { ok:false, message: err?.response?.data?.message || err.message, retryAfter: err?.response?.data?.retry_after }
    }
  }

  async function register(data){
    try{
      const res = await api.post('/register', data)
      if(res.data && res.data.success){
        localStorage.setItem('token', res.data.token)
        const registeredUser = {
          ...res.data.user,
          email: res.data.user?.email || data.email,
          username: res.data.user?.username || data.email
        }
        setUser(registeredUser)
        return { ok:true }
      }
      return { ok:false, message: res.data.message || 'Register failed' }
    }catch(err){
      if(err.message === 'Network Error'){
        return { ok:false, message: 'Unable to contact backend API. Make sure the PHP server is running and the URL is correct.' }
      }
      return { ok:false, message: err?.response?.data?.message || err.message }
    }
  }

  function logout(){
    if(user?.id){
      const currentKey = `settings_${user.id}`
      const guestKey = 'settings_guest'
      const saved = localStorage.getItem(currentKey)
      if(saved){
        localStorage.setItem(guestKey, saved)
      }
    }
    localStorage.removeItem('token')
    sessionStorage.removeItem('token')
    setUser(null)
  }

  async function updateProfile(data){
    try{
      const res = await api.patch('/profile', data)
      if(res.data?.success){
        if(res.data.user){
          setUser(res.data.user)
        } else {
          setUser(prev => ({ ...prev, ...data }))
        }
        return { ok:true }
      }
      return { ok:false, message: res.data?.message || 'Failed to update profile' }
    }catch(err){
      return { ok:false, message: err?.response?.data?.message || err.message || 'Failed to update profile' }
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(){
  return useContext(AuthContext)
}
