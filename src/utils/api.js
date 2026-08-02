const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
const API_BASE_URL = rawBaseUrl.replace(/\/$/, '')

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}

export function getAuthToken() {
  try {
    return JSON.parse(localStorage.getItem('auth-user'))?.token || ''
  } catch {
    return ''
  }
}

export function authHeaders(extra = {}) {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra }
}
