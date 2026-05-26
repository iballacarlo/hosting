import React, { useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import InputField from '../components/InputField'
import Button from '../components/Button'
import '../styles/profile.css'

function splitName(fullName){
  const clean = (fullName || '').trim().replace(/\s+/g,' ')
  if(!clean) return { first:'', middle:'', last:'', suffix:'' }

  const suffixes = ['JR','SR','II','III','IV','V']
  const parts = clean.split(' ')

  let suffix = ''
  const lastPart = parts[parts.length - 1].replace('.','').toUpperCase()

  if(suffixes.includes(lastPart)){
    suffix = parts.pop()
  }

  const first = parts[0] || ''
  const last = parts.length >= 2 ? parts[parts.length - 1] : ''
  const middle = parts.length > 2 ? parts.slice(1,-1).join(' ') : ''

  return { first, middle, last, suffix }
}

function formatProfileAddress(raw){
  const address = (raw || '').trim()
  if(!address) return ''

  const parts = address.split(/\s*,\s*/).filter(Boolean)
  let phase = ''
  let block = ''
  let lot = ''
  let street = ''

  parts.forEach(segment => {
    const value = segment.trim()
    const lower = value.toLowerCase()

    if(/^(phase|ph)\b/.test(lower)){
      phase = value
      return
    }

    const blockMatch = value.match(/^(?:block|blk\.?)(?:\s*[:\-]?\s*)(.*)$/i)
    if(blockMatch){
      block = blockMatch[1].trim() || block
      return
    }

    const lotMatch = value.match(/^(?:lot)(?:\s*[:\-]?\s*)(.*)$/i)
    if(lotMatch){
      lot = lotMatch[1].trim() || lot
      return
    }

    if(/^(brgy|barangay|bacoor|cavite|philippines|mambog)/i.test(lower)){
      return
    }

    if(!street){
      street = value
    }
  })

  const output = []
  if(block) output.push(`Blk. ${block}`)
  if(lot) output.push(`Lot ${lot}`)
  if(street) output.push(street)
  if(phase) output.push(phase)

  if(output.length === 0){
    return `${address}, Brgy. Mambog II, Bacoor, 4102 Cavite, PHILIPPINES`
  }

  return `${output.join(', ')}, Brgy. Mambog II, Bacoor, 4102 Cavite, PHILIPPINES`
}

export default function Profile(){

  const { user } = useAuth()
  const [profileUser, setProfileUser] = useState(user)

  const initial = useMemo(() => {
    const sourceUser = profileUser || user
    const parsed = splitName(sourceUser?.name)
    const first = sourceUser?.first_name || sourceUser?.firstName || sourceUser?.fname || parsed.first
    const middle = sourceUser?.middle_name || sourceUser?.middleName || sourceUser?.middle || parsed.middle
    const last = sourceUser?.last_name || sourceUser?.lastName || sourceUser?.lname || parsed.last
    const suffix = sourceUser?.suffix || sourceUser?.suf || parsed.suffix
    const rawAddress = sourceUser?.address || sourceUser?.location || ''
    const address = formatProfileAddress(rawAddress)
    return { first, middle, last, suffix, address }
  }, [profileUser, user])

  const [first,setFirst] = useState(initial.first)
  const [middle,setMiddle] = useState(initial.middle)
  const [last,setLast] = useState(initial.last)
  const [suffix,setSuffix] = useState(initial.suffix)
  const [address,setAddress] = useState(initial.address)
  const [email,setEmail] = useState(profileUser?.email || user?.email || user?.username || '')
  const [newPassword,setNewPassword] = useState('')
  const [confirmPassword,setConfirmPassword] = useState('')
  const [changePassword,setChangePassword] = useState(false)

  // keep fields in sync when user/context updates
  React.useEffect(() => {
    setFirst(initial.first)
    setMiddle(initial.middle)
    setLast(initial.last)
    setSuffix(initial.suffix)
    setAddress(initial.address)
  }, [initial.first, initial.middle, initial.last, initial.suffix, initial.address])

  React.useEffect(() => {
    setEmail(profileUser?.email || user?.email || user?.username || '')
  }, [profileUser, user])

  React.useEffect(() => {
    setProfileUser(user)
  }, [user])

  React.useEffect(() => {
    let cancelled = false
    async function loadProfile(){
      try {
        const res = await api.get('/me')
        if(!cancelled && res.data?.success){
          setProfileUser(res.data.user)
        }
      } catch(err){
        // Keep context/mock data if live profile fetch is unavailable.
      }
    }

    loadProfile()
    return () => {
      cancelled = true
    }
  }, [])

  const [msg,setMsg] = useState('')
  const [saving,setSaving] = useState(false)

  const { updateProfile } = useAuth()

  function getPasswordError(password){
    if(password.length < 8) return 'Password must be at least 8 characters.'
    if(!/[a-z]/.test(password)) return 'Password must include a lowercase letter.'
    if(!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.'
    if(!/\d/.test(password)) return 'Password must include a number.'
    if(!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character.'
    return ''
  }

  const passwordChecks = [
    { label: 'At least 8 characters', ok: newPassword.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(newPassword) },
    { label: 'Lowercase letter', ok: /[a-z]/.test(newPassword) },
    { label: 'Number', ok: /\d/.test(newPassword) },
    { label: 'Special character', ok: /[^A-Za-z0-9]/.test(newPassword) },
  ]

  async function save(){
    setMsg('')

    if(!first.trim() || !last.trim()){
      setMsg('First name and last name are required.')
      return
    }

    const fullName = `${first} ${middle ? middle + ' ' : ''}${last}${suffix ? ' ' + suffix : ''}`

    setSaving(true)

    try{
      const payload = {
        name: fullName,
        first_name: first,
        middle_name: middle,
        last_name: last,
        suffix: suffix,
        address: address.trim()
      }

      if(changePassword){
        const passwordError = getPasswordError(newPassword)
        if(passwordError){
          setMsg(passwordError)
          setSaving(false)
          return
        }

        if(newPassword !== confirmPassword){
          setMsg('Passwords do not match.')
          setSaving(false)
          return
        }

        payload.password = newPassword
      }

      const res = await updateProfile(payload)

      if(!res.ok){
        setMsg(res.message || 'Failed to save.')
        setSaving(false)
        return
      }

      setChangePassword(false)
      setNewPassword('')
      setConfirmPassword('')
      setMsg('Saved successfully.')
    }catch(err){
      setMsg('Network error.')
    }

    setSaving(false)
  }

  return (
    <div className="app-shell">

      <Sidebar />

      <div className="main-area">

        <Header />

        <main className="dash-main profile-page">

          <h1 className="page-title">Profile</h1>

          <section className="card">

            <div className="register-grid">

              {/* Personal Information */}
              <div className="register-col">

                <div className="register-title">Personal Information</div>

                <InputField
                  label="First Name"
                  value={first}
                  onChange={e=>setFirst(e.target.value)}
                />

                <InputField
                  label="Middle Name"
                  value={middle}
                  onChange={e=>setMiddle(e.target.value)}
                />

                <InputField
                  label="Last Name"
                  value={last}
                  onChange={e=>setLast(e.target.value)}
                />

                <InputField
                  label="Suffix"
                  value={suffix}
                  onChange={e=>setSuffix(e.target.value)}
                />

              </div>

              {/* Account Info */}
              <div className="register-col">

                <div className="register-title">Account Information</div>

                <InputField
                  label="Email"
                  value={email}
                  readOnly
                />

                <InputField
                  label="Address"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                />

                <div className={`profile-password-card ${changePassword ? 'is-open' : ''}`}>
                  <div className="profile-password-head">
                    <div>
                      <div className="profile-password-title">Password</div>
                      <p>Update your login password using a strong password.</p>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      className="profile-password-toggle"
                      onClick={() => {
                        setChangePassword(open => !open)
                        setNewPassword('')
                        setConfirmPassword('')
                      }}
                    >
                      {changePassword ? 'Cancel' : 'Change password'}
                    </Button>
                  </div>
                </div>

                {changePassword && (
                  <div className="profile-password-fields">
                    <InputField
                      label="New Password"
                      type="password"
                      allowToggle
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      autoComplete="new-password"
                    />

                    <div className="password-rules" aria-label="Password requirements">
                      {passwordChecks.map(rule => (
                        <span key={rule.label} className={`password-rule ${rule.ok ? 'ok' : ''}`}>
                          {rule.label}
                        </span>
                      ))}
                    </div>

                    <InputField
                      label="Confirm New Password"
                      type="password"
                      allowToggle
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-type new password"
                      autoComplete="new-password"
                    />
                  </div>
                )}

                {msg && (
                  <div className="error">
                    {msg}
                  </div>
                )}

                <div className="row" style={{marginTop:16,justifyContent:'flex-end'}}>
                  <Button
                    type="button"
                    onClick={save}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>

              </div>

            </div>

          </section>

        </main>

      </div>

    </div>
  )
}
