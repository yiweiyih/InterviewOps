import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/login',     name: 'login',     component: () => import('../views/LoginView.vue'), meta: { public: true, layout: 'auth', title: '登录' } },
  { path: '/',          name: 'home',      component: () => import('../views/HomeView.vue'), meta: { title: '工作台' } },
  { path: '/todo',      name: 'todo',      component: () => import('../views/TodoView.vue'), meta: { title: '任务中心' } },
  { path: '/ai',        name: 'ai',        component: () => import('../views/AIVIew.vue'), meta: { title: 'Agent 对话' } },
  { path: '/knowledge', name: 'knowledge', component: () => import('../views/KnowledgeView.vue'), meta: { title: '知识库' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  let isLoggedIn = false
  try {
    isLoggedIn = !!JSON.parse(localStorage.getItem('auth-user'))?.token
  } catch {
    localStorage.removeItem('auth-user')
  }
  if (!to.meta.public && !isLoggedIn) return { name: 'login' }
  if (to.name === 'login' && isLoggedIn) return { name: 'home' }
})

router.afterEach((to) => {
  document.title = `${to.meta.title || '工作台'} · Agentic RAG Assistant`
})

export default router
