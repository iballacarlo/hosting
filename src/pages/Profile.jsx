import React, { useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import mockApi from '../api/mockApi'
import api from '../api/axios'
import InputField from '../components/InputField'
import Button from '../components/Button'

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
  const [email,setEmail] = useState(profileUser?.email || user?.email || user?.username || mockApi.getCurrentUser()?.email || '')
  const [password,setPassword] = useState('********')
  const [passwordDirty,setPasswordDirty] = useState(false)

  // keep fields in sync when user/context updates
  React.useEffect(() => {
    setFirst(initial.first)
    setMiddle(initial.middle)
    setLast(initial.last)
    setSuffix(initial.suffix)
    setAddress(initial.address)
    if(!passwordDirty) setPassword('********')
  }, [initial.first, initial.middle, initial.last, initial.suffix, initial.address, passwordDirty])

  React.useEffect(() => {
    setEmail(profileUser?.email || user?.email || user?.username || mockApi.getCurrentUser()?.email || '')
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

      if(passwordDirty){
        if(!password.trim()){
          setMsg('Password cannot be blank.')
          setSaving(false)
          return
        }

        if(password !== '********'){
          payload.password = password
        }
      }

      const res = await updateProfile(payload)

      if(!res.ok){
        setMsg(res.message || 'Failed to save.')
        setSaving(false)
        return
      }

      setPasswordDirty(false)
      setPassword('********')
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

        <main className="dash-main">

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

                <InputField
                  label="Password"
                  type="password"
                  allowToggle
                  value={password}
                  onFocus={() => {
                    if(!passwordDirty && password === '********') setPassword('')
                  }}
                  onBlur={() => {
                    if(!passwordDirty && password === '') setPassword('********')
                  }}
                  onChange={e => {
                    setPassword(e.target.value)
                    setPasswordDirty(true)
                  }}
                />

                <p className="muted">
                  Password is hidden for security. Leave it as is to keep your current password.
                </p>

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
