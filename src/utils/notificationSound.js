let audioContext = null
let lastPlayedAt = 0
let lastAlertPlayedAt = 0

export function playNotificationSound(){
  if(typeof window === 'undefined') return

  const now = Date.now()
  if(now - lastPlayedAt < 900) return
  lastPlayedAt = now

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if(!AudioContextClass) return

    audioContext = audioContext || new AudioContextClass()
    if(audioContext.state === 'suspended'){
      audioContext.resume().catch(() => {})
    }

    const startAt = audioContext.currentTime + 0.01
    const notes = [
      { frequency: 880, start: 0, duration: 0.11, gain: 0.13 },
      { frequency: 1174.66, start: 0.11, duration: 0.16, gain: 0.1 }
    ]

    notes.forEach(note => {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(note.frequency, startAt + note.start)
      gain.gain.setValueAtTime(0.0001, startAt + note.start)
      gain.gain.exponentialRampToValueAtTime(note.gain, startAt + note.start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.start + note.duration)

      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start(startAt + note.start)
      oscillator.stop(startAt + note.start + note.duration + 0.03)
    })
  } catch (error) {}
}

export function playAlertNotificationSound(){
  if(typeof window === 'undefined') return

  const now = Date.now()
  if(now - lastAlertPlayedAt < 900) return
  lastAlertPlayedAt = now

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if(!AudioContextClass) return

    audioContext = audioContext || new AudioContextClass()
    if(audioContext.state === 'suspended'){
      audioContext.resume().catch(() => {})
    }

    const startAt = audioContext.currentTime + 0.01
    const notes = [
      { frequency: 659.25, start: 0, duration: 0.12, gain: 0.08 },
      { frequency: 783.99, start: 0.1, duration: 0.14, gain: 0.075 },
      { frequency: 1046.5, start: 0.22, duration: 0.2, gain: 0.065 }
    ]

    notes.forEach(note => {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()

      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(note.frequency, startAt + note.start)
      gain.gain.setValueAtTime(0.0001, startAt + note.start)
      gain.gain.exponentialRampToValueAtTime(note.gain, startAt + note.start + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.start + note.duration)

      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start(startAt + note.start)
      oscillator.stop(startAt + note.start + note.duration + 0.04)
    })
  } catch (error) {}
}
