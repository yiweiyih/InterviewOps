<script setup>
import {
  HomeFilled,
  List,
  ChatRound,
  Collection,
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

function handleCommand(cmd) {
  if (cmd === 'logout') {
    chatStore.reset()
    authStore.logout()
    router.push('/login')
  }
}
</script>

<template>
  <router-view v-if="isAuthLayout" />
  <div v-else class="app-container">
    <el-container style="height: 100vh;">
      <el-aside width="200px" style="background-color: #001529;">
        <div class="logo-container">
          <img class="logo-mark" src="/agent.svg" alt="" />
          <div>
            <h1 class="logo-text">Agentic RAG</h1>
            <p class="logo-caption">Operations Console</p>
          </div>
        </div>

        <el-menu :default-active="route.path" class="sidebar-menu" background-color="#001529" text-color="#fff"
          active-text-color="#ffd04b" router>
          <el-menu-item index="/">
            <template #title>
              <el-icon><HomeFilled /></el-icon>
              <span>工作台</span>
            </template>
          </el-menu-item>

          <el-menu-item index="/todo">
            <template #title>
              <el-icon><List /></el-icon>
              <span>任务中心</span>
            </template>
          </el-menu-item>

          <el-menu-item index="/ai">
            <template #title>
              <el-icon><ChatRound /></el-icon>
              <span>Agent 对话</span>
            </template>
          </el-menu-item>

          <el-menu-item index="/knowledge">
            <template #title>
              <el-icon><Collection /></el-icon>
              <span>知识库</span>
            </template>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-container>
        <el-header
          style="background-color: #fff; border-bottom: 1px solid #e6e6e6; display: flex; align-items: center; padding: 0 20px;">
          <div class="page-heading">
            <span class="page-eyebrow">AGENTIC RAG ASSISTANT</span>
            <h2>{{ route.meta.title }}</h2>
          </div>
          <div class="user-info">
            <el-dropdown @command="handleCommand">
              <span class="el-dropdown-link">
                <el-icon><UserFilled /></el-icon>
                {{ authStore.username }}
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="logout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>

        <el-main style="padding: 0; overflow: hidden; display: flex; flex-direction: column;">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #162033;
}

.app-container {
  height: 100%;
}

.app-container > .el-container,
.app-container > .el-container > .el-container,
.app-container .el-main {
  min-width: 0;
}

/* 侧边栏样式 */
.logo-container {
  padding: 0 18px;
  height: 60px;
  width: 100%;
  display: flex;
  justify-content: flex-start;
  gap: 10px;
  align-items: center;
  border-bottom: 1px solid #1f2d3d;
}

.logo-text {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  text-align: left;
  line-height: 1.1;
}

.logo-mark {
  width: 30px;
  height: 30px;
}

.logo-caption {
  color: #7f9bb3;
  font-size: 9px;
  letter-spacing: .08em;
  margin-top: 3px;
}

.sidebar-menu {
  border-right: none;
}

/* 顶部导航栏样式 */
.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-heading {
  flex: 1;
  min-width: 0;
}

.page-heading h2 {
  color: #162033;
  font-size: 17px;
  line-height: 1.2;
}

.page-eyebrow {
  display: block;
  color: #8492a6;
  font-size: 9px;
  letter-spacing: .14em;
  margin-bottom: 2px;
}

/* 主内容区域样式 */
.el-main {
  background-color: #f5f7fa;
  flex: 1;
  min-height: 0;
}
</style>

<style scoped>
/* 组件特定样式 */
.el-dropdown-link {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}
</style>
