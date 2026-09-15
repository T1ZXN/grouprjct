import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ContentPage,
  ContentSection,
  P,
  UL,
  NoteBox,
  PageCta,
} from "~/components/ContentPage";

export const Route = createFileRoute("/tyre-safety")({
  head: () => ({
    meta: [
      { title: "Tyre Safety Guide | N2 Wheels" },
      {
        name: "description",
        content:
          "Tread depth, tyre pressures, sidewall damage and rotation — an honest tyre safety guide from N2 Wheels, premium UK aftermarket wheel & tyre retailer.",
      },
    ],
  }),
  component: TyreSafetyPage,
});

function TyreSafetyPage() {
  return (
    <ContentPage
      chip="Tyre safety"
      title="Keeping your tyres safe"
      intro="Tyres are the only part of your car that touches the road. A five-minute check can save you money, fuel and — on the worst days — an accident. Here's what matters."
    >
      <ContentSection title="Tread depth">
        <P>
          The legal minimum tread depth in the UK is <strong className="text-white">1.6 mm</strong>{" "}
          across the central three-quarters of the tyre, around its entire circumference. But
          legality and safety are different numbers: braking and wet grip start to deteriorate
          well before 1.6 mm. Many motoring organisations recommend replacing tyres at{" "}
          <strong className="text-white">3 mm</strong> for year-round confidence, and 3 mm is a
          sensible point to start planning.
        </P>
        <UL
          items={[
            "Check tread depth at several points across the tyre — edges wear differently from the centre.",
            "Use the tyre's built-in wear indicators, or a 20p coin: if the coin's outer band is hidden, tread is around 3 mm or more.",
            "Uneven wear across a tyre usually means a pressure, alignment or suspension issue — worth investigating, not ignoring.",
          ]}
        />
      </ContentSection>

      <ContentSection title="Pressures">
        <P>
          Run tyres at the pressures your manufacturer specifies (check the driver's door plate or
          handbook — the figure varies with load and speed). Do it cold: a short drive heats
          tyres up and inflates the reading.
        </P>
        <UL
          items={[
            "Under-inflated tyres wear the shoulders, increase rolling resistance and run hotter at speed.",
            "Over-inflated tyres wear the centre and reduce grip, making the ride harsh.",
            "Check at least monthly, and always before a long trip or a heavy load.",
            "Cold weather drops pressures — a sudden cold snap is exactly when to re-check.",
          ]}
        />
      </ContentSection>

      <ContentSection title="Sidewall damage & wear">
        <P>
          The sidewall is the tyre's structure — damage there is rarely repairable. Look for
          cuts, bulges, cracks, exposed cords or grazing from kerbing. A bulge or a deep cut
          means the tyre's structure is compromised: have it inspected and, in most cases,
          replaced.
        </P>
        <UL
          items={[
            "Kerbing can damage the sidewall even when the wheel looks fine — inspect after any impact.",
            "Don't repair sidewall punctures; repairs to the tread area are only valid within the tyre's repair zone and by a qualified fitter.",
            "Cap or cup wear on the shoulders points to under-inflation; a feathered edge points to tracking issues.",
          ]}
        />
      </ContentSection>

      <ContentSection title="Rotation & age">
        <P>
          Tyres don't just wear out — they age. Rubber degrades over time regardless of mileage;
          some manufacturers advise replacement after around 6 years from manufacture, and tyres
          older than 10 years should be replaced. The manufacture date is in the DOT code on the
          sidewall (last four digits: week and year).
        </P>
        <P>
          Rotating tyres front-to-rear can even out wear and extend life — but on many modern
          cars the front and rear axles run different sizes, and directional tyres can't be
          cross-swapped. When in doubt, keep rotation simple and ask a professional.
        </P>
      </ContentSection>

      <ContentSection title="Seasonal choices">
        <P>
          Summer, all-season and winter tyres differ in compound and tread design. Summer tyres
          suit most UK driving most of the year; all-seasons trade a little dry grip for
          all-weather flexibility; winters genuinely help in cold, snowy or icy conditions. Our
          sample catalogue covers summer and all-season ranges — and we'll publish a fuller
          compare guide in News.
        </P>
      </ContentSection>

      <NoteBox title="Honest note">
        <p>
          This is general, educational guidance — not a guarantee, and not a substitute for a
          qualified tyre technician inspecting your car. N2 Wheels doesn't offer a fitting
          service yet; we supply tyres and will confirm the right spec for your car before any
          order.
        </p>
      </NoteBox>

      <PageCta secondaryTo="/tyres" secondaryLabel="Browse Tyres" />

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
        <Link to="/wheel-safety" className="link-muted font-medium">
          Wheel safety guide →
        </Link>
        <Link to="/fitment-guide" className="link-muted font-medium">
          Fitment guide →
        </Link>
      </div>
    </ContentPage>
  );
}