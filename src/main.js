import { createApp } from 'vue'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import './style.css'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
const app = createApp(App)
app.use(router)
app.use(createPinia())
app.mount('#app')
