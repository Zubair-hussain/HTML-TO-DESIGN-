import { NextRequest, NextResponse } from "next/server.js";
import { assertPublicHost, MAX_RESPONSE_BYTES, readLimitedText } from "../../../lib/fetch-safety.ts";
import { extractStylesheetLinks, injectStyles, StyleBlock } from "../../../lib/inline-css.ts";

const MAX_STYLESHEETS = 12;
const CSS_FETCH_TIMEOUT_MS = 8000;

const BROWSER_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 HTML-to-Figma-Design/0.1"
};

/**
 * Best-effort: fetch external stylesheets referenced by the page and inline them
 * as <style> blocks so class-based designs resolve. Every stylesheet URL is run
 * through the same SSRF guard as the page fetch. Failures are swallowed so the
 * primary HTML response is always returned.
 */
async function inlineExternalStylesheets(html: string, pageUrl: string): Promise<string> {
  let links: string[];
  try {
    links = extractStylesheetLinks(html, pageUrl).slice(0, MAX_STYLESHEETS);
  } catch {
    return html;
  }
  if (!links.length) return html;

  const blocks: StyleBlock[] = [];
  for (const link of links) {
    try {
      const parsed = new URL(link);
      if (!["http:", "https:"].includes(parsed.protocol)) continue;
      await assertPublicHost(parsed.hostname);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CSS_FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(parsed.toString(), { headers: BROWSER_HEADERS, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "";
      if (contentType && !contentType.includes("css") && !contentType.includes("text")) continue;

      const css = await readLimitedText(response);
      if (css.trim()) blocks.push({ href: parsed.toString(), css });
    } catch {
      // Skip this stylesheet; keep going.
    }
  }

  return injectStyles(html, blocks);
}

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { url } = body;

  if (!url) {
    return NextResponse.json({ error: "A URL is required." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Please provide a valid URL." }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Only HTTP and HTTPS URLs are supported." }, { status: 400 });
  }

  try {
    await assertPublicHost(parsed.hostname);
  } catch (error) {
    const message = error instanceof Error ? error.message : "This host cannot be fetched.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      next: { revalidate: 0 }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch this URL.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type") || "";
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    return NextResponse.json({ error: `Response is larger than ${MAX_RESPONSE_BYTES} bytes.` }, { status: 413 });
  }

  let text: string;
  try {
    text = await readLimitedText(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Response could not be read.";
    return NextResponse.json({ error: message }, { status: 413 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: `Fetch failed with ${response.status}.`, body: text.slice(0, 400) }, { status: 502 });
  }

  // For HTML pages, inline external stylesheets so class-based designs resolve.
  const isHtml = contentType.includes("html") || /^\s*<(!doctype|html)/i.test(text);
  const responseBody = isHtml ? await inlineExternalStylesheets(text, parsed.toString()) : text;

  return NextResponse.json({
    url: parsed.toString(),
    contentType,
    body: responseBody
  });
}
