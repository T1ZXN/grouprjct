import { createFileRoute, Link } from "@tanstack/react-router";
import { ContentPage, NoteBox, PageCta, MailLink } from "~/components/ContentPage";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ | N2 Wheels" },
      {
        name: "description",
        content:
          "Answers on wheel fitment checks, the demo catalogue, delivery, returns, UK registration lookup timing and payment. No payment is processed on the N2 Wheels site today.",
      },
    ],
  }),
  component: FaqPage,
});

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do you check a wheel will fit my car?",
    a: "Every order is verified against your exact vehicle before we confirm it — bolt pattern (PCD), offset, centre bore (with spigot rings where needed), brake clearance and TPMS requirements. Nothing is recommended with a blanket 'it'll fit' promise; the check is done on your specific car. The plate lookup reads your car from the live UK registration record, while the wheel and tyre fitment data on the site is sample data.",
  },
  {
    q: "Is the catalogue real stock?",
    a: "No — everything on the site today is sample/demo data. The wheels, tyres, packages and accessories shown are examples with no live stock, availability or supplier pricing claimed. Real products arrive with the supplier feed import in a later milestone.",
  },
  {
    q: "How much is delivery?",
    a: "UK-wide delivery for wheels is charged per quantity: £35 for 1 wheel, £55 for 2 and £80 for a full set of 4 (settings-driven). Tyres ship at £14 per order and accessories at £6. Delivery times are estimates and are confirmed with your order — see the Delivery page for full details.",
  },
  {
    q: "What's your returns policy?",
    a: "You have 14 days from delivery to notify us of a change-of-mind return, and items must be unused, unmarked and undamaged in original packaging. Faulty, incorrect or damaged items are sorted out quickly — email enquiry@n2wheels.co.uk. It's a template policy reviewed before launch.",
  },
  {
    q: "When will the UK registration lookup go live?",
    a: "Soon — the fitment search you see today runs on demo vehicle data behind a deliberately simple integration point, so a real UK registration API can plug in without redesigning the site. We'll announce it in News when it's live.",
  },
  {
    q: "How can I pay?",
    a: "No payment is processed on the site today — there are no payment providers connected yet. At launch we plan a manual invoice flow (we confirm your order and fitment by email first), with card payments to follow. Any financing options are a future roadmap item and nothing is active today.",
  },
  {
    q: "Do you fit tyres or offer a fitting service?",
    a: "Not yet. We supply wheels, tyres, packages and accessories — a tyre fitting or mobile fitting service isn't offered at this stage. We'll be transparent here and in News if/when that changes.",
  },
  {
    q: "What's included with a set of wheels?",
    a: "Each product page lists what's included — many sample wheels come with their bolts. Bolts, spigot rings and TPMS parts are confirmed against your exact vehicle during the order check, and accessories like spigot rings are available in the Accessories catalogue.",
  },
];

function FaqPage() {
  return (
    <ContentPage
      chip="FAQ"
      title="Frequently asked questions"
      intro="Straight answers to the questions we hear most. If yours isn't here, email us — we reply to every message."
    >
      <div className="space-y-4">
        {FAQS.map((faq, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-carbon p-5 sm:p-6">
            <h2 className="text-base font-bold tracking-tight text-white sm:text-lg">{faq.q}</h2>
            <p className="mt-2.5 text-sm leading-relaxed text-steel sm:text-base">{faq.a}</p>
          </div>
        ))}
      </div>

      <NoteBox title="Still stuck?">
        <p>
          Email <MailLink /> — include your car&apos;s make, model and year if you&apos;re asking
          about fitment, and we&apos;ll point you in the right direction.
        </p>
      </NoteBox>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
        <Link to="/delivery" className="link-muted font-medium">
          Delivery →
        </Link>
        <Link to="/returns" className="link-muted font-medium">
          Returns →
        </Link>
        <Link to="/financing" className="link-muted font-medium">
          Financing &amp; payment →
        </Link>
        <Link to="/contact" className="link-muted font-medium">
          Contact →
        </Link>
      </div>

      <PageCta secondaryTo="/wheels" secondaryLabel="Browse Wheels" />
    </ContentPage>
  );
}