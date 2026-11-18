// registry.ts：前端工具注册表（图标 / 懒加载 / 命令面板条目）
export interface ToolMeta {
  id: string
  name: string
  icon: string // 内联 SVG
  desc: string
  kind: 'hosted' | 'external'
  load?: () => Promise<{ mount: (root: HTMLElement) => void }>
}

const svg = (d: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`

export const ICONS = {
  clipboard: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>'),
  rocket: svg('<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>'),
  wrench: svg('<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>'),
  notes: svg('<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/><path d="M8.5 13h7M8.5 16.5h4.5"/>'),
  pin: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  dots: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>'),
  hammer: svg('<path d="M15 12l-8.5 8.5a2.12 2.12 0 01-3-3L12 9"/><path d="M17.64 15L22 10.64"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
}

export const HOSTED_TOOLS: ToolMeta[] = [
  {
    id: 'notes', name: '笔记', icon: ICONS.notes, kind: 'hosted',
    desc: '本地 Markdown 速记，自动保存',
    load: () => import('../tools/notes/NotesTool'),
  },
  {
    id: 'clipboard', name: '剪贴板历史', icon: ICONS.clipboard, kind: 'hosted',
    desc: '最近复制的内容，一键回贴',
    load: () => import('../tools/clipboard/ClipboardTool'),
  },
  {
    id: 'toolbox', name: '工具箱', icon: ICONS.wrench, kind: 'hosted',
    desc: '时间戳 / 编码 / 哈希 / 转换',
    load: () => import('../tools/toolbox/ToolboxTool'),
  },
]

export function findTool(id: string): ToolMeta | undefined {
  return HOSTED_TOOLS.find((t) => t.id === id)
}
