import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ContentPage,
  ContentSection,
  P,
  UL,
  NoteBox,
  PageCta,
} from "~/components/ContentPage";

export const Route = createFileRoute("/wheel-safety")({
  head: () => ({
    meta: [
      { title: "Wheel Safety Guide | N2 Wheels" },
      {
        name: "description",
        content:
          "Torque specs, re-torquing after 50 miles, cracks and load ratings — practical alloy wheel safety guidance from N2 Wheels, premium UK aftermarket wheel retailer.",
      },
    ],
  }),
  component: WheelSafetyPage,
});

function WheelSafetyPage() {
  return (
    <ContentPage
      chip="Wheel safety"
      title="Alloy wheel safety, in practice"
      intro="Alloys are engineered parts: they carry your car's weight, transmit braking forces and take every pothole you hit. A little routine attention keeps them — and you — safe."
    >
      <ContentSection title="Wheel nuts & torque">
        <P>
          Use the correct torque for your car. Under-tightened bolts work loose; over-tightened
          ones stretch the studs or distort the wheel. Your manufacturer's spec is the reference
          — commonly 100–130 Nm on modern cars, but <em>always check your own car&apos;s figure</em>.
          If we supply bolts with a wheel, their seat type (taper, radius or flat) and thread
          are confirmed against your exact vehicle before any order.
        </P>
        <UL
          items={[
            "Tighten in a star (cross) pattern, in stages — never in circle order.",
            "Use a calibrated torque wrench, not just a breaker bar and feel.",
            "On alloy wheels with locking bolts, keep the key somewhere you can find it (and tell your owner's pack).",
          ]}
        />
      </ContentSection>

      <ContentSection title="Re-torque after 50 miles">
        <P>
          Whenever wheels have been removed and refitted — new wheels, seasonal swaps, a
          puncture repair — re-check the torque after the first <strong className="text-white">50 miles
          (about 80 km)</strong> of driving. Newly seated wheel-to-hub interfaces can settle as
          the car is driven, and the manufacturer-supplied bolts on fresh wheel packages are
          exactly when this matters most. It takes two minutes with a torque wrench.
        </P>
      </ContentSection>

      <ContentSection title="Cracks, bends & corrosion">
        <P>
          Alloys crack and bend when they take impacts — potholes, kerbs, speed bumps taken
          fast. Damage progresses slowly and silently, so inspect:
        </P>
        <UL
          items={[
            "Cracks around the bolt holes, spokes and the rim edge — look for hairline lines and dark oxidised trails in the lacquer.",
            "Bent rims — a wobble at speed, steering vibration or a slow air leak from the bead are classic signs.",
            "Corrosion at the bead seat — where the tyre meets the rim — can cause air to weep past the tyre.",
            "Kerbing damage: cosmetic scrapes are one thing; gouges that remove material from the rim edge are structural.",
          ]}
        />
        <P>
          If you suspect structural damage, get the wheel inspected by a professional before
          continuing to use it. A buckled or cracked alloy is not a cosmetic problem.
        </P>
      </ContentSection>

      <ContentSection title="Load ratings & fitment compatibility">
        <P>
          Wheels carry load ratings defined by standards — the wheel set must match or exceed
          your car's requirements, especially on heavier cars, estates and vans. Fitment is more
          than bolt pattern: offset, centre bore, brake clearance and tyres all have to line up
          with your exact vehicle. That's why we verify compatibility before confirming any
          order, and why we don't make blanket "these will fit" promises.
        </P>
      </ContentSection>

      <ContentSection title="Cleaning & care">
        <UL
          items={[
            "Use pH-neutral wheel cleaner and a soft brush — abrasive or acid cleaners strip lacquer over time.",
            "Rinse after winter driving: road salt attacks alloy and bolts.",
            "Don't overtighten to 'compensate' for corrosion — clean the hub faces instead.",
          ]}
        />
      </ContentSection>

      <NoteBox title="Honest note">
        <p>
          This guide is educational and general — your vehicle's handbook and a qualified
          technician are the references that count for your specific car. N2 Wheels' sample
          fitment data is demo data and never a fitment guarantee.
        </p>
      </NoteBox>

      <PageCta secondaryTo="/wheels" secondaryLabel="Browse Wheels" />

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm">
        <Link to="/fitment-guide" className="link-muted font-medium">
          Fitment guide →
        </Link>
        <Link to="/tyre-safety" className="link-muted font-medium">
          Tyre safety guide →
        </Link>
      </div>
    </ContentPage>
  );
}