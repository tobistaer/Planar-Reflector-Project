# Planar Reflector Project (02561 Computer Graphics)

This repo implements a planar reflector (mirror-like ground plane) using a real-time rasterization pipeline in **WebGPU**/**WGSL**. The final result combines:
- Shadow mapping (light-space depth map)
- A planar reflection pass (mirrored geometry)
- Stencil masking to restrict the reflection to the ground quad
- Oblique near-plane clipping (Part 4) to remove “submerged” reflected geometry

The project is split into four incremental parts (`part_1` → `part_4`) matching the assignment stages.

## How to run

WebGPU resources are loaded via `fetch()`, so you must serve the folder over HTTP (not `file://`).

1. Start a local web server in the repo root:
   - `python -m http.server 8000`
2. Open one of the parts in a WebGPU-enabled browser (Chrome/Edge):
   - Part 1: `http://localhost:8000/part_1/prp01.html`
   - Part 2: `http://localhost:8000/part_2/prp02.html`
   - Part 3: `http://localhost:8000/part_3/prp03.html`
   - Part 4: `http://localhost:8000/part_4/prp04.html`

### Controls
- UI buttons toggle animation/light/shadow debug (varies slightly by part).
- Part 4: press `O` to toggle oblique near-plane clipping on/off (default: on).

## Folder structure

- `part_1/` — Mirrored teapot (baseline reflection) + shadow mapping.
- `part_2/` — Adds the textured ground plane and blends it so the reflection appears “in” the surface.
- `part_3/` — Uses the stencil buffer to clip the reflection to the ground quad.
- `part_4/` — Adds oblique near-plane clipping for submerged geometry and clears depth after the reflection pass; includes a shadow-map debug view and a small PCF filter.
- `models/` — Teapot model (`teapot.obj`, `teapot.mtl`).
- `reading material/` — Provided reference PDFs.
- `OBJParser.js` — Minimal OBJ loader used by the parts.
- `xamp23.png` — Ground texture (from the earlier worksheet).
- `Project Description Planar Reflector.pdf` — Assignment specification.
