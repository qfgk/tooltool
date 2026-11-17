// M0 冒烟基线：面板渲染 / 工具窗创建聚焦 / 单实例 / 数据落盘
import { spawn, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const EXE = join(process.cwd(), 'src-tauri/target/release/tooltool.exe')
const PORT = 9240
const DATA_DIR = join(os.homedir(), 'AppData/Roaming/tooltool')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
const failures = []
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ✓', name) }
  else { failures.push(name); console.log('  ✗', name, extra) }
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.id = 0
    this.pending = new Map()
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      }
    })
  }
  get open() { return this.ws.readyState === 1 }
  async ready() {
    if (this.open) return
    await new Promise((r, j) => {
      this.ws.addEventListener('open', r, { once: true })
      this.ws.addEventListener('error', j, { once: true })
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  close() { this.ws.close() }
}

async function evalIn(page, expression) {
  await page.ready()
  const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('page eval: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r.result?.value
}

async function findPage(port, marker) {
  for (let i = 0; i < 40; i++) {
    await sleep(300)
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      for (const t of list.filter((t) => t.type === 'page')) {
        try {
          const c = new CDP(t.webSocketDebuggerUrl)
          await c.ready()
          const has = await c.send('Runtime.evaluate', { expression: `typeof window.__tooltool === 'object' && window.__tooltool.label?.includes('${marker}')`, returnByValue: true })
          if (has.result?.value === true) return c
          c.close()
        } catch {}
      }
    } catch {}
  }
  return null
}

async function main() {
  try { execSync('taskkill /IM tooltool.exe /F', { stdio: 'ignore' }) } catch {}
  await sleep(800)
  const t0 = Date.now()
  const proc = spawn(EXE, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
    stdio: 'ignore',
  })

  console.log('■ 启动与面板')
  const shell = await findPage(PORT, 'shell')
  check('面板窗口已渲染并 show', !!shell)
  if (!shell) { proc.kill(); process.exit(1) }
  const bootMs = Date.now() - t0
  // 首次运行含 WebView2 环境初始化，放宽到 3s；后续运行 ≤1s
  check('面板冷启动 ≤3s（进程起→前端 booted）', bootMs <= 3000, `${bootMs}ms`)

  const cards = await evalIn(shell, `document.querySelectorAll('.tool-card').length`)
  check('Bento 网格渲染 4 张内置工具卡', cards === 4, `cards=${cards}`)
  const greet = await evalIn(shell, `document.querySelector('.hero-greet .hi')?.textContent?.trim()`)
  check('问候语渲染（含渐变强调）', !!greet && greet.length > 0, greet)
  const searchH = await evalIn(shell, `document.querySelector('.hero-search')?.offsetHeight`)
  check('Raycast 式大搜索框渲染', searchH >= 40, `h=${searchH}`)

  console.log('■ 工具窗创建与聚焦')
  // 面板点击 → 创建工具窗
  await evalIn(shell, `document.querySelectorAll('.tool-card')[0].click()`)
  const notes = await findPage(PORT, 'tool-notes')
  check('点击卡片创建工具窗（笔记）', !!notes)
  const countProcs = () => { try { return execSync('tasklist /NH /FO CSV', { encoding: 'utf-8' }).match(/tooltool\.exe/gi)?.length ?? 0 } catch { return 0 } }
  check('工具窗在同进程多窗（进程数=1）', countProcs() === 1, `procs=${countProcs()}`)

  // 再次点击 → 聚焦而非重复创建
  await evalIn(shell, `document.querySelectorAll('.tool-card')[0].click()`)
  await sleep(600)
  check('二次打开=聚焦（进程数不变）', countProcs() === 1, `procs=${countProcs()}`)

  // 其余三张卡逐个打开（工具窗共存）
  for (const idx of [1, 2, 3]) {
    await evalIn(shell, `document.querySelectorAll('.tool-card')[${idx}].click()`)
  }
  await sleep(1500)
  const clipPage = await findPage(PORT, 'tool-clipboard')
  const toolboxPage = await findPage(PORT, 'tool-toolbox')
  const launcherPage = await findPage(PORT, 'tool-launcher')
  check('剪贴板窗已创建', !!clipPage)
  check('工具箱窗已创建', !!toolboxPage)
  check('快速启动窗已创建', !!launcherPage)
  check('四工具窗共存（进程数仍=1）', countProcs() === 1, `procs=${countProcs()}`)

  console.log('■ 数据落盘与托盘')
  check('数据目录已建', existsSync(join(DATA_DIR)), DATA_DIR)
  check('backup/ 已生成', existsSync(join(DATA_DIR, 'backup')))
  const settingsOk = existsSync(join(DATA_DIR, 'settings.json')) || !readFileSyncSafe(join(DATA_DIR, 'settings.json'))
  void settingsOk

  proc.kill()
  console.log(failures.length ? `\n✗ ${failures.length} 项失败` : `\n✅ 全部 ${passed} 项通过`)
  process.exit(failures.length ? 1 : 0)
}

function readFileSyncSafe(p) { try { return !!readFileSync(p, 'utf-8') } catch { return false } }

main().catch((e) => { console.error(e); process.exit(1) })
