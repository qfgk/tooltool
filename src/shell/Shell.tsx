// 工作台主面板（仪表盘）：Bento 三级卡片 + 实时徽标 + 内联搜索 + Ctrl+K 命令面板
import { render } from 'solid-js/web'
import { createSignal, For, Show, onMount, onCleanup } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { HOSTED_TOOLS, ICONS, type ToolMeta } from '../shared/registry'
import { applyTheme, type ThemeMode } from '../shared/theme'

interface ToolEntry {
  id: string
  name: string
  kind: 'hosted' | 'external'
  command?: string
}

/** 各工具实时徽标 provider：面板每次显示时拉取 */
async function badgeFor(id: string): Promise<string | null> {
  try {
    if (id === 'clipboard') {
      const s = await invoke<{ count: number }>('clip_stats')
      return s.count > 0 ? String(s.count) : null
    }
    if (id === 'notes') {
      const list = await invoke<{ id: string }[]>('notes_list')
      return list.length > 0 ? String(list.length) : null
    }
    if (id === 'toolbox') return '6'
  } catch { /* 工具未实现命令前静默 */ }
  return null
}

function greet(): string {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function dateLine(): string {
  const d = new Date()
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week}`
}

export function mount(root: HTMLElement) {
  render(Dashboard, root)
}

function Dashboard() {
  const win = getCurrentWindow()
  const [tools, setTools] = createSignal<ToolEntry[]>([])
  const [q, setQ] = createSignal('')
  const [searchFocus, setSearchFocus] = createSignal(false)
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  const [paletteIdx, setPaletteIdx] = createSignal(0)
  // 主题：auto-time（随时间）| dark | light
  const [themeMode, setThemeMode] = createSignal<ThemeMode>('auto-time')
  const [badges, setBadges] = createSignal<Record<string, string>>({})
  // 启动项（快速启动器数据，面板直接展示执行）
  const [qlEntries, setQlEntries] = createSignal<{ id: string; name: string; kind: string; target: string }[]>([])

  let paletteInput: HTMLInputElement | undefined

  const refreshTools = async () => {
    try {
      const st = await invoke<{ settings: Record<string, any>; tools: ToolEntry[] }>('get_state')
      setTools(st.tools || [])
      const mode = (st.settings?.theme as ThemeMode) || 'auto-time'
      setThemeMode(mode)
      applyTheme(mode)
      try { setQlEntries(await invoke('ql_list')) } catch { /* ignore */ }
    } catch { /* ignore */ }
  }

  const loadBadges = async () => {
    const out: Record<string, string> = {}
    await Promise.all(
      HOSTED_TOOLS.map(async (t) => {
        const b = await badgeFor(t.id)
        if (b) out[t.id] = b
      }),
    )
    setBadges(out)
  }

  onMount(async () => {
    await refreshTools()
    await loadBadges()
    // 面板每次显示时刷新徽标与数据
    const onVisible = async () => {
      await refreshTools()
      await loadBadges()
    }
    window.addEventListener('focus', onVisible)
    onCleanup(() => {
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('keydown', onKey)
    })

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const next = !paletteOpen()
        setPaletteOpen(next)
        setPaletteIdx(0)
        if (next) setTimeout(() => paletteInput?.focus(), 30)
      } else if (e.key === 'Escape') {
        if (paletteOpen()) setPaletteOpen(false)
        else win.hide()
      }
    }
    window.addEventListener('keydown', onKey)
  })

  const cycleTheme = async () => {
    const order: ThemeMode[] = ['auto-time', 'dark', 'light']
    const next = order[(order.indexOf(themeMode()) + 1) % order.length]
    setThemeMode(next)
    applyTheme(next)
    try { await invoke('save_settings', { settings: { theme: next } }) } catch { /* ignore */ }
  }

  const themeIcon = () => (themeMode() === 'dark' ? '🌙' : themeMode() === 'light' ? '☀️' : '🕐')
  const themeLabel = () => (themeMode() === 'dark' ? '深色' : themeMode() === 'light' ? '浅色' : '随时间')

  const qlIco = (k: string) => (k === 'url' ? ICONS.search : k === 'dir' ? '📁' : '🚀')

  const filter = (list: ToolMeta[]) => {
    const kw = q().trim().toLowerCase()
    if (!kw) return list
    return list.filter((t) => t.name.toLowerCase().includes(kw) || t.desc.toLowerCase().includes(kw))
  }
  const hosted = () => filter(HOSTED_TOOLS)
  const external = () =>
    filter(
      tools()
        .filter((t) => t.kind === 'external')
        .map((t) => ({ id: t.id, name: t.name, icon: ICONS.pin, desc: t.command || '', kind: 'external' as const })),
    )
  const paletteFiltered = () => {
    const kw = q().trim().toLowerCase()
    const all = [
      ...HOSTED_TOOLS.map((t) => ({ id: t.id, name: t.name, icon: t.icon, kind: 'hosted' as const })),
      ...tools()
        .filter((t) => t.kind === 'external')
        .map((t) => ({ id: t.id, name: t.name, icon: ICONS.pin, kind: 'external' as const })),
    ]
    if (!kw) return all
    return all.filter((t) => t.name.toLowerCase().includes(kw))
  }

  const launch = (id: string) => invoke('launch_tool', { id }).catch((e) => console.error(e))

  const runPalette = (idx: number) => {
    const item = paletteFiltered()[idx]
    if (!item) return
    setPaletteOpen(false)
    setQ('')
    if (paletteInput) paletteInput.value = ''
    launch(item.id)
  }

  const searchEnter = () => {
    // 粘贴的是网址 → 直接打开；否则启动第一个匹配工具
    const all = [...hosted(), ...external()]
    if (all[0]) launch(all[0].id)
  }

  return (
    <div class="win">
      {/* 标题栏：品牌 + 内联搜索 + 主题/设置/关闭 */}
      <header class="win-head" data-tauri-drag-region>
        <span class="win-title"><span class="dot" /> tool-tool不绝</span>
        <span class="drag" data-tauri-drag-region />
        <div class="searchbox head-search" classList={{ focus: searchFocus() }}>
          <span class="s-ico" innerHTML={ICONS.search} />
          <input
            placeholder="搜索…  ⌘K"
            onInput={(e) => setQ(e.currentTarget.value)}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') searchEnter()
              else if (e.key === 'Escape') { e.currentTarget.blur(); win.hide() }
            }}
          />
        </div>
        <button
          class="ib theme-btn"
          style={{ width: '28px', height: '28px', 'font-size': '13px' }}
          title={`主题：${themeLabel()}（点击切换 固定深/固定浅/随时间）`}
          onClick={() => void cycleTheme()}
        >
          {themeIcon()}
        </button>
        <button
          class="ib"
          style={{ width: '28px', height: '28px' }}
          title="添加启动项（打开快速启动管理）"
          onClick={() => launch('launcher')}
          innerHTML={ICONS.plus}
        />
        <button
          class="ib close"
          style={{ width: '28px', height: '28px' }}
          title="关闭（隐藏到托盘）"
          onClick={() => win.hide()}
          innerHTML={ICONS.close}
        />
      </header>

      {/* 问候行（紧凑） */}
      <div class="hero-greet">
        <span class="hi">
          {greet()}，<em>开始专注</em>
        </span>
        <span class="date">{dateLine()}</span>
      </div>

      {/* Bento 仪表盘：hero 2×2 + wide 2×1 + std 1×1 */}
      <div class="bento">
        {/* Hero 2×2：笔记（默认主卡） */}
        <For each={hosted().filter((t) => t.id === 'notes')}>
          {(t) => (
            <button class="card hoverable tool-card hero" onClick={() => launch(t.id)} title={t.desc}>
              <Show when={badges()[t.id]}><span class="card-badge">{badges()[t.id]}</span></Show>
              <span class="tool-ico" innerHTML={t.icon} />
              <span class="tool-name">{t.name}</span>
              <span class="hero-num">{badges()[t.id] ?? '0'}</span>
              <span class="hero-num-label">{t.id === 'notes' ? '篇笔记' : '条目'}</span>
              <span class="tool-desc">{t.desc}</span>
            </button>
          )}
        </For>

        {/* Wide 2×1：剪贴板 */}
        <For each={hosted().filter((t) => t.id === 'clipboard')}>
          {(t) => (
            <button class="card hoverable tool-card wide" onClick={() => launch(t.id)} title={t.desc}>
              <span class="card-badge">{badges()[t.id] ?? ''}</span>
              <div class="wide-top">
                <span class="tool-ico sm" innerHTML={t.icon} />
                <span class="tool-name">{t.name}</span>
                <Show when={badges()[t.id]}><span class="wide-badge">{badges()[t.id]}</span></Show>
              </div>
              <span class="wide-preview">最近复制的内容，一键回贴</span>
            </button>
          )}
        </For>

        {/* Std 1×1：快速启动 / 工具箱 / 外部 / 添加 */}
        <For each={hosted().filter((t) => t.id !== 'notes' && t.id !== 'clipboard')}>
          {(t) => (
            <button class="card hoverable tool-card std" onClick={() => launch(t.id)} title={t.desc}>
              <Show when={badges()[t.id]}><span class="card-badge">{badges()[t.id]}</span></Show>
              <span class="tool-ico" innerHTML={t.icon} />
              <span class="tool-name">{t.name}</span>
              <span class="tool-desc">{t.desc}</span>
            </button>
          )}
        </For>
        {/* 启动项卡（来自快速启动器数据，点击直接执行） */}
        <For each={qlEntries()}>
          {(e) => (
            <button
              class="card hoverable tool-card std ql"
              onClick={() => invoke('ql_run', { id: e.id }).catch((err) => console.error(err))}
              title={e.target}
            >
              <span class="tool-ico ql" innerHTML={qlIco(e.kind)} />
              <span class="tool-name">{e.name}</span>
              <span class="tool-desc">{e.target}</span>
            </button>
          )}
        </For>
        {/* 添加卡：打开快速启动器管理 */}
        <Show when={!q().trim()}>
          <button class="card hoverable tool-card std add-card" onClick={() => launch('launcher')} title="添加应用 / 文件夹 / 网址，支持扫描文件夹批量导入">
            <span class="tool-ico add" innerHTML={ICONS.plus} />
            <span class="tool-name">添加启动项</span>
            <span class="tool-desc">应用 / 文件夹 / 网址</span>
          </button>
        </Show>
        <Show when={!hosted().length && !external().length}>
          <div class="bento-empty">没有匹配的工具</div>
        </Show>
      </div>

      {/* 状态栏 */}
      <div class="foot-hint">
        <span />
        <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '8px' }}>
          <span>主题：{themeLabel()}</span>
          <span>v0.1.0</span>
        </span>
      </div>

      {/* 命令面板 */}
      <Show when={paletteOpen()}>
        <div class="palette-mask" onClick={(e) => { if (e.target === e.currentTarget) setPaletteOpen(false) }}>
          <div class="glass-pop palette">
            <div class="searchbox palette-input">
              <span class="s-ico" innerHTML={ICONS.search} />
              <input
                ref={paletteInput}
                placeholder="输入工具名 / 命令…"
                onInput={(e) => { setQ(e.currentTarget.value); setPaletteIdx(0) }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'ArrowDown') { setPaletteIdx((paletteIdx() + 1) % Math.max(1, paletteFiltered().length)) }
                  else if (e.key === 'ArrowUp') { setPaletteIdx((paletteIdx() - 1 + paletteFiltered().length) % Math.max(1, paletteFiltered().length)) }
                  else if (e.key === 'Enter') { runPalette(paletteIdx()) }
                  else if (e.key === 'Escape') { setPaletteOpen(false) }
                }}
              />
            </div>
            <div class="palette-list">
              <For each={paletteFiltered()}>
                {(item, i) => (
                  <button
                    class="palette-item"
                    classList={{ on: i() === paletteIdx() }}
                    onMouseEnter={() => setPaletteIdx(i())}
                    onClick={() => runPalette(i())}
                  >
                    <span class="p-ico" innerHTML={item.icon} />
                    <span class="p-name">{item.name}</span>
                    <Show when={item.kind === 'hosted'}>
                      <span class="p-kind">内置</span>
                    </Show>
                  </button>
                )}
              </For>
              <Show when={!paletteFiltered().length}>
                <div class="palette-empty">没有匹配项</div>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

