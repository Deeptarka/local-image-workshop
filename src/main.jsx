import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Aperture, ArrowDown, ArrowUp, ArrowUpRight, Bot, Check, ChevronDown, Copy, Download, Home as HomeIcon, Image as ImageIcon, Layers3, Palette, RefreshCw, RotateCcw, Save, Settings, Shirt, Sparkles } from 'lucide-react'
import './styles.css'
import './darkroom-updates.css'

const API = '/comfy'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const DEFAULT_ENV = {
  COMFYUI_URL: 'http://127.0.0.1:8188',
  OLLAMA_URL: 'http://127.0.0.1:11434',
  OLLAMA_MODEL: 'qwen3.5:0.8b',
  LLM_SYSTEM_PROMPT: '',
  UTILITY_ORDER: 'darkroom,print,prompt-builder,upscaler,anime'
}
const UTILITY_DEFINITIONS = [
  { id: 'darkroom', title: 'Darkroom', kicker: 'SCENES · ATMOSPHERE · DETAIL', icon: Aperture, specimen: 'LIGHT / GRAIN', copy: 'Build atmospheric images from a positive and negative prompt, with flexible framing and optional LoRA control.', action: 'Develop an image' },
  { id: 'print', title: 'Print Studio', kicker: 'LETTERING · APPAREL · INK', icon: Shirt, specimen: 'TYPE / INK', copy: 'Compose lettering-aware graphics for apparel with screen-print treatments, controlled ink counts, and print-oriented prompting.', action: 'Pull a print' },
  { id: 'prompt-builder', title: 'Prompt Builder', kicker: 'ROUGH IDEA · POLISHED PROMPT', icon: Bot, specimen: 'IDEA / DETAIL', copy: 'Turn one quick idea into a detailed image prompt using a local Ollama model, then copy it into either image utility.', action: 'Build a prompt' },
  { id: 'upscaler', title: 'Image Upscaler', kicker: 'ENLARGE · REFINE · RESTORE', icon: Layers3, specimen: 'SCALE / DETAIL', copy: 'Enlarge an existing image with Real-ESRGAN, then refine texture and detail through Z-Image Turbo.', action: 'Upscale an image' },
  { id: 'anime', title: 'Anime Maker', kicker: 'CHARACTERS · WORLDS · COLOR', icon: Palette, specimen: 'LINE / COLOR', copy: 'Create expressive anime artwork with dedicated positive and negative prompting, framing, and sampling controls.', action: 'Create anime art' }
]
const UTILITY_IDS = UTILITY_DEFINITIONS.map(item => item.id)
function normalizeUtilityOrder(value) {
  const requested = String(value || '').split(',').map(item => item.trim()).filter(item => UTILITY_IDS.includes(item))
  return [...new Set([...requested, ...UTILITY_IDS])]
}
const OUTPUT_PREFIX = { darkroom: 'darkroom-z-turbo', print: 'print-studio/flux-klein', upscaler: 'upscaler/z-image-turbo', anime: 'anime/anima-base' }
const Z_REQUIRED = {
  diffusion: { file: 'z_image_turbo_bf16.safetensors', folder: 'diffusion_models', label: 'Diffusion model', size: '11.46 GB', url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors' },
  text: { file: 'qwen_3_4b.safetensors', folder: 'text_encoders', label: 'Text encoder', size: '7.49 GB', url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors' },
  vae: { file: 'ae.safetensors', folder: 'vae', label: 'VAE', size: '319.7 MB', url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors' }
}
const KLEIN_REQUIRED = {
  diffusion: { file: 'flux-2-klein-4b.safetensors', folder: 'diffusion_models', label: 'FLUX.2 Klein 4B Distilled', url: 'https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/diffusion_models/flux-2-klein-4b.safetensors' },
  text: { file: 'qwen_3_4b.safetensors', folder: 'text_encoders', label: 'Qwen 3 4B text encoder', url: 'https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors' },
  vae: { file: 'flux2-vae.safetensors', folder: 'vae', label: 'FLUX.2 VAE', url: 'https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors' }
}
const UPSCALE_REQUIRED = { ...Z_REQUIRED, upscale: { file: 'RealESRGAN_x4plus.safetensors', folder: 'upscale_models', label: '4× upscale model', url: 'https://huggingface.co/Comfy-Org/Real-ESRGAN_repackaged/resolve/main/RealESRGAN_x4plus.safetensors' } }
const ANIMA_REQUIRED = {
  diffusion: { file: 'anima-base-v1.0.safetensors', folder: 'diffusion_models', label: 'Anima Base 1.0', url: 'https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-base-v1.0.safetensors' },
  text: { file: 'qwen_3_06b_base.safetensors', folder: 'text_encoders', label: 'Qwen 3 0.6B Base', url: 'https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/text_encoders/qwen_3_06b_base.safetensors' },
  vae: { file: 'qwen_image_vae.safetensors', folder: 'vae', label: 'Qwen Image VAE', url: 'https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/vae/qwen_image_vae.safetensors' }
}
const ratios = ['1:1', '2:3', '3:4', '16:9', 'Custom']
const defaultFrame = { width: 1024, height: 1024, ratio: '1:1', orientation: 'square' }

function ratioDimensions(ratio, orientation) {
  let [a, b] = ratio.split(':').map(Number)
  if ((orientation === 'landscape' && a < b) || (orientation === 'portrait' && a > b)) [a, b] = [b, a]
  if (a === b) return { width: 1024, height: 1024, orientation: 'square' }
  const area = 1024 * 1024
  return { width: Math.round(Math.sqrt(area * a / b) / 16) * 16, height: Math.round(Math.sqrt(area * b / a) / 16) * 16, orientation }
}

function zImageWorkflow({ prompt, negativePrompt, steps, width, height, seed, loraName, loraStrength, outputPrefix }) {
  const modelSource = loraName !== 'disabled' ? ['10', 0] : ['1', 0]
  const graph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: Z_REQUIRED.diffusion.file, weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: Z_REQUIRED.text.file, type: 'lumina2', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: Z_REQUIRED.vae.file } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    '5': { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt, clip: ['2', 0] } },
    '6': { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } },
    '7': { class_type: 'ModelSamplingAuraFlow', inputs: { model: modelSource, shift: 3 } },
    '8': { class_type: 'KSampler', inputs: { seed: seed < 0 ? Math.floor(Math.random() * 2 ** 32) : seed, steps, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1, model: ['7', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0] } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    '11': { class_type: 'SaveImage', inputs: { filename_prefix: outputPrefix, images: ['9', 0] } }
  }
  if (loraName !== 'disabled') graph['10'] = { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: loraName, strength_model: loraStrength } }
  return graph
}

function printPrompt(prompt, treatment, inkCount) {
  return `Create a standalone print graphic for a T-shirt. ${prompt.trim()} Render every requested word exactly as written, with correct spelling and clear letterforms. The requested wording must be the only text. ${treatment}. Limited ${inkCount}-color screen-print palette, strong silhouette, centered balanced composition, clean outer boundary, isolated artwork on a plain solid background. No shirt, person, product mockup, hanger, room, watermark, signature, border, or extra lettering.`
}

function kleinWorkflow({ prompt, width, height, steps, guidance, seed, model, encoder, vae, outputPrefix }) {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: model, weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: encoder, type: 'flux2', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: vae } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    '5': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    '6': { class_type: 'EmptyFlux2LatentImage', inputs: { width, height, batch_size: 1 } },
    '7': { class_type: 'RandomNoise', inputs: { noise_seed: seed < 0 ? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) : seed } },
    '8': { class_type: 'CFGGuider', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], cfg: guidance } },
    '9': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    '10': { class_type: 'Flux2Scheduler', inputs: { steps, width, height } },
    '11': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['7', 0], guider: ['8', 0], sampler: ['9', 0], sigmas: ['10', 0], latent_image: ['6', 0] } },
    '12': { class_type: 'VAEDecode', inputs: { samples: ['11', 0], vae: ['3', 0] } },
    '13': { class_type: 'SaveImage', inputs: { filename_prefix: outputPrefix, images: ['12', 0] } }
  }
}

function upscaleWorkflow({ image, prompt, seed, denoise, outputPrefix }) {
  return {
    '1': { class_type: 'LoadImage', inputs: { image } },
    '2': { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['1', 0], upscale_method: 'lanczos', megapixels: 1, resolution_steps: 1 } },
    '3': { class_type: 'UpscaleModelLoader', inputs: { model_name: UPSCALE_REQUIRED.upscale.file } },
    '4': { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: ['3', 0], image: ['2', 0] } },
    '5': { class_type: 'ImageScaleBy', inputs: { image: ['4', 0], upscale_method: 'lanczos', scale_by: 0.5 } },
    '6': { class_type: 'UNETLoader', inputs: { unet_name: Z_REQUIRED.diffusion.file, weight_dtype: 'default' } },
    '7': { class_type: 'CLIPLoader', inputs: { clip_name: Z_REQUIRED.text.file, type: 'lumina2', device: 'default' } },
    '8': { class_type: 'VAELoader', inputs: { vae_name: Z_REQUIRED.vae.file } },
    '9': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['7', 0] } },
    '10': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['7', 0] } },
    '11': { class_type: 'VAEEncode', inputs: { pixels: ['5', 0], vae: ['8', 0] } },
    '12': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['6', 0], shift: 3 } },
    '13': { class_type: 'KSampler', inputs: { seed: seed < 0 ? Math.floor(Math.random() * 2 ** 32) : seed, steps: 5, cfg: 1, sampler_name: 'dpmpp_2m_sde', scheduler: 'beta', denoise, model: ['12', 0], positive: ['9', 0], negative: ['10', 0], latent_image: ['11', 0] } },
    '14': { class_type: 'VAEDecode', inputs: { samples: ['13', 0], vae: ['8', 0] } },
    '15': { class_type: 'SaveImage', inputs: { filename_prefix: outputPrefix, images: ['14', 0] } }
  }
}

function animaWorkflow({ prompt, negativePrompt, width, height, steps, cfg, seed, outputPrefix }) {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: ANIMA_REQUIRED.diffusion.file, weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: ANIMA_REQUIRED.text.file, type: 'stable_diffusion', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: ANIMA_REQUIRED.vae.file } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    '5': { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt, clip: ['2', 0] } },
    '6': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '7': { class_type: 'KSampler', inputs: { seed: seed < 0 ? Math.floor(Math.random() * 2 ** 32) : seed, steps, cfg, sampler_name: 'er_sde', scheduler: 'simple', denoise: 1, model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: outputPrefix, images: ['8', 0] } }
  }
}

async function responseJson(response, fallback) {
  const text = await response.text()
  if (!text.trim()) throw new Error(fallback)
  try { return JSON.parse(text) } catch { throw new Error(`ComfyUI returned an unreadable response (HTTP ${response.status}).`) }
}

function Slider({ id, label, value, min, max, step = 1, onChange, suffix = '', disabled = false }) {
  return <div className="field slider-field"><div className="label-row"><label htmlFor={id}>{label}</label><output htmlFor={id}>{value}{suffix}</output></div><input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))}/></div>
}

function useFrame(initial = defaultFrame) {
  const [frame, setFrame] = useState(initial)
  const chooseRatio = ratio => {
    if (ratio === 'Custom') return setFrame(current => ({ ...current, ratio }))
    const [wide, tall] = ratio.split(':').map(Number)
    const orientation = ratio === '1:1' ? 'square' : frame.orientation === 'square' ? (wide > tall ? 'landscape' : 'portrait') : frame.orientation
    setFrame(current => ({ ...current, ratio, ...ratioDimensions(ratio, orientation) }))
  }
  const chooseOrientation = orientation => setFrame(current => {
    if (current.ratio === 'Custom') {
      const swap = (orientation === 'landscape' && current.width < current.height) || (orientation === 'portrait' && current.width > current.height)
      return { ...current, orientation, ...(swap ? { width: current.height, height: current.width } : {}) }
    }
    return { ...current, ...ratioDimensions(current.ratio, orientation) }
  })
  return { frame, setFrame, chooseRatio, chooseOrientation }
}

function FrameControls({ frame, setFrame, chooseRatio, chooseOrientation }) {
  return <><fieldset><legend>Aspect ratio</legend><div className="ratio-grid">{ratios.map(ratio => <button type="button" key={ratio} className={frame.ratio === ratio ? 'ratio active' : 'ratio'} aria-pressed={frame.ratio === ratio} onClick={() => chooseRatio(ratio)}><i style={ratio === 'Custom' ? undefined : { aspectRatio: ratio.replace(':', ' / ') }}/>{ratio}</button>)}</div></fieldset><fieldset><legend>Orientation</legend><div className="segmented">{['portrait', 'square', 'landscape'].map(value => <button type="button" key={value} disabled={value === 'square' && frame.ratio !== '1:1'} className={frame.orientation === value ? 'active' : ''} aria-pressed={frame.orientation === value} onClick={() => chooseOrientation(value)}>{value}</button>)}</div></fieldset><div className="size-row"><Slider id="width" label="Width" value={frame.width} min={512} max={1536} step={16} suffix=" px" disabled={frame.ratio !== 'Custom'} onChange={value => setFrame(current => ({ ...current, width: value }))}/><Slider id="height" label="Height" value={frame.height} min={512} max={1536} step={16} suffix=" px" disabled={frame.ratio !== 'Custom'} onChange={value => setFrame(current => ({ ...current, height: value }))}/></div><p className="help">Orientation flips each preset. Choose Custom to edit dimensions.</p></>
}

function ModelFile({ item, installed }) {
  return <li className={installed ? 'model-file ready' : 'model-file'}><span className="file-state" aria-hidden="true">{installed ? <Check size={14}/> : '↓'}</span><span className="file-copy"><strong>{item.file}</strong><small>{item.label}<br/>models/{item.folder}</small></span>{!installed && <a href={item.url} target="_blank" rel="noreferrer">Download</a>}</li>
}

function OutputStage({ imageUrl, busy, prompt, frame, label, filename, downloadable = true }) {
  return <section className="stage" aria-label="Generated image preview"><div className={`aperture ${busy ? 'working' : ''}`} style={{ aspectRatio: `${frame.width} / ${frame.height}` }}>{imageUrl ? <img src={imageUrl} alt={`Generated image: ${prompt}`}/> : <div className="empty"><ImageIcon size={38}/><p>Your image will develop here.</p><span>Nothing leaves this machine.</span></div>}{busy && <div className="developing"><span>DEVELOPING</span></div>}</div><div className="stage-meta"><span>{frame.width} × {frame.height} PX · {label}</span>{imageUrl && downloadable && <a className="download" href={imageUrl} download={filename}><Download size={17}/>Download Image</a>}</div></section>
}

function UtilityStatus({ status, ready }) {
  return <div className="utility-status" role="status" aria-live="polite"><span className={ready ? 'dot online' : 'dot'}/><span>{status}</span></div>
}

function useComfyAssets(required, includeLoras = false) {
  const [assets, setAssets] = useState(() => ({ ...Object.fromEntries(Object.keys(required).map(key => [key, []])), loras: [] }))
  const [status, setStatus] = useState('Connecting to ComfyUI…')
  const [error, setError] = useState('')
  const loadAssets = async () => {
    setError('')
    try {
      const keys = Object.keys(required)
      const endpoints = [...keys.map(key => required[key].folder), ...(includeLoras ? ['loras'] : [])]
      const responses = await Promise.all(endpoints.map(name => fetch(`${API}/models/${name}`)))
      if (responses.some(response => !response.ok)) throw new Error('ComfyUI did not respond.')
      const values = await Promise.all(responses.map(response => responseJson(response, 'ComfyUI returned an empty model response.')))
      const next = { ...Object.fromEntries(keys.map((key, index) => [key, values[index]])), loras: includeLoras ? values[keys.length] : [] }
      setAssets(next)
      const found = Object.entries(required).filter(([key, item]) => next[key].some(name => name.endsWith(item.file))).length
      const total = Object.keys(required).length
      setStatus(found === total ? 'Ready to generate' : `${found} of ${total} required models ready`)
    } catch { setStatus('ComfyUI unavailable'); setError('Start ComfyUI, then refresh models.') }
  }
  useEffect(() => { loadAssets() }, [required.diffusion.file, required.text.file, required.vae.file])
  const installed = useMemo(() => Object.fromEntries(Object.entries(required).map(([key, item]) => [key, assets[key].some(name => name.endsWith(item.file))])), [assets, required])
  return { assets, status, setStatus, error, setError, loadAssets, installed, ready: Object.values(installed).every(Boolean) }
}

async function runWorkflow(graph, outputNode, setStatus, setImageUrl, abort) {
  const queued = await fetch('/api/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: crypto.randomUUID() }) })
  const payload = await responseJson(queued, 'ComfyUI did not return a job ID.')
  if (!queued.ok || payload.error) throw new Error(payload.error?.message || 'ComfyUI rejected the workflow.')
  setStatus('Generating locally…')
  for (let i = 0; i < 1800 && !abort.current; i++) {
    await sleep(1000)
    const history = await fetch(`${API}/history/${payload.prompt_id}`).then(response => response.json())
    const job = history[payload.prompt_id]
    if (job?.status?.status_str === 'error') throw new Error('Generation failed inside ComfyUI. Check its console for the failing node.')
    const output = job?.outputs?.[outputNode]?.images?.[0]
    if (output) {
      const params = new URLSearchParams({ filename: output.filename, subfolder: output.subfolder || '', type: output.type || 'output' })
      setImageUrl(`${API}/view?${params}`); setStatus('Finished · ready to download'); return
    }
  }
  throw new Error('Generation timed out. The job may still be running in ComfyUI.')
}

async function uploadImageToComfy(file) {
  const form = new FormData(); form.append('image', file, file.name); form.append('type', 'input'); form.append('overwrite', 'true')
  const response = await fetch(`${API}/upload/image`, { method: 'POST', body: form })
  const payload = await responseJson(response, 'ComfyUI did not return the uploaded image name.')
  if (!response.ok || !payload.name) throw new Error(payload.error || 'ComfyUI rejected the source image.')
  return payload.subfolder ? `${payload.subfolder}/${payload.name}` : payload.name
}

function ModelSetup({ required, installed, ready, loadAssets, intro }) {
  return <details className="setup-card" open={!ready}><summary><span><Settings size={17}/><strong>Model setup</strong><small>{Object.values(installed).filter(Boolean).length}/{Object.keys(required).length} installed</small></span><ChevronDown size={18}/></summary><div className="setup-body"><p>{intro}</p><ul>{Object.entries(required).map(([key, item]) => <ModelFile key={key} item={item} installed={installed[key]}/>)}</ul><button type="button" className="refresh-models" onClick={loadAssets}><RefreshCw size={16}/>Refresh Models</button></div></details>
}

function Darkroom() {
  const assetState = useComfyAssets(Z_REQUIRED, true)
  const { frame, setFrame, chooseRatio, chooseOrientation } = useFrame()
  const [prompt, setPrompt] = useState('A weathered cedar cabin with one lit window beside a misty alpine lake at dawn, the cabin clearly visible in the foreground, pine forest behind it, soft natural light, realistic architectural photography, 35mm lens, detailed wood texture')
  const [negativePrompt, setNegativePrompt] = useState('blurry, distorted, malformed, text, watermark, oversaturated')
  const [steps, setSteps] = useState(8), [seed, setSeed] = useState(-1), [loraName, setLoraName] = useState('disabled'), [loraStrength, setLoraStrength] = useState(0.8)
  const [busy, setBusy] = useState(false), [imageUrl, setImageUrl] = useState('')
  const abort = useRef(false)
  useEffect(() => { setLoraName(current => assetState.assets.loras.includes(current) ? current : 'disabled') }, [assetState.assets.loras])
  const reset = () => {
    setPrompt('A weathered cedar cabin with one lit window beside a misty alpine lake at dawn, the cabin clearly visible in the foreground, pine forest behind it, soft natural light, realistic architectural photography, 35mm lens, detailed wood texture')
    setNegativePrompt('blurry, distorted, malformed, text, watermark, oversaturated'); setSteps(8); setSeed(-1); setLoraName('disabled'); setLoraStrength(0.8); setFrame(defaultFrame); setImageUrl(''); assetState.setError(''); assetState.loadAssets()
  }
  const generate = async event => {
    event.preventDefault(); if (!prompt.trim() || !assetState.ready || busy) return
    setBusy(true); assetState.setError(''); assetState.setStatus('Queuing Z-Image Turbo…'); abort.current = false
    try { await runWorkflow(zImageWorkflow({ prompt: prompt.trim(), negativePrompt: negativePrompt.trim(), steps, seed, ...frame, loraName, loraStrength, outputPrefix: OUTPUT_PREFIX.darkroom }), '11', assetState.setStatus, setImageUrl, abort) }
    catch (error) { assetState.setError(error.message); assetState.setStatus('Could not generate') } finally { setBusy(false) }
  }
  return <ToolLayout eyebrow="DARKROOM · TEXT TO IMAGE" title="Develop an image" dek="Z-Image Turbo · 8-step local generation" status={assetState.status} ready={assetState.ready} onReset={reset} resetDisabled={busy} controls={<form className="controls" noValidate onSubmit={generate}>
    <section><div className="section-head"><span>01</span><h2>Frame the scene</h2></div><label htmlFor="prompt">Prompt</label><textarea className="resize-none" id="prompt" value={prompt} onChange={event => setPrompt(event.target.value)} rows="7"/><p className="help">Name the subject first, then its position, setting, light, lens, and texture.</p><label htmlFor="negative-prompt">Negative prompt</label><textarea className="resize-none" id="negative-prompt" value={negativePrompt} onChange={event => setNegativePrompt(event.target.value)} rows="3"/><p className="help">Experimental: at fixed CFG 1, negative conditioning may have a subtle effect.</p></section>
    <section><div className="section-head"><span>02</span><h2>Choose the frame</h2></div><FrameControls {...{ frame, setFrame, chooseRatio, chooseOrientation }}/></section>
    <section><div className="section-head"><span>03</span><h2>Tune the exposure</h2></div><Slider id="steps" label="Steps" value={steps} min={4} max={12} onChange={setSteps}/><div className="field"><label htmlFor="seed">Seed <span>−1 for random</span></label><input id="seed" type="number" value={seed} min="-1" max="4294967295" onChange={event => setSeed(Number(event.target.value))}/></div></section>
    <section><div className="section-head"><span>04</span><h2>Optional LoRA</h2></div><div className="lora-controls"><div className="field"><label htmlFor="lora">LoRA file</label><select id="lora" value={loraName} onChange={event => setLoraName(event.target.value)}><option value="disabled">Disabled</option>{assetState.assets.loras.map(name => <option key={name} value={name}>{name}</option>)}</select></div><Slider id="lora-strength" label="Model strength" value={loraStrength} min={-2} max={2} step={0.05} disabled={loraName === 'disabled'} onChange={setLoraStrength}/></div></section>
    {assetState.error && <p className="error" role="alert">{assetState.error}</p>}<button className="generate" type="submit" disabled={!prompt.trim() || !assetState.ready || busy} aria-busy={busy}>{busy ? <><span className="spinner"/>Generating…</> : <><Sparkles size={18}/>Generate Image</>}</button><UtilityStatus status={assetState.status} ready={assetState.ready}/>{!assetState.ready && <p className="button-help">Install all three required model files before generating.</p>}
  </form>} output={<><OutputStage imageUrl={imageUrl} busy={busy} prompt={prompt} frame={frame} label={frame.ratio} filename="darkroom-z-turbo.png"/><ModelSetup required={Z_REQUIRED} {...assetState} intro="Install the official Z-Image Turbo split files in their exact model folders."/></>}/>
}

function PrintStudio() {
  const assetState = useComfyAssets(KLEIN_REQUIRED)
  const { frame, setFrame, chooseRatio, chooseOrientation } = useFrame({ width: 896, height: 1152, ratio: '3:4', orientation: 'portrait' })
  const [prompt, setPrompt] = useState('A bold vintage mountain emblem with large arched text reading exactly “WILD AT HEART”, pine trees and a rising sun')
  const [treatment, setTreatment] = useState('Bold distressed screen-print illustration with highly legible slab-serif typography')
  const [inkCount, setInkCount] = useState(4), [steps, setSteps] = useState(4), [guidance, setGuidance] = useState(1), [seed, setSeed] = useState(-1)
  const [busy, setBusy] = useState(false), [imageUrl, setImageUrl] = useState(''), [jobStatus, setJobStatus] = useState('')
  const abort = useRef(false)
  const reset = () => {
    setPrompt('A bold vintage mountain emblem with large arched text reading exactly “WILD AT HEART”, pine trees and a rising sun')
    setTreatment('Bold distressed screen-print illustration with highly legible slab-serif typography'); setInkCount(4); setSteps(4); setGuidance(1); setSeed(-1); setFrame({ width: 896, height: 1152, ratio: '3:4', orientation: 'portrait' }); setImageUrl(''); setJobStatus(''); assetState.setError(''); assetState.loadAssets()
  }
  const generate = async event => {
    event.preventDefault(); if (!prompt.trim() || !assetState.ready || busy) return
    setBusy(true); assetState.setError(''); setJobStatus('Preparing print composition…'); abort.current = false
    try {
      const graph = kleinWorkflow({ prompt: printPrompt(prompt, treatment, inkCount), ...frame, steps, guidance, seed, model: KLEIN_REQUIRED.diffusion.file, encoder: KLEIN_REQUIRED.text.file, vae: KLEIN_REQUIRED.vae.file, outputPrefix: OUTPUT_PREFIX.print })
      await runWorkflow(graph, '13', setJobStatus, setImageUrl, abort)
    } catch (error) { assetState.setError(error.message); setJobStatus('Could not generate') } finally { setBusy(false) }
  }
  return <ToolLayout eyebrow="PRINT STUDIO · TYPE & ILLUSTRATION" title="Pull a print" dek="FLUX.2 Klein 4B · lettering-aware artwork" status={jobStatus || assetState.status} ready={assetState.ready} accent="print" onReset={reset} resetDisabled={busy} controls={<form className="controls print-controls" noValidate onSubmit={generate}>
    <section><div className="section-head"><span>01</span><h2>Describe the print</h2></div><label htmlFor="print-prompt">Prompt</label><textarea className="resize-none" id="print-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} rows="8" aria-describedby="print-help"/><p className="help" id="print-help">Put required wording in quotation marks and say “reading exactly”. Print constraints are added automatically.</p></section>
    <section><div className="section-head"><span>02</span><h2>Set the treatment</h2></div><div className="field"><label htmlFor="treatment">Artwork treatment</label><select id="treatment" value={treatment} onChange={event => setTreatment(event.target.value)}><option>Bold distressed screen-print illustration with highly legible slab-serif typography</option><option>Clean vector-style mascot graphic with heavy outlined display lettering</option><option>Retro collegiate badge with athletic block typography</option><option>Hand-drawn psychedelic poster graphic with thick readable lettering</option><option>Minimal modern emblem with crisp geometric sans-serif typography</option></select></div><Slider id="ink-count" label="Ink colors" value={inkCount} min={2} max={8} onChange={setInkCount}/></section>
    <section><div className="section-head"><span>03</span><h2>Choose the canvas</h2></div><FrameControls {...{ frame, setFrame, chooseRatio, chooseOrientation }}/></section>
    <section><div className="section-head"><span>04</span><h2>Tune the pull</h2></div><Slider id="print-steps" label="Steps" value={steps} min={4} max={12} onChange={setSteps}/><Slider id="guidance" label="Guidance" value={guidance} min={1} max={5} step={0.1} onChange={setGuidance}/><div className="field"><label htmlFor="print-seed">Seed <span>−1 for random</span></label><input id="print-seed" type="number" value={seed} min="-1" max="9007199254740991" onChange={event => setSeed(Number(event.target.value))}/></div><p className="help">The distilled model is designed for 4 steps. Increase steps only when you prefer a slower variation.</p></section>
    {assetState.error && <p className="error" role="alert">{assetState.error}</p>}<button className="generate print-generate" type="submit" disabled={!prompt.trim() || !assetState.ready || busy} aria-busy={busy}>{busy ? <><span className="spinner"/>Pulling Print…</> : <><Shirt size={18}/>Generate Print Artwork</>}</button><UtilityStatus status={jobStatus || assetState.status} ready={assetState.ready}/>{!assetState.ready && <p className="button-help">Install the three Klein model files before generating.</p>}
  </form>} output={<><OutputStage imageUrl={imageUrl} busy={busy} prompt={prompt} frame={frame} label={`${frame.ratio} · ${inkCount} INKS`} filename="flux-klein-shirt-print.png"/><div className="model-note print-note"><strong>Production note</strong><span>The download is a raster PNG. Verify spelling and your printer’s size, background, and color-profile requirements before manufacturing.</span></div><ModelSetup required={KLEIN_REQUIRED} {...assetState} intro="Install the official FLUX.2 Klein 4B Distilled files. The Qwen encoder can be shared with Z-Image."/></>}/>
}

function ImageUpscaler() {
  const assetState = useComfyAssets(UPSCALE_REQUIRED)
  const [file, setFile] = useState(null), [sourceUrl, setSourceUrl] = useState(''), [imageUrl, setImageUrl] = useState('')
  const [frame, setFrame] = useState(defaultFrame), [prompt, setPrompt] = useState('masterpiece, high detail, crisp natural texture')
  const [denoise, setDenoise] = useState(0.33), [seed, setSeed] = useState(-1), [busy, setBusy] = useState(false), [jobStatus, setJobStatus] = useState('')
  const abort = useRef(false), fileInput = useRef(null)
  const chooseFile = event => {
    const next = event.target.files?.[0]; if (!next) return
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    const url = URL.createObjectURL(next); setFile(next); setSourceUrl(url); setImageUrl(''); assetState.setError('')
    const probe = new Image(); probe.onload = () => setFrame({ width: probe.naturalWidth, height: probe.naturalHeight, ratio: 'Source', orientation: probe.naturalWidth === probe.naturalHeight ? 'square' : probe.naturalWidth > probe.naturalHeight ? 'landscape' : 'portrait' }); probe.src = url
  }
  const reset = () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); setFile(null); setSourceUrl(''); setImageUrl(''); setFrame(defaultFrame); setPrompt('masterpiece, high detail, crisp natural texture'); setDenoise(0.33); setSeed(-1); setJobStatus(''); assetState.setError(''); if (fileInput.current) fileInput.current.value = ''; assetState.loadAssets() }
  const generate = async event => {
    event.preventDefault(); if (!file || !assetState.ready || busy) return
    setBusy(true); setImageUrl(''); assetState.setError(''); setJobStatus('Uploading source image…'); abort.current = false
    try { const image = await uploadImageToComfy(file); setJobStatus('Upscaling and refining…'); await runWorkflow(upscaleWorkflow({ image, prompt: prompt.trim(), seed, denoise, outputPrefix: OUTPUT_PREFIX.upscaler }), '15', setJobStatus, setImageUrl, abort) }
    catch (error) { assetState.setError(error.message); setJobStatus('Could not upscale') } finally { setBusy(false) }
  }
  return <ToolLayout eyebrow="IMAGE UPSCALER · RESTORE & REFINE" title="Enlarge the image" dek="Real-ESRGAN 4× · Z-Image Turbo refinement" status={jobStatus || assetState.status} ready={assetState.ready} accent="upscaler" onReset={reset} resetDisabled={busy} controls={<form className="controls" noValidate onSubmit={generate}>
    <section><div className="section-head"><span>01</span><h2>Choose the source</h2></div><label htmlFor="upscale-source">Image file</label><input ref={fileInput} className="file-input" id="upscale-source" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile}/><p className="help">PNG, JPEG, or WebP. The source is sent directly to your local ComfyUI input folder.</p></section>
    <section><div className="section-head"><span>02</span><h2>Guide the refinement</h2></div><label htmlFor="upscale-prompt">Detail prompt</label><textarea className="resize-none" id="upscale-prompt" rows="4" value={prompt} onChange={event => setPrompt(event.target.value)}/><Slider id="upscale-denoise" label="Refinement strength" value={denoise} min={0.1} max={0.6} step={0.01} onChange={setDenoise}/><div className="field"><label htmlFor="upscale-seed">Seed <span>−1 for random</span></label><input id="upscale-seed" type="number" value={seed} min="-1" max="4294967295" onChange={event => setSeed(Number(event.target.value))}/></div><p className="help">Lower strength preserves the source. Higher strength allows more regenerated detail.</p></section>
    {assetState.error && <p className="error" role="alert">{assetState.error}</p>}<button className="generate" type="submit" disabled={!file || !assetState.ready || busy} aria-busy={busy}>{busy ? <><span className="spinner"/>Upscaling…</> : <><Layers3 size={18}/>Upscale Image</>}</button><UtilityStatus status={jobStatus || assetState.status} ready={assetState.ready}/>{!assetState.ready && <p className="button-help">Install all four required model files before upscaling.</p>}
  </form>} output={<><OutputStage imageUrl={imageUrl || sourceUrl} busy={busy} prompt={file?.name || 'source image'} frame={frame} label={imageUrl ? 'UPSCALED' : sourceUrl ? 'SOURCE' : 'WAITING'} filename="z-image-upscaled.png" downloadable={Boolean(imageUrl)}/><ModelSetup required={UPSCALE_REQUIRED} {...assetState} intro="Install the official Z-Image Turbo files plus the Real-ESRGAN 4× upscaler used by the template."/></>}/>
}

function AnimeMaker() {
  const assetState = useComfyAssets(ANIMA_REQUIRED)
  const { frame, setFrame, chooseRatio, chooseOrientation } = useFrame()
  const [prompt, setPrompt] = useState('A determined young sky courier standing on a rooftop above a luminous coastal city, wind lifting her jacket and hair, expressive anime key visual, detailed clouds, vivid sunset color')
  const [negativePrompt, setNegativePrompt] = useState('worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia')
  const [steps, setSteps] = useState(30), [cfg, setCfg] = useState(4), [seed, setSeed] = useState(-1), [busy, setBusy] = useState(false), [imageUrl, setImageUrl] = useState('')
  const abort = useRef(false)
  const reset = () => { setPrompt('A determined young sky courier standing on a rooftop above a luminous coastal city, wind lifting her jacket and hair, expressive anime key visual, detailed clouds, vivid sunset color'); setNegativePrompt('worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia'); setSteps(30); setCfg(4); setSeed(-1); setFrame(defaultFrame); setImageUrl(''); assetState.setError(''); assetState.loadAssets() }
  const generate = async event => {
    event.preventDefault(); if (!prompt.trim() || !assetState.ready || busy) return
    setBusy(true); assetState.setError(''); assetState.setStatus('Queuing Anima Base…'); abort.current = false
    try { await runWorkflow(animaWorkflow({ prompt: prompt.trim(), negativePrompt: negativePrompt.trim(), ...frame, steps, cfg, seed, outputPrefix: OUTPUT_PREFIX.anime }), '9', assetState.setStatus, setImageUrl, abort) }
    catch (error) { assetState.setError(error.message); assetState.setStatus('Could not generate') } finally { setBusy(false) }
  }
  return <ToolLayout eyebrow="ANIME MAKER · TEXT TO IMAGE" title="Draw an anime world" dek="Anima Base 1.0 · expressive illustration" status={assetState.status} ready={assetState.ready} accent="anime" onReset={reset} resetDisabled={busy} controls={<form className="controls" noValidate onSubmit={generate}>
    <section><div className="section-head"><span>01</span><h2>Describe the artwork</h2></div><label htmlFor="anime-prompt">Prompt</label><textarea className="resize-none" id="anime-prompt" rows="7" value={prompt} onChange={event => setPrompt(event.target.value)}/><p className="help">Describe the character, pose, setting, camera, light, palette, and anime treatment.</p><label htmlFor="anime-negative">Negative prompt</label><textarea className="resize-none" id="anime-negative" rows="3" value={negativePrompt} onChange={event => setNegativePrompt(event.target.value)}/></section>
    <section><div className="section-head"><span>02</span><h2>Choose the frame</h2></div><FrameControls {...{ frame, setFrame, chooseRatio, chooseOrientation }}/></section>
    <section><div className="section-head"><span>03</span><h2>Tune the drawing</h2></div><Slider id="anime-steps" label="Steps" value={steps} min={12} max={50} onChange={setSteps}/><Slider id="anime-cfg" label="Guidance" value={cfg} min={1} max={8} step={0.5} onChange={setCfg}/><div className="field"><label htmlFor="anime-seed">Seed <span>−1 for random</span></label><input id="anime-seed" type="number" value={seed} min="-1" max="4294967295" onChange={event => setSeed(Number(event.target.value))}/></div><p className="help">Template defaults: 30 steps, CFG 4, ER-SDE sampler, Simple scheduler.</p></section>
    {assetState.error && <p className="error" role="alert">{assetState.error}</p>}<button className="generate" type="submit" disabled={!prompt.trim() || !assetState.ready || busy} aria-busy={busy}>{busy ? <><span className="spinner"/>Drawing…</> : <><Palette size={18}/>Generate Anime Image</>}</button><UtilityStatus status={assetState.status} ready={assetState.ready}/>{!assetState.ready && <p className="button-help">Install the three Anima model files before generating.</p>}
  </form>} output={<><OutputStage imageUrl={imageUrl} busy={busy} prompt={prompt} frame={frame} label={frame.ratio} filename="anima-base-artwork.png"/><ModelSetup required={ANIMA_REQUIRED} {...assetState} intro="Install the official Anima Base model, Qwen 0.6B text encoder, and Qwen Image VAE in their exact model folders."/></>}/>
}

function PromptBuilder({ env }) {
  const [idea, setIdea] = useState(''), [result, setResult] = useState('')
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('Checking Ollama…'), [ready, setReady] = useState(false)
  const [error, setError] = useState(''), [copied, setCopied] = useState(false)
  const checkOllama = async () => {
    try {
      const response = await fetch('/api/ollama/status')
      const payload = await responseJson(response, 'Ollama returned an empty status response.')
      setReady(Boolean(payload.ready)); setStatus(payload.status || (payload.ready ? 'Ready to build prompts' : 'Ollama unavailable'))
    } catch { setReady(false); setStatus('Ollama unavailable') }
  }
  useEffect(() => { checkOllama() }, [env.OLLAMA_URL, env.OLLAMA_MODEL])
  const buildPrompt = async event => {
    event.preventDefault(); if (!idea.trim() || busy) return
    setBusy(true); setError(''); setCopied(false); setStatus('Writing locally…')
    try {
      const response = await fetch('/api/expand-prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idea: idea.trim() }) })
      const payload = await responseJson(response, 'Ollama returned an empty response.')
      if (!response.ok) throw new Error(payload.error || 'The prompt could not be generated.')
      setResult(payload.prompt); setReady(true); setStatus('Prompt ready to copy')
    } catch (caught) { setError(caught.message); setStatus('Could not build prompt') } finally { setBusy(false) }
  }
  const copyPrompt = async () => {
    if (!result) return
    try { await navigator.clipboard.writeText(result); setCopied(true) }
    catch { setError('Clipboard access was blocked. Select the prompt and copy it manually.') }
  }
  const reset = () => { setIdea(''); setResult(''); setError(''); setCopied(false); setStatus('Checking Ollama…'); checkOllama() }
  const controls = <form className="controls prompt-controls" noValidate onSubmit={buildPrompt}>
    <section><div className="section-head"><span>01</span><h2>Start with one line</h2></div><label htmlFor="prompt-idea">Image idea</label><input id="prompt-idea" className="prompt-idea" value={idea} onChange={event => setIdea(event.target.value)} placeholder="A tiny bookshop glowing on a rainy Tokyo street" autoComplete="off" aria-describedby="prompt-idea-help"/><p className="help" id="prompt-idea-help">Keep it simple. The local model will add visual detail without changing the core idea.</p></section>
    <div className="prompt-action-block"><section><div className="section-head"><span>02</span><h2>Build the prompt</h2></div><p className="help">Uses <code>{env.OLLAMA_MODEL || DEFAULT_ENV.OLLAMA_MODEL}</code> through your local Ollama server.</p></section>{error && <p className="error" role="alert">{error}</p>}<button className="generate" type="submit" disabled={!idea.trim() || busy} aria-busy={busy}>{busy ? <><span className="spinner"/>Building…</> : <><Sparkles size={18}/>Build Image Prompt</>}</button><UtilityStatus status={status} ready={ready}/></div>
  </form>
  const output = <section className="prompt-sheet" aria-label="Generated image prompt"><div className="prompt-sheet-head"><span>GENERATED PROMPT</span>{result && <button type="button" className="copy-prompt" onClick={copyPrompt}><Copy size={16}/>{copied ? 'Copied' : 'Copy Prompt'}</button>}</div><div className={result ? 'prompt-result' : 'prompt-result empty-prompt'}>{result || 'Your expanded prompt will appear here, ready to copy into Darkroom or Print Studio.'}</div><p className="copy-status" role="status" aria-live="polite">{copied ? 'Copied to clipboard.' : ''}</p></section>
  return <ToolLayout eyebrow="PROMPT BUILDER · LOCAL LLM" title="Develop the idea" dek={`${env.OLLAMA_MODEL || DEFAULT_ENV.OLLAMA_MODEL} · prompt expansion`} status={status} ready={ready} accent="prompt-builder" onReset={reset} resetDisabled={busy} controls={controls} output={output}/>
}

function SettingsPanel({ env, onSaved }) {
  const [draft, setDraft] = useState(env), [saving, setSaving] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  useEffect(() => { setDraft(env) }, [env])
  const save = async event => {
    event.preventDefault(); setSaving(true); setMessage(''); setError('')
    try {
      const response = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) })
      const payload = await responseJson(response, 'Settings could not be saved.')
      if (!response.ok) throw new Error(payload.error || 'Settings could not be saved.')
      onSaved(payload); setMessage('Settings saved to .env and applied.')
    } catch (caught) { setError(caught.message) } finally { setSaving(false) }
  }
  const fields = [['COMFYUI_URL', 'ComfyUI URL', 'Local ComfyUI address used by the image utilities.'], ['OLLAMA_URL', 'Ollama URL', 'Local Ollama API address.'], ['OLLAMA_MODEL', 'Ollama model', 'Exact installed model name, for example qwen3.5:0.8b.']]
  const orderedUtilities = normalizeUtilityOrder(draft.UTILITY_ORDER)
  const moveUtility = (id, offset) => {
    const from = orderedUtilities.indexOf(id), to = from + offset
    if (to < 0 || to >= orderedUtilities.length) return
    const next = [...orderedUtilities]; [next[from], next[to]] = [next[to], next[from]]
    setDraft(current => ({ ...current, UTILITY_ORDER: next.join(',') })); setMessage('')
  }
  return <main><header className="masthead"><div><p className="eyebrow">WORKSHOP · SETTINGS</p><h1>Configure the bench</h1><p className="dek">Allow-listed local environment variables</p></div></header><div className="settings-wrap"><form className="settings-form" noValidate onSubmit={save}><div className="settings-intro"><Settings size={22}/><div><h2>Local runtime</h2><p>These values are written to the project’s <code>.env</code> file. Only the fields shown here can be read or changed.</p></div></div><fieldset className="utility-sorter"><legend>Utility order</legend><p>Sets the order of the homepage cards and utility menu.</p><ol>{orderedUtilities.map((id, index) => { const item = UTILITY_DEFINITIONS.find(candidate => candidate.id === id); const Icon = item.icon; return <li key={id}><span><Icon size={17}/><strong>{item.title}</strong></span><span className="sort-actions"><button type="button" onClick={() => moveUtility(id, -1)} disabled={index === 0} aria-label={`Move ${item.title} Up`}><ArrowUp size={16}/></button><button type="button" onClick={() => moveUtility(id, 1)} disabled={index === orderedUtilities.length - 1} aria-label={`Move ${item.title} Down`}><ArrowDown size={16}/></button></span></li> })}</ol></fieldset>{fields.map(([key, label, help]) => <div className="field env-field" key={key}><label htmlFor={key}>{label}</label><input id={key} value={draft[key] || ''} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} aria-describedby={`${key}-help`}/><small id={`${key}-help`}>{help}</small></div>)}<div className="field env-field"><label htmlFor="LLM_SYSTEM_PROMPT">Prompt Builder instruction</label><textarea className="resize-none settings-prompt" id="LLM_SYSTEM_PROMPT" rows="8" value={draft.LLM_SYSTEM_PROMPT || ''} onChange={event => setDraft(current => ({ ...current, LLM_SYSTEM_PROMPT: event.target.value }))} aria-describedby="LLM_SYSTEM_PROMPT-help"/><small id="LLM_SYSTEM_PROMPT-help">The system instruction sent to Ollama. Replace this with your final version when ready.</small></div>{error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}<div className="settings-actions"><button className="page-reset" type="button" disabled={saving} onClick={() => { setDraft(env); setMessage(''); setError('') }}><RotateCcw size={15}/>Reset Unsaved Changes</button><button className="generate settings-save" type="submit" disabled={saving}>{saving ? <><span className="spinner"/>Saving…</> : <><Save size={17}/>Save Settings</>}</button></div></form></div></main>
}

function ToolLayout({ eyebrow, title, dek, controls, output, accent = '', onReset, resetDisabled = false }) {
  return <main className={accent}><header className="masthead"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="dek">{dek}</p></div><div className="masthead-tools">{onReset && <button type="button" className="page-reset" onClick={onReset} disabled={resetDisabled}><RotateCcw size={15}/>Reset</button>}</div></header><div className="workspace">{controls}<div className="output-column">{output}</div></div></main>
}

function Home({ onOpen, order }) {
  const cards = normalizeUtilityOrder(order).map(id => UTILITY_DEFINITIONS.find(item => item.id === id))
  return <main className="home"><header className="home-hero"><p className="eyebrow home-eyebrow"><strong>LOCAL WORKSHOP</strong><span>—</span> CREATIVE UTILITIES</p><h1>Choose your bench.</h1><p>Each tool has its own local model workflow, controls, and output. Image tools use ComfyUI; Prompt Builder uses Ollama.</p></header><section className="tool-cards" aria-label="Available utilities">{cards.map(({ id, title, kicker, icon: Icon, specimen, copy, action }) => <button type="button" className={`tool-card ${id}`} key={id} onClick={() => onOpen(id)} aria-label={`Open ${title}`}><span className="card-visual" aria-hidden="true"><Icon/><i>{specimen}</i></span><span className="card-copy"><small>{kicker}</small><strong>{title}</strong><span>{copy}</span></span><span className="card-action">{action.replace(/\b\w/g, letter => letter.toUpperCase())}<ArrowUpRight size={17}/></span></button>)}</section></main>
}

function UtilityRail({ active, onChange, order }) {
  const utilities = normalizeUtilityOrder(order).map(id => UTILITY_DEFINITIONS.find(item => item.id === id)).map(({ id, title: label, icon }) => ({ id, label, icon }))
  const items = [{ id: 'home', label: 'Home', icon: HomeIcon }, ...utilities, { id: 'settings', label: 'Settings', icon: Settings }]
  return <aside className="utility-rail" aria-label="Utilities"><div className="brand-mark"><Aperture size={22}/><span>Local Workshop</span><i aria-hidden="true">—</i></div><nav>{items.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={active === id ? 'utility active' : 'utility'} aria-label={label} aria-current={active === id ? 'page' : undefined} onClick={() => onChange(id)}><Icon size={18}/><span>{label}</span></button>)}</nav><p className="rail-note">Local tools. Local files.</p></aside>
}

function App() {
  const [active, setActive] = useState('home'), [env, setEnv] = useState(DEFAULT_ENV)
  const [visited, setVisited] = useState(() => new Set(['home']))
  useEffect(() => { fetch('/api/settings').then(response => response.json()).then(setEnv).catch(() => {}) }, [])
  useEffect(() => {
    const titles = { home: 'Local Workshop', darkroom: 'Darkroom | Local Workshop', print: 'Print Studio | Local Workshop', 'prompt-builder': 'Prompt Builder | Local Workshop', upscaler: 'Image Upscaler | Local Workshop', anime: 'Anime Maker | Local Workshop', settings: 'Settings | Local Workshop' }
    document.title = titles[active]
  }, [active])
  const navigate = id => { setVisited(current => new Set(current).add(id)); setActive(id) }
  return <div className="app-shell"><UtilityRail active={active} onChange={navigate} order={env.UTILITY_ORDER}/>{visited.has('home') && <div className="utility-panel" hidden={active !== 'home'}><Home onOpen={navigate} order={env.UTILITY_ORDER}/></div>}{visited.has('darkroom') && <div className="utility-panel" hidden={active !== 'darkroom'}><Darkroom/></div>}{visited.has('print') && <div className="utility-panel" hidden={active !== 'print'}><PrintStudio/></div>}{visited.has('prompt-builder') && <div className="utility-panel" hidden={active !== 'prompt-builder'}><PromptBuilder env={env}/></div>}{visited.has('upscaler') && <div className="utility-panel" hidden={active !== 'upscaler'}><ImageUpscaler/></div>}{visited.has('anime') && <div className="utility-panel" hidden={active !== 'anime'}><AnimeMaker/></div>}{visited.has('settings') && <div className="utility-panel" hidden={active !== 'settings'}><SettingsPanel env={env} onSaved={setEnv}/></div>}</div>
}

const container = document.getElementById('root')
const root = import.meta.hot?.data.root || createRoot(container)
if (import.meta.hot) import.meta.hot.data.root = root
root.render(<App/>)
