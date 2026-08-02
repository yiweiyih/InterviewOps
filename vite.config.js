import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      vue(),
      AutoImport({ resolvers: [ElementPlusResolver()], dts: false }),
      Components({ resolvers: [ElementPlusResolver()], dts: false })
    ],
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
          changeOrigin: true
        }
      }
    }
  }
})
