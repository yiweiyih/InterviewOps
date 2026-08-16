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

export async function requestJson(path, options = {}) {
  const headers = authHeaders(options.body && !(options.body instanceof FormData)
    ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
    : options.headers)
  const response = await fetch(apiUrl(path), { ...options, headers })
  const data = await response.json().catch(() => ({}))
  if (response.status === 401 && path !== '/api/login') {
    localStorage.removeItem('auth-user')
    if (window.location.pathname !== '/login') window.location.replace('/login?expired=1')
    throw new Error('登录状态已失效，请重新登录')
  }
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`)
  return data
}
