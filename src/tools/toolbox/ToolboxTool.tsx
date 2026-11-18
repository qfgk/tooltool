// 工具箱：时间戳 / 编码 / 哈希 / 文本 / 换算 —— 纯前端零存储，即开即用
import { render } from 'solid-js/web'
import { createSignal, createMemo, For, Show, onMount, onCleanup } from 'solid-js'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ICONS } from '../../shared/registry'
import '../../shared/tool-page.css'

export function mount(root: HTMLElement) {
  render(Toolbox, root)
}

type TabId = 'timestamp' | 'encode' | 'hash' | 'text' | 'convert' | 'color'

const TABS: { id: TabId; name: string; icon: string }[] = [
  { id: 'timestamp', name: '时间戳', icon: '⏱' },
  { id: 'encode', name: '编码', icon: '🔐' },
  { id: 'hash', name: '哈希', icon: '#️⃣' },
  { id: 'text', name: '文本', icon: '✏️' },
  { id: 'convert', name: '换算', icon: '🔄' },
  { id: 'color', name: '取色', icon: '🎨' },
]

/* ---------------- 通用小组件 ---------------- */

function TextArea(props: { value: string; onInput: (v: string) => void; placeholder?: string; rows?: number; mono?: boolean }) {
  return (
    <textarea
      class="tb-area"
      classList={{ mono: props.mono }}
      rows={props.rows ?? 4}
      placeholder={props.placeholder}
      value={props.value}
      onInput={(e) => props.onInput(e.currentTarget.value)}
    />
  )
}

function CopyBtn(props: { getText: () => string; label?: string }) {
  const [done, setDone] = createSignal(false)
  return (
    <button
      class="btn ghost tb-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(props.getText())
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        } catch { /* ignore */ }
      }}
    >
      {done() ? '✓ 已复制' : (props.label ?? '复制')}
    </button>
  )
}

/* ---------------- 时间戳 ---------------- */

function TimestampTool() {
  const [now, setNow] = createSignal(Date.now())
  const [input, setInput] = createSignal(String(Date.now()))
  let timer: number

  onMount(() => {
    timer = window.setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  const parsed = createMemo<{ date: Date | null; error?: string }>(() => {
    const raw = input().trim()
    if (!raw) return { date: null }
    if (/^\d{10}$/.test(raw)) return { date: new Date(Number(raw) * 1000) }
    if (/^\d{13}$/.test(raw)) return { date: new Date(Number(raw)) }
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return { date: d }
    return { date: null, error: '无法解析：请输入 10 位秒 / 13 位毫秒时间戳或标准日期字符串' }
  })

  const fmt = (d: Date | null) =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}` : '—'

  const cur = () => new Date(now())

  return (
    <div class="tb-block">
      <div class="tb-row">
        <span class="tb-label">当前时间</span>
        <span class="tb-mono">{fmt(cur())}</span>
      </div>
      <div class="tb-row">
        <span class="tb-label">当前毫秒</span>
        <span class="tb-mono">{now()}</span>
        <CopyBtn getText={() => String(now())} label="复制毫秒" />
      </div>
      <div class="tb-row">
        <span class="tb-label">当前秒</span>
        <span class="tb-mono">{Math.floor(now() / 1000)}</span>
        <CopyBtn getText={() => String(Math.floor(now() / 1000))} label="复制秒" />
      </div>
      <div class="tb-divider" />
      <div class="tb-row col">
        <span class="tb-label">输入（秒/毫秒时间戳或日期字符串）</span>
        <input class="tb-input mono" value={input()} onInput={(e) => setInput(e.currentTarget.value)} />
      </div>
      <Show when={parsed().error}>
        <div class="tb-err">{parsed().error}</div>
      </Show>
      <Show when={parsed().date}>
        <div class="tb-row">
          <span class="tb-label">日期时间</span>
          <span class="tb-mono">{fmt(parsed().date)}</span>
          <CopyBtn getText={() => fmt(parsed().date)} />
        </div>
        <div class="tb-row">
          <span class="tb-label">秒</span>
          <span class="tb-mono">{parsed().date ? Math.floor(parsed().date!.getTime() / 1000) : '—'}</span>
          <CopyBtn getText={() => String(Math.floor(parsed().date!.getTime() / 1000))} />
        </div>
        <div class="tb-row">
          <span class="tb-label">毫秒</span>
          <span class="tb-mono">{parsed().date?.getTime() ?? '—'}</span>
          <CopyBtn getText={() => String(parsed().date!.getTime())} />
        </div>
      </Show>
    </div>
  )
}

/* ---------------- 编码 ---------------- */

function EncodeTool() {
  const [raw, setRaw] = createSignal('')
  const b64e = createMemo(() => {
    try { return raw() ? btoa(unescape(encodeURIComponent(raw()))) : '' } catch { return '—' }
  })
  const urlE = createMemo(() => {
    try { return raw() ? encodeURIComponent(raw()) : '' } catch { return '—' }
  })
  const hex = createMemo(() => {
    try {
      const bytes = new TextEncoder().encode(raw())
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ')
    } catch { return '—' }
  })

  const [b64dIn, setB64dIn] = createSignal('')
  const [urlDIn, setUrlDIn] = createSignal('')
  const b64d = createMemo(() => {
    try { return b64dIn() ? decodeURIComponent(escape(atob(b64dIn().trim()))) : '' } catch { return '(无效 Base64)' }
  })
  const urlD = createMemo(() => {
    try { return urlDIn() ? decodeURIComponent(urlDIn()) : '' } catch { return '(无效编码)' }
  })

  return (
    <div class="tb-block">
      <div class="tb-section">编码（输入 → 输出）</div>
      <TextArea value={raw()} onInput={setRaw} placeholder="输入要编码的文本…" rows={3} />
      <div class="tb-row"><span class="tb-label">Base64</span><span class="tb-mono wrap">{b64e()}</span><CopyBtn getText={b64e} /></div>
      <div class="tb-row"><span class="tb-label">URL</span><span class="tb-mono wrap">{urlE()}</span><CopyBtn getText={urlE} /></div>
      <div class="tb-row"><span class="tb-label">Hex</span><span class="tb-mono wrap">{hex()}</span><CopyBtn getText={hex} /></div>

      <div class="tb-divider" />
      <div class="tb-section">解码</div>
      <div class="tb-row col">
        <span class="tb-label">Base64 → 文本</span>
        <TextArea value={b64dIn()} onInput={setB64dIn} placeholder="粘贴 Base64…" rows={2} mono />
        <div class="tb-mono wrap">{b64d()}</div>
      </div>
      <div class="tb-row col">
        <span class="tb-label">URL → 文本</span>
        <TextArea value={urlDIn()} onInput={setUrlDIn} placeholder="粘贴 URL 编码…" rows={2} mono />
        <div class="tb-mono wrap">{urlD()}</div>
      </div>
    </div>
  )
}

/* ---------------- 哈希（WebCrypto SHA-256 + 内联 MD5） ---------------- */

function md5(input: string): string {
  const rl = (v: number, s: number) => (v << s) | (v >>> (32 - s))
  const toHex = (n: number) => {
    let s = ''
    for (let i = 0; i < 4; i++) s += ((n >> (i * 8 + 4)) & 0x0f).toString(16) + ((n >> (i * 8)) & 0x0f).toString(16)
    return s
  }
  const utf8 = unescape(encodeURIComponent(input))
  const n = utf8.length
  const words: number[] = []
  for (let i = 0; i < n; i++) words[i >> 2] = (words[i >> 2] || 0) | (utf8.charCodeAt(i) << ((i % 4) * 8))
  words[n >> 2] = (words[n >> 2] || 0) | (0x80 << ((n % 4) * 8))
  const blocks = (((n + 8) >> 6) + 1) * 16
  for (let i = words.length; i < blocks; i++) words[i] = 0
  words[blocks - 2] = n * 8

  let a = 1732584193
  let b = -271733879
  let c = -1732584194
  let d = 271733878

  const K = new Array(64)
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)

  for (let i = 0; i < blocks; i += 16) {
    const [oa, ob, oc, od] = [a, b, c, d]
    for (let j = 0; j < 64; j++) {
      let f: number
      let x: number
      if (j < 16) {
        f = (b & c) | (~b & d)
        x = j
      } else if (j < 32) {
        f = (d & b) | (~d & c)
        x = (5 * j + 1) % 16
      } else if (j < 48) {
        f = b ^ c ^ d
        x = (3 * j + 5) % 16
      } else {
        f = c ^ (b | ~d)
        x = (7 * j) % 16
      }
      const tmp = d
      const sum = (a + f + words[i + x] + K[j]) | 0
      d = c
      c = b
      b = (b + rl(sum, S[(j >> 2) * 4 + (j % 4)])) | 0
      a = tmp
    }
    a = (a + oa) | 0
    b = (b + ob) | 0
    c = (c + oc) | 0
    d = (d + od) | 0
  }
  return toHex(a) + toHex(b) + toHex(c) + toHex(d)
}

function HashTool() {
  const [text, setText] = createSignal('')
  const [sha256, setSha256] = createSignal('')

  const compute = async (v: string) => {
    setText(v)
    if (!v) { setSha256(''); return }
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))
      setSha256(Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join(''))
    } catch { setSha256('（SHA-256 不可用）') }
  }

  return (
    <div class="tb-block">
      <TextArea value={text()} onInput={compute} placeholder="输入文本…" rows={3} />
      <div class="tb-row"><span class="tb-label">MD5</span><span class="tb-mono wrap">{text() ? md5(text()) : '—'}</span><CopyBtn getText={() => md5(text())} /></div>
      <div class="tb-row"><span class="tb-label">SHA-256</span><span class="tb-mono wrap">{sha256() || '—'}</span><CopyBtn getText={sha256} /></div>
      <div class="tb-row col">
        <span class="tb-label">UUID v4（点击生成）</span>
        <button class="btn ghost" onClick={() => setSha256(crypto.randomUUID())}>生成新 UUID</button>
        <Show when={sha256().length === 36}>
          <span class="tb-mono">{sha256()}</span>
          <CopyBtn getText={sha256} />
        </Show>
      </div>
    </div>
  )
}

/* ---------------- 文本 ---------------- */

function TextTool() {
  const [text, setText] = createSignal('')
  const [regex, setRegex] = createSignal('')
  const [flags, setFlags] = createSignal('g')

  const lines = createMemo(() => text().split('\n'))
  const stats = createMemo(() => ({
    chars: text().length,
    words: text().trim() ? text().trim().split(/\s+/).length : 0,
    lines: lines().length,
  }))
  const deduped = createMemo(() => Array.from(new Set(lines().filter((l) => l.trim()))).join('\n'))
  const sorted = createMemo(() => lines().filter((l) => l.trim()).sort((a, b) => a.localeCompare(b, 'zh')).join('\n'))
  const regexResult = createMemo(() => {
    if (!regex() || !text()) return ''
    try {
      const re = new RegExp(regex(), flags().includes('g') ? flags() : flags() + 'g')
      const matches = text().match(re)
      return matches ? `匹配 ${matches.length} 处：\n${matches.join('\n')}` : '无匹配'
    } catch (e) { return '正则错误：' + String(e) }
  })

  const transform = (fn: (s: string) => string) => setText(fn(text()))

  return (
    <div class="tb-block">
      <TextArea value={text()} onInput={setText} placeholder="输入文本，每行一条…" rows={6} />
      <div class="tb-row"><span class="tb-label">统计</span><span class="tb-mono">{stats().chars} 字符 · {stats().words} 词 · {stats().lines} 行</span></div>
      <div class="tb-btns">
        <button class="btn ghost" onClick={() => transform((s) => s.toUpperCase())}>全部大写</button>
        <button class="btn ghost" onClick={() => transform((s) => s.toLowerCase())}>全部小写</button>
        <button class="btn ghost" onClick={() => setText(deduped())}>去重行</button>
        <button class="btn ghost" onClick={() => setText(sorted())}>排序行</button>
        <CopyBtn getText={text} label="复制全部" />
      </div>
      <div class="tb-divider" />
      <div class="tb-row col">
        <span class="tb-label">正则测试</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input class="tb-input mono" placeholder="/pattern/gi" value={regex()} onInput={(e) => setRegex(e.currentTarget.value)} />
          <input class="tb-input" style={{ width: '70px' }} placeholder="flags" value={flags()} onInput={(e) => setFlags(e.currentTarget.value)} />
        </div>
        <div class="tb-mono wrap">{regexResult()}</div>
      </div>
    </div>
  )
}

/* ---------------- 换算 ---------------- */

function ConvertTool() {
  const [lenValue, setLenValue] = createSignal('1')
  const [lenUnit, setLenUnit] = createSignal<'km' | 'm' | 'cm' | 'mile' | 'inch'>('km')
  const conversions: Record<string, number> = { km: 1000, m: 1, cm: 0.01, mile: 1609.344, inch: 0.0254 }
  const lenResults = createMemo(() => {
    const v = parseFloat(lenValue())
    if (isNaN(v)) return null
    const meters = v * conversions[lenUnit()]
    return Object.entries(conversions).map(([u, f]) => ({ unit: u, value: (meters / f).toPrecision(6).replace(/\.?0+$/, '') }))
  })

  const [tsValue, setTsValue] = createSignal('')
  const tsResult = createMemo(() => {
    const raw = tsValue().trim()
    if (!raw) return null
    if (/^\d{10}$/.test(raw)) return new Date(Number(raw) * 1000).toLocaleString()
    if (/^\d{13}$/.test(raw)) return new Date(Number(raw)).toLocaleString()
    const d = new Date(raw)
    return isNaN(d.getTime()) ? '无法解析' : d.toLocaleString()
  })

  return (
    <div class="tb-block">
      <div class="tb-section">长度换算</div>
      <div class="tb-row" style={{ 'align-items': 'center' }}>
        <input class="tb-input" style={{ width: '120px' }} value={lenValue()} onInput={(e) => setLenValue(e.currentTarget.value)} />
        <For each={Object.keys(conversions)}>
          {(u) => (
            <button class="ql-kind" classList={{ on: lenUnit() === u }} onClick={() => setLenUnit(u as any)}>{u}</button>
          )}
        </For>
      </div>
      <Show when={lenResults()}>
        <For each={lenResults()}>
          {(r) => (
            <div class="tb-row">
              <span class="tb-label">{r.unit}</span>
              <span class="tb-mono">{r.value}</span>
              <CopyBtn getText={() => r.value} />
            </div>
          )}
        </For>
      </Show>
      <div class="tb-divider" />
      <div class="tb-section">时间戳 ⇄ 日期</div>
      <input class="tb-input mono" placeholder="时间戳或日期字符串" value={tsValue()} onInput={(e) => setTsValue(e.currentTarget.value)} />
      <Show when={tsResult()}>
        <div class="tb-row"><span class="tb-label">结果</span><span class="tb-mono">{tsResult()}</span><CopyBtn getText={() => tsResult() ?? ''} /></div>
      </Show>
    </div>
  )
}

/* ---------------- 取色 ---------------- */

function ColorTool() {
  const [color, setColor] = createSignal('#6e6af6')

  const pick = async () => {
    try {
      // EyeDropper API（Chromium/WebView2 支持）
      const eye = new (window as any).EyeDropper()
      const res = await eye.open()
      setColor(res.sRGBHex)
    } catch { /* 用户取消 */ }
  }

  return (
    <div class="tb-block">
      <div class="tb-row" style={{ 'align-items': 'center', gap: '12px' }}>
        <button class="btn primary" onClick={pick}>从屏幕取色</button>
        <span class="tb-label">需要 WebView2 较新版本支持 EyeDropper API</span>
      </div>
      <div class="tb-row" style={{ 'align-items': 'center', gap: '12px', 'margin-top': '12px' }}>
        <span class="tb-swatch" style={{ background: color() }} />
        <input class="tb-input mono" style={{ width: '140px' }} value={color()} onInput={(e) => setColor(e.currentTarget.value)} />
        <CopyBtn getText={color} label="复制 HEX" />
      </div>
      <div class="tb-row col">
        <span class="tb-label">预览</span>
        <div class="tb-swatch big" style={{ background: color() }} />
      </div>
    </div>
  )
}

/* ---------------- 主组件 ---------------- */

function Toolbox() {
  const win = getCurrentWindow()
  const [tab, setTab] = createSignal<TabId>('timestamp')

  return (
    <div class="win">
      <header class="win-head" data-tauri-drag-region>
        <span class="win-title"><span class="dot" /> 工具箱</span>
        <span class="drag" data-tauri-drag-region />
        <button class="ib close" title="关闭 (Esc)" onClick={() => win.close()} innerHTML={ICONS.close} />
      </header>

      {/* 分类锚栏 */}
      <div class="tb-tabs">
        <For each={TABS}>
          {(t) => (
            <button class="tb-tab" classList={{ on: tab() === t.id }} onClick={() => setTab(t.id)}>
              <span style={{ 'margin-right': '5px' }}>{t.icon}</span>
              {t.name}
            </button>
          )}
        </For>
      </div>

      <div class="tool-page" style={{ overflow: 'auto' }}>
        <Show when={tab() === 'timestamp'}><TimestampTool /></Show>
        <Show when={tab() === 'encode'}><EncodeTool /></Show>
        <Show when={tab() === 'hash'}><HashTool /></Show>
        <Show when={tab() === 'text'}><TextTool /></Show>
        <Show when={tab() === 'convert'}><ConvertTool /></Show>
        <Show when={tab() === 'color'}><ColorTool /></Show>
      </div>
    </div>
  )
}
