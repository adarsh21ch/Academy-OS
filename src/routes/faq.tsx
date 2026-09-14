import { createFileRoute } from "@tanstack/react-router";
import { isPlatformRequest, seo } from "@/lib/seo";
import { useQuery } from "@tanstack/react-query";
import { TenantGate } from "@/components/site/TenantGate";
import { PageHero } from "@/components/site/PageHero";
import { useTenant } from "@/lib/tenant-context";
import { sectionsBy, siteContentQuery } from "@/lib/site-queries";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/faq")({
  head: () =>
    seo({
      title: "FAQ — Admissions, Fees, Batches & Timings",
      description:
        "Answers to common questions about joining the academy: admissions, batch timings, fees, trials, equipment and attendance.",
      path: "/faq",
      index: !isPlatformRequest(),
    }),
  component: () => (
    <TenantGate>
      <FaqPage />
    </TenantGate>
  ),
});

function FaqPage() {
  const tenant = useTenant();
  const { data: sections = [] } = useQuery(siteContentQuery(tenant.id));
  const items = sectionsBy(sections, "faq").map(
    (s) => s.content as { question?: string; answer?: string },
  );

  const jsonLd =
    items.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items
            .filter((i) => i.question && i.answer)
            .map((i) => ({
              "@type": "Question",
              name: i.question,
              acceptedAnswer: { "@type": "Answer", text: i.answer },
            })),
        }
      : null;

  return (
    <>
      <PageHero
        eyebrow="Help"
        title="Frequently Asked Questions"
        subtitle={`Answers about training, fees, and joining ${tenant.name}.`}
      />
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-12 text-center text-muted-foreground">
            FAQ coming soon.
          </div>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {items.map((it, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left">
                  {it.question ?? `Question ${i + 1}`}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{it.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
        {jsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        )}
      </div>
    </>
  );
}
