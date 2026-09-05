/**
 * Curated premium design tokens: color palettes and font pairings.
 * These are reference libraries surfaced in the UI so designers can copy a
 * cohesive palette or type pairing into their source before importing.
 */

export type PremiumPalette = {
  name: string;
  /** Ordered darkest/base -> accent -> light. */
  colors: string[];
};

export type FontPairing = {
  name: string;
  heading: string;
  body: string;
  /** Google Fonts stylesheet URL for the pairing. */
  import: string;
};

export const PREMIUM_PALETTES: PremiumPalette[] = [
  { name: "Midnight", colors: ["#0b1020", "#1b2440", "#4f6bff", "#8aa0ff", "#eef1ff"] },
  { name: "Slate Pro", colors: ["#0f172a", "#334155", "#64748b", "#cbd5e1", "#f8fafc"] },
  { name: "Ocean", colors: ["#012a4a", "#014f86", "#2a9d8f", "#61a5c2", "#e8f4f8"] },
  { name: "Sunset", colors: ["#2b1055", "#7597de", "#ff7e5f", "#feb47b", "#fff1e6"] },
  { name: "Forest", colors: ["#1b2d20", "#2d6a4f", "#40916c", "#95d5b2", "#f0f7f2"] },
  { name: "Royal", colors: ["#10002b", "#3c096c", "#7b2cbf", "#c77dff", "#f3e8ff"] },
  { name: "Ember", colors: ["#1a0d0d", "#7f1d1d", "#dc2626", "#f97316", "#fff7ed"] },
  { name: "Mono", colors: ["#000000", "#1f1f1f", "#525252", "#a3a3a3", "#ffffff"] },
  { name: "Candy", colors: ["#2d0a31", "#c9184a", "#ff4d6d", "#ff8fa3", "#fff0f3"] },
  { name: "Sand", colors: ["#3a2f26", "#8a6d54", "#c8a27c", "#e8d5b7", "#faf3e8"] }
];

const g = (families: string) =>
  `https://fonts.googleapis.com/css2?${families}&display=swap`;

export const FONT_PAIRINGS: FontPairing[] = [
  {
    name: "Inter Sans",
    heading: "Inter",
    body: "Inter",
    import: g("family=Inter:wght@400;500;600;700;800")
  },
  {
    name: "Editorial",
    heading: "Playfair Display",
    body: "Source Sans 3",
    import: g("family=Playfair+Display:wght@600;700;800&family=Source+Sans+3:wght@400;500;600")
  },
  {
    name: "Geometric",
    heading: "Poppins",
    body: "Inter",
    import: g("family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600")
  },
  {
    name: "Techno",
    heading: "Space Grotesk",
    body: "Inter",
    import: g("family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500")
  },
  {
    name: "Serif Display",
    heading: "DM Serif Display",
    body: "DM Sans",
    import: g("family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700")
  },
  {
    name: "Modern",
    heading: "Sora",
    body: "Manrope",
    import: g("family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600")
  }
];
