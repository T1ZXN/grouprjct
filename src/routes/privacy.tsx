import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ContentPage,
  ContentSection,
  P,
  UL,
  NoteBox,
  MailLink,
} from "~/components/ContentPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | N2 Wheels" },
      {
        name: "description",
        content:
          "How N2 Wheels would handle your data — what we'd collect, cookies and your rights under UK data protection law. Template policy: no real customer data is collected on the site today.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <ContentPage
      chip="Privacy policy"
      title="Privacy promise"
      intro="This page explains how N2 Wheels would collect, use and protect your information. It's a clear, UK-appropriate template — and the honest headline is that the site collects no real customer data today."
    >
      <NoteBox title="Template — review before launch">
        <p>
          This is a working draft policy, not legal advice. It will be reviewed (with a
          practitioner if needed) before orders, payments or data collection go live, and the
          final version will be published here.
        </p>
      </NoteBox>

      <ContentSection title="What we collect today">
        <P>
          Almost nothing. This website is a preview: the catalogue is sample data, there are no
          customer accounts, no checkout and no payment processing. We do not collect or store
          names, email addresses, vehicle registrations or payment details on this site today.
        </P>
      </ContentSection>

      <ContentSection title="What we'd collect in future">
        <P>
          When orders go live, expect us to collect the minimum needed to serve you:
        </P>
        <UL
          items={[
            <>Contact details — name, email address, phone number and delivery address.</>,
            <>Order information — products ordered and, when the lookup goes live, your vehicle's registration details for fitment checks.</>,
            <>Payment information — processed by a regulated payment provider; we would avoid storing card numbers ourselves.</>,
          ]}
        />
      </ContentSection>

      <ContentSection title="How we'd use it">
        <UL
          items={[
            "To confirm, fulfil and deliver your order — including verifying wheel fitment for your exact vehicle.",
            "To respond to your enquiries and provide after-sales support.",
            "To meet legal obligations such as VAT records and consumer protection.",
            "Only with your consent would we send marketing updates — you can opt out at any time.",
          ]}
        />
      </ContentSection>

      <ContentSection title="Cookies">
        <P>
          The site uses no advertising or cross-site tracking cookies today. We may use
          strictly-necessary cookies or local storage for site functionality (for example, stored
          pricing settings or basket state when checkout arrives), and we&apos;d document any
          analytics cookies here before adding them.
        </P>
      </ContentSection>

      <ContentSection title="Your rights">
        <P>
          Under UK data protection law (UK GDPR / Data Protection Act 2018) you would have the
          right to access your data, ask for corrections, request deletion, restrict processing,
          object to marketing and complain to the ICO. Contact <MailLink /> to exercise any of
          these.
        </P>
      </ContentSection>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
        <Link to="/terms" className="link-muted font-medium">
          Terms &amp; conditions →
        </Link>
        <Link to="/contact" className="link-muted font-medium">
          Contact →
        </Link>
      </div>
    </ContentPage>
  );
}