// 剪贴板历史（M4 实现，M0 占位）
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ICONS } from '../../shared/registry'

export function mount(root: HTMLElement) {
  const win = getCurrentWindow()
  const wrap = document.createElement('div')
  wrap.className = 'win'
  wrap.innerHTML = `
    <header class="win-head" data-tauri-drag-region>
      <span class="win-title"><span class="dot"></span> 剪贴板历史</span>
      <span class="drag" data-tauri-drag-region></span>
      <button class="ib close" title="关闭 (Esc)" data-act="close">${ICONS.close}</button>
    </header>
    <div class="tool-page">
      <div class="tool-placeholder">
        <div class="big-ico">${ICONS.clipboard}</div>
        <div class="t1">剪贴板历史 · M4 开发中</div>
        <div class="t2">复制的内容将自动记录，可一键回贴</div>
      </div>
    </div>
  `
  root.appendChild(wrap)
  wrap.querySelector('[data-act="close"]')?.addEventListener('click', () => win.close())
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') win.close() })
}
