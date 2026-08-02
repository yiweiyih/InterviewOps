import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/login',     name: 'login',     component: () => import('../views/LoginView.vue'), meta: { public: true, layout: 'auth', title: '登录' } },
  { path: '/',          name: 'home',      component: () => import('../views/HomeView.vue'), meta: { title: '备战工作台' } },
  { path: '/profile',   name: 'profile',   component: () => import('../views/ProfileView.vue'), meta: { title: '目标与画像' } },
  { path: '/materials', name: 'materials', component: () => import('../views/KnowledgeView.vue'), meta: { title: '面试资料' } },
  { path: '/interview', name: 'interview', component: () => import('../views/InterviewView.vue'), meta: { title: '模拟面试' } },
  { path: '/reviews',   name: 'reviews',   component: () => import('../views/ReviewView.vue'), meta: { title: '复盘档案' } },
  { path: '/plan',      name: 'plan',      component: () => import('../views/TodoView.vue'), meta: { title: '提升计划' } },
  { path: '/coach',     name: 'coach',     component: () => import('../views/AIVIew.vue'), meta: { title: '备战教练' } },
  { path: '/todo',      redirect: '/plan' },
  { path: '/ai',        redirect: '/coach' },
  { path: '/knowledge', redirect: '/materials' },
  { path: '/:pathMatch(.*)*', redirect: '/' },
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
  document.title = `${to.meta.title || '备战工作台'} · InterviewOps`
})

export default router
