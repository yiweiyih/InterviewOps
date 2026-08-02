import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/login',     name: 'login',     component: () => import('../views/LoginView.vue'), meta: { public: true } },
  { path: '/',          name: 'home',      component: () => import('../views/HomeView.vue') },
  { path: '/todo',      name: 'todo',      component: () => import('../views/TodoView.vue') },
  { path: '/ai',        name: 'ai',        component: () => import('../views/AIVIew.vue')   },
  { path: '/knowledge', name: 'knowledge', component: () => import('../views/KnowledgeView.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const stored = localStorage.getItem('auth-user')
  const isLoggedIn = !!(stored && JSON.parse(stored)?.token)
  if (!to.meta.public && !isLoggedIn) return { name: 'login' }
})

export default router
