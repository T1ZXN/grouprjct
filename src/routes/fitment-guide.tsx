import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ContentPage,
  ContentSection,
  P,
  UL,
  NoteBox,
  PageCta,
} from "~/components/ContentPage";

export const Route = createFileRoute("/fitment-guide")({
  head: () => ({
    meta: [
      { title: "Wheel Fitment Guide | N2 Wheels" },
      {
        name: "description",
        content:
          "Learn what wheel diameter, width, PCD and offset mean and why correct fitment matters. N2 Wheels verifies compatibility with your exact vehicle before confirming any order.",
      },
    ],
  }),
  component: FitmentGuidePage,
});

function FitmentGuidePage() {
  return (
    <ContentPage
      chip="Fitment guide"
      title="Wheel fitment, explained"
      intro="Five numbers on a wheel decide whether it fits your car. Get one wrong and the wheel won't bolt on safely, no matter how good it looks. This guide explains each one in plain English."
    >
      <ContentSection title="Why fitment matters">
        <P>
          A wheel's job is to carry your car's weight and deliver braking and steering forces
          to the road. It can only do that if it mounts to your hub correctly, clears your
          brakes and suspension, and sits within the wheel arches. Wrong-fit wheels can rub,
          vibrate, damage hubs or — in the worst case — fail. Getting fitment right isn't a
          styling detail; it's a safety and handling issue.
        </P>
      </ContentSection>

      <ContentSection title={'Diameter (e.g. 18")'}>
        <P>
          The rim diameter in inches — the size of the wheel the tyre wraps around. Code is
          usually stamped on the tyre sidewall (e.g. 225/45<strong className="text-white">R18</strong>). The
          wheel diameter must match the tyre's rim diameter exactly, and it affects your
          speedometer reading: change it and the rolling radius of the tyre changes too.
        </P>
      </ContentSection>

      <ContentSection title="Width (e.g. 8.5J)">
        <P>
          Rim width in inches (the J is the bead profile). Width determines which tyre sizes
          are approved for the rim — every tyre size has a permitted rim-width range. It also
          changes how the wheel sits in the arch and how the tyre contacts the road.
        </P>
      </ContentSection>

      <ContentSection title="PCD (e.g. 5x112)">
        <P>
          Pitch Circle Diameter — the bolt-hole pattern. 5x112 means five bolts arranged on a
          112 mm circle. The PCD must match your hub, or the wheel simply cannot be fitted.
          Common patterns include 5x112 (VW Group, Mercedes), 5x114.3 (many Japanese cars) and
          4x100 (smaller Fords, Vauxhalls and older MG/Rover).
        </P>
      </ContentSection>

      <ContentSection title="Offset / ET (e.g. ET45)">
        <P>
          The offset is the distance in millimetres from the wheel's centreline to the hub
          mounting face. Low offset pushes the wheel outward (deeper dish look); high offset
          tucks it in. Get it too far wrong and the wheel rubs the arch or the suspension, or
          sits so deep it fouls the caliper. Cars have a designed offset range — staying within
          it keeps steering geometry and bearing loads sensible.
        </P>
      </ContentSection>

      <ContentSection title="Centre bore & spigot rings">
        <P>
          The centre bore is the hole in the middle of the wheel that locates it on the hub.
          If the wheel's bore is larger than your hub, spigot/centric rings fill the gap so the
          wheel centres precisely and the bolts don't carry all the weight. This is a common,
          inexpensive and perfectly safe fix — we confirm it against your exact vehicle and
          rings are available in our Accessories catalogue.
        </P>
      </ContentSection>

      <ContentSection title="What to watch on used / package deals">
        <UL
          items={[
            "Brake clearance — big calipers need the right spoke design and offset. Photos don't prove clearance; geometry does.",
            "TPMS — cars with factory tyre-pressure monitoring need compatible valves or sensors.",
            "Load rating — wheels and tyres must match or exceed your vehicle's requirements, especially on heavier cars and vans.",
            "Staggered setups — some cars run different widths front and rear; that's fine, but the set must match the car's spec.",
          ]}
        />
      </ContentSection>

      <NoteBox title="How N2 Wheels does fitment">
        <p>
          We verify compatibility with your exact vehicle — geometry, PCD, offset, centre bore,
          brake clearance and TPMS — before confirming any order. This page is educational only
          and not a fitment guarantee; the sample fitment records on product pages are demo
          data until a live UK registration lookup is connected.
        </p>
      </NoteBox>

      <PageCta secondaryTo="/wheels" secondaryLabel="Browse Wheels" />

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
        <Link to="/tyre-safety" className="link-muted font-medium">
          Tyre safety guide →
        </Link>
        <Link to="/wheel-safety" className="link-muted font-medium">
          Wheel safety guide →
        </Link>
      </div>
    </ContentPage>
  );
}