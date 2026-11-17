import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
  },
  build: {
    target: 'chrome105',
    rollupOptions: {
      output: {
        // 每个工具独立 chunk，按需加载
        manualChunks(id) {
          if (id.includes('/tools/clipboard')) return 'tool-clipboard'
          if (id.includes('/tools/launcher')) return 'tool-launcher'
          if (id.includes('/tools/toolbox')) return 'tool-toolbox'
          if (id.includes('/tools/notes')) return 'tool-notes'
        },
      },
    },
  },
})
