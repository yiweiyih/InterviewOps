import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiUrl, authHeaders as createAuthHeaders } from '../utils/api'

function authHeaders(extra = {}) {
  return createAuthHeaders({ 'Content-Type': 'application/json', ...extra })
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
      const res = await fetch(apiUrl('/api/todos'), { headers: authHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '任务加载失败')
      todos.value = data.todos || []
    } finally {
      loading.value = false
    }
  }

  async function addTodo(text) {
    const trimmedText = text.trim()
    if (!trimmedText) return
    const res = await fetch(apiUrl('/api/todos'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ text: trimmedText })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '添加任务失败')
    todos.value = data.todos || []
  }

  async function deleteTodo(id) {
    const res = await fetch(apiUrl(`/api/todos/${id}`), { method: 'DELETE', headers: authHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '删除任务失败')
    todos.value = data.todos || []
    selectedTodoIds.value.delete(id)
  }

  async function toggleTodo(id) {
    const res = await fetch(apiUrl(`/api/todos/${id}/toggle`), { method: 'PATCH', headers: authHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '更新任务失败')
    todos.value = data.todos || []
  }

  async function toggleAllTodos() {
    const newState = !isAllCompleted.value
    const toToggle = todos.value.filter(t => t.completed !== newState)
    const results = await Promise.allSettled(toToggle.map(async (todo) => {
      const response = await fetch(apiUrl(`/api/todos/${todo.id}/toggle`), {
        method: 'PATCH',
        headers: authHeaders()
      })
      if (!response.ok) throw new Error(`任务 ${todo.id} 状态更新失败`)
    }))
    await fetchTodos()
    if (results.some(result => result.status === 'rejected')) throw new Error('部分任务状态更新失败')
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
    const results = await Promise.allSettled([...selectedTodoIds.value].map(async (id) => {
      const response = await fetch(apiUrl(`/api/todos/${id}`), { method: 'DELETE', headers: authHeaders() })
      if (!response.ok) throw new Error(`任务 ${id} 删除失败`)
    }))
    selectedTodoIds.value.clear()
    await fetchTodos()
    if (results.some(result => result.status === 'rejected')) throw new Error('部分任务删除失败')
  }

  return {
    todos, selectedTodoIds, loading,
    remainingCount, isAllCompleted, isAllSelected, hasSelectedTodos,
    fetchTodos, addTodo, deleteTodo, toggleTodo,
    toggleAllTodos, toggleTodoSelection, toggleAllSelection, batchDeleteTodos
  }
})
