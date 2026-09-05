import * as cheerio from "cheerio";

export type StyleBlock = { href?: string; css: string };

/**
 * Collect the URLs of external stylesheets (`<link rel="stylesheet" href>`) in an
 * HTML document, resolved against `baseUrl` when provided. `data:` URLs and empty
 * hrefs are skipped, and the result is de-duplicated preserving order.
 */
export function extractStylesheetLinks(html: string, baseUrl?: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const links: string[] = [];

  $("link").each((_, element) => {
    const rel = ($(element).attr("rel") || "").toLowerCase();
    if (!rel.split(/\s+/).includes("stylesheet")) return;
    const href = $(element).attr("href");
    if (!href) return;
    if (/^data:/i.test(href.trim())) return;

    let resolved = href.trim();
    if (baseUrl) {
      try {
        resolved = new URL(href, baseUrl).toString();
      } catch {
        return; // Unresolvable relative URL — skip.
      }
    }
    if (!seen.has(resolved)) {
      seen.add(resolved);
      links.push(resolved);
    }
  });

  return links;
}

/**
 * Inject fetched CSS back into the document as `<style>` blocks so the design
 * converter (which reads `<style>`) can resolve them. Blocks are appended to
 * `<head>` when present, otherwise prepended to `<body>`, otherwise to the top.
 * Existing markup is left untouched.
 */
export function injectStyles(html: string, blocks: StyleBlock[]): string {
  const usable = blocks.filter((block) => block.css && block.css.trim());
  if (!usable.length) return html;

  const $ = cheerio.load(html);
  const styleTags = usable
    .map((block) => {
      const attr = block.href ? ` data-imported-href="${block.href.replace(/"/g, "&quot;")}"` : "";
      return `<style${attr}>\n${block.css}\n</style>`;
    })
    .join("\n");

  const head = $("head");
  if (head.length) {
    head.append(styleTags);
  } else {
    const body = $("body");
    if (body.length) body.prepend(styleTags);
    else $.root().prepend(styleTags);
  }

  return $.html();
}
