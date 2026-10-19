import AppShell from "@/components/shell/AppShell";
import Background from "@/components/ui/Background";
import SmoothScroll from "@/components/ui/SmoothScroll";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Background />
      <SmoothScroll />
      <div className="relative z-[1]">{children}</div>
    </AppShell>
  );
}
