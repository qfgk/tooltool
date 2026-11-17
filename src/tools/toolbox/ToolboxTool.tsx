// 工具箱（M2 实现，M0 占位）
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ICONS } from '../../shared/registry'

export function mount(root: HTMLElement) {
  const win = getCurrentWindow()
  const wrap = document.createElement('div')
  wrap.className = 'win'
  wrap.innerHTML = `
    <header class="win-head" data-tauri-drag-region>
      <span class="win-title"><span class="dot"></span> 工具箱</span>
      <span class="drag" data-tauri-drag-region></span>
      <button class="ib close" title="关闭 (Esc)" data-act="close">${ICONS.close}</button>
    </header>
    <div class="tool-page">
      <div class="tool-placeholder">
        <div class="big-ico">${ICONS.wrench}</div>
        <div class="t1">工具箱 · M2 开发中</div>
        <div class="t2">时间戳 / 编码 / 哈希 / 文本处理 / 单位换算 / 取色</div>
      </div>
    </div>
  `
  root.appendChild(wrap)
  wrap.querySelector('[data-act="close"]')?.addEventListener('click', () => win.close())
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') win.close() })
}
