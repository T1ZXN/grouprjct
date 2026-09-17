import { createFileRoute } from "@tanstack/react-router";
import { FitmentSearch } from "~/components/FitmentSearch";

export const Route = createFileRoute("/fitment")({
  head: () => ({
    meta: [
      { title: "Find Wheels For My Car | N2 Wheels" },
      {
        name: "description",
        content:
          "Find alloy wheels for your car by UK registration or make, model and year. The plate lookup reads your car from the live UK registration record; wheel and tyre recommendations are sample data — we verify compatibility before confirming any order.",
      },
    ],
  }),
  component: FitmentPage,
});

function FitmentPage() {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-16 sm:py-24">
        <div className="max-w-3xl">
          <span className="sample-chip">Car fitment</span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Find The Right Wheels For Your Car
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-steel sm:text-base">
            Enter your UK registration or choose make, model and year and we'll recommend wheels
            suited to your car. The plate lookup reads your car's details from the live UK
            registration record; the wheel and tyre recommendations shown here are sample data.
            We verify compatibility with your exact vehicle before confirming any order — nothing
            is recommended with a blanket fitment guarantee.
          </p>
          <div className="mt-8">
            <FitmentSearch />
          </div>
        </div>
      </div>
    </section>
  );
}