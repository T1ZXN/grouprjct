import { createFileRoute } from "@tanstack/react-router";
import { ContentPage, ContentSection, P, NoteBox, PageCta, MailLink } from "~/components/ContentPage";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      {
        title: "About Us | N2 Wheels — Premium Aftermarket Alloy Wheels UK",
      },
      {
        name: "description",
        content:
          "N2 Wheels is a premium UK aftermarket wheel & tyre retailer. Quality alloy wheels, tyres, complete packages and accessories — we verify compatibility with your car before confirming any order.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <ContentPage
      chip="About N2 Wheels"
      title="Quality aftermarket wheels, fitted right."
      intro="N2 Wheels is a premium UK aftermarket wheel & tyre retailer. We were founded on a simple idea: finding wheels that actually fit your car shouldn't be a guessing game."
    >
      <ContentSection title="Our story">
        <P>
          N2 Wheels was founded to make buying aftermarket alloys straightforward. The wheel
          market is full of great products — and full of confusing numbers. Sizes, PCDs, offsets,
          centre bores: get any one of them wrong and the wheels won't fit, no matter how good
          they look in the photos.
        </P>
        <P>
          So we set out to build a retailer that makes the fitment question a first-class part of
          the experience. We supply quality aftermarket alloy wheels, tyres, complete wheel &amp;
          tyre packages and accessories, and we check compatibility with your exact vehicle before
          confirming any order. Not with guesses — with the real geometry of your car.
        </P>
        <P>
          Today the website runs on a sample catalogue while we build out the real product feed
          and order tooling. A plate lookup against the live UK registration database is already
          connected; the catalogue itself is sample data. The look, the fitment process and the
          service standards you see here are the ones we intend to launch with.
        </P>
      </ContentSection>

      <ContentSection title="How we work">
        <P>
          Every wheel or package in our catalogue is defined by its engineering data — diameter,
          width, PCD, offset, centre bore — so "will it fit?" can be answered properly, not just
          by marketing photo.
        </P>
        <P>
          When you place an order, we verify compatibility against your exact vehicle: bolt
          pattern, offset range, centre bore (with spigot rings where needed), brake clearance
          and any TPMS requirements. Only once that check passes do we confirm your order.
        </P>
        <NoteBox title="An honest note on where we are">
          <p>
            The products shown on this site today are sample/demo data — no live stock or
            availability is claimed. The plate lookup reads the live UK registration record;
            payment is coming in a later milestone. The fitment process and quality standards
            described here are the real ones we ship with.
          </p>
        </NoteBox>
      </ContentSection>

      <ContentSection title="Talk to us">
        <P>
          Questions about a product, a fitment, or the roadmap? Email{" "}
          <MailLink /> — we read every message.
        </P>
      </ContentSection>

      <PageCta
        primaryTo="/wheels"
        primaryLabel="Browse Alloy Wheels"
        secondaryTo="/contact"
        secondaryLabel="Contact Us"
      />
    </ContentPage>
  );
}