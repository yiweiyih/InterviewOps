<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'

const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()

const activeTab = ref('login')
const loading = ref(false)
const errorMsg = ref('')

const loginForm = reactive({ username: '', password: '' })
const registerForm = reactive({ username: '', password: '', confirm: '' })

const API = 'http://localhost:3001'

async function handleLogin() {
  if (!loginForm.username || !loginForm.password) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginForm.username, password: loginForm.password })
    })
    const data = await res.json()
    if (!res.ok) { errorMsg.value = data.error || '登录失败'; return }
    chatStore.reset()
    authStore.login(data)
    router.push('/')
  } catch {
    errorMsg.value = '网络错误，请检查后端是否启动'
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  if (!registerForm.username || !registerForm.password) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  if (registerForm.password !== registerForm.confirm) {
    errorMsg.value = '两次密码不一致'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(`${API}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: registerForm.username, password: registerForm.password })
    })
    const data = await res.json()
    if (!res.ok) { errorMsg.value = data.error || '注册失败'; return }
    authStore.login(data)
    router.push('/')
  } catch {
    errorMsg.value = '网络错误，请检查后端是否启动'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-box">
      <h1 class="login-title">Yu Agent</h1>
      <p class="login-subtitle">智能体工作台</p>

      <el-tabs v-model="activeTab" class="login-tabs" @tab-change="errorMsg = ''">
        <el-tab-pane label="登录" name="login">
          <el-form @submit.prevent="handleLogin">
            <el-form-item>
              <el-input v-model="loginForm.username" placeholder="用户名" size="large" />
            </el-form-item>
            <el-form-item>
              <el-input v-model="loginForm.password" placeholder="密码" type="password" size="large"
                show-password @keyup.enter="handleLogin" />
            </el-form-item>
            <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon :closable="false"
              style="margin-bottom: 12px;" />
            <el-button type="primary" size="large" style="width: 100%;" :loading="loading"
              @click="handleLogin">
              登录
            </el-button>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="注册" name="register">
          <el-form @submit.prevent="handleRegister">
            <el-form-item>
              <el-input v-model="registerForm.username" placeholder="用户名" size="large" />
            </el-form-item>
            <el-form-item>
              <el-input v-model="registerForm.password" placeholder="密码" type="password" size="large"
                show-password />
            </el-form-item>
            <el-form-item>
              <el-input v-model="registerForm.confirm" placeholder="确认密码" type="password" size="large"
                show-password @keyup.enter="handleRegister" />
            </el-form-item>
            <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon :closable="false"
              style="margin-bottom: 12px;" />
            <el-button type="primary" size="large" style="width: 100%;" :loading="loading"
              @click="handleRegister">
              注册
            </el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #001529 0%, #003a70 100%);
}

.login-box {
  background: #fff;
  border-radius: 12px;
  padding: 40px 36px;
  width: 380px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.login-title {
  text-align: center;
  font-size: 28px;
  font-weight: 700;
  color: #001529;
  margin-bottom: 4px;
}

.login-subtitle {
  text-align: center;
  color: #888;
  font-size: 14px;
  margin-bottom: 28px;
}

.login-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}
</style>
