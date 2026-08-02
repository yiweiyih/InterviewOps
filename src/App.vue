<script setup>
import {
  ChatRound,
  DataAnalysis,
  Files,
  HomeFilled,
  List,
  Microphone,
  User,
  UserFilled
} from '@element-plus/icons-vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useChatStore } from './stores/chat'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const chatStore = useChatStore()
const isAuthLayout = computed(() => route.meta.layout === 'auth')

const navigation = [
  { label: '总览', items: [{ path: '/', label: '备战工作台', icon: HomeFilled }] },
  {
    label: '准备',
    items: [
      { path: '/profile', label: '目标与画像', icon: User },
      { path: '/materials', label: '面试资料', icon: Files }
    ]
  },
  {
    label: '训练闭环',
    items: [
      { path: '/interview', label: '模拟面试', icon: Microphone },
      { path: '/reviews', label: '复盘档案', icon: DataAnalysis },
      { path: '/plan', label: '提升计划', icon: List }
    ]
  },
  { label: '智能工具', items: [{ path: '/coach', label: '备战教练', icon: ChatRound }] }
]

function handleCommand(command) {
  if (command !== 'logout') return
  chatStore.reset()
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <router-view v-if="isAuthLayout" />
  <div v-else class="app-shell">
    <aside class="sidebar">
      <button class="brand" aria-label="返回备战工作台" @click="router.push('/')">
        <span class="brand-mark">IO</span>
        <span class="brand-copy">
          <strong>InterviewOps</strong>
          <small>PREP · PRACTICE · REVIEW</small>
        </span>
      </button>

      <nav class="navigation" aria-label="主导航">
        <section v-for="group in navigation" :key="group.label" class="nav-group">
          <p>{{ group.label }}</p>
          <router-link v-for="item in group.items" :key="item.path" :to="item.path" class="nav-item">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </router-link>
        </section>
      </nav>

      <div class="sidebar-foot">
        <span class="privacy-dot"></span>
        <div><strong>私有工作区</strong><small>资料与记录按用户隔离</small></div>
      </div>
    </aside>

    <section class="content-shell">
      <header class="topbar">
        <div class="page-heading">
          <span>INTERVIEW PREPARATION OS</span>
          <h1>{{ route.meta.title }}</h1>
        </div>
        <el-dropdown @command="handleCommand">
          <button class="user-chip">
            <span class="avatar"><el-icon><UserFilled /></el-icon></span>
            <span class="user-name">{{ authStore.username }}</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu><el-dropdown-item command="logout">退出登录</el-dropdown-item></el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>
      <main class="main-content"><router-view /></main>
    </section>
  </div>
</template>

<style>
.app-shell { display: flex; width: 100%; height: 100%; background: #f6f7fb; }
.sidebar { display: flex; flex: 0 0 232px; flex-direction: column; width: 232px; padding: 18px 14px; color: #d9dcf3; background: linear-gradient(180deg, #17172c 0%, #20203c 64%, #191a30 100%); }
.brand { display: flex; align-items: center; gap: 11px; width: 100%; padding: 7px 8px 20px; color: inherit; background: transparent; text-align: left; cursor: pointer; }
.brand-mark { display: grid; flex: 0 0 36px; place-items: center; width: 36px; height: 36px; border: 1px solid rgba(255,255,255,.16); border-radius: 11px; color: #fff; background: linear-gradient(145deg, #7167ef, #4d43cc); box-shadow: 0 7px 18px rgba(86,74,220,.32); font-size: 12px; font-weight: 800; letter-spacing: -.03em; }
.brand-copy { display: flex; min-width: 0; flex-direction: column; }
.brand-copy strong { color: #fff; font-size: 16px; letter-spacing: -.02em; }
.brand-copy small { margin-top: 3px; color: #898ba9; font-size: 7px; letter-spacing: .13em; }
.navigation { min-height: 0; overflow-y: auto; scrollbar-width: none; }
.nav-group { margin-top: 12px; }
.nav-group > p { padding: 0 12px 7px; color: #72748f; font-size: 9px; font-weight: 700; letter-spacing: .13em; }
.nav-item { display: flex; align-items: center; gap: 11px; height: 42px; margin: 2px 0; padding: 0 12px; border-radius: 10px; color: #aeb1cb; font-size: 13px; text-decoration: none; transition: .18s ease; }
.nav-item .el-icon { font-size: 17px; }
.nav-item:hover { color: #f3f3ff; background: rgba(255,255,255,.06); }
.nav-item.router-link-exact-active { color: #fff; background: linear-gradient(90deg, rgba(110,98,238,.32), rgba(91,80,218,.14)); box-shadow: inset 2px 0 #8b82ff; }
.sidebar-foot { display: grid; grid-template-columns: auto 1fr; gap: 9px; align-items: center; margin-top: auto; padding: 14px 10px 4px; border-top: 1px solid rgba(255,255,255,.07); }
.privacy-dot { width: 8px; height: 8px; border-radius: 50%; background: #35caa6; box-shadow: 0 0 0 4px rgba(53,202,166,.1); }
.sidebar-foot div { display: flex; min-width: 0; flex-direction: column; }
.sidebar-foot strong { color: #d8daec; font-size: 11px; }
.sidebar-foot small { margin-top: 2px; color: #777a96; font-size: 9px; }
.content-shell { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.topbar { display: flex; flex: 0 0 68px; align-items: center; gap: 20px; padding: 0 28px; border-bottom: 1px solid #e7e8f0; background: rgba(255,255,255,.92); backdrop-filter: blur(14px); }
.page-heading { flex: 1; min-width: 0; }
.page-heading span { display: block; margin-bottom: 2px; color: #9699ae; font-size: 8px; font-weight: 700; letter-spacing: .16em; }
.page-heading h1 { color: #191d31; font-size: 18px; line-height: 1.25; }
.user-chip { display: flex; align-items: center; gap: 8px; padding: 5px 9px 5px 5px; border: 1px solid #e4e5ee; border-radius: 12px; color: #4a4f68; background: #fff; cursor: pointer; }
.avatar { display: grid; place-items: center; width: 29px; height: 29px; border-radius: 8px; color: #6157e8; background: #efedff; }
.user-name { max-width: 130px; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.main-content { min-width: 0; min-height: 0; flex: 1; overflow: hidden; }
@media (max-width: 920px) {
  .sidebar { flex-basis: 74px; width: 74px; padding-inline: 9px; }
  .brand { justify-content: center; padding-inline: 0; }
  .brand-copy, .nav-group > p, .nav-item span, .sidebar-foot div { display: none; }
  .nav-item { justify-content: center; padding: 0; }
  .sidebar-foot { display: flex; justify-content: center; }
}
@media (max-width: 600px) {
  .sidebar { flex-basis: 62px; width: 62px; padding-inline: 6px; }
  .topbar { padding: 0 16px; }
  .user-name { display: none; }
}
</style>
