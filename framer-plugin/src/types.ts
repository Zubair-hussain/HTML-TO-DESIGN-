// Self-contained copy of the design document shape produced by the studio's
// JSON export, so this plugin has no dependency on the Next.js app's lib.

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
  sourceType: string;
  createdAt: string;
  tokens: {
    colors: string[];
    fonts: string[];
    fontSizes?: string[];
    fontWeights?: string[];
    radii?: string[];
  };
  nodes: DesignNode[];
};
