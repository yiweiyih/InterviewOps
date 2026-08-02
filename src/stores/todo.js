import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const API = 'http://localhost:3001'

function authHeaders(extra = {}) {
  try {
    const token = JSON.parse(localStorage.getItem('auth-user'))?.token || ''
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...extra }
  } catch {
    return { 'Content-Type': 'application/json', ...extra }
  }
}

export const useTodoStore = defineStore('todo', () => {
  const todos = ref([])
  const selectedTodoIds = ref(new Set())
  const loading = ref(false)

  const remainingCount = computed(() => todos.value.filter(t => !t.completed).length)
  const isAllCompleted = computed(() => todos.value.length > 0 && todos.value.every(t => t.completed))
  const isAllSelected = computed(() => todos.value.length > 0 && selectedTodoIds.value.size === todos.value.length)
  const hasSelectedTodos = computed(() => selectedTodoIds.value.size > 0)

  async function fetchTodos() {
    loading.value = true
    try {
      const res = await fetch(`${API}/api/todos`, { headers: authHeaders() })
      const data = await res.json()
      todos.value = data.todos || []
    } finally {
      loading.value = false
    }
  }

  async function addTodo(text) {
    const trimmedText = text.trim()
    if (!trimmedText) return
    const res = await fetch(`${API}/api/todos`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ text: trimmedText })
    })
    const data = await res.json()
    todos.value = data.todos || []
  }

  async function deleteTodo(id) {
    const res = await fetch(`${API}/api/todos/${id}`, { method: 'DELETE', headers: authHeaders() })
    const data = await res.json()
    todos.value = data.todos || []
    selectedTodoIds.value.delete(id)
  }

  async function toggleTodo(id) {
    const res = await fetch(`${API}/api/todos/${id}/toggle`, { method: 'PATCH', headers: authHeaders() })
    const data = await res.json()
    todos.value = data.todos || []
  }

  async function toggleAllTodos() {
    const newState = !isAllCompleted.value
    const toToggle = todos.value.filter(t => t.completed !== newState)
    await Promise.all(toToggle.map(t =>
      fetch(`${API}/api/todos/${t.id}/toggle`, { method: 'PATCH', headers: authHeaders() })
    ))
    await fetchTodos()
  }

  function toggleTodoSelection(id) {
    if (selectedTodoIds.value.has(id)) {
      selectedTodoIds.value.delete(id)
    } else {
      selectedTodoIds.value.add(id)
    }
  }

  function toggleAllSelection() {
    if (isAllSelected.value) {
      selectedTodoIds.value.clear()
    } else {
      selectedTodoIds.value = new Set(todos.value.map(t => t.id))
    }
  }

  async function batchDeleteTodos() {
    await Promise.all([...selectedTodoIds.value].map(id =>
      fetch(`${API}/api/todos/${id}`, { method: 'DELETE', headers: authHeaders() })
    ))
    selectedTodoIds.value.clear()
    await fetchTodos()
  }

  return {
    todos, selectedTodoIds, loading,
    remainingCount, isAllCompleted, isAllSelected, hasSelectedTodos,
    fetchTodos, addTodo, deleteTodo, toggleTodo,
    toggleAllTodos, toggleTodoSelection, toggleAllSelection, batchDeleteTodos
  }
})
