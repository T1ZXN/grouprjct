import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ContentPage,
  ContentSection,
  P,
  UL,
  NoteBox,
  MailLink,
} from "~/components/ContentPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions | N2 Wheels" },
      {
        name: "description",
        content:
          "N2 Wheels terms of use — the catalogue is sample data, prices include UK VAT, and no blanket fitment guarantee is made. Template terms reviewed before launch.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <ContentPage
      chip="Terms & conditions"
      title="Terms of use"
      intro="The rules that apply when you use this website and, in future, buy from N2 Wheels. Written to be clear and honest — a template to be reviewed before launch, not legal advice."
    >
      <NoteBox title="Template — review before launch">
        <p>
          This is a working draft. It will be reviewed before orders, payments or live data go
          live, and the final version published here will govern.
        </p>
      </NoteBox>

      <ContentSection title="Sample catalogue">
        <P>
          Everything displayed on this website today — wheels, tyres, packages, accessories,
          prices, images and fitment records — is sample/demo data for preview purposes. No live
          stock, availability or supplier pricing is claimed, and nothing shown constitutes an
          offer for sale until the catalogue goes live.
        </P>
      </ContentSection>

      <ContentSection title="Prices & VAT">
        <P>
          All prices shown include UK VAT at 20%. Prices are derived from central pricing
          settings (supplier discount, exchange rate, margin, VAT and shipping) and may change
          between preview and launch. For tyres and accessories, prices include VAT; delivery is
          added separately at the rates on the Delivery page.
        </P>
      </ContentSection>

      <ContentSection title="Fitment">
        <P>
          We verify compatibility with your exact vehicle — geometry, PCD, offset, centre bore
          and brake clearance — before confirming any order. No universal fitment guarantee is
          made, and fitment records shown on the site are sample data. It is your responsibility
          to provide accurate vehicle information at the point of order.
        </P>
      </ContentSection>

      <ContentSection title="Orders & payment">
        <P>
          No payment is processed on this website today. When ordering launches, you will be able
          to place an order for review: we will confirm price, availability and fitment with you
          by email before anything is charged.
        </P>
      </ContentSection>

      <ContentSection title="Your use of the site">
        <UL
          items={[
            "Content on this site is provided for lawful, personal use — don't republish, scrape or resell it.",
            "Don't attempt to disrupt the site, its servers or other users' access.",
            "When you submit details (contact form, future orders), make sure they are accurate and yours.",
          ]}
        />
      </ContentSection>

      <ContentSection title="Liability">
        <P>
          We aim for the site to be accurate and available, but it is a work in progress: content
          may contain preview errors and is provided without warranties of any kind. Nothing in
          these terms limits liability that cannot be limited under English law (for example, for
          death or personal injury caused by negligence, or for fraud).
        </P>
        <P>
          Questions about these terms? Email <MailLink />.
        </P>
      </ContentSection>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
        <Link to="/privacy" className="link-muted font-medium">
          Privacy policy →
        </Link>
        <Link to="/delivery" className="link-muted font-medium">
          Delivery →
        </Link>
        <Link to="/returns" className="link-muted font-medium">
          Returns →
        </Link>
      </div>
    </ContentPage>
  );
}