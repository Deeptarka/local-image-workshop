# Local Darkroom UX contract

The Workshop shell opens on Home and owns navigation between Home, Darkroom, Print Studio, Prompt Builder, Image Upscaler, Anime Maker, and Settings. No disabled or non-working utility appears in navigation. A utility mounts on first visit and remains mounted but hidden during in-app navigation, preserving prompts, tuning controls, generated results, status, errors, and running jobs until the browser page itself reloads. Home presents one unnumbered descriptive 2:3 portrait card for each creative utility and never presents Settings as a card. Cards use stable capability copy rather than model names; configured model values appear only within the utility or Settings where they come from live state. The order saved in Settings is the shared source for both homepage cards and utility-rail tools; Home remains first and Settings remains last. Each utility submits one job at a time and keeps its form and output state independent. Every working utility has a Reset action that restores its authored defaults and clears its result; reset is blocked while a job is pending. On desktop, each utility's opening prompt section spans both workspace columns before the remaining controls and output continue in two equal, centered columns; narrow screens retain source order. Controls remain populated after success or failure. Image stages reserve the selected ratio, remain in normal document flow and scroll with the page. Errors remain inline and actionable; successful image output exposes a direct download action and successful prompt output exposes an explicit clipboard action.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native LoRA select | `src/main.jsx` | native | keyboard and browser |
| Form | Generation form | `src/main.jsx` | create | browser workflow |
| Scrollbar | Global application stylesheet | `DESIGN.md` | geometry only | computed style |
| Settings | Allow-listed environment form | `vite.config.js` | local create/edit | API readback |
| Clipboard | Prompt Builder copy button | `src/main.jsx` | explicit copy | browser interaction |

## Async flow

`Generate Image` → disabled busy state → ComfyUI queue submission → bounded history polling → preview and download on success, or persistent inline recovery guidance on failure. Duplicate submission is blocked while a job is pending. Model/runtime readiness is always shown in a live region immediately beneath the utility's primary generate/build button rather than in the masthead.

## Model readiness

Generation requires the named Z-Image Turbo diffusion model, Qwen text encoder, and VAE in their separate ComfyUI folders. The UI checks each role independently and blocks generation until all three are ready. The LoRA dropdown begins with `Disabled`; choosing it omits the LoRA loader and disables strength tuning. Copy restricts adapters to Z-Image Turbo-compatible LoRAs.

## Format behavior

Ratio choices contain one canonical direction per shape: 1:1, 2:3, 3:4, and 16:9. Orientation handles reciprocal portrait/landscape forms. Width and height remain disabled for presets and become editable only after selecting Custom.

## Prompt conditioning

Positive and negative prompts are encoded separately. The UI labels negative prompting experimental because Z-Image Turbo's fixed CFG 1 may make its effect subtle.

## Print Studio

Print Studio uses an independent FLUX.2 Klein 4B Distilled API graph with Klein's Flux2 latent, scheduler, CFG guider, Euler sampler, and four-step default. The user's prompt is automatically wrapped with exact-lettering, limited-palette, isolated-artwork, and no-mockup constraints. Tuning exposes treatment, ink count, format, steps, guidance, and seed. It does not modify or reuse Darkroom's workflow.

## Prompt Builder

Prompt Builder sends the user's one-line idea to the configured local Ollama chat endpoint with the allow-listed system instruction. On desktop its build action occupies the left half of the workspace and the generated prompt follows beneath at full two-column width; narrow screens preserve source order. It returns only the generated prompt, preserves the previous successful result when a later request fails, blocks duplicate submission while pending, and writes to the clipboard only after the user chooses Copy prompt.

## Image Upscaler

Image Upscaler follows the official `image_upscale_z_image_turbo` blueprint: source upload, one-megapixel normalization, Real-ESRGAN 4× enlargement, 0.5 resize, VAE encoding, and five-step Z-Image Turbo refinement. The user controls the refinement prompt, denoise strength, and seed. The source preview remains visible until a refined output replaces it.

## Anime Maker

Anime Maker follows the official `text_to_image_anima_base_1_0` blueprint with Anima Base 1.0, Qwen 3 0.6B Base, Qwen Image VAE, ER-SDE sampling, and a Simple scheduler. It exposes positive and negative prompts, frame controls, steps, CFG, and seed.

## Environment settings

Settings reads and writes only `COMFYUI_URL`, `OLLAMA_URL`, `OLLAMA_MODEL`, `LLM_SYSTEM_PROMPT`, and `UTILITY_ORDER`, as declared in `.env.example`. The sorter normalizes missing, duplicate, or unknown utility identifiers before persistence. Its reset action discards unsaved edits and reloads the last applied values. Model filenames, VAEs, and output prefixes remain owned and documented by their individual utilities. Saving is atomic, applies immediately to the local proxies, navigation, homepage cards, and subsequent generation requests, preserves the value on failure, and never exposes arbitrary process environment variables.
