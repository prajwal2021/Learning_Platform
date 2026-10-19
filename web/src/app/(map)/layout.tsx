import type { Metadata } from "next";
import RootDocument from "@/components/RootDocument";
import "@/styles/brand.css";
import "@/styles/stackmap.css";
import "@/styles/legacy-bridge.css";

export const metadata: Metadata = { title: "Stack Map and Labs · Stackcraft", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RootDocument>{children}</RootDocument>;
}
