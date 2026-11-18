// 快速启动器：条目网格 + 搜索过滤 + 添加/编辑/删除 + 一键执行
import { render } from 'solid-js/web'
import { createSignal, createMemo, For, Show, onMount } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ICONS } from '../../shared/registry'
import '../../shared/tool-page.css'

interface QlEntry {
  id: string
  name: string
  kind: 'app' | 'dir' | 'url'
  target: string
}

const KIND_META: Record<string, { ico: string; label: string }> = {
  app: { ico: '🚀', label: '应用' },
  dir: { ico: '📁', label: '文件夹' },
  url: { ico: '🌐', label: '网址' },
}

export function mount(root: HTMLElement) {
  render(QuickLaunch, root)
}

function QuickLaunch() {
  const win = getCurrentWindow()
  const [entries, setEntries] = createSignal<QlEntry[]>([])
  const [q, setQ] = createSignal('')
  const [editing, setEditing] = createSignal<QlEntry | null>(null) // null = 列表；{} = 新建
  const [form, setForm] = createSignal({ name: '', kind: 'app', target: '' })
  const [formErr, setFormErr] = createSignal('')
  const [busyId, setBusyId] = createSignal<string | null>(null)

  const refresh = async () => {
    try { setEntries(await invoke<QlEntry[]>('ql_list')) } catch (e) { console.error(e) }
  }
  onMount(refresh)

  const filtered = createMemo(() => {
    const kw = q().trim().toLowerCase()
    if (!kw) return entries()
    return entries().filter((e) => e.name.toLowerCase().includes(kw) || e.target.toLowerCase().includes(kw))
  })

  const openForm = (entry?: QlEntry) => {
    setFormErr('')
    setEditing(entry ?? { id: '', name: '', kind: 'app', target: '' })
    setForm({ name: entry?.name ?? '', kind: entry?.kind ?? 'app', target: entry?.target ?? '' })
  }

  const saveForm = async () => {
    setFormErr('')
    try {
      await invoke('ql_save', { entry: { id: editing()!.id, ...form() } })
      setEditing(null)
      await refresh()
    } catch (e) { setFormErr(String(e)) }
  }

  const run = async (e: QlEntry) => {
    setBusyId(e.id)
    try { await invoke('ql_run', { id: e.id }) } catch (err) { console.error(err); alert(String(err)) }
    setBusyId(null)
  }

  const del = async (e: QlEntry) => {
    try {
      await invoke('ql_delete', { id: e.id })
      await refresh()
    } catch (err) { alert(String(err)) }
  }

  const kindIco = (k: string) => KIND_META[k]?.ico ?? '⚙'

  return (
    <div class="win">
      <header class="win-head" data-tauri-drag-region>
        <span class="win-title"><span class="dot" /> 快速启动</span>
        <span class="drag" data-tauri-drag-region />
        <div class="searchbox" style={{ width: '200px', height: '30px' }}>
          <span class="s-ico" innerHTML={ICONS.search} />
          <input placeholder="搜索…" onInput={(e) => setQ(e.currentTarget.value)} />
        </div>
        <button class="ib" title="新增条目" onClick={() => openForm()} innerHTML={ICONS.plus} />
        <button class="ib close" title="关闭 (Esc)" onClick={() => win.close()} innerHTML={ICONS.close} />
      </header>

      {/* 列表视图 */}
      <Show when={!editing()}>
        <div class="tool-page">
          <Show
            when={filtered().length > 0}
            fallback={
              <div class="tool-placeholder">
                <div class="big-ico" innerHTML={ICONS.rocket} />
                <div class="t1">{q() ? '没有匹配的条目' : '还没有启动条目'}</div>
                <div class="t2">点击右上角 ＋ 添加应用 / 文件夹 / 网址</div>
              </div>
            }
          >
            <div class="ql-grid">
              <For each={filtered()}>
                {(e) => (
                  <div class="card hoverable ql-card" onClick={() => run(e)} title={e.target}>
                    <span class="ql-ico">{kindIco(e.kind)}</span>
                    <span class="ql-name">{e.name}</span>
                    <span class="ql-target">{e.target}</span>
                    <span
                      class="ql-acts"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <button class="ib" title="编辑" onClick={() => openForm(e)} innerHTML={ICONS.minus} style={{ 'font-size': '12px' }} />
                      <button class="ib close" title="删除" onClick={() => del(e)} innerHTML={ICONS.close} />
                    </span>
                    <Show when={busyId() === e.id}>
                      <span class="ql-busy" />
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      {/* 表单视图（新建 / 编辑） */}
      <Show when={editing()}>
        <div class="tool-page" style={{ 'justify-content': 'center' }}>
          <div class="ql-form card">
            <div class="ql-form-title">{editing()!.id ? '编辑条目' : '新增条目'}</div>

            <label class="ql-label">名称</label>
            <input
              class="ql-input"
              placeholder="例如：VS Code"
              value={form().name}
              onInput={(e) => setForm({ ...form(), name: e.currentTarget.value })}
            />

            <label class="ql-label">类型</label>
            <div class="ql-kinds">
              <For each={Object.keys(KIND_META)}>
                {(k) => (
                  <button
                    class="ql-kind"
                    classList={{ on: form().kind === k }}
                    onClick={() => setForm({ ...form(), kind: k })}
                  >
                    {KIND_META[k].ico} {KIND_META[k].label}
                  </button>
                )}
              </For>
            </div>

            <label class="ql-label">{form().kind === 'url' ? '网址' : form().kind === 'dir' ? '文件夹路径' : '程序 / 文件路径'}</label>
            <input
              class="ql-input"
              placeholder={form().kind === 'url' ? 'https://…' : 'D:\\…\\app.exe'}
              value={form().target}
              onInput={(e) => setForm({ ...form(), target: e.currentTarget.value })}
            />
            <Show when={formErr()}>
              <div class="ql-err">{formErr()}</div>
            </Show>

            <div class="ql-form-acts">
              <button class="btn ghost" onClick={() => setEditing(null)}>取消</button>
              <button class="btn primary" onClick={saveForm}>保存</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
