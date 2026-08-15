import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clarity IE | Charity independent examination",
  description: "Controlled independent examination workflow for UK charities"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
