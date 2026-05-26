import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import InputField from '../components/InputField'
import Button from '../components/Button'
import { useSettings } from '../context/SettingsContext'
import api from '../api/axios'
import '../styles/login.css'
import Logo from '../assets/Bacoor.png'
import { addressData } from '../data/addressData'
import { sortTextAsc } from '../utils/sortOptions'
// use AuthContext.register for creating account + auto-login

export default function Register(){
  const { register } = useAuth()
  const navigate = useNavigate()

  const {
    dark, setDark,
    contrast, setContrast,
    fontSize, setFontSize
  } = useSettings()

  const [form, setForm] = useState({
    first: '',
    middle: '',
    last: '',
    suffix: '',
    birthdate: '',
    gender: '',
    phase: '',
    street: '',
    block: '',
    lot: '',
    email: '',
    password: '',
    confirm: '',
  })

  const [currentStep, setCurrentStep] = useState(0)
  const [err, setErr] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const panelRef = useRef(null)

  function setField(key, value){
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const stepLabels = ['Personal', 'Address', 'Account', 'Verify']

  function getEmailError(email){
    const value = email.trim().toLowerCase()
    if(!value) return 'Email is required.'
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)){
      return 'Enter a valid email address.'
    }

    const domain = value.split('@').pop()
    const commonDomains = [
      'gmail.com',
      'yahoo.com',
      'ymail.com',
      'outlook.com',
      'hotmail.com',
      'live.com',
      'icloud.com',
      'aol.com',
      'proton.me',
      'protonmail.com',
      'mail.com',
    ]

    if(!commonDomains.includes(domain)){
      let suggestion = ''
      let bestDistance = Number.POSITIVE_INFINITY

      commonDomains.forEach(commonDomain => {
        const distance = levenshtein(domain, commonDomain)
        if(distance < bestDistance){
          bestDistance = distance
          suggestion = commonDomain
        }
      })

      if(bestDistance <= 2){
        return 'Enter a valid email domain.'
      }
    }

    return ''
  }

  function levenshtein(a, b){
    const matrix = Array.from({ length: a.length + 1 }, (_, row) => [row])
    for(let col = 1; col <= b.length; col++) matrix[0][col] = col

    for(let row = 1; row <= a.length; row++){
      for(let col = 1; col <= b.length; col++){
        const cost = a[row - 1] === b[col - 1] ? 0 : 1
        matrix[row][col] = Math.min(
          matrix[row - 1][col] + 1,
          matrix[row][col - 1] + 1,
          matrix[row - 1][col - 1] + cost
        )
      }
    }

    return matrix[a.length][b.length]
  }

  function getPasswordError(password){
    if(password.length < 8) return 'Password must be at least 8 characters.'
    if(!/[a-z]/.test(password)) return 'Password must include a lowercase letter.'
    if(!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.'
    if(!/\d/.test(password)) return 'Password must include a number.'
    if(!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character.'
    return ''
  }

  function isStrongPassword(password){
    return getPasswordError(password) === ''
  }

  function isStepValid(step){
    if(step === 0){
      return (
        form.first.trim() &&
        form.last.trim() &&
        form.birthdate.trim() &&
        form.gender.trim()
      )
    }

    if(step === 1){
      return form.phase.trim() && form.street.trim() && form.block.trim() && form.lot.trim()
    }

    if(step === 2){
      return !getEmailError(form.email) && isStrongPassword(form.password) && form.password === form.confirm
    }

    if(step === 3){
      return otp.trim().length === 6
    }

    return false
  }

  function validateStep(step){
    if(step === 0){
      if(!isStepValid(0)){
        setErr('Please complete all personal information before continuing.')
        return false
      }
      if(form.birthdate && new Date(form.birthdate) > new Date()){
        setErr('Birthdate cannot be in the future.')
        return false
      }
    }

    if(step === 1){
      if(!isStepValid(1)){
        setErr('Please complete all address information before continuing.')
        return false
      }
    }

    if(step === 2){
      const emailError = getEmailError(form.email)
      if(emailError){
        setErr(emailError)
        return false
      }

      const passwordError = getPasswordError(form.password)
      if(passwordError){
        setErr(passwordError)
        return false
      }

      if(form.password !== form.confirm){
        setErr('Passwords do not match.')
        return false
      }
    }

    if(step === 3){
      if(!otp.trim()){
        setErr('Registration code is required.')
        return false
      }

      if(otp.trim().length !== 6){
        setErr('Enter the 6-digit registration code.')
        return false
      }
    }

    setErr('')
    return true
  }

  function canGoToStep(index){
    if(index <= currentStep) return true
    if(index === 3) return currentStep === 3
    for(let i = 0; i < index; i++){
      if(!isStepValid(i)) return false
    }
    return true
  }

  const passwordsMatch =
    form.password.length > 0 &&
    form.confirm.length > 0 &&
    form.password === form.confirm

  const passwordsMismatch =
    form.password.length > 0 &&
    form.confirm.length > 0 &&
    form.password !== form.confirm

  const passwordChecks = [
    { label: 'At least 8 characters', ok: form.password.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(form.password) },
    { label: 'Lowercase letter', ok: /[a-z]/.test(form.password) },
    { label: 'Number', ok: /\d/.test(form.password) },
    { label: 'Special character', ok: /[^A-Za-z0-9]/.test(form.password) },
  ]

  const maxBirthdate = useMemo(() => new Date().toISOString().split('T')[0], [])

  function getRegistrationPayload(){
    const fullAddress = `${form.phase}, ${form.street}, Block ${form.block}, Lot ${form.lot}`

    return {
      first_name: form.first,
      middle_name: form.middle,
      last_name: form.last,
      suffix: form.suffix || '',

      birth_date: form.birthdate,
      gender: form.gender,
      address: fullAddress,

      email: form.email,
      password: form.password,
      otp
    }
  }

  async function requestRegistrationOtp(){
    setErr('')
    setSuccessMessage('')

    if(!validateStep(0) || !validateStep(1) || !validateStep(2)){
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/register-otp', { email: form.email }, { timeout: 45000 })
      if(res.data?.success){
        setOtp('')
        setCurrentStep(3)
        setSuccessMessage(res.data.message || 'OTP sent to your email.')
        setResendSeconds(res.data.resend_after || 30)
      } else {
        setErr(res.data?.message || 'Failed to send registration code.')
      }
    } catch(err){
      const retryAfter = err.response?.data?.retry_after
      if(retryAfter) setResendSeconds(retryAfter)
      setErr(err.response?.data?.message || err.message || 'Failed to send registration code.')
    } finally {
      setLoading(false)
    }
  }

  async function handle(e){
    e.preventDefault()
    setErr('')
    setSuccessMessage('')

    if(!validateStep(0) || !validateStep(1) || !validateStep(2) || !validateStep(3)){
      return
    }

    setLoading(true)
    try {
      // call AuthContext.register so token and user are set on success
      const result = await register(getRegistrationPayload())
      if(result.ok){
        // registration succeeded and user is signed in; go to resident dashboard
        navigate('/dashboard')
      } else {
        setErr(result.message || 'Registration failed')
      }

    } catch(err){
      console.error(err)
      setErr(err.response?.data?.message || err.message || 'Server error')
    } finally {
      setLoading(false)
    }
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

  const fontOptions = useMemo(() => ([
    { key: 'small', label: 'S' },
    { key: 'medium', label: 'M' },
    { key: 'large', label: 'L' },
    { key: 'xlarge', label: 'XL' },
  ]), [])

  return (
    <div className="login-shell register-shell">
      <header className="login-topbar">
        <div className="topbar-left">
          <Link to="/login" className="topbar-brand" aria-label="Go to login page">
            <img
              src={Logo}
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
        <form
          className="login-card register-card"
          onSubmit={(e) => {
            if(currentStep === 3){
              handle(e)
              return
            }
            e.preventDefault()
            if(currentStep === 2) requestRegistrationOtp()
          }}
          noValidate
        >
          <div className="login-body">
            <div className="card-head">
              <h2 className="card-title">Create Account</h2>
              <p className="card-sub">Fill out your details to create your resident account.</p>
            </div>

            <div className="register-steps" aria-label="Registration steps">
              {stepLabels.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`step-item ${currentStep === index ? 'step-active' : ''}`}
                  onClick={() => canGoToStep(index) && setCurrentStep(index)}
                  disabled={!canGoToStep(index)}
                >
                  <span className="step-count">{index + 1}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="register-grid">
              {currentStep === 0 && (
                <div className="register-col">
                  <div className="register-title">
                    <span className="step-pill">1</span>
                    Personal Information
                  </div>

                  <InputField
                    label="First Name *"
                    value={form.first}
                    onChange={e => setField('first', e.target.value)}
                    placeholder="Juan"
                    autoComplete="given-name"
                  />

                  <InputField
                    label="Middle Name"
                    value={form.middle}
                    onChange={e => setField('middle', e.target.value)}
                    placeholder="Optional"
                    autoComplete="additional-name"
                  />

                  <InputField
                    label="Last Name *"
                    value={form.last}
                    onChange={e => setField('last', e.target.value)}
                    placeholder="Dela Cruz"
                    autoComplete="family-name"
                  />

                  <InputField
                    label="Suffix"
                    value={form.suffix}
                    onChange={e => setField('suffix', e.target.value)}
                    placeholder="Optional"
                    autoComplete="honorific-suffix"
                  />

                  <InputField
                    label="Birthdate *"
                    type="date"
                    max={maxBirthdate}
                    value={form.birthdate || ''}
                    onChange={e => setField('birthdate', e.target.value)}
                  />

                  <div className="form-group">
                    <label className="field-label">Gender *</label>
                    <select
                      className="field-input"
                      value={form.gender}
                      onChange={e => setField('gender', e.target.value)}
                    >
                      <option value="">Select</option>
                      {sortTextAsc(['Male', 'Female', 'Prefer not to say']).map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  {err && <div className="error">{err}</div>}

                  <div className="register-actions step-actions">
                    <Button
                      type="button"
                      onClick={() => {
                        if(validateStep(0)) setCurrentStep(1)
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}

              {currentStep === 1 && (
                <div className="register-col">
                  <div className="register-title">
                    <span className="step-pill">2</span>
                    Address Information
                  </div>

                  <div className="form-group">
                    <label className="field-label">Phase *</label>
                    <select
                      className="field-input"
                      value={form.phase}
                      onChange={e => {
                        setField('phase', e.target.value)
                        setField('street', '') // Reset street when phase changes
                      }}
                    >
                      <option value="">Select Phase</option>
                      {sortTextAsc(Object.keys(addressData)).map(phase => (
                        <option key={phase} value={phase}>{phase}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="field-label">Street *</label>
                    <select
                      className="field-input"
                      value={form.street}
                      onChange={e => setField('street', e.target.value)}
                      disabled={!form.phase}
                    >
                      <option value="">Select Street</option>
                      {form.phase && sortTextAsc(addressData[form.phase]).map(street => (
                        <option key={street} value={street}>{street}</option>
                      ))}
                    </select>
                  </div>

                  <InputField
                    label="Block *"
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    value={form.block}
                    onChange={e => setField('block', e.target.value.replace(/\D/g, ''))}
                    placeholder="Block number"
                  />

                  <InputField
                    label="Lot *"
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    value={form.lot}
                    onChange={e => setField('lot', e.target.value.replace(/\D/g, ''))}
                    placeholder="Lot number"
                  />

                  {err && <div className="error">{err}</div>}

                  <div className="register-actions step-actions">
                    <Button type="button" variant="secondary" onClick={() => setCurrentStep(0)}>
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        if(validateStep(1)) setCurrentStep(2)
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="register-col">
                  <div className="register-title">
                    <span className="step-pill">3</span>
                    Account Details
                  </div>

                  <InputField
                    label="Email *"
                    type="email"
                    value={form.email}
                    onChange={e => {
                      setField('email', e.target.value)
                      setOtp('')
                      setSuccessMessage('')
                    }}
                    placeholder="you@gmail.com"
                    autoComplete="email"
                  />

                  <InputField
                    label="Password *"
                    type="password"
                    allowToggle
                    value={form.password}
                    onChange={e => setField('password', e.target.value)}
                    placeholder="Create a password"
                    autoComplete="new-password"
                  />

                  <div className="pw-hint">
                    Use at least <strong>8 characters</strong> with uppercase, lowercase, number, and special character.
                  </div>

                  <div className="password-rules" aria-label="Password requirements">
                    {passwordChecks.map(rule => (
                      <span key={rule.label} className={`password-rule ${rule.ok ? 'ok' : ''}`}>
                        {rule.label}
                      </span>
                    ))}
                  </div>

                  <InputField
                    label="Confirm Password *"
                    type="password"
                    allowToggle
                    value={form.confirm}
                    onChange={e => setField('confirm', e.target.value)}
                    placeholder="Re-type password"
                    autoComplete="new-password"
                  />

                  {passwordsMatch && <div className="pw-ok">✅ Passwords match</div>}
                  {passwordsMismatch && <div className="pw-bad">⚠️ Passwords do not match</div>}

                  {err && <div className="error">{err}</div>}

                  <div className="register-actions step-actions">
                    <Button type="button" variant="secondary" onClick={() => setCurrentStep(1)}>
                      Back
                    </Button>
                    <Button type="button" onClick={requestRegistrationOtp} disabled={loading}>
                      {loading ? 'Sending...' : 'Send OTP'}
                    </Button>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="register-col">
                  <div className="register-title">
                    <span className="step-pill">4</span>
                    Verify Email
                  </div>

                  <p className="muted" style={{ margin: 0 }}>
                    Enter the 6-digit OTP sent to {form.email}.
                  </p>

                  <InputField
                    label="Registration Code *"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit OTP"
                    autoComplete="one-time-code"
                  />

                  {successMessage && <div className="success">{successMessage}</div>}
                  {err && <div className="error">{err}</div>}

                  <div className="register-actions step-actions">
                    <Button type="button" variant="secondary" onClick={() => setCurrentStep(2)}>
                      Back
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={requestRegistrationOtp}
                      disabled={loading || resendSeconds > 0}
                    >
                      {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend OTP'}
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Registering...' : 'Register'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <p className="muted bottom-text" style={{ marginTop: 18 }}>
              Already have an account? <Link to="/login">Login</Link>
            </p>
          </div>
        </form>
      </main>
    </div>
  )
}
