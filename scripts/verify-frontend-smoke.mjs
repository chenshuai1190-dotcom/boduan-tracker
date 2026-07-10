#!/usr/bin/env node

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const summary = []
const childOutput = []

const FRONTEND_TABS = [
  {
    id: 'home',
    label: 'home',
    expectedText: ['今日盈亏', '财报日历', 'Today P&L', 'Earnings'],
  },
  {
    id: 'trades',
    label: 'trades',
    expectedText: ['持仓分布', '交易记录', 'Positions', 'Trade Records'],
  },
  {
    id: 'analysis',
    label: 'analysis',
    expectedText: ['家庭总资产', '12 个月走势', 'Family net worth', '12-month trend'],
  },
  {
    id: 'review',
    label: 'review',
    expectedText: ['北极星目标', '投资心得', 'North Star', 'Investment Notes'],
  },
  {
    id: 'settings',
    label: 'settings',
    expectedText: ['账户设置', '更新日志', 'Account Settings', 'Changelog'],
  },
]

function fail(message) {
  failures.push(message)
}

function firstLine(value) {
  return String(value || '').trim().split(/\r?\n/).find(Boolean) || ''
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function collectChildOutput(label, stream) {
  stream?.on('data', (chunk) => {
    const text = String(chunk)
    childOutput.push(`${label}: ${text}`)
    if (childOutput.length > 80) childOutput.shift()
  })
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.BROWSER_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)

  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close(() => {
        if (port) resolve(port)
        else reject(new Error('failed to allocate local port'))
      })
    })
  })
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ statusCode: res.statusCode, body }))
    })
    req.on('error', reject)
    req.setTimeout(3000, () => {
      req.destroy(new Error(`timeout fetching ${url}`))
    })
  })
}

async function waitForHttp(url, timeoutMs = 15000) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await httpGet(url)
      if (result.statusCode && result.statusCode >= 200 && result.statusCode < 500) return result
      lastError = new Error(`HTTP ${result.statusCode}`)
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw lastError || new Error(`timed out waiting for ${url}`)
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl
    this.nextId = 1
    this.pending = new Map()
    this.handlers = new Map()
    this.socket = null
  }

  connect() {
    if (typeof WebSocket !== 'function') {
      throw new Error('Node WebSocket API is unavailable; use Node 22+ or set up a supported runtime')
    }

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.webSocketUrl)
      this.socket = socket
      socket.addEventListener('open', () => resolve())
      socket.addEventListener('error', () => reject(new Error(`failed to connect Chrome DevTools at ${this.webSocketUrl}`)), { once: true })
      socket.addEventListener('message', (event) => this.handleMessage(event.data))
      socket.addEventListener('close', () => {
        for (const { reject: rejectPending } of this.pending.values()) {
          rejectPending(new Error('Chrome DevTools connection closed'))
        }
        this.pending.clear()
      })
    })
  }

  handleMessage(raw) {
    let message
    try {
      message = JSON.parse(String(raw))
    } catch {
      return
    }

    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message || 'Chrome DevTools command failed'))
      else resolve(message.result || {})
      return
    }

    if (message.method) {
      const callbacks = this.handlers.get(message.method) || []
      for (const callback of callbacks) callback(message)
    }
  }

  on(method, callback) {
    const callbacks = this.handlers.get(method) || []
    callbacks.push(callback)
    this.handlers.set(method, callbacks)
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId++
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify(payload))
    })
  }

  close() {
    try {
      this.socket?.close()
    } catch {
      // ignore cleanup errors
    }
  }
}

async function evaluate(client, sessionId, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId)
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate exception')
  }
  return result.result?.value
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode) return
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 2000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function summarizeErrorEvent(event) {
  if (event.method === 'Runtime.exceptionThrown') {
    const details = event.params?.exceptionDetails
    const exception = details?.exception
    return exception?.description || exception?.value || details?.text || 'runtime exception'
  }
  if (event.method === 'Runtime.consoleAPICalled') {
    const args = event.params?.args || []
    return args.map((arg) => arg.value || arg.description || arg.unserializableValue || arg.type).filter(Boolean).join(' ')
  }
  return JSON.stringify(event.params || {})
}

async function main() {
  const chromePath = findChrome()
  if (!chromePath) {
    fail('Chrome/Chromium not found. Set CHROME_PATH to a local Chrome-compatible browser executable.')
    return
  }

  const vitePort = await getFreePort()
  const cdpPort = await getFreePort()
  const userDataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'boduan-frontend-smoke-'))
  let vite = null
  let chrome = null
  let client = null

  try {
    vite = spawn(npmCommand(), ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        BROWSER: 'none',
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    collectChildOutput('vite stdout', vite.stdout)
    collectChildOutput('vite stderr', vite.stderr)

    await waitForHttp(`http://127.0.0.1:${vitePort}/`, 20000)
    summary.push(`vite=http://127.0.0.1:${vitePort}`)

    const chromeArgs = [
      '--headless=new',
      '--disable-background-networking',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-gpu',
      '--no-default-browser-check',
      '--no-first-run',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ]
    if (typeof process.getuid === 'function' && process.getuid() === 0) chromeArgs.unshift('--no-sandbox')

    chrome = spawn(chromePath, chromeArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
    collectChildOutput('chrome stdout', chrome.stdout)
    collectChildOutput('chrome stderr', chrome.stderr)

    const version = await waitForHttp(`http://127.0.0.1:${cdpPort}/json/version`, 20000)
    const browserInfo = JSON.parse(version.body)
    summary.push(`chrome=${chromePath}`)
    summary.push(`browser=${browserInfo.Browser || 'unknown'}`)

    client = new CdpClient(browserInfo.webSocketDebuggerUrl)
    await client.connect()

    const pageErrors = []
    client.on('Runtime.exceptionThrown', (event) => pageErrors.push(event))
    client.on('Runtime.consoleAPICalled', (event) => {
      if (event.params?.type === 'error') pageErrors.push(event)
    })

    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true })
    await client.send('Runtime.enable', {}, sessionId)
    await client.send('Page.enable', {}, sessionId)

    for (const tab of FRONTEND_TABS) {
      const beforeErrorCount = pageErrors.length
      const url = `http://127.0.0.1:${vitePort}/?tab=${tab.id}&smoke=frontend-${tab.id}`
      await client.send('Page.navigate', { url }, sessionId)
      await new Promise(resolve => setTimeout(resolve, 900))

      const state = await evaluate(client, sessionId, `(() => {
        const root = document.querySelector('#root');
        const text = root?.textContent || '';
        return {
          rootChildCount: root?.children.length || 0,
          bodyTextLength: document.body.textContent?.length || 0,
          text,
          title: document.title,
          url: location.href,
        };
      })()`)

      const snippet = String(state.text || '').replace(/\s+/g, ' ').slice(0, 180)
      const hasExpectedText = tab.expectedText.some((item) => String(state.text || '').includes(item))
      const newErrors = pageErrors.slice(beforeErrorCount)
      const fatalErrors = newErrors
        .map(summarizeErrorEvent)
        .filter((message) => /ReferenceError|TypeError|SyntaxError|Cannot read|is not defined|The above error occurred/i.test(message))

      if (state.rootChildCount < 1) fail(`${tab.label} rendered empty #root`)
      if (state.bodyTextLength < 80) fail(`${tab.label} rendered too little text (${state.bodyTextLength})`)
      if (!hasExpectedText) fail(`${tab.label} missing expected text; snippet="${snippet}"`)
      if (fatalErrors.length > 0) fail(`${tab.label} console/runtime errors: ${fatalErrors.slice(0, 2).join(' | ')}`)

      summary.push(`${tab.label}=root:${state.rootChildCount} text:${state.bodyTextLength} errors:${newErrors.length} expected:${hasExpectedText}`)
    }
  } finally {
    client?.close()
    await stopProcess(chrome)
    await stopProcess(vite)
    await fsp.rm(userDataDir, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (error) {
  fail(error.message || String(error))
}

if (failures.length > 0) {
  console.error('frontend smoke: FAIL')
  for (const item of summary) console.error(`- ${item}`)
  for (const item of failures) console.error(`ERROR: ${item}`)
  const tail = childOutput.slice(-12).map((line) => firstLine(line)).filter(Boolean)
  for (const line of tail) console.error(`LOG: ${line}`)
  process.exit(1)
}

console.log('frontend smoke: PASS')
for (const item of summary) console.log(`- ${item}`)
