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

export const Route = createFileRoute("/financing")({
  head: () => ({
    meta: [
      { title: "Financing & Payment Options | N2 Wheels" },
      {
        name: "description",
        content:
          "How payment will work at N2 Wheels — manual invoice and card payments planned; no payment is processed on the site today and no finance options are active yet.",
      },
    ],
  }),
  component: FinancingPage,
});

function FinancingPage() {
  return (
    <ContentPage
      chip="Financing & payment"
      title="How payment will work"
      intro="Straight answers, before you get excited: no payment is processed on this site today, and no finance products are active yet. Here's exactly where we are and what's planned."
    >
      <ContentSection title="Today">
        <P>
          This website is in preview with a sample catalogue. There are no payment providers
          connected and nothing can be purchased or charged. You won't be asked for card details
          anywhere on the site, and no order is confirmed without an email conversation first.
        </P>
      </ContentSection>

      <ContentSection title="Planned — manual invoice first">
        <P>
          The first ordering flow we plan to launch is intentionally human: you place an order,
          and we check price, availability and vehicle fitment with you by email before anything
          is processed. Once confirmed, we'd raise a manual invoice (payable by bank transfer or
          a card payment link) before dispatch.
        </P>
        <P>
          That flow keeps the fitment promise honest — wheels get verified against your exact
          car before money moves — and gives us a chance to sort out any problem while the order
          is still just a conversation.
        </P>
      </ContentSection>

      <ContentSection title="Planned — card payments">
        <P>
          Card payments (including the manual invoice card-links above) are on the roadmap, to
          be handled by a regulated payment provider — the site won't store card numbers. We'll
          announce here and in News when that's live.
        </P>
      </ContentSection>

      <ContentSection title="What about finance?">
        <P>
          We're exploring Klarna-style instalment options as a future feature so a quality set of
          wheels can be spread over a few payments. <strong className="text-white">None of it is active
          today</strong> — no finance agreements, no credit checks, no instalment plans are being
          offered, shown or implied anywhere on this site right now.
        </P>
      </ContentSection>

      <ContentSection title="Our commitment">
        <UL
          items={[
            "No payment is requested until your order and fitment are confirmed by email.",
            "No fake urgency — nothing on this site creates artificial deadlines or 'limited spots'.",
            "Any finance feature will be subject to responsible lending rules, clearly presented, and only when we're ready to run it properly.",
          ]}
        />
      </ContentSection>

      <NoteBox title="Questions?">
        <p>
          Email <MailLink /> — happy to explain the roadmap or answer anything about how an
          order would work.
        </p>
      </NoteBox>

      <PageCta secondaryTo="/wheels" secondaryLabel="Browse Wheels" />

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
        <Link to="/faq" className="link-muted font-medium">
          FAQ →
        </Link>
        <Link to="/delivery" className="link-muted font-medium">
          Delivery →
        </Link>
      </div>
    </ContentPage>
  );
}