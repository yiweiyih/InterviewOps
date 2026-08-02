<script setup>
import {
  HomeFilled,
  List,
  Setting,
  ChatRound,
  Collection,
  UserFilled
} from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useChatStore } from './stores/chat'

const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()

function handleCommand(cmd) {
  if (cmd === 'logout') {
    chatStore.reset()
    authStore.logout()
    router.push('/login')
  }
}
</script>

<template>
  <div class="app-container">
    <el-container style="height: 100vh;">
      <el-aside width="200px" style="background-color: #001529;">
        <div class="logo-container">
          <h1 class="logo-text">Yu Agent</h1>
        </div>

        <el-menu default-active="/" class="sidebar-menu" background-color="#001529" text-color="#fff"
          active-text-color="#ffd04b" router>
          <el-menu-item index="/">
            <template #title>
              <el-icon><HomeFilled /></el-icon>
              <span>首页</span>
            </template>
          </el-menu-item>

          <el-menu-item index="/todo">
            <template #title>
              <el-icon><List /></el-icon>
              <span>待办列表</span>
            </template>
          </el-menu-item>

          <el-menu-item index="/ai">
            <template #title>
              <el-icon><ChatRound /></el-icon>
              <span>AI对话</span>
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
          <div style="flex: 1;"></div>
          <h2>Yu Agent · 智能体工作台</h2>
          <div style="flex: 1;"></div>
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
  font-family: Arial, sans-serif;
}

.app-container {
  height: 100%;
}

/* 侧边栏样式 */
.logo-container {
  padding: 0;
  height: 60px;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  border-bottom: 1px solid #1f2d3d;
}

.logo-text {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  text-align: center;
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
