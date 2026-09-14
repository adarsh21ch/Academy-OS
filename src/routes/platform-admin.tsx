import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PlatformProvider } from "@/lib/platform-context";
import { PlatformShell } from "@/components/platform/PlatformShell";

export const Route = createFileRoute("/platform-admin")({
  head: () => ({
    meta: [{ title: "Platform Admin · Cricket Academy OS" }, { name: "robots", content: "noindex" }],
  }),
  component: Layout,
});

function Layout() {
  return (
    <PlatformProvider>
      <PlatformShell>
        <Outlet />
      </PlatformShell>
    </PlatformProvider>
  );
}
