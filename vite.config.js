import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ENV_PATH = path.resolve('.env')
const PROMPT_DIRECTORY = path.resolve('prompts')
const MODEL_PROMPT_YAML = path.join(PROMPT_DIRECTORY, 'clothing_brand_model_prompt_components.yaml')
const MODEL_PROMPT_EXPANDER = path.join(PROMPT_DIRECTORY, '__prompt-expander.md')
const DESIGN_DIRECTOR_PROMPT = path.join(PROMPT_DIRECTORY, 'dtf-design-director.md')
const DESIGN_LAB_WORKFLOW = path.resolve('workflows/image_design_lab.api.json')
const DEFAULT_PROMPT_PRESETS = 'animation-image.md,realistic-image.md,vector-print.md'
const DEFAULTS = {
  COMFYUI_URL: 'http://127.0.0.1:8188',
  OLLAMA_URL: 'http://127.0.0.1:11434',
  OLLAMA_MODEL: 'qwen3.5:0.8b',
  PROMPT_PRESETS: DEFAULT_PROMPT_PRESETS,
  UTILITY_ORDER: 'darkroom,print,design-lab,print-enhance,mockup,model-studio,prompt-builder,upscaler,anime'
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
  try { runtimeSettings = { ...DEFAULTS, ...parseEnv(await readFile(ENV_PATH, 'utf8')) } }
  catch { runtimeSettings = { ...DEFAULTS } }
  return runtimeSettings
}

function configuredPromptFiles() {
  return runtimeSettings.PROMPT_PRESETS.split(',').map(name => name.trim()).filter(name => /^[a-z0-9][a-z0-9-]*\.md$/i.test(name))
}

async function loadPromptPreset(name) {
  if (!configuredPromptFiles().includes(name)) throw new Error('Unknown prompt preset.')
  const content = (await readFile(path.join(PROMPT_DIRECTORY, name), 'utf8')).trim()
  if (!content) throw new Error(`Prompt preset ${name} is empty.`)
  return content
}

async function saveSettings(next) {
  const clean = { ...DEFAULTS }
  for (const key of ALLOWED_KEYS) if (typeof next[key] === 'string' && next[key].trim()) clean[key] = next[key].trim()
  new URL(clean.COMFYUI_URL); new URL(clean.OLLAMA_URL)
  const validUtilities = ['darkroom', 'print', 'design-lab', 'print-enhance', 'mockup', 'model-studio', 'prompt-builder', 'upscaler', 'anime']
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

function parsePromptVocabulary(source) {
  const result = {}
  const stack = []
  for (const rawLine of source.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue
    const indent = rawLine.length - rawLine.trimStart().length
    const inlineListMatch = rawLine.trim().match(/^([a-zA-Z0-9_]+):\s*\[(.*)\]\s*$/)
    if (inlineListMatch) {
      while (stack.length && stack.at(-1).indent >= indent) stack.pop()
      const pathKey = [...stack.map(item => item.key), inlineListMatch[1]].join('.')
      result[pathKey] = inlineListMatch[2].split(',').map(value => value.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
      continue
    }
    const keyMatch = rawLine.trim().match(/^([a-zA-Z0-9_]+):(?:\s.*)?$/)
    if (keyMatch) {
      while (stack.length && stack.at(-1).indent >= indent) stack.pop()
      stack.push({ indent, key: keyMatch[1] })
      continue
    }
    const valueMatch = rawLine.trim().match(/^-\s+(.+)$/)
    if (!valueMatch || !stack.length) continue
    const pathKey = stack.map(item => item.key).join('.')
    if (pathKey.startsWith('prompt_templates') || pathKey === 'compatibility_rules') continue
    const value = valueMatch[1].replace(/^['"]|['"]$/g, '')
    if (!value.includes('{')) (result[pathKey] ||= []).push(value)
  }
  return result
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

    server.middlewares.use('/api/prompt-presets', async (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const presets = await Promise.all(configuredPromptFiles().map(async name => {
          await loadPromptPreset(name)
          return { id: name, label: name.replace(/\.md$/i, '').split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ') }
        }))
        return sendJson(res, 200, { presets })
      } catch (error) { return sendJson(res, 500, { error: `Could not load prompt presets: ${error.message}` }) }
    })

    server.middlewares.use('/api/model-prompt-schema', async (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const source = await readFile(MODEL_PROMPT_YAML, 'utf8')
        return sendJson(res, 200, { fields: parsePromptVocabulary(source) })
      } catch (error) { return sendJson(res, 500, { error: `Could not load model prompt options: ${error.message}` }) }
    })

    server.middlewares.use('/api/expand-model-prompt', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        const brokenPrompt = typeof payload.brokenPrompt === 'string' ? payload.brokenPrompt.trim() : ''
        if (!brokenPrompt) return sendJson(res, 400, { error: 'Build the broken prompt first.' })
        if (brokenPrompt.length > 6000) return sendJson(res, 400, { error: 'The broken prompt is too long.' })
        const systemPrompt = (await readFile(MODEL_PROMPT_EXPANDER, 'utf8')).trim()
        const upstream = await fetch(`${runtimeSettings.OLLAMA_URL.replace(/\/$/, '')}/api/chat`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: runtimeSettings.OLLAMA_MODEL, stream: false, think: false, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: brokenPrompt }], options: { temperature: 0.45 } }),
          signal: AbortSignal.timeout(120000)
        })
        const result = await upstream.json().catch(() => ({}))
        if (!upstream.ok) throw new Error(result.error || `Ollama returned HTTP ${upstream.status}`)
        const prompt = result.message?.content?.trim()
        if (!prompt) throw new Error('Ollama returned an empty prompt.')
        return sendJson(res, 200, { prompt })
      } catch (error) { return sendJson(res, 502, { error: `Could not expand the model prompt: ${error.message}` }) }
    })

    server.middlewares.use('/api/expand-prompt', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        const idea = typeof payload.idea === 'string' ? payload.idea.trim() : ''
        if (!idea) return sendJson(res, 400, { error: 'Enter a one-line image idea first.' })
        if (idea.length > 1000) return sendJson(res, 400, { error: 'Keep the starting idea under 1,000 characters.' })
        const systemPrompt = await loadPromptPreset(payload.preset)
        const upstream = await fetch(`${runtimeSettings.OLLAMA_URL.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: runtimeSettings.OLLAMA_MODEL, stream: false, think: false, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: idea }], options: { temperature: 0.7 } }),
          signal: AbortSignal.timeout(120000)
        })
        const result = await upstream.json().catch(() => ({}))
        if (!upstream.ok) throw new Error(result.error || `Ollama returned HTTP ${upstream.status}`)
        const prompt = result.message?.content?.trim()
        if (!prompt) throw new Error('Ollama returned an empty prompt.')
        return sendJson(res, 200, { prompt })
      } catch (error) { return sendJson(res, 502, { error: `Could not generate with Ollama: ${error.message}` }) }
    })

    server.middlewares.use('/api/design-lab/workflow', async (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
      try { return sendJson(res, 200, JSON.parse(await readFile(DESIGN_LAB_WORKFLOW, 'utf8'))) }
      catch (error) { return sendJson(res, 500, { error: `Design Lab workflow could not be loaded: ${error.message}` }) }
    })

    server.middlewares.use('/api/design-lab/direct', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        const instruction = typeof payload.instruction === 'string' ? payload.instruction.trim() : ''
        if (!instruction) return sendJson(res, 400, { error: 'Describe the Design Lab task first.' })
        if (instruction.length > 16000) return sendJson(res, 400, { error: 'The Design Lab request is too long. Remove some text and try again.' })
        const systemPrompt = (await readFile(DESIGN_DIRECTOR_PROMPT, 'utf8')).trim()
        const userMessage = { role: 'user', content: instruction }
        if (typeof payload.image === 'string' && payload.image.includes(',')) userMessage.images = [payload.image.split(',')[1]]
        const upstream = await fetch(`${runtimeSettings.OLLAMA_URL.replace(/\/$/, '')}/api/chat`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: runtimeSettings.OLLAMA_MODEL, stream: false, think: false, format: payload.json ? 'json' : undefined, messages: [{ role: 'system', content: systemPrompt }, userMessage], options: { temperature: payload.temperature ?? 0.55 } }),
          signal: AbortSignal.timeout(180000)
        })
        const result = await upstream.json().catch(() => ({}))
        if (!upstream.ok) throw new Error(result.error || `Ollama returned HTTP ${upstream.status}`)
        const content = result.message?.content?.trim()
        if (!content) throw new Error('Ollama returned an empty response.')
        return sendJson(res, 200, { content })
      } catch (error) {
        const hint = /image|vision|multimodal/i.test(error.message) ? ' The configured Ollama model may not support vision; select a vision-capable local model in Settings.' : ''
        return sendJson(res, 502, { error: `Design Lab could not use Ollama: ${error.message}.${hint}` })
      }
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
