# Installation Guide

This guide assumes Windows PowerShell, ComfyUI on port `8188`, and Ollama on port `11434`. Equivalent commands work on macOS and Linux.

## 1. Requirements

- Node.js 20 or newer
- pnpm 9 or newer
- A working local ComfyUI installation
- Ollama for Prompt Builder
- Enough disk space for the model sets you choose

The image workflows can run without an NVIDIA GPU, but CPU generation may be slow. Start with conservative image dimensions and the template step defaults.

## 2. Install the Application

```powershell
git clone <your-repository-url>
cd image-works
Copy-Item .env.example .env
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`.

## 3. Configure Local Services

The default `.env` values are:

```dotenv
COMFYUI_URL="http://127.0.0.1:8188"
OLLAMA_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="qwen3.5:0.8b"
```

You can edit these values on the Settings page. Restart the Vite development server after manually changing `.env`.

## 4. Install Ollama and the Prompt Model

After installing Ollama, run:

```powershell
ollama pull qwen3.5:0.8b
ollama serve
```

If you later install a different model, update `OLLAMA_MODEL` in Settings. Prompt Builder recipes are Markdown files in the `prompts` folder; list their filenames in the comma-separated `PROMPT_PRESETS` value in `.env`.

The filename list accepts names containing letters, numbers, and hyphens with a `.md` extension. Recipe files must stay directly inside `prompts`; nested paths are rejected. Restart the development or preview server after changing the environment file.

## 5. Install ComfyUI Models

Keep each filename unchanged and place it in the exact folder shown. Restart ComfyUI or use **Refresh Models** in the utility after adding files.

### Darkroom — Z-Image Turbo

| File | ComfyUI folder |
|---|---|
| `z_image_turbo_bf16.safetensors` | `models/diffusion_models` |
| `qwen_3_4b.safetensors` | `models/text_encoders` |
| `ae.safetensors` | `models/vae` |

Optional compatible LoRAs belong in `models/loras`.

### Print Studio — FLUX.2 Klein 4B Distilled

| File | ComfyUI folder |
|---|---|
| `flux-2-klein-4b.safetensors` | `models/diffusion_models` |
| `qwen_3_4b.safetensors` | `models/text_encoders` |
| `flux2-vae.safetensors` | `models/vae` |

Print Enhancer reuses this exact three-file set for single-reference image editing. It does not require another diffusion model, encoder, VAE, or custom node. Update ComfyUI if the core `ReferenceLatent` or `GetImageSize` nodes are unavailable.

Design Lab also reuses this exact three-file set. Its generation graph is `workflows/image_design_lab.api.json`. Optional reference analysis is performed by Ollama before generation, so reference images are not automatically passed into ComfyUI conditioning.

For visual-reference analysis, configure a local Ollama model that supports image input. If the configured model is text-only, Design Lab reports that limitation; idea-only concept development remains available. No multi-gigabyte model is downloaded automatically.

The Qwen text encoder can be shared with Darkroom.

### Image Upscaler

Install all Darkroom models plus:

| File | ComfyUI folder |
|---|---|
| `RealESRGAN_x4plus.safetensors` | `models/upscale_models` |

The workflow first enlarges with Real-ESRGAN and then refines the result with Z-Image Turbo.

### Anime Maker — Anima Base 1.0

| File | ComfyUI folder |
|---|---|
| `anima-base-v1.0.safetensors` | `models/diffusion_models` |
| `qwen_3_06b_base.safetensors` | `models/text_encoders` |
| `qwen_image_vae.safetensors` | `models/vae` |

Every image utility includes a **Model Setup** panel with direct official download links and live readiness status.

## 6. Production Build

```powershell
pnpm build
pnpm preview
```

The compiled site is written to `dist/`. The preview server retains the same local proxy behavior.

## Troubleshooting

### ComfyUI Unavailable

- Confirm ComfyUI is running at the configured URL.
- Open `http://127.0.0.1:8188` directly to verify it responds.
- Check that the filename and model folder exactly match the setup table.
- Restart ComfyUI after installing models.

### Ollama Unavailable

```powershell
ollama list
ollama serve
```

Confirm that the model shown in Settings appears in `ollama list`.

If Design Lab accepts text but fails when a reference is attached, the configured model is likely not vision-capable. Select an installed vision model in Settings and retry. Reference files remain local and are sent only to the configured loopback Ollama service.

### Design Lab Out of Memory

- Use Draft or Standard quality and begin with the default 832 × 1056 frame.
- Generate one variation at a time.
- Close other GPU-heavy ComfyUI jobs before retrying.
- Upscale the selected result afterward instead of generating immediately at final print dimensions.

### A Workflow Is Rejected

- Update ComfyUI to a version that includes the nodes used by its official template.
- Open the matching file in `workflows/` to inspect the API graph.
- Read the ComfyUI console for the node named in the error.

### CPU Generation Is Too Slow

- Use the default step count.
- Start with `1:1` at `1024 × 1024` or a smaller custom size.
- Avoid running multiple generations simultaneously.
- Close other memory-heavy applications.
