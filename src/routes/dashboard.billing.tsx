import { createFileRoute, redirect } from "@tanstack/react-router";

// Canonical billing page is /dashboard/subscription (TrialBanner, UpgradeCard,
// LimitReachedCard and profile all link there). This route is preserved as a
// redirect so legacy inbound links, bookmarks, and AI/tool hrefs continue to
// resolve to the single source of truth.
export const Route = createFileRoute("/dashboard/billing")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/subscription", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Billing · Cricket Academy OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => null,
});
