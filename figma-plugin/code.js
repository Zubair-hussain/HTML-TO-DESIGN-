figma.showUI(__html__, { width: 420, height: 540 });

const PAGE_WIDTH = 960;
const GAP = 20;

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const expanded = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const number = Number.parseInt(expanded, 16);
  if (Number.isNaN(number)) return null;
  return {
    r: ((number >> 16) & 255) / 255,
    g: ((number >> 8) & 255) / 255,
    b: (number & 255) / 255
  };
}

function colorFromStyles(styles, fallback) {
  const raw = styles["background-color"] || styles.background || styles.color;
  if (typeof raw === "string" && raw.startsWith("#")) {
    return hexToRgb(raw) || fallback;
  }
  return fallback;
}

function parsePx(value, fallback) {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function createNode(node, parent, depth) {
  if (node.type === "text" || node.type === "link" || node.type === "button" || node.type === "input") {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    const text = figma.createText();
    text.name = node.name;
    text.characters = node.text || node.name;
    text.fontSize = parsePx(node.styles["font-size"], node.type === "button" ? 16 : 18);
    text.fills = [{ type: "SOLID", color: colorFromStyles({ color: node.styles.color }, { r: 0.1, g: 0.13, b: 0.16 }) }];
    text.resizeWithoutConstraints(Math.min(PAGE_WIDTH - depth * 32, Math.max(180, text.width)), text.height);
    parent.appendChild(text);
    return text;
  }

  const frame = figma.createFrame();
  frame.name = node.name;
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.itemSpacing = 12;
  frame.paddingTop = parsePx(node.styles.padding, 20);
  frame.paddingRight = 20;
  frame.paddingBottom = 20;
  frame.paddingLeft = 20;
  frame.cornerRadius = node.type === "image" ? 0 : 8;
  frame.resize(PAGE_WIDTH - depth * 32, 120);
  frame.fills = [{ type: "SOLID", color: colorFromStyles(node.styles || {}, { r: 1, g: 1, b: 1 }) }];
  parent.appendChild(frame);

  if (node.type === "image") {
    frame.name = `${node.name} image placeholder`;
    frame.resize(PAGE_WIDTH - depth * 32, 180);
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
    figma.ui.postMessage({ type: "IMPORT_DONE", message: `Design created: ${design.nodes?.length || 0} top-level layers.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The design could not be created.";
    figma.ui.postMessage({ type: "IMPORT_ERROR", message });
  }
};
