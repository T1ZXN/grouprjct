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

export const Route = createFileRoute("/returns")({
  head: () => ({
    meta: [
      { title: "Returns & Refunds | N2 Wheels" },
      {
        name: "description",
        content:
          "N2 Wheels returns & refunds policy — 14-day change-of-mind window, items unused and undamaged, fitment-verified orders. Email enquiry@n2wheels.co.uk to start a return.",
      },
    ],
  }),
  component: ReturnsPage,
});

function ReturnsPage() {
  return (
    <ContentPage
      chip="Returns"
      title="Returns & refunds"
      intro="We want you to be confident in what you order. This is a straightforward, honest returns policy — it's a template we'll review before launch, not legal advice."
    >
      <NoteBox title="Important — fitment-verified orders">
        <p>
          Every order is checked against your exact vehicle before we confirm it. We do
          everything we can to get the right wheels to you first time — and if we get a fitment
          wrong, tell us straight away and we&apos;ll make it right.
        </p>
      </NoteBox>

      <ContentSection title="Change of mind">
        <P>
          Changed your mind? You have <strong className="text-white">14 days from delivery</strong>{" "}
          to notify us that you&apos;d like to return an item, followed by another 14 days to send
          it back.
        </P>
        <UL
          items={[
            "Items must be unused, unmarked and undamaged, in their original packaging with all included parts (bolts, spigot rings, paperwork).",
            "Wheels and tyres returned after being fitted or used on a vehicle cannot be accepted as change-of-mind returns.",
            "Return shipping costs are the customer's responsibility for change-of-mind returns, unless the item was faulty or incorrect.",
            "Refunds are issued to the original payment method once the return is received and checked.",
          ]}
        />
      </ContentSection>

      <ContentSection title="Faulty, incorrect or damaged items">
        <P>
          If something arrives damaged, is faulty, or turns out not to match your confirmed
          order, contact us within 14 days of delivery — we&apos;ll arrange a replacement or a
          refund, including reasonable return costs. Please keep the original packaging: it&apos;s
          the best protection for a return in transit.
        </P>
      </ContentSection>

      <ContentSection title="How to start a return">
        <P>
          Email <MailLink /> with your order reference (if you have one) and a short description
          of the issue. We&apos;ll reply with the return instructions and a returns address. Please
          don&apos;t send anything back before we&apos;ve confirmed the return with you.
        </P>
      </ContentSection>

      <NoteBox title="Honest status">
        <p>
          This policy is a draft template for launch — nothing can be ordered or returned on the
          site today (the catalogue is sample data). It reflects how we intend to operate once
          orders go live, and will be reviewed before launch.
        </p>
      </NoteBox>

      <ContentSection title="Related">
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
          <Link to="/delivery" className="link-muted font-medium">
            Delivery &amp; shipping →
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