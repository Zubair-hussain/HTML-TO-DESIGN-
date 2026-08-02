import * as cheerio from "cheerio";
import type { Element } from "domhandler";

export type DesignNode = {
  id: string;
  type: "frame" | "text" | "image" | "button" | "input" | "link" | "section";
  name: string;
  text?: string;
  href?: string;
  src?: string;
  styles: Record<string, string>;
  children: DesignNode[];
};

export type DesignDocument = {
  title: string;
  sourceType: "html" | "url" | "api" | "file" | "editor";
  createdAt: string;
  tokens: {
    colors: string[];
    fonts: string[];
  };
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

function inlineStyleToObject(style = "") {
  return style
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const [rawKey, ...rawValue] = part.split(":");
      const key = rawKey?.trim();
      const value = rawValue.join(":").trim();
      if (key && value) acc[key] = value;
      return acc;
    }, {});
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

function collectTokens($: cheerio.CheerioAPI, html: string) {
  const colors = new Set<string>();
  const fonts = new Set<string>();
  const colorRegex = /#(?:[0-9a-fA-F]{3}){1,2}|rgba?\([^)]+\)|hsla?\([^)]+\)/g;
  const fontRegex = /font-family\s*:\s*([^;"']+)/gi;

  for (const match of html.matchAll(colorRegex)) colors.add(match[0]);
  for (const match of html.matchAll(fontRegex)) fonts.add(match[1].trim());

  $("[style]").each((_, element) => {
    const styles = inlineStyleToObject($(element).attr("style"));
    if (styles.color) colors.add(styles.color);
    if (styles["background-color"]) colors.add(styles["background-color"]);
    if (styles["font-family"]) fonts.add(styles["font-family"]);
  });

  return {
    colors: Array.from(colors).slice(0, 24),
    fonts: Array.from(fonts).slice(0, 12)
  };
}

function convertElement($: cheerio.CheerioAPI, element: Element, index: number, path: string): DesignNode | null {
  const tag = element.tagName?.toLowerCase();
  if (!tag || !visualTags.has(tag)) return null;

  const $element = $(element);
  const children: DesignNode[] = [];
  $element.children().each((childIndex, child) => {
    const converted = convertElement($, child, childIndex, `${path}-${childIndex}`);
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
    styles: inlineStyleToObject($element.attr("style")),
    children
  };
}

export function convertHtmlToDesign(html: string, sourceType: DesignDocument["sourceType"]): DesignDocument {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || $("h1").first().text().trim() || "Untitled import";
  const roots: DesignNode[] = [];
  const rootElements = $("body").children().length ? $("body").children() : $.root().children();

  rootElements.each((index, element) => {
    const converted = convertElement($, element, index, `${index}`);
    if (converted) roots.push(converted);
  });

  return {
    title,
    sourceType,
    createdAt: new Date().toISOString(),
    tokens: collectTokens($, html),
    nodes: roots
  };
}

export function figmaPluginSnippet(document: DesignDocument) {
  return `const importedDesign = ${JSON.stringify(document, null, 2)};

figma.showUI(__html__, { width: 420, height: 620 });
figma.ui.postMessage({ type: "IMPORT_DESIGN", payload: importedDesign });
`;
}
