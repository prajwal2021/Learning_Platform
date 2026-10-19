import type { Metadata, Viewport } from "next";
import RootDocument from "@/components/RootDocument";
import { BRAND } from "@/lib/brand";
import "@/styles/brand.css";
import "@/styles/app.css";

export const metadata: Metadata = {
  title: { default: `${BRAND.name} · ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RootDocument>{children}</RootDocument>;
}
