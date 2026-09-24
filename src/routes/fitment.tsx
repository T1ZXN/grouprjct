import { createFileRoute } from "@tanstack/react-router";
import { FitmentSearch } from "~/components/FitmentSearch";

export const Route = createFileRoute("/fitment")({
  head: () => ({
    meta: [
      { title: "Find Tyres & Wheels For My Car | N2 Wheels" },
      {
        name: "description",
        content:
          "Find tyres and alloy wheels for your car by UK registration or by make, model and year. The plate lookup reads your car from the live UK registration record; the tyre and wheel matches shown are sample data — we verify compatibility with your exact vehicle before confirming any order.",
      },
    ],
  }),
  component: FitmentPage,
});

/**
 * The fitment search page.
 *
 * ONE search answers for BOTH lines (owner direction 2026-09-17: tyres first,
 * wheels as the bonus line): a resolved vehicle lists the tyres, wheels and
 * packages whose sample fitment records cover it. The registration path stays
 * honest — a plate that can't be resolved is never turned into a vehicle.
 */
function FitmentPage() {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-16 sm:py-24">
        <div className="max-w-3xl">
          <span className="sample-chip">Tyre &amp; wheel fitment</span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Find The Right Tyres &amp; Wheels For Your Car
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-steel sm:text-base">
            Enter your UK registration or choose make, model and year — we'll show the tyres and
            wheels our sample catalogue lists for that car, tyres first. The plate lookup reads
            your car's details from the live UK registration record; the tyre and wheel matches
            shown are sample data. We verify compatibility with your exact vehicle before
            confirming any order — nothing is recommended with a blanket fitment guarantee.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-steel">
            <li>· Tyres that fit your car — by size range in our sample catalogue.</li>
            <li>· Alloy wheels that fit your car — by make and model in our sample fitment data.</li>
            <li>· Complete wheel and tyre packages for the same vehicle.</li>
          </ul>
          <div className="mt-8">
            <FitmentSearch />
          </div>
        </div>
      </div>
    </section>
  );
}
