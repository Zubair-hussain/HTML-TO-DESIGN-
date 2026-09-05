import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { readFile } from "node:fs/promises";
import { convertHtmlToDesign, figmaPluginSnippet, framerComponentSnippet } from "../lib/design-converter.ts";
import { escapeHtml } from "../lib/html.ts";
import { extractStylesheetLinks, injectStyles } from "../lib/inline-css.ts";
import { isPrivateIp, MAX_RESPONSE_BYTES, readLimitedText } from "../lib/fetch-safety.ts";
import { POST } from "../app/api/fetch-url/route.ts";

const countNodes = (nodes) => nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);

function jsonRequest(body) {
  return {
    json: async () => body
  };
}

function malformedRequest() {
  return {
    json: async () => {
      throw new Error("bad json");
    }
  };
}

async function responseJson(response) {
  return response.json();
}

describe("HTML to design converter", () => {
  it("converts the sample HTML file into stable design nodes and tokens", async () => {
    const html = await readFile("samples/apple-style-landing.html", "utf8");
    const first = convertHtmlToDesign(html, "file");
    const second = convertHtmlToDesign(html, "file");

    assert.equal(first.title, "Apple Style Product Landing");
    assert.equal(countNodes(first.nodes), 12);
    assert.deepEqual(
      first.nodes.map((node) => node.id),
      second.nodes.map((node) => node.id)
    );
    assert.ok(first.tokens.colors.includes("#0071e3"));
    assert.ok(first.tokens.fonts.includes("Arial"));
  });

  it("extracts semantic node types for links, buttons, inputs, images, and text", () => {
    const design = convertHtmlToDesign(
      `<main><a href="/buy">Buy</a><button>Pay</button><input placeholder="Email"><img src="/hero.png"><p>Hello</p></main>`,
      "html"
    );
    const main = design.nodes[0];
    const types = main.children.map((node) => node.type);

    assert.deepEqual(types, ["link", "button", "input", "image", "text"]);
    assert.equal(main.children[0].href, "/buy");
    assert.equal(main.children[2].text, "Email");
    assert.equal(main.children[3].src, "/hero.png");
  });

  it("resolves CSS from <style> blocks and class selectors, not just inline styles", () => {
    const html = `<!doctype html><html><head><style>
      body { color: #222; font-family: 'Poppins'; }
      .hero { background: #0071e3; padding: 40px; border-radius: 16px; }
      .hero h1 { color: #ffffff; font-size: 48px; }
      @media (max-width: 600px) { .hero { padding: 8px; } }
    </style></head><body><section class="hero"><h1>Hi</h1></section></body></html>`;
    const design = convertHtmlToDesign(html, "html");
    const hero = design.nodes[0];
    const h1 = hero.children[0];

    assert.equal(hero.styles["background"], "#0071e3");
    assert.equal(hero.styles["border-radius"], "16px");
    // Mobile-only max-width override must not clobber the desktop padding.
    assert.equal(hero.styles["padding"], "40px");
    // Descendant selector wins over inherited body color; body font-family inherits down.
    assert.equal(h1.styles["color"], "#ffffff");
    assert.equal(h1.styles["font-family"], "'Poppins'");
    assert.ok(design.tokens.colors.includes("#0071e3"));
    assert.ok(design.tokens.fontSizes.includes("48px"));
  });

  it("emits a Framer React component snippet from the design tree", () => {
    const design = convertHtmlToDesign("<main><h1>Framer</h1></main>", "html");
    const snippet = framerComponentSnippet(design);

    assert.match(snippet, /export default function ImportedDesign/);
    assert.match(snippet, /import \* as React/);
    assert.match(snippet, /Framer/);
  });

  it("creates a Figma plugin import snippet with the current design payload", () => {
    const design = convertHtmlToDesign("<h1>Hello Figma</h1>", "html");
    const snippet = figmaPluginSnippet(design);

    assert.match(snippet, /figma\.showUI/);
    assert.match(snippet, /IMPORT_DESIGN/);
    assert.match(snippet, /Hello Figma/);
  });
});

describe("External CSS inlining", () => {
  it("extracts and resolves stylesheet links against a base URL", () => {
    const html = `<html><head>
      <link rel="stylesheet" href="/styles/app.css">
      <link rel="preload stylesheet" href="https://cdn.example.com/theme.css">
      <link rel="icon" href="/favicon.ico">
      <link rel="stylesheet" href="data:text/css,body{}">
      <link rel="stylesheet" href="/styles/app.css">
    </head><body></body></html>`;
    const links = extractStylesheetLinks(html, "https://site.test/page");

    assert.deepEqual(links, [
      "https://site.test/styles/app.css",
      "https://cdn.example.com/theme.css"
    ]);
  });

  it("injects fetched CSS as <style> blocks into <head>", () => {
    const out = injectStyles("<html><head></head><body><p>Hi</p></body></html>", [
      { href: "https://cdn.example.com/theme.css", css: ".x{color:red}" },
      { css: "" }
    ]);

    assert.match(out, /<style data-imported-href="https:\/\/cdn\.example\.com\/theme\.css">/);
    assert.match(out, /\.x\{color:red\}/);
  });
});

describe("HTML escaping", () => {
  it("escapes API payloads before wrapping them in editor HTML", () => {
    assert.equal(
      escapeHtml(`</pre><script>alert("x")</script>&`),
      "&lt;/pre&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;"
    );
  });
});

describe("Fetch safety", () => {
  it("detects private, loopback, metadata, and public IP addresses", () => {
    assert.equal(isPrivateIp("127.0.0.1"), true);
    assert.equal(isPrivateIp("10.0.0.5"), true);
    assert.equal(isPrivateIp("172.16.0.1"), true);
    assert.equal(isPrivateIp("192.168.1.1"), true);
    assert.equal(isPrivateIp("169.254.169.254"), true);
    assert.equal(isPrivateIp("::1"), true);
    assert.equal(isPrivateIp("8.8.8.8"), false);
  });

  it("rejects responses larger than the configured byte limit", async () => {
    const response = new Response("x".repeat(MAX_RESPONSE_BYTES + 1));

    await assert.rejects(readLimitedText(response), /larger/);
  });
});

describe("Fetch URL API route", () => {
  it("returns 400 for malformed JSON bodies", async () => {
    const response = await POST(malformedRequest());

    assert.equal(response.status, 400);
    assert.equal((await responseJson(response)).error, "Request body must be valid JSON.");
  });

  it("returns 400 when the URL is missing, invalid, or unsupported", async () => {
    const missing = await POST(jsonRequest({}));
    const invalid = await POST(jsonRequest({ url: "not a url" }));
    const ftp = await POST(jsonRequest({ url: "ftp://example.com/file" }));

    assert.equal(missing.status, 400);
    assert.equal(invalid.status, 400);
    assert.equal(ftp.status, 400);
  });

  it("blocks local/private URL targets before fetching", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response("should not happen"));
    const response = await POST(jsonRequest({ url: "http://127.0.0.1:3000" }));

    assert.equal(response.status, 400);
    assert.equal(fetchMock.mock.callCount(), 0);
    fetchMock.mock.restore();
  });

  it("fetches a public URL and returns the response body", async () => {
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response("<html><title>Example</title></html>", {
          status: 200,
          headers: { "content-type": "text/html", "content-length": "34" }
        })
    );

    const response = await POST(jsonRequest({ url: "https://example.com" }));
    const body = await responseJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.url, "https://example.com/");
    assert.equal(body.contentType, "text/html");
    assert.match(body.body, /Example/);
    assert.equal(fetchMock.mock.callCount(), 1);
    fetchMock.mock.restore();
  });

  it("returns 413 when content-length is too large", async () => {
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response("too large", {
          status: 200,
          headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) }
        })
    );

    const response = await POST(jsonRequest({ url: "https://example.com" }));

    assert.equal(response.status, 413);
    fetchMock.mock.restore();
  });

  it("returns 502 for upstream HTTP failures", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response("nope", { status: 503 }));
    const response = await POST(jsonRequest({ url: "https://example.com" }));
    const body = await responseJson(response);

    assert.equal(response.status, 502);
    assert.match(body.error, /503/);
    fetchMock.mock.restore();
  });
});

describe("Figma plugin scaffold", () => {
  it("has a manifest, UI, and node-creating plugin code", async () => {
    const manifest = JSON.parse(await readFile("figma-plugin/manifest.json", "utf8"));
    const code = await readFile("figma-plugin/code.js", "utf8");
    const ui = await readFile("figma-plugin/ui.html", "utf8");

    assert.equal(manifest.main, "code.js");
    assert.equal(manifest.ui, "ui.html");
    assert.match(code, /figma\.createFrame/);
    assert.match(code, /figma\.createText/);
    assert.match(ui, /Proceed/);
    assert.match(ui, /Creating design/);
    assert.match(ui, /@keyframes spin/);
    assert.match(ui, /#14ae5c/);
  });
});
