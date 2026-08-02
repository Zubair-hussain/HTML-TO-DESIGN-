import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { readFile } from "node:fs/promises";
import { convertHtmlToDesign, figmaPluginSnippet } from "../lib/design-converter.ts";
import { escapeHtml } from "../lib/html.ts";
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

  it("creates a Figma plugin import snippet with the current design payload", () => {
    const design = convertHtmlToDesign("<h1>Hello Figma</h1>", "html");
    const snippet = figmaPluginSnippet(design);

    assert.match(snippet, /figma\.showUI/);
    assert.match(snippet, /IMPORT_DESIGN/);
    assert.match(snippet, /Hello Figma/);
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
