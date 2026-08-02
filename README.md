# Figma Import Studio

Next.js app for converting HTML, website URLs, API responses, uploaded files, and editor drafts into a Figma-ready design document.

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

- `figma-design.json`: structured design document with nodes, text, links, images, inline styles, colors, and fonts.
- `figma-plugin-import.js`: starter bridge snippet for a Figma plugin UI.

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
