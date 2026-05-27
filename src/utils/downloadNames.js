export function downloadTimestamp(date = new Date()){
  const pad = value => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('') + '-' + String(date.getMilliseconds()).padStart(3, '0')
}

export function safeDownloadPart(value, fallback = 'download'){
  return String(value || fallback).replace(/[^a-zA-Z0-9-_]/g, '_')
}
