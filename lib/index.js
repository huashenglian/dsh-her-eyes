// dsh-her-eyes — application-level Vision-Language-Model analyzer.
// Host half: registers the `analyze_image` tool on the global tools registry
// (shared by every session of this deployment) and serves the settings web
// routes used by the client-half settings page. Config is stored at
// $DSH_HOME/vlm-vision.json (beside the settings document when available).
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const name = 'dsh-her-eyes'
const inject = ['tools', 'webServer']

const Config = z.object({})

const MAX_IMAGE_BYTES = 20 * 1024 * 1024

// ---------- config model ----------
const defaultConfig = () => ({
  retryCount: 5,
  api: {
    primary: { endpoint: '', apiKey: '', model: '' },
    backup: { endpoint: '', apiKey: '', model: '' }
  }
})

function normalizeConfig(raw) {
  const fallback = defaultConfig()
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const retryRaw = Number(src.retryCount)
  const retryCount = Number.isFinite(retryRaw) && retryRaw > 0 ? Math.min(Math.floor(retryRaw), 20) : fallback.retryCount
  const pick = (which) => {
    const a = src.api && typeof src.api === 'object' && src.api[which] && typeof src.api[which] === 'object' ? src.api[which] : {}
    return {
      endpoint: typeof a.endpoint === 'string' ? a.endpoint : '',
      apiKey: typeof a.apiKey === 'string' ? a.apiKey : '',
      model: typeof a.model === 'string' ? a.model : ''
    }
  }
  return { retryCount, api: { primary: pick('primary'), backup: pick('backup') } }
}

const masked = (cfg) => ({
  retryCount: cfg.retryCount,
  api: {
    primary: { endpoint: cfg.api.primary.endpoint, model: cfg.api.primary.model, apiKeySet: cfg.api.primary.apiKey !== '' },
    backup: { endpoint: cfg.api.backup.endpoint, model: cfg.api.backup.model, apiKeySet: cfg.api.backup.apiKey !== '' }
  }
})

let configDirCache
async function configDir(ctx) {
  if (configDirCache) return configDirCache
  const settings = ctx.get('settings')
  if (settings !== undefined) {
    try {
      const doc = await settings.prepareDocument()
      if (typeof doc === 'string' && doc.length > 0) {
        configDirCache = dirname(doc)
        return configDirCache
      }
    } catch {
      // not file-backed; fall through
    }
  }
  const envHome = process.env.DSH_HOME
  if (envHome && envHome.length > 0) {
    configDirCache = envHome
    return configDirCache
  }
  configDirCache = homedir()
  return configDirCache
}

async function configFile(ctx) {
  return join(await configDir(ctx), 'vlm-vision.json')
}

async function loadConfig(ctx) {
  try {
    const file = await configFile(ctx)
    if (!existsSync(file)) return defaultConfig()
    return normalizeConfig(JSON.parse(readFileSync(file, 'utf8')))
  } catch (e) {
    console.error('[dsh-her-eyes] config read failed:', String(e && e.message || e))
    return defaultConfig()
  }
}

async function storeConfig(ctx, cfg) {
  const file = await configFile(ctx)
  writeFileSync(file, JSON.stringify(normalizeConfig(cfg), null, 2), 'utf8')
}

// ---------- HTTP (native fetch, UTF-8 throughout) ----------
async function httpJson(url, method, apiKey, body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = { Accept: 'application/json' }
    if (apiKey) headers.Authorization = 'Bearer ' + apiKey
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let res
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })
    } catch (e) {
      return { ok: false, status: 'NET', body: null, message: String(e && e.message || e) }
    }
    const text = await res.text()
    let parsed = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }
    return { ok: res.ok, status: res.status, body: parsed, message: text.slice(0, 2000) }
  } finally {
    clearTimeout(timer)
  }
}

const chatEndpointOf = (apiCfg) => {
  const base = String(apiCfg.endpoint || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return /\/chat\/completions$/.test(base) ? base : base + '/chat/completions'
}

const modelsEndpointOf = (apiCfg) => {
  const base = String(apiCfg.endpoint || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return /\/models$/.test(base) ? base : base + '/models'
}

// ---------- binary-safe base64 ----------
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function bytesToBase64(bytes) {
  let out = ''
  const len = bytes.length
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < len ? bytes[i + 1] : 0
    const b2 = i + 2 < len ? bytes[i + 2] : 0
    out += B64_CHARS[b0 >> 2]
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < len ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < len ? B64_CHARS[b2 & 63] : '='
  }
  return out
}

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
}
const mimeFor = (filePath) => {
  const lower = String(filePath || '').toLowerCase()
  for (const ext of Object.keys(MIME_BY_EXT)) if (lower.endsWith(ext)) return MIME_BY_EXT[ext]
  return 'image/png'
}

// ---------- failover / retry state (module-scope: shared by all sessions) ----------
const state = { activeApi: 'primary', primaryFailures: 0, backupFailures: 0 }
const RETRYABLE = new Set(['402', '408', '429', '500', '502', '503', '504', 'TIMEOUT', 'NET'])
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const whichLabel = (w) => (w === 'backup' ? '备选' : '主')

function chatPayload(apiCfg, question, dataUrl, detail) {
  const imageUrl = { url: dataUrl }
  if (detail === 'low' || detail === 'high') imageUrl.detail = detail
  return {
    model: apiCfg.model || '',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: question },
        { type: 'image_url', image_url: imageUrl }
      ]
    }],
    max_tokens: 2048,
    stream: false
  }
}

async function callWithFailover(ctx, cfg, buildReq, signal) {
  const retryCount = cfg.retryCount
  const order = []
  if (state.activeApi === 'backup' && cfg.api.backup.endpoint) {
    if (cfg.api.backup.endpoint) order.push('backup')
    if (cfg.api.primary.endpoint) order.push('primary')
  } else {
    if (cfg.api.primary.endpoint) order.push('primary')
    if (cfg.api.backup.endpoint) order.push('backup')
  }
  if (order.length === 0) {
    throw new Error('analyze_image: 未配置任何 VLM API。请在 Web 设置页“视觉模型 (VLM)”或本地文件 ' + await configFile(ctx) + ' 中配置 endpoint / apiKey / model')
  }
  let last = null
  for (const which of order) {
    const apiCfg = cfg.api[which]
    let attempts = 0
    while (true) {
      if (signal && signal.aborted) {
        const e = new Error('analyze_image: 请求已取消')
        e.name = 'AbortError'
        throw e
      }
      attempts += 1
      const req = buildReq(apiCfg)
      let res
      if (!req.url) {
        res = { ok: false, status: 'CFG', message: 'endpoint 未配置' }
      } else {
        try {
          res = await httpJson(req.url, 'POST', apiCfg.apiKey, req.body, 180000)
        } catch (e) {
          res = { ok: false, status: 'NET', message: String(e && e.message || e) }
        }
      }
      if (signal && signal.aborted) {
        const e = new Error('analyze_image: 请求已取消')
        e.name = 'AbortError'
        throw e
      }
      if (res.ok) {
        if (which === 'primary') {
          state.primaryFailures = 0
          state.activeApi = 'primary'
        } else {
          state.backupFailures = 0
        }
        return { which, attempts, res }
      }
      last = { which, status: res.status, message: res.message, attempts }
      if (!RETRYABLE.has(res.status)) {
        throw new Error('analyze_image: ' + whichLabel(which) + ' VLM API 返回不可重试错误 (HTTP ' + res.status + ')：' + res.message)
      }
      if (which === 'primary') state.primaryFailures += 1
      else state.backupFailures += 1
      const failures = which === 'primary' ? state.primaryFailures : state.backupFailures
      if (failures > retryCount) {
        state.activeApi = which
        break
      }
      await sleep(Math.min(800 * attempts, 5000))
    }
  }
  const d = last ? '(' + last.which + ' · ' + last.status + ' · ' + last.message + '，尝试 ' + last.attempts + ' 次)' : '(未知错误)'
  throw new Error('analyze_image: 所有 VLM API 均失败，连续错误次数超过重试上限 ' + retryCount + ' ' + d)
}

function extractAnswer(body) {
  if (!body || typeof body !== 'object') return ''
  if (body.choices && Array.isArray(body.choices) && body.choices[0]) {
    const first = body.choices[0]
    const msg = first.message
    if (msg) {
      if (typeof msg.content === 'string' && msg.content.length > 0) return msg.content
      if (Array.isArray(msg.content)) {
        const parts = msg.content
          .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
          .map((p) => p.text)
        if (parts.length > 0) return parts.join('\n')
      }
    }
    if (typeof first.text === 'string' && first.text.length > 0) return first.text
  }
  if (typeof body.output_text === 'string' && body.output_text.length > 0) return body.output_text
  if (body.output && Array.isArray(body.output)) {
    const parts = body.output
      .map((o) => o && o.content)
      .filter((c) => Array.isArray(c))
      .reduce((acc, c) => acc.concat(c), [])
      .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
    if (parts.length > 0) return parts.join('\n')
  }
  return ''
}

// ---------- web settings routes (browser <-> host over HTTP) ----------
const readBody = (req) => new Promise((resolve) => {
  let data = ''
  req.on('data', (chunk) => { data += chunk })
  req.on('end', () => resolve(data || null))
  req.on('error', () => resolve(null))
})
const jsonOut = (res, status, obj) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(JSON.stringify(obj))
}

function applyPatch(cfg, patch) {
  const c = normalizeConfig(cfg)
  const p = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
  const mergeApi = (current, patchApi) => {
    const o = patchApi && typeof patchApi === 'object' && !Array.isArray(patchApi) ? patchApi : {}
    const next = {
      endpoint: typeof o.endpoint === 'string' ? o.endpoint.trim() : current.endpoint,
      model: typeof o.model === 'string' ? o.model.trim() : current.model,
      apiKey: current.apiKey
    }
    if (typeof o.apiKey === 'string' && o.apiKey.length > 0) next.apiKey = o.apiKey
    else if (o.apiKey === null) next.apiKey = ''
    return next
  }
  c.retryCount = p.retryCount !== undefined ? Number(p.retryCount) : c.retryCount
  c.api = {
    primary: mergeApi(c.api.primary, p.api && p.api.primary),
    backup: mergeApi(c.api.backup, p.api && p.api.backup)
  }
  return normalizeConfig(c)
}

function apply(ctx) {
  const webServer = ctx.get('webServer')

  // ---- the model-visible tool (global tools registry: shared by all sessions) ----
  const tool = defineTool({
    name: 'analyze_image',
    description: '调用视觉语言模型 (VLM) 分析一张本地图片并回答你想了解的内容。适合解读截图、图表、UI 设计稿、照片、文档扫描件等。图片不经过主 agent，直接发送给你配置的 VLM API（主 API 连续失败超过重试次数会自动切换到备选 API）。',
    parameters: {
      image_path: { type: 'string', required: true, description: '要分析的图片文件的本地路径（绝对路径，或相对当前工作目录的路径）' },
      question: { type: 'string', required: true, description: '你想从图片中了解什么（分析需求）。例如“这张图表反映了什么趋势？”、“这个页面上有哪些元素？”' },
      detail: { type: 'string', enum: ['auto', 'low', 'high'], description: '图片细节级别，默认 auto' }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          answer: { type: 'string' },
          model: { type: 'string' },
          api: { type: 'string' },
          attempts: { type: 'number' },
          usage: { type: 'object', additionalProperties: true }
        }
      },
      render: (args, value) => [{
        type: 'text',
        text: value && value.ok
          ? '## 图像分析结果\n\n' + (value.answer || '') + '\n\n— 模型: ' + (value.model || '未知') + ' · API: ' + (value.api === 'backup' ? '备选' : '主') + ' · 尝试: ' + value.attempts + ' 次'
          : '图像分析失败：' + (value ? (value.detail || JSON.stringify(value)) : '未知错误')
      }]
    },
    async execute(args, exec) {
      const imagePath = String(args && args.image_path || '').trim()
      const question = String(args && args.question || '').trim()
      if (!imagePath) throw new Error('analyze_image: 缺少参数 image_path（图片文件路径）')
      if (!question) throw new Error('analyze_image: 缺少参数 question（你想从图片中了解什么）')
      const signal = exec && exec.signal ? exec.signal : undefined
      const cfg = await loadConfig(ctx)

      let resolved = imagePath
      const cwd = exec && exec.agent && exec.agent.meta ? exec.agent.meta.cwd : undefined
      if (cwd && !/^[A-Za-z]:[\\/]/.test(imagePath) && !imagePath.startsWith('/') && !imagePath.startsWith('\\\\')) {
        resolved = join(cwd, imagePath)
      }
      let buffer
      try {
        buffer = readFileSync(resolved)
        if (buffer.length > MAX_IMAGE_BYTES) throw new Error('文件超过 ' + Math.round(MAX_IMAGE_BYTES / 1024 / 1024) + 'MB')
      } catch (e) {
        throw new Error('analyze_image: 无法读取图片 “' + imagePath + '”：' + String(e && e.message || e))
      }
      const dataUrl = 'data:' + mimeFor(resolved) + ';base64,' + bytesToBase64(buffer)
      const outcome = await callWithFailover(ctx, cfg, (apiCfg) => ({
        url: chatEndpointOf(apiCfg),
        body: chatPayload(apiCfg, question, dataUrl, args && args.detail)
      }), signal)
      const body = outcome.res.body && typeof outcome.res.body === 'object' ? outcome.res.body : {}
      const answer = extractAnswer(body)
      if (!answer) {
        return {
          ok: true,
          answer: '(VLM 未返回文本内容。原始响应：' + String(JSON.stringify(body)).slice(0, 1500) + ')',
          model: (body.model || cfg.api[outcome.which].model || ''),
          api: outcome.which,
          attempts: outcome.attempts,
          usage: null
        }
      }
      return {
        ok: true,
        answer,
        model: (body.model || cfg.api[outcome.which].model || ''),
        api: outcome.which,
        attempts: outcome.attempts,
        usage: body.usage ? body.usage : null
      }
    }
  })
  ctx.tools.register(tool)

  if (webServer === undefined) return

  webServer.register({
    kind: 'exact',
    path: '/vlm/config',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        const cfg = await loadConfig(ctx)
        jsonOut(res, 200, {
          ok: true,
          config: masked(cfg),
          path: await configFile(ctx),
          activeApi: state.activeApi,
          primaryFailures: state.primaryFailures,
          backupFailures: state.backupFailures
        })
        return
      }
      if (req.method === 'POST') {
        try {
          const raw = await readBody(req)
          const patch = raw ? JSON.parse(raw) : {}
          const cfg = await loadConfig(ctx)
          const next = applyPatch(cfg, patch)
          await storeConfig(ctx, next)
          jsonOut(res, 200, { ok: true, config: masked(next), path: await configFile(ctx) })
        } catch (e) {
          jsonOut(res, 400, { ok: false, error: String(e && e.message || e) })
        }
        return
      }
      jsonOut(res, 405, { ok: false, error: 'method not allowed' })
    }
  })

  webServer.register({
    kind: 'exact',
    path: '/vlm/models',
    handler: async (req, res) => {
      if (req.method !== 'POST') return jsonOut(res, 405, { ok: false, error: 'method not allowed' })
      try {
        const raw = await readBody(req)
        const args = raw ? JSON.parse(raw) : {}
        const which = args && args.api === 'backup' ? 'backup' : 'primary'
        const cfg = await loadConfig(ctx)
        const saved = cfg.api[which]
        let endpoint = saved.endpoint
        if (args && typeof args.endpoint === 'string' && args.endpoint.trim().length > 0) endpoint = args.endpoint.trim()
        let apiKey = saved.apiKey
        if (args && typeof args.apiKey === 'string' && args.apiKey.length > 0) apiKey = args.apiKey
        const apiCfg = { endpoint, apiKey, model: saved.model }
        if (!apiCfg.endpoint) return jsonOut(res, 400, { ok: false, error: '未配置 endpoint，请先在上方填入端点 URL' })
        const r = await httpJson(modelsEndpointOf(apiCfg), 'GET', apiKey, undefined, 30000)
        if (!r.ok) return jsonOut(res, 200, { ok: false, error: 'HTTP ' + r.status + ': ' + r.message })
        const body = r.body && typeof r.body === 'object' ? r.body : {}
        let ids = []
        if (Array.isArray(body.data)) {
          ids = body.data.map((d) => (d && (d.id || d.name)) || '').filter((s) => typeof s === 'string' && s.length > 0)
        } else if (Array.isArray(body.models)) {
          ids = body.models.map((m) => (typeof m === 'string' ? m : (m && (m.id || m.name)) || '')).filter(Boolean)
        } else if (Array.isArray(body.ids)) {
          ids = body.ids.filter((s) => typeof s === 'string')
        }
        jsonOut(res, 200, { ok: true, models: ids.slice(0, 100), which })
      } catch (e) {
        jsonOut(res, 400, { ok: false, error: String(e && e.message || e) })
      }
    }
  })

  webServer.register({
    kind: 'exact',
    path: '/vlm/reset',
    handler: async (req, res) => {
      if (req.method !== 'POST') return jsonOut(res, 405, { ok: false, error: 'method not allowed' })
      state.activeApi = 'primary'
      state.primaryFailures = 0
      state.backupFailures = 0
      jsonOut(res, 200, { ok: true })
    }
  })
}

export { Config, apply, inject, name }