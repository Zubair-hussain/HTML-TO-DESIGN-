# Figma & Framer Import Studio

Next.js app for converting HTML, website URLs, API responses, uploaded files, and editor drafts into a design document you can import into **Figma** or **Framer**.

## How styles are resolved

The converter resolves the full CSS cascade, not just inline `style=""` attributes:

1. Every `<style>` block is parsed (dependency-free) into selector rules.
2. Rules are matched against the DOM (via cheerio) and merged per element by CSS specificity and source order.
3. Inheritable properties (color, font, text-align, …) flow from `<body>` down to every node.
4. Inline `style=""` wins last, exactly like the browser cascade.

Result: real backgrounds, colors, fonts, weights, spacing, radii, and flex direction land on each node — instead of the empty styling that produced boilerplate before. Mobile-only (`max-width`) media queries are skipped so the desktop base layout is imported.

For **URL imports**, external stylesheets (`<link rel="stylesheet">`) are fetched and inlined before conversion — each through the same SSRF guard as the page fetch (public-host check, size/time limits). For heavily scripted sites, paste the rendered HTML.

## Premium tokens

The sidebar includes a **Premium palettes** and **Font pairings** library (see `lib/premium-tokens.ts`). Click a palette to copy its colors, or a font pairing to copy its Google Fonts `<link>`. The preview pane also shows the design's own extracted tokens (colors, fonts, sizes, weights, radii) as clickable swatches.

## Targets

- **Figma** — see `figma-plugin/` and the JSON/Figma exports below.
- **Framer** — two paths: the `FramerImportedDesign.tsx` **code component** export (no build, most style-faithful) and the native **`framer-plugin/`** (builds real canvas layers). See `framer-plugin/README.md`.

## CI/CD & security

GitHub Actions in `.github/workflows/`:

- `ci.yml` — lint, typecheck, test, and build on Node 20 & 22; plus a Conventional-Commits check on PRs.
- `codeql.yml` — CodeQL security + quality scanning (push, PR, weekly).
- `security.yml` — `npm audit` (high+) and dependency-review on PRs.
- `release.yml` — on a successful production **deployment** (`deployment_status`), re-runs the full gate and cuts a GitHub Release with generated notes.
- `.github/dependabot.yml` — weekly npm and GitHub-Actions updates.

## Run Locally

```bash
npm install
npm run dev -- --port 3000
```

Open `http://localhost:3000`.

## Test Inputs

- Paste HTML into the source editor.
- Enter `https://www.apple.com/` in Website URL and click fetch.
- Upload `samples/apple-style-landing.html`.
- Enter an API endpoint and click fetch. JSON responses are wrapped in a `<pre>` block so they can still become design nodes.

## Exports

- `figma-design.json`: structured design document with nodes, text, links, images, resolved styles, colors, fonts, sizes, weights, and radii.
- `figma-plugin-import.js`: bridge snippet that posts the design into the Figma plugin UI.
- `FramerImportedDesign.tsx`: a self-contained React component rendering the design with real styles. In Framer, open **Assets → Code → New Code File** and paste it; it becomes an insertable component. Works as a live React preview anywhere too.

## Load The Figma Plugin

1. Open Figma desktop.
2. Go to `Plugins > Development > Import plugin from manifest`.
3. Select `figma-plugin/manifest.json`.
4. Run `HTML to Figma Design Importer`.
5. Paste the exported `figma-design.json` into the plugin UI and click `Create Figma Nodes`.

The plugin creates real Figma frames and text layers from the exported design tree. Image nodes are imported as labeled placeholder frames because arbitrary remote image fetching needs extra plugin-side handling.

## Deploy To Vercel

```bash
npm install
npm run build
npx vercel
```

For production:

```bash
npx vercel --prod
```

## Deploy With Docker

```bash
docker build -t figma-import-studio .
docker run -p 3000:3000 figma-import-studio
```

## Notes

Some websites block server-side fetching or serve heavily scripted pages. In those cases, paste page HTML manually or upload an exported HTML file.
