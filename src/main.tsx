// 入口：按窗口 label 路由（shell 面板 / tool-* 工具窗），渲染完成后 show
import { getCurrentWindow } from '@tauri-apps/api/window'
import './shared/design.css'

const win = getCurrentWindow()
const label = win.label
const root = document.getElementById('app')!

const TOOL_IMPORTS: Record<string, () => Promise<{ mount: (root: HTMLElement) => void }>> = {
  clipboard: () => import('./tools/clipboard/ClipboardTool'),
  launcher: () => Promise.all([import('./tools/launcher/QuickLaunchTool'), import('./shared/tool-page.css')]).then(([m]) => m),
  toolbox: () => import('./tools/toolbox/ToolboxTool'),
  notes: () => import('./tools/notes/NotesTool'),
}

async function boot() {
  // 主题按 settings 应用（默认 auto-time：6-18 点浅色，其余深色）
  try {
    const st = await (window as any).__TAURI_INTERNALS__.invoke('get_state')
    const mode = st?.settings?.theme || 'auto-time'
    const h = new Date().getHours()
    document.documentElement.dataset.theme =
      mode === 'dark' ? 'dark' : mode === 'light' ? 'light' : (h >= 6 && h < 18 ? 'light' : 'dark')
  } catch {
    document.documentElement.dataset.theme = 'dark'
  }
  try {
    if (label === 'shell') {
      const mod = await import('./shell/Shell')
      await import('./shell/shell.css')
      mod.mount(root)
    } else if (label.startsWith('tool-')) {
      const id = label.slice(5)
      const names: Record<string, string> = { clipboard: '剪贴板历史', launcher: '快速启动', toolbox: '工具箱', notes: '笔记' }
      document.title = `${names[id] ?? id} · tool-tool不绝`
      const loader = TOOL_IMPORTS[id]
      if (loader) {
        const mod = await loader()
        mod.mount(root)
      } else {
        renderUnknown(`未知工具：${id}`)
      }
    } else {
      renderUnknown(`未知窗口：${label}`)
    }
  } catch (e) {
    renderUnknown(String(e))
  }

  // 渲染完成后再显示窗口，避免白屏闪烁
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      try {
        await win.show()
        await win.setFocus()
      } catch { /* ignore */ }
      ;(window as any).__tooltool = { booted: () => true, label }
    })
  })
}

function renderUnknown(msg: string) {
  root.innerHTML = `<div class="tool-page"><div class="tool-placeholder">
    <div class="t1">${msg}</div><div class="t2">按 Esc 关闭窗口</div></div></div>`
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') win.close()
  })
}

boot()
