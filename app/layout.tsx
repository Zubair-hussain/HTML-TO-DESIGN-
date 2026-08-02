import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "HTML to Figma Design",
  description: "Convert HTML, URLs, APIs, files, and editor drafts into Figma-ready design structure."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
