"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { Braces, Download, FileJson, Globe, Layers3, PlugZap, Send, Upload } from "lucide-react";
import { convertHtmlToDesign, DesignDocument, DesignNode, figmaPluginSnippet } from "@/lib/design-converter";
import { escapeHtml } from "@/lib/html";

const sampleHtml = `<main style="font-family: Inter; color: #17202a; background: #f7f4ef;">
  <section style="padding: 48px; background-color: #fff;">
    <h1 style="font-size: 48px; color: #0f766e;">Launch analytics dashboard</h1>
    <p>Track active users, conversion, and revenue across every product surface.</p>
    <button style="background-color: #111827; color: white; padding: 14px 22px;">Create Figma draft</button>
  </section>
  <section style="padding: 32px;">
    <article><h2>Revenue</h2><p>$84.2k this month</p></article>
    <article><h2>Activation</h2><p>42% trial to paid conversion</p></article>
  </section>
</main>`;

function countNodes(nodes: DesignNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

function TreeNode({ node, depth = 0 }: { node: DesignNode; depth?: number }) {
  return (
    <div className="tree-node" style={{ paddingLeft: depth * 14 }}>
      <div className="tree-row">
        <span className={`node-type ${node.type}`}>{node.type}</span>
        <span>{node.name}</span>
      </div>
      {node.children.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function Home() {
  const [sourceType, setSourceType] = useState<DesignDocument["sourceType"]>("html");
  const [html, setHtml] = useState(sampleHtml);
  const [url, setUrl] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [mcpEndpoint, setMcpEndpoint] = useState(
    process.env.NEXT_PUBLIC_DEFAULT_MCP_ENDPOINT || "http://localhost:3333/mcp/import-design"
  );
  const [status, setStatus] = useState("Ready");

  const design = useMemo(() => convertHtmlToDesign(html, sourceType), [html, sourceType]);
  const exportJson = useMemo(() => JSON.stringify(design, null, 2), [design]);
  const pluginCode = useMemo(() => figmaPluginSnippet(design), [design]);

  async function fetchRemote(kind: "url" | "api") {
    const target = kind === "url" ? url : apiUrl;
    setStatus(`Fetching ${kind === "url" ? "website" : "API"}...`);
    const response = await fetch("/api/fetch-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: target })
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || "Fetch failed");
      return;
    }
    setSourceType(kind);
    setHtml(payload.contentType.includes("json") ? `<pre>${escapeHtml(payload.body)}</pre>` : payload.body);
    setStatus(`Imported ${payload.url}`);
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSourceType("file");
    setHtml(await file.text());
    setStatus(`Loaded ${file.name}`);
  }

  function download(name: string, content: string, type = "application/json") {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Layers3 size={28} />
          <div>
            <strong>Figma Import Studio</strong>
            <span>HTML, URL, API, file, editor, MCP</span>
          </div>
        </div>

        <div className="metric-grid">
          <div><strong>{countNodes(design.nodes)}</strong><span>Nodes</span></div>
          <div><strong>{design.tokens.colors.length}</strong><span>Colors</span></div>
          <div><strong>{design.tokens.fonts.length}</strong><span>Fonts</span></div>
        </div>

        <label className="field-label">Website URL</label>
        <div className="input-row">
          <Globe size={18} />
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" />
          <button title="Fetch website" onClick={() => fetchRemote("url")}><Send size={17} /></button>
        </div>

        <label className="field-label">API Endpoint</label>
        <div className="input-row">
          <Braces size={18} />
          <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} placeholder="https://api.site.com/page" />
          <button title="Fetch API" onClick={() => fetchRemote("api")}><Send size={17} /></button>
        </div>

        <label className="file-button">
          <Upload size={18} />
          <span>Upload HTML file</span>
          <input type="file" accept=".html,.htm,.txt,.json" onChange={onFileChange} />
        </label>

        <div className="mcp-panel">
          <div className="panel-title"><PlugZap size={18} /> MCP bridge</div>
          <input value={mcpEndpoint} onChange={(event) => setMcpEndpoint(event.target.value)} />
          <button onClick={() => setStatus(`Prepared MCP payload for ${mcpEndpoint}`)}>Prepare payload</button>
        </div>

        <div className="deploy-panel">
          <strong>Deploy options</strong>
          <code>npm run build</code>
          <code>npx vercel --prod</code>
          <code>docker build -t figma-import-studio .</code>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{design.title}</h1>
            <p>{status}</p>
          </div>
          <div className="actions">
            <button onClick={() => download("figma-design.json", exportJson)}><Download size={18} /> JSON</button>
            <button onClick={() => download("figma-plugin-import.js", pluginCode, "text/javascript")}><FileJson size={18} /> Plugin</button>
          </div>
        </header>

        <div className="content-grid">
          <section className="editor-pane">
            <div className="pane-head">
              <strong>Source editor</strong>
              <select value={sourceType} onChange={(event) => setSourceType(event.target.value as DesignDocument["sourceType"])}>
                <option value="html">HTML</option>
                <option value="url">Website URL</option>
                <option value="api">API</option>
                <option value="file">File</option>
                <option value="editor">Editor</option>
              </select>
            </div>
            <textarea value={html} onChange={(event) => { setSourceType("editor"); setHtml(event.target.value); }} spellCheck={false} />
          </section>

          <section className="preview-pane">
            <div className="pane-head"><strong>Design tree</strong><span>{design.sourceType}</span></div>
            <div className="tree">
              {design.nodes.map((node) => <TreeNode key={node.id} node={node} />)}
            </div>
          </section>

          <section className="json-pane">
            <div className="pane-head"><strong>Figma-ready export</strong><span>JSON</span></div>
            <pre>{exportJson}</pre>
          </section>
        </div>
      </section>
    </main>
  );
}
