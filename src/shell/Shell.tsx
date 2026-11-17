// 工作台主面板：问候 + Raycast 式搜索优先 + 3 列工具网格 + Ctrl+K 命令面板
import { render } from 'solid-js/web'
import { createSignal, For, Show, onMount, onCleanup } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { HOSTED_TOOLS, ICONS, type ToolMeta } from '../shared/registry'

interface ToolEntry {
  id: string
  name: string
  kind: 'hosted' | 'external'
  command?: string
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
  const [tools, setTools] = createSignal<ToolEntry[]>([])
  const [q, setQ] = createSignal('')
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  const [paletteIdx, setPaletteIdx] = createSignal(0)

  let paletteInput: HTMLInputElement | undefined

  onMount(async () => {
    try {
      const st = await invoke<{ settings: Record<string, any>; tools: ToolEntry[] }>('get_state')
      setTools(st.tools || [])
      const theme = (st as any).settings?.theme
      if (theme === 'light') document.documentElement.dataset.theme = 'light'
    } catch { /* ignore */ }

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const next = !paletteOpen()
        setPaletteOpen(next)
        setPaletteIdx(0)
        if (next) setTimeout(() => paletteInput?.focus(), 30)
      } else if (e.key === 'Escape') {
        if (paletteOpen()) setPaletteOpen(false)
        else getCurrentWindow().hide()
      }
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  })

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

  const launch = (id: string) => {
    invoke('launch_tool', { id }).catch((e) => console.error(e))
  }

  const runPalette = (idx: number) => {
    const item = paletteFiltered()[idx]
    if (!item) return
    setPaletteOpen(false)
    setQ('')
    if (paletteInput) paletteInput.value = ''
    launch(item.id)
  }

  return (
    <div class="win">
      {/* 问候区 + Raycast 式大搜索 */}
      <div class="hero">
        <div class="hero-greet">
          <span class="hi">
            {greet()}，<em>开始专注</em>
          </span>
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '10px' }}>
            <span class="date">{dateLine()}</span>
            <button
              class="ib"
              style={{ width: '26px', height: '26px', 'font-size': '13px' }}
              title="关闭（隐藏到托盘）"
              onClick={() => getCurrentWindow().hide()}
              innerHTML={ICONS.close}
            />
          </span>
        </div>
        <div class="searchbox hero-search">
          <span class="s-ico" innerHTML={ICONS.search} />
          <input
            placeholder="搜索工具，回车启动第一个…"
            onInput={(e) => setQ(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                const all = [...hosted(), ...external()]
                if (all[0]) launch(all[0].id)
              } else if (e.key === 'Escape') {
                getCurrentWindow().hide()
              }
            }}
          />
          <button class="ib" style={{ width: '24px', height: '24px', 'font-size': '11px' }} title="命令面板 (Ctrl+K)" onClick={() => { setPaletteOpen(true); setTimeout(() => paletteInput?.focus(), 30) }} innerHTML={ICONS.dots} />
        </div>
      </div>

      {/* 工具网格 */}
      <div class="bento">
        <For each={hosted()}>
          {(t) => (
            <button class="card hoverable tool-card" onClick={() => launch(t.id)} title={t.desc}>
              <span class="tool-ico" innerHTML={t.icon} />
              <span class="tool-name">{t.name}</span>
              <span class="tool-desc">{t.desc}</span>
            </button>
          )}
        </For>
        <For each={external()}>
          {(t) => (
            <button class="card hoverable tool-card" onClick={() => launch(t.id)} title={t.desc}>
              <span class="tool-ico ext" innerHTML={t.icon} />
              <span class="tool-name">{t.name}</span>
              <span class="tool-desc">{t.desc}</span>
            </button>
          )}
        </For>
        <Show when={!hosted().length && !external().length}>
          <div class="bento-empty">没有匹配的工具</div>
        </Show>
      </div>

      {/* 底部提示 */}
      <div class="foot-hint">
        <span>
          <kbd>Ctrl+Alt+T</kbd> 呼出 / 隐藏 · <kbd>Ctrl+K</kbd> 命令面板
        </span>
        <span>点击卡片启动工具</span>
      </div>

      {/* 命令面板 */}
      <Show when={paletteOpen()}>
        <div
          class="palette-mask"
          onClick={(e) => { if (e.target === e.currentTarget) setPaletteOpen(false) }}
        >
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
