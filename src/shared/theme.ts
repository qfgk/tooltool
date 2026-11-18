// 主题管理：固定深/固定浅/随时间自动（6-18 点浅色，其余深色）
export type ThemeMode = 'auto-time' | 'dark' | 'light'

export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'dark' || mode === 'light') return mode
  const h = new Date().getHours()
  return h >= 6 && h < 18 ? 'light' : 'dark'
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = resolveTheme(mode)
}

/** 启动时应用 + 每小时刷新一次（auto-time 随时间翻转） */
export function startThemeLoop(getMode: () => ThemeMode) {
  applyTheme(getMode())
  window.setInterval(() => applyTheme(getMode()), 3600_000)
}
