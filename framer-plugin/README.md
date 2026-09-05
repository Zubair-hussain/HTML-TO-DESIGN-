# HTML to Design — Framer Plugin

A native Framer plugin that builds real Framer canvas layers from a design
document exported by the studio (`figma-design.json`). It is the Framer
counterpart to the Figma plugin in `../figma-plugin`.

## Two ways to get a design into Framer

| Path | File | Best for |
| --- | --- | --- |
| **Code component** (no build) | `FramerImportedDesign.tsx` from the app's **Framer** export button | Fastest, most style-faithful — paste into Assets → Code |
| **Native plugin** (this folder) | builds real Frame/Text layers | Editable native layers on the canvas |

## Run this plugin

Framer plugins are Vite + React apps. The dependencies here are standard; if
anything drifts from Framer's current template, regenerate the scaffold with
`npm create framer-plugin@latest` and drop in `src/import.ts` + `src/App.tsx`.

```bash
cd framer-plugin
npm install
npm run dev
```

Then in Framer desktop: **Plugins → Develop → Open Development Plugin** and point
it at the running dev server. Paste the exported `figma-design.json` into the
plugin panel and click **Create Framer layers**.

## How it works

`src/import.ts` walks the design tree and calls the documented Framer API:

- [`framer.createFrameNode(attributes, parentId?)`](https://www.framer.com/developers/reference/plugins-create-frame-node)
  for containers (background color, border radius, width/height, nesting).
- [`framer.addText(text, options?)`](https://www.framer.com/developers/reference/plugins-add-text)
  for text and link nodes.

Both calls are wrapped defensively: `createFrameNode` retries with a smaller
attribute set if a value type isn't accepted by the installed Framer version,
and `addText` falls back to a parent-less call if `AddTextOptions` differs. This
keeps the import from hard-failing across API versions.

### Known limitation

Framer's public plugin API exposes fewer style attributes than Figma's, so the
native plugin reproduces structure, backgrounds, radii, and text — but not every
typographic detail. For the most style-accurate result, use the **code
component** export instead.

> Replace the `id` in `framer.json` with the id Framer assigns when you register
> the plugin.
