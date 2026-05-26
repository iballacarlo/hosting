import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import api from '../api/axios'

const SettingsContext = createContext()

function getSettingsKey(user){
  return `settings_${user?.id || 'guest'}`
}

export function SettingsProvider({ children }){
  const { user } = useAuth()
  const [dark, setDark] = useState(false)
  const [contrast, setContrast] = useState(false)
  const [fontSize, setFontSize] = useState('small')
  const [screenReader, setScreenReader] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const storageKey = getSettingsKey(user)

  useEffect(() => {
    setLoaded(false)
    let cancelled = false

    let saved = {}
    try {
      saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
    } catch {
      saved = {}
    }

    setDark(saved.dark !== undefined ? saved.dark : false)
    setContrast(saved.contrast !== undefined ? saved.contrast : false)
    setFontSize(saved.fontSize !== undefined ? saved.fontSize : 'small')
    setScreenReader(saved.screenReader !== undefined ? saved.screenReader : false)
    setLoaded(true)

    async function loadBackendSettings(){
      if(!user || user.role !== 'resident') return

      try {
        const res = await api.get('/accessibility-settings')
        const settings = res.data?.data
        if(cancelled || !res.data?.success || !settings) return

        setDark(Boolean(settings.dark))
        setContrast(Boolean(settings.contrast))
        setFontSize(settings.fontSize || 'small')
        setScreenReader(Boolean(settings.screenReader))
        localStorage.setItem(storageKey, JSON.stringify({
          dark: Boolean(settings.dark),
          contrast: Boolean(settings.contrast),
          fontSize: settings.fontSize || 'small',
          screenReader: Boolean(settings.screenReader)
        }))
      } catch {
        // Keep local accessibility settings if backend settings cannot be loaded.
      }
    }

    loadBackendSettings()
    return () => {
      cancelled = true
    }
  }, [storageKey])

  useEffect(() => {
    const root = document.documentElement

    root.dataset.theme = dark ? 'dark' : 'light'
    root.dataset.contrast = contrast ? 'high' : 'normal'

    root.classList.toggle('dark', dark)
    root.classList.toggle('high-contrast', contrast)
  }, [dark, contrast])

  useEffect(() => {
    const root = document.documentElement

    root.classList.remove(
      'font-small',
      'font-medium',
      'font-large',
      'font-xlarge'
    )

    root.classList.add(`font-${fontSize}`)
  }, [fontSize])

  useEffect(() => {
    if (!window.speechSynthesis) return

    if (screenReader) {
      const activateMsg = new SpeechSynthesisUtterance(
        'Screen reader mode enabled. Focus elements to hear labels and roles.'
      )
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(activateMsg)
    } else {
      window.speechSynthesis.cancel()
    }
  }, [screenReader])

  useEffect(() => {
    if (!screenReader || !window.speechSynthesis) return

    const describeElement = (element) => {
      const ariaLabel = element.getAttribute('aria-label')
      if (ariaLabel) return ariaLabel.trim()

      const labelledBy = element.getAttribute('aria-labelledby')
      if (labelledBy) {
        const labelElement = document.getElementById(labelledBy)
        if (labelElement) return labelElement.textContent.trim()
      }

      if (element instanceof HTMLInputElement) {
        const t = element.type
        if (['submit', 'button', 'reset'].includes(t)) {
          return element.value?.trim() || ''
        }
        if (t === 'checkbox' || t === 'radio') {
          return (element.labels?.[0]?.textContent || element.value || '').trim()
        }
        if (t === 'date') {
          return (element.labels?.[0]?.textContent || element.placeholder || element.value || '').trim()
        }
        // text-like inputs
        if (['text', 'email', 'search', 'tel', 'password', 'number'].includes(t)) {
          return (element.labels?.[0]?.textContent || element.placeholder || element.value || '').trim()
        }
      }

      if (element instanceof HTMLTextAreaElement) {
        return (element.getAttribute('aria-label') || element.placeholder || element.textContent || '').trim()
      }

      if (element.alt) return element.alt.trim()
      if (element.title) return element.title.trim()
      return element.textContent?.trim() || ''
    }

    const describeRole = (element) => {
      const explicit = element.getAttribute('role')
      if (explicit) return explicit
      const tag = element.tagName.toLowerCase()
      if (tag === 'button') return 'button'
      if (tag === 'a' && element.hasAttribute('href')) return 'link'
      if (tag === 'input') {
        const t = element.type
        // detect switch-style controls: wrapped in .switch or explicit role
        if (element.getAttribute('role') === 'switch' || element.closest && element.closest('.switch')) return 'switch'
        if (t === 'checkbox') return 'checkbox'
        if (t === 'radio') return 'radio button'
        if (t === 'date') return 'date field'
        if (['submit', 'button', 'reset'].includes(t)) return 'button'
        if (['text', 'email', 'search', 'tel', 'password', 'number'].includes(t)) return 'text field'
        return 'input field'
      }
      if (tag === 'select') return 'dropdown'
      if (tag === 'textarea') return 'text area'
      return ''
    }

    const handleFocusIn = (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target === document.body) return

      const label = describeElement(target)
      if (!label) return

      const role = describeRole(target)
      let announcement = label
      if (role) {
        if (role === 'switch') {
          announcement = `${label}, ${target.checked ? 'on' : 'off'} switch`
        } else if (role === 'checkbox') {
          announcement = `${label}, ${target.checked ? 'checked' : 'not checked'} checkbox`
        } else if (role === 'radio button') {
          announcement = `${label}, ${target.checked ? 'selected' : 'not selected'} radio button`
        } else if (role === 'text field' || role === 'input field' || role === 'text area') {
          const val = (target.value || '').toString()
          announcement = val && target.type !== 'password' ? `${label}, ${role}, value ${val}` : `${label}, ${role}`
        } else if (role === 'dropdown') {
          const selected = target.options && target.options[target.selectedIndex] ? target.options[target.selectedIndex].textContent.trim() : ''
          announcement = selected ? `${label}, dropdown, selected ${selected}` : `${label}, dropdown`
        } else if (role === 'date field') {
          announcement = target.value ? `${label}, date field, ${target.value}` : `${label}, date field`
        } else {
          announcement = `${label}, ${role}`
        }
      }

      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(announcement)
      utterance.rate = 1
      utterance.pitch = 1
      window.speechSynthesis.speak(utterance)
    }

    document.addEventListener('focusin', handleFocusIn, true)
    return () => {
      document.removeEventListener('focusin', handleFocusIn, true)
      window.speechSynthesis.cancel()
    }
  }, [screenReader])

  const saveSettings = async () => {
    const settings = { dark, contrast, fontSize, screenReader }
    localStorage.setItem(storageKey, JSON.stringify(settings))

    if(user?.role === 'resident'){
      await api.put('/accessibility-settings', settings)
    }
  }

  const resetSettings = async () => {
    const defaults = {
      dark: false,
      contrast: false,
      fontSize: 'small',
      screenReader: false
    }

    setDark(false)
    setContrast(false)
    setFontSize('small')
    setScreenReader(false)
    localStorage.setItem(storageKey, JSON.stringify(defaults))

    if(user?.role === 'resident'){
      await api.put('/accessibility-settings', defaults)
    }
  }

  return (
    <SettingsContext.Provider
      value={{
        dark, setDark,
        contrast, setContrast,
        fontSize, setFontSize,
        screenReader, setScreenReader,
        saveSettings,
        resetSettings
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(){
  return useContext(SettingsContext)
}
