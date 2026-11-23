---
name: pixellab-sprites
description: Use when the user wants sprites, characters, enemies, objects, VFX, tiles or UI art generated for SoulsGate with PixelLab (pixel-art AI). Covers the PixelLab MCP server and the `tools/pixellab.mjs` REST client, token setup, credit safety and where to put the results in the repo.
---

# PixelLab sprites for SoulsGate

Two ways to call PixelLab; both use the same API token.

1. **MCP server** `pixellab` (configured in `.mcp.json`, URL `https://api.pixellab.ai/mcp`). Prefer it inside Claude Code when its tools are loaded: tools are agent-friendly and documented at https://api.pixellab.ai/mcp/docs.
2. **REST client** `node tools/pixellab.mjs …` (no dependencies). Use it when MCP tools are not available or for scripted runs. Run it with no args for help.

```bash
node tools/pixellab.mjs balance                                   # check credits first
node tools/pixellab.mjs image "dark knight, souls-like, glowing blue eyes" --size 64x64 --view "low top-down" --direction south --name knight
node tools/pixellab.mjs pro "rock beetle enemy, stone shell" --size 64x64 --name rockbeetle
node tools/pixellab.mjs character "hooded mage apostle" --size 64x64 --dirs 8 --name apostle   # 8-direction ZIP
node tools/pixellab.mjs object "black sun relic orb" --px 48 --name blacksun-orb
node tools/pixellab.mjs raw GET /characters                       # any other endpoint
```

Parameters and enums: take them from https://api.pixellab.ai/v2/openapi.json, never guess. Useful enums:
- `view`: `side`, `low top-down`, `high top-down` (objects: `top-down`, `sidescroller`)
- `direction`: `north` … `north-west` (8)
- `outline`: `single color black outline`, `single color outline`, `selective outline`, `lineless`
- `shading`: `flat shading` … `highly detailed shading`; `detail`: `low detail`, `medium detail`, `highly detailed`

## Token

- Cloud sessions: the token is a network secret for host `api.pixellab.ai` on the **SoulsGate** environment; the proxy injects it, nothing to set locally.
- Local: `export PIXELLAB_API_KEY=...` (from https://www.pixellab.ai/account). Never commit the token or paste it in chat.
- HTTP 401 = token missing/invalid, 402 = out of credits, 429 = too many concurrent jobs.

## Rules

- Every generation spends credits. Run `balance` and ask the user before batches (more than ~3 calls) or Pro/character/animation jobs.
- Generate one sample first, show it to the user (Read the PNG), iterate on the prompt, then batch.
- Save to `assets/sprites/<category>/` (e.g. `enemies/`, `hero/`, `fx/`, `ui/`). Use lowercase kebab-case names matching the game system (`rockbeetle`, `apostle`, `black-sun`).
- Keep one style across the game: reuse the same `view`, `outline`, `shading`, `detail` and size; for consistency pass an existing sprite as a style/reference image (Pro endpoints) or fix a `seed`.
- Preview: `tools/pixellab.mjs` rebuilds `assets/sprites/manifest.json` and unzips character/object ZIPs; the web viewer at `/sprites/` shows everything (animations from `name-N.png` frames). After adding files by hand run `node tools/sprites-manifest.mjs`.
- The game currently draws most entities procedurally on canvas (`render_*.js`). Wiring a sprite in means loading it as an `Image` once at startup and drawing it with `ctx.imageSmoothingEnabled = false` so pixels stay crisp.
