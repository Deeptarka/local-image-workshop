import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ENV_PATH = path.resolve('.env')
const PROMPT_PATH = path.resolve('image-enhancement-prompt.md')
const DEFAULTS = {
  COMFYUI_URL: 'http://127.0.0.1:8188',
  OLLAMA_URL: 'http://127.0.0.1:11434',
  OLLAMA_MODEL: 'qwen3.5:0.8b',
  LLM_SYSTEM_PROMPT: '',
  UTILITY_ORDER: 'darkroom,print,prompt-builder,upscaler,anime'
}
const ALLOWED_KEYS = Object.keys(DEFAULTS)
let runtimeSettings = { ...DEFAULTS }

function parseEnv(source = '') {
  const values = {}
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (!match || !ALLOWED_KEYS.includes(match[1])) continue
    const raw = match[2].trim()
    try { values[match[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw.replace(/^'|'$/g, '') }
    catch { values[match[1]] = raw.replace(/^['"]|['"]$/g, '') }
  }
  return values
}

async function loadSettings() {
  const defaults = { ...DEFAULTS, LLM_SYSTEM_PROMPT: (await readFile(PROMPT_PATH, 'utf8')).trim() }
  try { runtimeSettings = { ...defaults, ...parseEnv(await readFile(ENV_PATH, 'utf8')) } }
  catch { runtimeSettings = defaults }
  return runtimeSettings
}

async function saveSettings(next) {
  const clean = { ...DEFAULTS, LLM_SYSTEM_PROMPT: (await readFile(PROMPT_PATH, 'utf8')).trim() }
  for (const key of ALLOWED_KEYS) if (typeof next[key] === 'string' && next[key].trim()) clean[key] = next[key].trim()
  new URL(clean.COMFYUI_URL); new URL(clean.OLLAMA_URL)
  const validUtilities = ['darkroom', 'print', 'prompt-builder', 'upscaler', 'anime']
  const requestedOrder = clean.UTILITY_ORDER.split(',').map(item => item.trim()).filter(item => validUtilities.includes(item))
  clean.UTILITY_ORDER = [...new Set([...requestedOrder, ...validUtilities])].join(',')
  const contents = `${ALLOWED_KEYS.map(key => `${key}=${JSON.stringify(clean[key])}`).join('\n')}\n`
  const temporary = `${ENV_PATH}.tmp`
  await writeFile(temporary, contents, 'utf8')
  await rename(temporary, ENV_PATH)
  runtimeSettings = clean
  return clean
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function sendJson(res, status, value) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

function localTransport() {
  const configure = server => {
    server.middlewares.use('/api/settings', async (req, res) => {
      try {
        if (req.method === 'GET') return sendJson(res, 200, runtimeSettings)
        if (req.method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed' })
        const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        return sendJson(res, 200, await saveSettings(payload))
      } catch (error) { return sendJson(res, 400, { error: error.message }) }
    })

    server.middlewares.use('/api/ollama/status', async (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const upstream = await fetch(`${runtimeSettings.OLLAMA_URL.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000) })
        if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`)
        const payload = await upstream.json()
        const names = (payload.models || []).map(item => item.name || item.model)
        const ready = names.includes(runtimeSettings.OLLAMA_MODEL)
        return sendJson(res, 200, { ready, status: ready ? 'Ready to build prompts' : `${runtimeSettings.OLLAMA_MODEL} is not installed` })
      } catch (error) { return sendJson(res, 200, { ready: false, status: `Ollama unavailable · ${error.message}` }) }
    })

    server.middlewares.use('/api/expand-prompt', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        const idea = typeof payload.idea === 'string' ? payload.idea.trim() : ''
        if (!idea) return sendJson(res, 400, { error: 'Enter a one-line image idea first.' })
        if (idea.length > 1000) return sendJson(res, 400, { error: 'Keep the starting idea under 1,000 characters.' })
        const upstream = await fetch(`${runtimeSettings.OLLAMA_URL.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: runtimeSettings.OLLAMA_MODEL, stream: false, think: false, messages: [{ role: 'system', content: runtimeSettings.LLM_SYSTEM_PROMPT }, { role: 'user', content: idea }], options: { temperature: 0.7 } }),
          signal: AbortSignal.timeout(120000)
        })
        const result = await upstream.json().catch(() => ({}))
        if (!upstream.ok) throw new Error(result.error || `Ollama returned HTTP ${upstream.status}`)
        const prompt = result.message?.content?.trim()
        if (!prompt) throw new Error('Ollama returned an empty prompt.')
        return sendJson(res, 200, { prompt })
      } catch (error) { return sendJson(res, 502, { error: `Could not generate with Ollama: ${error.message}` }) }
    })

    server.middlewares.use('/api/prompt', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: { message: 'Method not allowed' } })
      try {
        const upstream = await fetch(`${runtimeSettings.COMFYUI_URL.replace(/\/$/, '')}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: await readBody(req) })
        res.statusCode = upstream.status
        res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')
        res.end(Buffer.from(await upstream.arrayBuffer()))
      } catch (error) { sendJson(res, 502, { error: { message: `Could not reach ComfyUI: ${error.message}` } }) }
    })

    server.middlewares.use('/comfy', async (req, res) => {
      try {
        const options = { method: req.method, headers: { accept: req.headers.accept || '*/*' } }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          options.body = await readBody(req)
          if (req.headers['content-type']) options.headers['content-type'] = req.headers['content-type']
        }
        const upstream = await fetch(`${runtimeSettings.COMFYUI_URL.replace(/\/$/, '')}${req.url}`, options)
        res.statusCode = upstream.status
        for (const name of ['content-type', 'content-length', 'cache-control']) {
          const value = upstream.headers.get(name); if (value) res.setHeader(name, value)
        }
        res.end(Buffer.from(await upstream.arrayBuffer()))
      } catch (error) { sendJson(res, 502, { error: `Could not reach ComfyUI: ${error.message}` }) }
    })
  }
  return { name: 'local-workshop-transport', async configResolved() { await loadSettings() }, configureServer: configure, configurePreviewServer: configure }
}

export default defineConfig({ plugins: [react(), localTransport()], server: { port: 5173 } })
