import * as cheerio from "cheerio";
import type { Element } from "domhandler";

export type DesignNode = {
  id: string;
  type: "frame" | "text" | "image" | "button" | "input" | "link" | "section";
  name: string;
  text?: string;
  href?: string;
  src?: string;
  /** Effective, cascade-resolved CSS declarations for this element. */
  styles: Record<string, string>;
  children: DesignNode[];
};

export type DesignTokens = {
  colors: string[];
  fonts: string[];
  fontSizes: string[];
  fontWeights: string[];
  radii: string[];
};

export type DesignDocument = {
  title: string;
  sourceType: "html" | "url" | "api" | "file" | "editor";
  createdAt: string;
  tokens: DesignTokens;
  nodes: DesignNode[];
};

const visualTags = new Set([
  "body",
  "main",
  "header",
  "footer",
  "nav",
  "section",
  "article",
  "aside",
  "div",
  "button",
  "a",
  "img",
  "input",
  "textarea",
  "select",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "label",
  "li"
]);

const textTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "label", "li"]);

/** CSS properties that inherit from parent to child by default. */
const INHERITED_PROPS = new Set([
  "color",
  "font",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-transform",
  "text-indent",
  "white-space",
  "visibility",
  "direction",
  "list-style"
]);

/** Split a string on `separator` while ignoring separators nested in (), [], "" or ''. */
function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);

    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

function parseDeclarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of splitTopLevel(body, ";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part
      .slice(idx + 1)
      .replace(/!important/gi, "")
      .trim();
    if (key && value) out[key] = value;
  }
  return out;
}

function inlineStyleToObject(style = "") {
  return parseDeclarations(style);
}

type CssRule = { selector: string; decls: Record<string, string> };

/** Minimal, dependency-free CSS parser. Flattens @media/@supports and skips other at-rules. */
function parseStylesheet(css: string): CssRule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];

  const collect = (text: string) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) break;
      const prelude = text.slice(i, open).trim();

      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth += 1;
        else if (text[j] === "}") depth -= 1;
        j += 1;
      }
      const bodyText = text.slice(open + 1, j - 1);

      if (prelude.startsWith("@")) {
        // Descend into conditional groups; ignore @keyframes/@font-face/@import etc.
        // Skip mobile-only (max-width) media queries so the desktop base layout wins.
        const isMobileOnly = /^@media\b/i.test(prelude) && /max-width/i.test(prelude) && !/min-width/i.test(prelude);
        if (/^@(media|supports|layer|container)\b/i.test(prelude) && !isMobileOnly) collect(bodyText);
      } else if (prelude) {
        const decls = parseDeclarations(bodyText);
        if (Object.keys(decls).length) {
          for (const sel of splitTopLevel(prelude, ",")) {
            const trimmed = sel.trim();
            if (trimmed) rules.push({ selector: trimmed, decls });
          }
        }
      }
      i = j;
    }
  };

  collect(clean);
  return rules;
}

/** Rough CSS specificity: ids*100 + (classes|attrs|pseudo-classes)*10 + (elements|pseudo-elements). */
function specificity(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const elements =
    (selector.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length + (selector.match(/::[\w-]+/g) || []).length;
  return ids * 100 + classes * 10 + elements;
}

type ResolvedEntry = { value: string; spec: number; order: number };

/** Match every stylesheet rule against the document, resolving the cascade per element. */
function buildStyleMap($: cheerio.CheerioAPI, rules: CssRule[]): Map<Element, Record<string, string>> {
  const staged = new Map<Element, Record<string, ResolvedEntry>>();

  rules.forEach((rule, order) => {
    const spec = specificity(rule.selector);
    let matched: cheerio.Cheerio<Element>;
    try {
      matched = $(rule.selector) as cheerio.Cheerio<Element>;
    } catch {
      return; // Unsupported selector (e.g. ::before) — skip gracefully.
    }
    matched.each((_, element) => {
      if (!element || typeof (element as Element).tagName !== "string") return;
      let entry = staged.get(element as Element);
      if (!entry) {
        entry = {};
        staged.set(element as Element, entry);
      }
      for (const [prop, value] of Object.entries(rule.decls)) {
        const existing = entry[prop];
        if (!existing || spec > existing.spec || (spec === existing.spec && order >= existing.order)) {
          entry[prop] = { value, spec, order };
        }
      }
    });
  });

  const flattened = new Map<Element, Record<string, string>>();
  for (const [element, entry] of staged) {
    const decls: Record<string, string> = {};
    for (const [prop, resolved] of Object.entries(entry)) decls[prop] = resolved.value;
    flattened.set(element, decls);
  }
  return flattened;
}

function nodeType(tag: string): DesignNode["type"] {
  if (tag === "img") return "image";
  if (tag === "button") return "button";
  if (tag === "input" || tag === "textarea" || tag === "select") return "input";
  if (tag === "a") return "link";
  if (textTags.has(tag)) return "text";
  if (["section", "article", "main", "header", "footer", "nav", "aside"].includes(tag)) return "section";
  return "frame";
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function readableName(tag: string, text: string, index: number) {
  const label = compactText(text).slice(0, 32);
  return label ? `${tag.toUpperCase()} - ${label}` : `${tag.toUpperCase()} ${index + 1}`;
}

function pickInherited(styles: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [prop, value] of Object.entries(styles)) {
    if (INHERITED_PROPS.has(prop)) out[prop] = value;
  }
  return out;
}

type ConvertContext = {
  $: cheerio.CheerioAPI;
  styleMap: Map<Element, Record<string, string>>;
};

function convertElement(
  ctx: ConvertContext,
  element: Element,
  index: number,
  path: string,
  inherited: Record<string, string>
): DesignNode | null {
  const tag = element.tagName?.toLowerCase();
  if (!tag || !visualTags.has(tag)) return null;

  const { $, styleMap } = ctx;
  const $element = $(element);

  // Effective style = inherited props < class/id rules < inline style.
  const ruleStyles = styleMap.get(element) || {};
  const inlineStyles = inlineStyleToObject($element.attr("style"));
  const effective: Record<string, string> = { ...inherited, ...ruleStyles, ...inlineStyles };

  const nextInherited = pickInherited(effective);

  const children: DesignNode[] = [];
  $element.children().each((childIndex, child) => {
    const converted = convertElement(ctx, child as Element, childIndex, `${path}-${childIndex}`, nextInherited);
    if (converted) children.push(converted);
  });

  const directText = compactText(
    $element
      .contents()
      .filter((_, child) => child.type === "text")
      .text()
  );

  if (!children.length && !directText && tag !== "img" && tag !== "input") return null;

  return {
    id: `${tag}-${path}`,
    type: nodeType(tag),
    name: readableName(tag, directText || $element.attr("aria-label") || "", index),
    text: directText || $element.attr("placeholder") || undefined,
    href: tag === "a" ? $element.attr("href") : undefined,
    src: tag === "img" ? $element.attr("src") : undefined,
    styles: effective,
    children
  };
}

const COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}){1,2}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g;

function addColorsFrom(value: string | undefined, sink: Set<string>) {
  if (!value) return;
  for (const match of value.matchAll(COLOR_REGEX)) sink.add(match[0].trim());
}

function primaryFont(value: string): string {
  const first = splitTopLevel(value, ",")[0] || value;
  return first.replace(/["']/g, "").trim();
}

function collectTokens($: cheerio.CheerioAPI, html: string, nodes: DesignNode[]): DesignTokens {
  const colors = new Set<string>();
  const fonts = new Set<string>();
  const fontSizes = new Set<string>();
  const fontWeights = new Set<string>();
  const radii = new Set<string>();

  // Raw sweep keeps backwards-compatible coverage of colors/fonts anywhere in the source.
  for (const match of html.matchAll(COLOR_REGEX)) colors.add(match[0].trim());
  for (const match of html.matchAll(/font-family\s*:\s*([^;"}']+)/gi)) fonts.add(primaryFont(match[1]));

  const walk = (list: DesignNode[]) => {
    for (const node of list) {
      const s = node.styles;
      addColorsFrom(s.color, colors);
      addColorsFrom(s["background-color"], colors);
      addColorsFrom(s.background, colors);
      addColorsFrom(s["border-color"], colors);
      addColorsFrom(s.border, colors);
      addColorsFrom(s.fill, colors);
      if (s["font-family"]) fonts.add(primaryFont(s["font-family"]));
      if (s["font-size"]) fontSizes.add(s["font-size"].trim());
      if (s["font-weight"]) fontWeights.add(s["font-weight"].trim());
      if (s["border-radius"]) radii.add(s["border-radius"].trim());
      walk(node.children);
    }
  };
  walk(nodes);

  return {
    colors: Array.from(colors).slice(0, 48),
    fonts: Array.from(fonts).filter(Boolean).slice(0, 24),
    fontSizes: Array.from(fontSizes).slice(0, 24),
    fontWeights: Array.from(fontWeights).slice(0, 12),
    radii: Array.from(radii).slice(0, 12)
  };
}

export function convertHtmlToDesign(html: string, sourceType: DesignDocument["sourceType"]): DesignDocument {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || $("h1").first().text().trim() || "Untitled import";

  // Parse every <style> block, then resolve the cascade for the whole document.
  const rules: CssRule[] = [];
  $("style").each((_, element) => {
    rules.push(...parseStylesheet($(element).text()));
  });
  const styleMap = buildStyleMap($, rules);
  const ctx: ConvertContext = { $, styleMap };

  // Seed inheritance from <body>'s effective style so page-wide defaults reach every node.
  const bodyElement = $("body").get(0) as Element | undefined;
  const bodyStyles = bodyElement
    ? { ...(styleMap.get(bodyElement) || {}), ...inlineStyleToObject($(bodyElement).attr("style")) }
    : {};
  const rootInherited = pickInherited(bodyStyles);

  const roots: DesignNode[] = [];
  const rootElements = $("body").children().length ? $("body").children() : $.root().children();
  rootElements.each((index, element) => {
    const converted = convertElement(ctx, element as Element, index, `${index}`, rootInherited);
    if (converted) roots.push(converted);
  });

  return {
    title,
    sourceType,
    createdAt: new Date().toISOString(),
    tokens: collectTokens($, html, roots),
    nodes: roots
  };
}

export function figmaPluginSnippet(document: DesignDocument) {
  return `const importedDesign = ${JSON.stringify(document, null, 2)};

figma.showUI(__html__, { width: 420, height: 620 });
figma.ui.postMessage({ type: "IMPORT_DESIGN", payload: importedDesign });
`;
}

/**
 * Framer target: emit a self-contained React/TSX component that renders the resolved
 * design tree with real styles. Drop it into Framer as a code component (Assets → Code → New)
 * or use it as a live preview anywhere React runs.
 */
export function framerComponentSnippet(document: DesignDocument): string {
  const componentName = "ImportedDesign";
  const tree = JSON.stringify(document.nodes, null, 2);
  return `// Auto-generated by Figma/Framer Import Studio
// Framer: Assets panel -> Code -> New Code File -> paste this. It appears as an insertable component.
import * as React from "react";

type DesignNode = {
  id: string;
  type: "frame" | "text" | "image" | "button" | "input" | "link" | "section";
  name: string;
  text?: string;
  href?: string;
  src?: string;
  styles: Record<string, string>;
  children: DesignNode[];
};

const NODES: DesignNode[] = ${tree};

function toReactStyle(styles: Record<string, string>): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const [prop, value] of Object.entries(styles || {})) {
    const camel = prop.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
    out[camel] = value;
  }
  return out as React.CSSProperties;
}

function RenderNode({ node }: { node: DesignNode }) {
  const style = toReactStyle(node.styles);
  if (node.type === "image") {
    return <img src={node.src || ""} alt={node.name} style={{ display: "block", ...style }} />;
  }
  if (node.type === "link") {
    return (
      <a href={node.href || "#"} style={style}>
        {node.text}
        {node.children.map((child) => (
          <RenderNode key={child.id} node={child} />
        ))}
      </a>
    );
  }
  if (node.type === "button") {
    return <button style={style}>{node.text || node.name}</button>;
  }
  if (node.type === "input") {
    return <input placeholder={node.text || ""} style={style} readOnly />;
  }
  if (node.type === "text") {
    return (
      <div style={style}>
        {node.text}
        {node.children.map((child) => (
          <RenderNode key={child.id} node={child} />
        ))}
      </div>
    );
  }
  return (
    <div style={style}>
      {node.text}
      {node.children.map((child) => (
        <RenderNode key={child.id} node={child} />
      ))}
    </div>
  );
}

export default function ${componentName}() {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {NODES.map((node) => (
        <RenderNode key={node.id} node={node} />
      ))}
    </div>
  );
}
`;
}
