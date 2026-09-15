import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ContentPage,
  ContentSection,
  P,
  UL,
  NoteBox,
  PageCta,
  MailLink,
} from "~/components/ContentPage";
import { getPricingSettings } from "~/lib/pricing";

export const Route = createFileRoute("/delivery")({
  head: () => ({
    meta: [
      { title: "Delivery & Shipping | N2 Wheels" },
      {
        name: "description",
        content:
          "UK-wide delivery for alloy wheels, tyres and accessories — from £35 for a single wheel and £80 for a full set of 4. Delivery times are estimates and confirmed with your order.",
      },
    ],
  }),
  component: DeliveryPage,
});

function DeliveryPage() {
  const s = getPricingSettings();
  return (
    <ContentPage
      chip="Delivery"
      title="UK-wide delivery"
      intro="We supply wheels, tyres, packages and accessories throughout the UK. Rates below come from our pricing settings — the same numbers the order engine uses."
    >
      <ContentSection
        title="Wheel delivery — per quantity"
        lead={`Standard delivery for alloy wheels is charged by quantity of wheels in the order (settings-driven):`}
      >
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-coal/60 text-xs font-semibold uppercase tracking-wider text-steel">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-steel">
              {[...s.shippingTiers]
                .sort((a, b) => b.minQty - a.minQty)
                .map((tier) => (
                  <tr key={tier.minQty}>
                    <td className="px-4 py-3">{tier.label}</td>
                    <td className="px-4 py-3 font-semibold text-white">£{tier.priceGBP.toFixed(0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <P>
          A complete wheel &amp; tyre package is a full 4-wheel set, so it ships at the
          4-wheel rate ({`£${s.shippingTiers[0].priceGBP.toFixed(0)}`}).
        </P>
      </ContentSection>

      <ContentSection
        title="Tyres & accessories"
        lead="Single-item categories ship at the flat per-order rates from our pricing settings:"
      >
        <UL
          items={[
            <>
              Tyres and tyre-related items: <strong className="text-white">£{s.shippingByCategory.tyres.toFixed(0)}</strong> per order.
            </>,
            <>
              Accessories (bolts, spigot rings, cleaning and care):{" "}
              <strong className="text-white">£{s.shippingByCategory.accessories.toFixed(0)}</strong> per order.
            </>,
          ]}
        />
      </ContentSection>

      <ContentSection title="Timescales">
        <P>
          We aim to dispatch within the window confirmed with your order — but delivery times
          are always estimates, not promises, and are confirmed at the point of ordering.
          Remote UK postcode areas can take longer.
        </P>
        <UL
          items={[
            "Order confirmation is sent after your order details and vehicle compatibility have been verified with you.",
            "Deliveries are made Monday–Friday; large wheel sets / packages may require a signature.",
            "You'll receive tracking details when your order is dispatched.",
          ]}
        />
      </ContentSection>

      <NoteBox title="Honest status">
        <p>
          The website is currently in preview with a sample catalogue — no orders are processed
          today, so nothing can be dispatched yet. The rates on this page are the delivery
          settings our order engine will use at launch.
        </p>
      </NoteBox>

      <ContentSection title="Questions?">
        <P>
          Email <MailLink /> and we&apos;ll help with anything delivery-related.
        </P>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
          <Link to="/returns" className="link-muted font-medium">
            Returns policy →
          </Link>
          <Link to="/faq" className="link-muted font-medium">
            FAQ →
          </Link>
          <Link to="/contact" className="link-muted font-medium">
            Contact →
          </Link>
        </div>
      </ContentSection>

      <PageCta secondaryTo="/wheels" secondaryLabel="Browse Wheels" />
    </ContentPage>
  );
}