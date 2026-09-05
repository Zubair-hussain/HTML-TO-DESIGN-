import type { DesignDocument, DesignNode } from "./types";

const COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}){1,2}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/;

function firstColor(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(COLOR_REGEX);
    if (match) return match[0];
  }
  return undefined;
}

function pxNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The Framer Plugin API is passed in rather than imported, so this logic stays
 * testable and version-agnostic. Confirmed API surface used here:
 *   framer.createFrameNode(attributes, parentId?) -> Promise<FrameNode | null>
 *   framer.addText(text, options?)               -> Promise<void>
 * See: https://www.framer.com/developers/reference/plugins-create-frame-node
 *      https://www.framer.com/developers/reference/plugins-add-text
 */
export interface FramerLike {
  createFrameNode: (attributes: Record<string, unknown>, parentId?: string) => Promise<{ id?: string } | null>;
  addText: (text: string, options?: unknown) => Promise<unknown>;
}

/** addText's options shape is not fully documented; fall back if it rejects. */
async function addTextSafe(framer: FramerLike, text: string, parentId?: string) {
  try {
    await framer.addText(text, parentId ? { parent: parentId } : undefined);
  } catch {
    await framer.addText(text);
  }
}

/** createFrameNode attribute types vary by version; degrade gracefully. */
async function createFrameSafe(
  framer: FramerLike,
  attributes: Record<string, unknown>,
  parentId?: string
): Promise<string | undefined> {
  const attempts: Record<string, unknown>[] = [
    attributes,
    attributes.backgroundColor ? { backgroundColor: attributes.backgroundColor } : {},
    {}
  ];
  for (const attempt of attempts) {
    try {
      const frame = await framer.createFrameNode(attempt, parentId);
      return frame?.id;
    } catch {
      // Try the next, less ambitious attribute set.
    }
  }
  return undefined;
}

async function createNode(framer: FramerLike, node: DesignNode, parentId: string | undefined) {
  const styles = node.styles || {};

  if (node.type === "text" || node.type === "link") {
    await addTextSafe(framer, node.text || node.name, parentId);
    return;
  }

  const attributes: Record<string, unknown> = {};
  const background = firstColor(styles["background-color"], styles.background);
  if (background) attributes.backgroundColor = background;
  const radius = pxNumber(styles["border-radius"]);
  if (radius !== undefined) attributes.borderRadius = radius;
  const width = pxNumber(styles.width);
  if (width !== undefined) attributes.width = width;
  const height = pxNumber(styles.height);
  if (height !== undefined) attributes.height = height;

  const frameId = await createFrameSafe(framer, attributes, parentId);

  if (node.text) await addTextSafe(framer, node.text, frameId);
  for (const child of node.children || []) {
    await createNode(framer, child, frameId);
  }
}

/** Build the whole design tree on the Framer canvas. */
export async function importDesignToFramer(framer: FramerLike, design: DesignDocument): Promise<number> {
  let count = 0;
  for (const node of design.nodes || []) {
    await createNode(framer, node, undefined);
    count += 1;
  }
  return count;
}
