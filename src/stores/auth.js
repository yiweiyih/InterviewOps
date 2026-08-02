import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'auth-user'

export const useAuthStore = defineStore('auth', () => {
  const _stored = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {} } catch { return {} }
  })()

  const token = ref(_stored.token || '')
  const userId = ref(_stored.userId || '')
  const username = ref(_stored.username || '')

  const isLoggedIn = computed(() => !!token.value)

  function login(data) {
    token.value = data.token
    userId.value = data.userId
    username.value = data.username
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function logout() {
    token.value = ''
    userId.value = ''
    username.value = ''
    localStorage.removeItem(STORAGE_KEY)
  }

  return { token, userId, username, isLoggedIn, login, logout }
})
