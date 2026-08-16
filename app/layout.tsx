import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clarity IE",
  applicationName: "Clarity IE",
  description: "Controlled independent examination workflow for UK charities.",
  manifest: "/site.webmanifest",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      { url: "/clarity-ie-brandmark-2026.svg", type: "image/svg+xml" },
      {
        url: "/clarity-ie-brandmark-2026-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/clarity-ie-brandmark-2026.svg",
    apple: [
      {
        url: "/clarity-ie-apple-touch-icon-2026.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Clarity IE",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#2C3E50",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
