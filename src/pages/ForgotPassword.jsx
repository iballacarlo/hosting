import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import InputField from '../components/InputField'
import Button from '../components/Button'
import { useSettings } from '../context/SettingsContext'
import api from '../api/axios'
import '../styles/login.css'
import Logo from '../assets/Bacoor.png'

export default function ForgotPassword(){
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  
  const {
    dark, setDark,
    contrast, setContrast,
    fontSize, setFontSize
  } = useSettings()

  const [email, setEmail] = useState('')
  const [token, setToken] = useState(searchParams.get('token') || '')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [step, setStep] = useState(searchParams.get('token') ? 2 : 1)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)
  const [expiresAt, setExpiresAt] = useState(null)
  
  const panelRef = useRef(null)

  function normalizeApiData(data){
    if(typeof data !== 'string') return data || {}

    const trimmed = data.trim()
    if(!trimmed) return {}

    try {
      return JSON.parse(trimmed)
    } catch {
      const firstJson = trimmed.match(/\{[\s\S]*\}/)
      if(firstJson){
        try {
          return JSON.parse(firstJson[0])
        } catch {
          // Keep the readable text below when the response is not clean JSON.
        }
      }
    }

    return {
      success: false,
      message: trimmed.slice(0, 300)
    }
  }

  function getResponseErrorMessage(res, fallback){
    const data = normalizeApiData(res?.data)
    if(data?.message) return data.message
    return `${fallback}${res?.status ? ` (HTTP ${res.status})` : ''}`
  }

  function getApiErrorMessage(err, fallback){
    const data = normalizeApiData(err?.response?.data)
    if(data?.message) return data.message
    if(err?.response?.status) return `${fallback} (HTTP ${err.response.status})`
    return err?.message || fallback
  }

  useEffect(() => {
    function onDown(e){
      if(!settingsOpen) return
      const el = panelRef.current
      if(el && !el.contains(e.target)) setSettingsOpen(false)
    }

    function onEsc(e){
      if(e.key === 'Escape') setSettingsOpen(false)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)

    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [settingsOpen])

  useEffect(() => {
    if(resendSeconds <= 0) return undefined
    const timer = window.setInterval(() => {
      setResendSeconds(seconds => Math.max(0, seconds - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [resendSeconds])

  function validateStep1(){
    const e = {}
    if(!email.trim()) e.email = 'Email is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function validateStep2(){
    const e = {}
    if(!email.trim()) e.email = 'Email is required'
    if(!token.trim()) e.token = 'Reset code is required'
    if(token.trim() && token.trim().length !== 6) e.token = 'Enter the 6-digit reset code'
    if(!password.trim()) e.password = 'Password is required'
    if(password && password.length < 6) e.password = 'Password must be at least 6 characters'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function requestResetCode(){
    if(!validateStep1()) return

    setLoading(true)
    try{
      const res = await api.post('/forgot-password', { email }, { timeout: 45000 })
      const data = normalizeApiData(res.data)
      
      if(data.success){
        setToken('')
        setSuccessMessage(data.message || 'OTP sent to your email.')
        setResendSeconds(data.resend_after || 30)
        setExpiresAt(Date.now() + ((data.expires_in || 900) * 1000))
        setErrors({})
        setStep(2)
      } else {
        if(data.retry_after) setResendSeconds(data.retry_after)
        setErrors({ form: getResponseErrorMessage(res, 'Failed to request reset') })
      }
    } catch(err){
      const data = normalizeApiData(err?.response?.data)
      if(data?.retry_after) setResendSeconds(data.retry_after)
      setErrors({ form: getApiErrorMessage(err, 'Failed to request reset') })
    } finally {
      setLoading(false)
    }
  }

  function setOtpValue(value){
    setToken(String(value || '').replace(/\D/g, '').slice(0, 6))
  }

  function handleOtpChange(index, value){
    const digits = String(value || '').replace(/\D/g, '')
    if(!digits){
      const next = token.split('')
      next[index] = ''
      setOtpValue(next.join(''))
      return
    }

    const next = token.padEnd(6, ' ').split('')
    digits.split('').forEach((digit, offset) => {
      if(index + offset < 6) next[index + offset] = digit
    })
    const updated = next.join('').replace(/\s/g, '')
    setOtpValue(updated)

    const nextIndex = Math.min(index + digits.length, 5)
    window.requestAnimationFrame(() => {
      document.getElementById(`otp-${nextIndex}`)?.focus()
    })
  }

  function handleOtpKeyDown(index, e){
    if(e.key === 'Backspace' && !token[index] && index > 0){
      e.preventDefault()
      document.getElementById(`otp-${index - 1}`)?.focus()
      const next = token.split('')
      next[index - 1] = ''
      setOtpValue(next.join(''))
    }

    if(e.key === 'ArrowLeft' && index > 0){
      e.preventDefault()
      document.getElementById(`otp-${index - 1}`)?.focus()
    }

    if(e.key === 'ArrowRight' && index < 5){
      e.preventDefault()
      document.getElementById(`otp-${index + 1}`)?.focus()
    }
  }

  function handleOtpPaste(e){
    const pasted = e.clipboardData.getData('text')
    const digits = pasted.replace(/\D/g, '').slice(0, 6)
    if(!digits) return
    e.preventDefault()
    setOtpValue(digits)
    window.requestAnimationFrame(() => {
      document.getElementById(`otp-${Math.min(digits.length, 6) - 1}`)?.focus()
    })
  }

  async function handleRequestReset(e){
    e.preventDefault()
    await requestResetCode()
  }

  async function handleResendCode(){
    if(resendSeconds > 0 || loading) return
    await requestResetCode()
  }

  async function handleResetPassword(e){
    e.preventDefault()
    if(!validateStep2()) return

    setLoading(true)
    try{
      const res = await api.post('/reset-password', { email, token, password }, { timeout: 30000 })
      const data = normalizeApiData(res.data)

      if(data.success){
        setSuccessMessage('Password reset successfully! Redirecting to login...')
        setErrors({})
        setResendSeconds(0)
        setExpiresAt(null)
        setTimeout(() => navigate('/login'), 2000)
      } else {
        setErrors({ form: getResponseErrorMessage(res, 'Failed to reset password') })
      }
    } catch(err){
      setErrors({ form: getApiErrorMessage(err, 'Failed to reset password') })
    } finally {
      setLoading(false)
    }
  }

  const fontOptions = useMemo(() => ([
    { key: 'small', label: 'S' },
    { key: 'medium', label: 'M' },
    { key: 'large', label: 'L' },
    { key: 'xlarge', label: 'XL' },
  ]), [])

  return (
    <div className="login-shell">
      <header className="login-topbar">
        <div className="topbar-left">
          <Link to="/login" className="topbar-brand" aria-label="Go to login page">
            <img
              src="/src/assets/Bacoor.png"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = Logo
              }}
              alt="City of Bacoor logo"
              className="topbar-logo"
            />

            <div className="brand-copy">
              <div className="brand-kicker">Barangay</div>
              <div className="brand-name">Mambog II</div>
            </div>
          </Link>
        </div>

        <div className="topbar-center">
          <h1 className="system-title">Barangay Service &amp; Complaint Management System</h1>
          <p className="system-subtitle">
            Online platform for complaint submission and barangay document requests
          </p>
        </div>

        <div className="topbar-right" ref={panelRef}>
          <button
            type="button"
            className="settings-btn"
            aria-label="Open display settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(v => !v)}
            title="Display settings"
          >
            <span className="settings-gear">⚙</span>
            <span className="settings-text">Settings</span>
          </button>

          {settingsOpen && (
            <div className="settings-panel" role="dialog" aria-label="Display settings">
              <div className="settings-head">
                <strong>Display Settings</strong>
                <button
                  type="button"
                  className="settings-close"
                  aria-label="Close settings"
                  onClick={() => setSettingsOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="settings-item">
                <div className="settings-label">
                  <span>High contrast</span>
                  <small>Improve visibility and borders</small>
                </div>

                <label className="switch">
                  <input
                    type="checkbox"
                    checked={contrast}
                    onChange={(e) => setContrast(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="settings-item">
                <div className="settings-label">
                  <span>Dark mode</span>
                  <small>Use darker page colors</small>
                </div>

                <label className="switch">
                  <input
                    type="checkbox"
                    checked={dark}
                    onChange={(e) => setDark(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="settings-divider" />

              <div className="settings-label block">
                <span>Font size</span>
                <small>Adjust text size for readability</small>
              </div>

              <div className="font-size-row" role="group" aria-label="Font size">
                {fontOptions.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`chip ${fontSize === opt.key ? 'active' : ''}`}
                    onClick={() => setFontSize(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="login-main">
        <section className="login-layout single-card">
          {step === 1 && (
            <form className="login-card" onSubmit={handleRequestReset} aria-labelledby="resetTitle" noValidate>
              <div className="login-body">
                <div className="card-head">
                  <h2 id="resetTitle" className="card-title">Forgot password?</h2>
                  <p className="card-sub">Enter your email address to receive a reset code.</p>
                </div>

                <InputField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  error={errors.email}
                  placeholder="Enter your registered email"
                  autoComplete="email"
                />

                {successMessage && <div className="success">{successMessage}</div>}
                {errors.form && <div className="error">{errors.form}</div>}

                <div className="actions">
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Sending...' : 'Send Reset Code'}
                  </Button>
                </div>

                <p className="muted bottom-text">
                  Remember your password? <Link to="/login">Login here</Link>
                </p>
              </div>
            </form>
          )}

          {step === 2 && (
            <form className="login-card" onSubmit={handleResetPassword} aria-labelledby="resetPasswordTitle" noValidate>
              <div className="login-body">
                <div className="card-head">
                  <h2 id="resetPasswordTitle" className="card-title">Reset password</h2>
                  <p className="card-sub">
                    Enter your reset code and new password{expiresAt ? '. Your OTP expires in 15 minutes.' : '.'}
                  </p>
                </div>

                <InputField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  error={errors.email}
                  placeholder="Enter your email"
                  autoComplete="email"
                  disabled
                />

                <div className={`otp-group ${errors.token ? 'has-error' : ''}`}>
                  <label className="field-label" htmlFor="otp-0">Reset Code</label>

                  <div className="otp-inputs" onPaste={handleOtpPaste}>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <input
                        key={index}
                        id={`otp-${index}`}
                        className="otp-input"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        enterKeyHint="next"
                        maxLength={1}
                        value={token[index] || ''}
                        aria-label={`Reset code digit ${index + 1}`}
                        onChange={e => handleOtpChange(index, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(index, e)}
                        onFocus={e => e.target.select()}
                      />
                    ))}
                  </div>

                  {errors.token && <div className="error otp-error">{errors.token}</div>}
                </div>

                <InputField
                  label="New Password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  error={errors.password}
                  allowToggle
                  placeholder="Enter new password"
                  autoComplete="new-password"
                />

                {successMessage && <div className="success">{successMessage}</div>}
                {errors.form && <div className="error">{errors.form}</div>}

                <div className="actions">
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </Button>
                </div>

                <p className="muted bottom-text">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={loading || resendSeconds > 0}
                    style={{background: 'none', border: 'none', color: resendSeconds > 0 ? 'var(--muted-color)' : 'var(--link-color)', cursor: resendSeconds > 0 ? 'not-allowed' : 'pointer', textDecoration: 'underline', marginRight: '12px'}}
                  >
                    {resendSeconds > 0 ? `Resend OTP in ${resendSeconds}s` : 'Resend OTP'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep(1)
                      setPassword('')
                      setErrors({})
                      setSuccessMessage('')
                      setResendSeconds(0)
                      setExpiresAt(null)
                    }}
                    style={{background: 'none', border: 'none', color: 'var(--link-color)', cursor: 'pointer', textDecoration: 'underline'}}
                  >
                    Back to request code
                  </button>
                </p>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
