---
version: alpha
colors:
  ink: "#3b2a22"
  paper: "#faf9f7"
  panel: "#eee7e2"
  muted: "#77665c"
  signal: "#8b5e3c"
  line: "#d8cec8"
typography:
  display:
    fontFamily: "Georgia, Times New Roman, serif"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
  utility:
    fontFamily: "Consolas, Monaco, monospace"
rounded:
  control: "6px"
  panel: "12px"
spacing:
  unit: "8px"
components:
  button:
    radius: "6px"
  panel:
    radius: "12px"
---

## Overview

Local Workshop is a quiet suite of local creative utilities. Darkroom borrows from enlarger controls and contact sheets; Print Studio borrows from ink mixing and screen-print pulls; Prompt Builder treats a rough idea like an editor’s marked-up brief; Image Upscaler behaves like a restoration bench; Anime Maker echoes a clean animation drawing desk. Every utility remains functional, tactile, and restrained. Generated images and finished prompt copy are the focal points. Avoid glossy AI gradients, glass panels, and decorative dashboards.

## Colors

The canonical palette is intentionally minimal: soft paper white `#faf9f7` is the application canvas, true white is reserved for raised cards and fields, deep coffee `#3b2a22` anchors navigation and primary structure, medium coffee `#8b5e3c` carries every interactive accent, and pale coffee tints `#eee7e2` and `#d8cec8` provide panels and borders. Muted copy uses `#77665c`. No utility introduces an independent theme color; sliders, focus, active states, and primary hover behavior use the same medium coffee.

## Typography

Georgia gives the title a workshop-journal character; Arial keeps controls direct; Consolas is reserved for machine state, seeds, and measurements. The application uses a 17px root size, with compact labels raised by roughly one pixel from the original scale.

## Layout

A persistent 240px utility rail owns cross-tool navigation on wide desktops so every utility name remains on one line; it collapses to its icon treatment before workspace content becomes cramped. Every destination starts at the top of its content column. On desktop, the opening prompt section spans the full workspace width; beneath it, image utilities use two equal columns capped at 560px each and centered as one balanced composition. Prompt Builder keeps its action block in the left half, then gives the generated prompt the full two-column reading width below. The complete form stacks in source order on narrow screens. Preview height is derived only from the selected aspect ratio; it must not be clamped by minimum or maximum heights. Image stages remain in natural document flow and reserve the selected aspect ratio during every async state.

Home uses tall 2:3 job-ticket cards as the workshop directory, arranged three across when desktop space permits and two or one across as space narrows. Every card shares the same paper and pale-coffee treatment; utility identity comes from its icon and writing, never a one-off theme color. Cards do not display sequence numbers because their order is user-configurable, and they do not display model names because runtime configuration may change independently. Each combines a restrained specimen area, a stable capability line, a concrete description, and one navigation action. Settings stays in the rail because it configures the workshop rather than producing an artifact.

## Elevation & Depth

Use borders and tonal separation, not shadows. The product should feel physically printed rather than floating.

## Shapes

Small radii only. Controls feel machined; the image aperture is nearly square.

## Components

Controls expose visible labels and values. Ratio presets resemble camera backs, and model readiness is expressed as a role-by-role pipeline. Every working utility exposes one consistent reset action, disabled while that utility is busy. The generate button retains its dimensions while busy. Readiness occupies a reserved live region directly beneath the relevant generate/build action, keeping the header focused on page identity and reset.

## Do's and Don'ts

Do keep technical details understandable and compact. Do reserve space before imagery arrives. Don't hide failure recovery, rely on color alone, or introduce decorative motion.
