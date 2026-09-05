import { framer } from "framer-plugin";
import { useState } from "react";
import { importDesignToFramer, type FramerLike } from "./import";
import type { DesignDocument } from "./types";

framer.showUI({ position: "top right", width: 340, height: 460 });

export function App() {
  const [json, setJson] = useState("");
  const [status, setStatus] = useState("Paste the exported figma-design.json below.");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const design = JSON.parse(json) as DesignDocument;
      if (!design || !Array.isArray(design.nodes)) {
        throw new Error("That JSON has no `nodes` array.");
      }
      const count = await importDesignToFramer(framer as unknown as FramerLike, design);
      setStatus(`Created ${count} top-level layer${count === 1 ? "" : "s"} on the canvas.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, height: "100%" }}>
      <p style={{ margin: 0, fontSize: 12, color: "#666" }}>{status}</p>
      <textarea
        value={json}
        onChange={(event) => setJson(event.target.value)}
        placeholder='{ "title": "...", "nodes": [ ... ] }'
        spellCheck={false}
        style={{ flex: 1, resize: "none", fontFamily: "monospace", fontSize: 12, padding: 8 }}
      />
      <button onClick={run} disabled={busy || !json.trim()} style={{ padding: "8px 12px", fontWeight: 600 }}>
        {busy ? "Creating…" : "Create Framer layers"}
      </button>
    </main>
  );
}
