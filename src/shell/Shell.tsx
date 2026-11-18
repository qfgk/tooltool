// 工作台主面板：问候 + Raycast 式搜索优先 + 3 列工具网格 + Ctrl+K 命令面板
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
  // 外部工具表单
  const [addOpen, setAddOpen] = createSignal(false)
  const [addForm, setAddForm] = createSignal({ name: '', command: '' })
  const [addErr, setAddErr] = createSignal('')
  // 主题：auto-time（随时间）| dark | light
  const [themeMode, setThemeMode] = createSignal<ThemeMode>('auto-time')

  let paletteInput: HTMLInputElement | undefined

  const PIN_TODO_EXE = 'D:\\ai\\todo\\src-tauri\\target\\release\\todo.exe'

  const refreshTools = async () => {
    try {
      const st = await invoke<{ settings: Record<string, any>; tools: ToolEntry[] }>('get_state')
      setTools(st.tools || [])
      const mode = (st.settings?.theme as ThemeMode) || 'auto-time'
      setThemeMode(mode)
      applyTheme(mode)
      // auto-time 模式下每小时刷新（昼夜翻转）
      window.setInterval(() => applyTheme(mode), 3600_000)
    } catch { /* ignore */ }
  }

  const cycleTheme = async () => {
    const order: ThemeMode[] = ['auto-time', 'dark', 'light']
    const next = order[(order.indexOf(themeMode()) + 1) % order.length]
    setThemeMode(next)
    applyTheme(next)
    try { await invoke('save_settings', { settings: { theme: next } }) } catch { /* ignore */ }
  }

  const themeIcon = () => (themeMode() === 'dark' ? '🌙' : themeMode() === 'light' ? '☀️' : '🕐')
  const themeLabel = () => (themeMode() === 'dark' ? '深色' : themeMode() === 'light' ? '浅色' : '随时间')

  onMount(async () => {
    await refreshTools()

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const next = !paletteOpen()
        setPaletteOpen(next)
        setPaletteIdx(0)
        if (next) setTimeout(() => paletteInput?.focus(), 30)
      } else if (e.key === 'Escape') {
        if (paletteOpen() || addOpen()) {
          setPaletteOpen(false)
          setAddOpen(false)
        } else getCurrentWindow().hide()
      }
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  })

  const addExternal = async () => {
    setAddErr('')
    try {
      await invoke('add_external_tool', { name: addForm().name, command: addForm().command })
      setAddOpen(false)
      setAddForm({ name: '', command: '' })
      await refreshTools()
    } catch (e) { setAddErr(String(e)) }
  }

  const removeExternal = async (id: string) => {
    try {
      await invoke('remove_tool', { id })
      await refreshTools()
    } catch (e) { console.error(e) }
  }

  const quickAddPinTodo = () => {
    setAddOpen(true)
    setAddErr('')
    setAddForm({ name: 'PinTodo 待办', command: PIN_TODO_EXE })
  }

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
            <button
              class="ib theme-btn"
              style={{ width: '26px', height: '26px', 'font-size': '13px' }}
              title={`主题：${themeLabel()}（点击切换 固定深/固定浅/随时间）`}
              onClick={() => void cycleTheme()}
            >
              {themeIcon()}
            </button>
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
              <span
                class="ext-del"
                title="移除此工具"
                onClick={(ev) => { ev.stopPropagation(); removeExternal(t.id) }}
                innerHTML={ICONS.close}
              />
            </button>
          )}
        </For>
        {/* 添加外部工具卡片 */}
        <Show when={!q().trim()}>
          <button class="card hoverable tool-card add-card" onClick={() => { setAddOpen(true); setAddErr(''); setAddForm({ name: '', command: '' }) }}>
            <span class="tool-ico add" innerHTML={ICONS.plus} />
            <span class="tool-name">添加外部工具</span>
            <span class="tool-desc">exe / 脚本 / 任意程序</span>
          </button>
        </Show>
        <Show when={!hosted().length && !external().length}>
          <div class="bento-empty">没有匹配的工具</div>
        </Show>
      </div>

      {/* 底部提示 */}
      <div class="foot-hint">
        <span>
          <kbd>Ctrl+Alt+T</kbd> 呼出 / 隐藏 · <kbd>Ctrl+K</kbd> 命令面板
        </span>
        <Show when={!tools().some((t) => t.kind === 'external' && t.id.startsWith('ext-'))} fallback={<span>点击卡片启动工具</span>}>
          <button class="quick-pin" onClick={quickAddPinTodo}>⚡ 一键注册 PinTodo</button>
        </Show>
      </div>

      {/* 添加外部工具表单 */}
      <Show when={addOpen()}>
        <div
          class="palette-mask"
          onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false) }}
        >
          <div class="glass-pop add-card-pop">
            <div class="add-title">添加外部工具</div>
            <label class="add-label">名称</label>
            <input
              class="add-input"
              placeholder="例如：PinTodo 待办"
              value={addForm().name}
              onInput={(e) => setAddForm({ ...addForm(), name: e.currentTarget.value })}
            />
            <label class="add-label">目标（exe / lnk / 脚本路径）</label>
            <input
              class="add-input"
              placeholder="D:\\app\\tool.exe"
              value={addForm().command}
              onInput={(e) => setAddForm({ ...addForm(), command: e.currentTarget.value })}
            />
            <Show when={addErr()}>
              <div class="add-err">{addErr()}</div>
            </Show>
            <div class="add-acts">
              <button class="btn ghost" onClick={() => setAddOpen(false)}>取消</button>
              <button class="btn primary" onClick={addExternal}>添加</button>
            </div>
          </div>
        </div>
      </Show>

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
