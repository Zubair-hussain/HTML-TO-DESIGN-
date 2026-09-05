figma.showUI(__html__, { width: 420, height: 620 });

const PAGE_WIDTH = 1024;
const GAP = 20;

// ---------- Color parsing (hex, rgb/rgba, hsl/hsla, named) ----------

const NAMED_COLORS = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  navy: "#000080",
  teal: "#008080",
  orange: "#ffa500",
  purple: "#800080",
  yellow: "#ffff00",
  transparent: "rgba(0,0,0,0)"
};

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function hexToColor(hex) {
  let value = hex.replace("#", "").trim();
  if (value.length === 3 || value.length === 4) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const a = value.length >= 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1;
  if ([r, g, b].some(Number.isNaN)) return null;
  return { color: { r: r / 255, g: g / 255, b: b / 255 }, opacity: a };
}

function hslToColor(h, s, l, a) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { color: { r: clamp01(r + m), g: clamp01(g + m), b: clamp01(b + m) }, opacity: a };
}

function parseColor(raw) {
  if (!raw) return null;
  let value = String(raw).trim().toLowerCase();
  if (NAMED_COLORS[value]) value = NAMED_COLORS[value];

  if (value.startsWith("#")) return hexToColor(value);

  const rgbMatch = value.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(/[,/]/).map((p) => p.trim());
    const r = Number.parseFloat(parts[0]);
    const g = Number.parseFloat(parts[1]);
    const b = Number.parseFloat(parts[2]);
    const a = parts[3] !== undefined ? Number.parseFloat(parts[3]) : 1;
    if ([r, g, b].some(Number.isNaN)) return null;
    return { color: { r: r / 255, g: g / 255, b: b / 255 }, opacity: Number.isNaN(a) ? 1 : a };
  }

  const hslMatch = value.match(/hsla?\(([^)]+)\)/);
  if (hslMatch) {
    const parts = hslMatch[1].split(/[,/]/).map((p) => p.trim());
    const h = Number.parseFloat(parts[0]);
    const s = Number.parseFloat(parts[1]);
    const l = Number.parseFloat(parts[2]);
    const a = parts[3] !== undefined ? Number.parseFloat(parts[3]) : 1;
    if ([h, s, l].some(Number.isNaN)) return null;
    return hslToColor(h, s, l, Number.isNaN(a) ? 1 : a);
  }

  return null;
}

/** First color found inside a shorthand like `background` or `border`. */
function firstColorInValue(value) {
  if (!value) return null;
  const match = String(value).match(/#(?:[0-9a-fA-F]{3,4}){1,2}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-z]+/i);
  return match ? parseColor(match[0]) : null;
}

function backgroundColor(styles) {
  return (
    parseColor(styles["background-color"]) ||
    firstColorInValue(styles.background) ||
    null
  );
}

function textColor(styles) {
  return parseColor(styles.color) || { color: { r: 0.1, g: 0.13, b: 0.16 }, opacity: 1 };
}

// ---------- Dimension helpers ----------

function parsePx(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Expand `padding`/`margin` shorthand (1-4 values) into {top,right,bottom,left}. */
function expandBox(shorthand, fallback) {
  if (!shorthand) return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  const parts = String(shorthand)
    .trim()
    .split(/\s+/)
    .map((p) => parsePx(p, fallback));
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

function resolvePadding(styles) {
  const box = expandBox(styles.padding, 0);
  return {
    top: parsePx(styles["padding-top"], box.top),
    right: parsePx(styles["padding-right"], box.right),
    bottom: parsePx(styles["padding-bottom"], box.bottom),
    left: parsePx(styles["padding-left"], box.left)
  };
}

function resolveRadius(styles) {
  const box = expandBox(styles["border-radius"], 0);
  // Uniform radius is what Figma cornerRadius expects; take the max of the corners.
  return Math.max(box.top, box.right, box.bottom, box.left);
}

// ---------- Font weight -> Inter style ----------

const WEIGHT_TO_STYLE = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black"
};

function fontStyleFor(styles) {
  let weight = styles["font-weight"];
  if (weight === "bold") weight = 700;
  else if (weight === "normal" || weight === undefined) weight = 400;
  else weight = Number.parseInt(String(weight), 10) || 400;
  const rounded = Math.round(weight / 100) * 100;
  let style = WEIGHT_TO_STYLE[Math.min(900, Math.max(100, rounded))] || "Regular";
  if (String(styles["font-style"]).includes("italic")) {
    style = style === "Regular" ? "Italic" : `${style} Italic`;
  }
  return style;
}

async function loadInter(style) {
  try {
    await figma.loadFontAsync({ family: "Inter", style });
    return { family: "Inter", style };
  } catch (e) {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    return { family: "Inter", style: "Regular" };
  }
}

function textAlignFor(value) {
  const v = String(value || "").toLowerCase();
  if (v === "center") return "CENTER";
  if (v === "right" || v === "end") return "RIGHT";
  if (v === "justify") return "JUSTIFIED";
  return "LEFT";
}

// ---------- Node creation ----------

function applyBorder(node, styles) {
  const color =
    parseColor(styles["border-color"]) || firstColorInValue(styles.border) || null;
  const width = parsePx(styles["border-width"], styles.border ? 1 : 0);
  if (color && width > 0) {
    node.strokes = [{ type: "SOLID", color: color.color, opacity: color.opacity }];
    node.strokeWeight = width;
  }
}

async function createNode(node, parent, depth) {
  const styles = node.styles || {};

  if (node.type === "text" || node.type === "link" || node.type === "button" || node.type === "input") {
    const font = await loadInter(fontStyleFor(styles));
    const text = figma.createText();
    text.name = node.name;
    text.fontName = font;
    text.characters = node.text || node.name;
    text.fontSize = parsePx(styles["font-size"], node.type === "button" ? 16 : 18);
    const tc = textColor(styles);
    text.fills = [{ type: "SOLID", color: tc.color, opacity: tc.opacity }];
    text.textAlignHorizontal = textAlignFor(styles["text-align"]);
    const lh = parsePx(styles["line-height"], NaN);
    if (Number.isFinite(lh)) text.lineHeight = { value: lh, unit: "PIXELS" };

    // Buttons render as a padded pill so they read as controls, not bare text.
    if (node.type === "button") {
      const wrap = figma.createFrame();
      wrap.name = node.name;
      wrap.layoutMode = "HORIZONTAL";
      wrap.primaryAxisSizingMode = "AUTO";
      wrap.counterAxisSizingMode = "AUTO";
      const pad = resolvePadding(styles);
      wrap.paddingTop = pad.top || 12;
      wrap.paddingBottom = pad.bottom || 12;
      wrap.paddingLeft = pad.left || 18;
      wrap.paddingRight = pad.right || 18;
      wrap.cornerRadius = resolveRadius(styles) || 8;
      const bg = backgroundColor(styles) || { color: { r: 0.07, g: 0.09, b: 0.15 }, opacity: 1 };
      wrap.fills = [{ type: "SOLID", color: bg.color, opacity: bg.opacity }];
      applyBorder(wrap, styles);
      wrap.appendChild(text);
      parent.appendChild(wrap);
      return wrap;
    }

    parent.appendChild(text);
    text.resizeWithoutConstraints(
      Math.min(PAGE_WIDTH - depth * 32, Math.max(180, text.width)),
      text.height
    );
    return text;
  }

  const frame = figma.createFrame();
  frame.name = node.name;

  const display = String(styles.display || "");
  const flexRow = display.includes("flex") && String(styles["flex-direction"] || "row").includes("row");
  frame.layoutMode = flexRow ? "HORIZONTAL" : "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.itemSpacing = parsePx(styles.gap, 12);

  const pad = resolvePadding(styles);
  frame.paddingTop = pad.top || 20;
  frame.paddingRight = pad.right || 20;
  frame.paddingBottom = pad.bottom || 20;
  frame.paddingLeft = pad.left || 20;
  frame.cornerRadius = resolveRadius(styles);

  const width = parsePx(styles.width, PAGE_WIDTH - depth * 32);
  frame.resize(Math.max(1, Math.min(width, PAGE_WIDTH)), 120);

  const bg = backgroundColor(styles);
  if (bg) frame.fills = [{ type: "SOLID", color: bg.color, opacity: bg.opacity }];
  else frame.fills = []; // transparent instead of a stack of white boxes
  applyBorder(frame, styles);

  parent.appendChild(frame);

  if (node.type === "image") {
    frame.name = `${node.name} (image placeholder)`;
    frame.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.91, b: 0.93 } }];
    frame.resize(Math.max(1, Math.min(width, PAGE_WIDTH)), parsePx(styles.height, 200));
  }

  for (const child of node.children || []) {
    await createNode(child, frame, depth + 1);
  }

  return frame;
}

figma.ui.onmessage = async (message) => {
  if (message.type !== "IMPORT_DESIGN") return;

  try {
    const design = message.payload;
    const root = figma.createFrame();
    root.name = design.title || "Imported design";
    root.layoutMode = "VERTICAL";
    root.primaryAxisSizingMode = "AUTO";
    root.counterAxisSizingMode = "FIXED";
    root.itemSpacing = GAP;
    root.paddingTop = 32;
    root.paddingRight = 32;
    root.paddingBottom = 32;
    root.paddingLeft = 32;
    root.resize(PAGE_WIDTH, 200);
    root.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.94 } }];
    figma.currentPage.appendChild(root);

    for (const node of design.nodes || []) {
      await createNode(node, root, 0);
    }

    figma.viewport.scrollAndZoomIntoView([root]);
    figma.ui.postMessage({
      type: "IMPORT_DONE",
      message: `Design created: ${design.nodes?.length || 0} top-level layers.`
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "The design could not be created.";
    figma.ui.postMessage({ type: "IMPORT_ERROR", message: errorMessage });
  }
};
