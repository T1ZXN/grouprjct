import { createFileRoute, Link } from "@tanstack/react-router";
import { Breadcrumb, SpecTable } from "~/components/SpecTable";
import { StockChip } from "~/components/ProductCard";
import { FitmentChecker } from "~/components/FitmentChecker";
import { AddToBasket } from "~/components/AddToBasket";
import { DEMO_NOTICE, demoWheels, wheelSizeLabel } from "~/data/products";
import type { Wheel } from "~/data/products";
import { formatGBP } from "~/lib/pricing";
import { useLiveProduct } from "~/lib/liveCatalogue";

/** Canonical site base used for JSON-LD absolute URLs (never localhost). */
const WHEEL_SITE_BASE = "https://0db91f50521ace36d5f63f7aac07e858.ctonew.app";
const availabilityUri = (status: Wheel["stockStatus"]): string => {
  switch (status) {
    case "In Stock":
      return "https://schema.org/InStock";
    case "Available to order":
      return "https://schema.org/BackOrder";
    case "Out of stock":
      return "https://schema.org/OutOfStock";
    default:
      return "https://schema.org/LimitedAvailability";
  }
};
/** Product structured data (JSON-LD) — simple, correct, wheels only. */
function wheelJsonLd(w: Wheel) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${w.brand} ${w.name}`,
    image: `${WHEEL_SITE_BASE}${w.image}`,
    description: w.description,
    sku: w.supplierId ?? w.id,
    brand: { "@type": "Brand", name: w.brand },
    offers: {
      "@type": "Offer",
      price: w.retailPriceIncVat,
      priceCurrency: "GBP",
      availability: availabilityUri(w.stockStatus),
      url: `${WHEEL_SITE_BASE}/wheels/${w.id}`,
      itemCondition: "https://schema.org/NewCondition",
    },
  };
}

export const Route = createFileRoute("/wheels/$id")({
  loader: ({ params }) => demoWheels.find((w) => w.id === params.id) ?? null,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.brand} ${loaderData.name} ${loaderData.size.diameter}" × ${loaderData.size.width} — N2 Wheels`
          : "Wheel not found | N2 Wheels",
      },
      {
        name: "description",
        content: loaderData
          ? `${loaderData.description} Check "will this fit my car?" against our sample fitment data — we verify with your exact vehicle before confirming any order.`
          : "The alloy wheel you were looking for isn't in our sample catalogue.",
      },
    ],
    scripts: loaderData
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify(wheelJsonLd(loaderData)).replace(
              /</g,
              "\\u003c",
            ),
          },
        ]
      : [],
  }),
  component: WheelDetailPage,
});

function WheelDetailPage() {
  const sample = Route.useLoaderData();
  const params = Route.useParams();
  // Live catalogue hydration: the sample (prerendered) row is shown until a
  // Supabase read succeeds in the browser; then the database row takes over
  // (price, stock, name come from the live row; the URL slug is the row id).
  const live = useLiveProduct<Wheel>(params.id, "wheels");
  const wheel = live ?? sample;
  if (!wheel) return <WheelNotFound />;
  return <WheelDetail wheel={wheel} />;
}

function WheelDetail({ wheel }: { wheel: Wheel }) {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-10 sm:py-14">
        <Breadcrumb
          items={[
            { label: "Home", to: "/" },
            { label: "Wheels", to: "/wheels" },
            { label: wheel.name },
          ]}
        />

        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:items-start">
          {/* Hero image */}
          <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
            <img
              src={wheel.image}
              alt={`${wheel.brand} ${wheel.name} alloy wheel`}
              className="aspect-square w-full object-cover"
            />
          </div>

          {/* Summary */}
          <div>
            <span className="sample-chip">Sample data</span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-steel">
              {wheel.brand} · {wheel.colour}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {wheel.name}
            </h1>
            <p className="mt-2 text-lg font-semibold text-white">
              {wheelSizeLabel(wheel.size)}
            </p>
            <p className="mt-1 text-sm text-steel">{wheel.finish}</p>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <p className="text-3xl font-bold text-white">
                {formatGBP(wheel.retailPriceIncVat)}
              </p>
              <StockChip status={wheel.stockStatus} />
            </div>
            <p className="mt-1 text-xs text-steel-dim">
              Price includes UK VAT at 20%.
            </p>

            <p className="mt-5 text-sm leading-relaxed text-steel">
              {wheel.description}
            </p>
            <p className="mt-3 text-sm font-semibold text-white">
              {wheel.includedBolts}
            </p>

            <div className="mt-5 rounded-lg border border-race/30 bg-race/5 p-4 text-sm leading-relaxed text-steel">
              We verify compatibility with your exact vehicle — geometry, PCD,
              offset and centre bore — before confirming any order.
            </div>
            <AddToBasket product={wheel} />
            <Link to="/fitment" className="btn btn-outline mt-3">
              Find Wheels For My Car
            </Link>
          </div>
        </div>

        {/* Spec table */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <SpecTable
            title="Specifications"
            rows={[
              { label: "Diameter", value: `${wheel.size.diameter}"` },
              { label: "Width", value: wheel.size.width },
              { label: "PCD", value: wheel.size.pcd },
              { label: "Offset (ET)", value: wheel.size.offset },
              { label: "Colour", value: wheel.colour },
              { label: "Finish", value: wheel.finish },
              {
                label: "Price inc. VAT",
                value: formatGBP(wheel.retailPriceIncVat),
              },
              { label: "Included", value: wheel.includedBolts },
            ]}
          />
          <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
            <h2 className="border-b border-line bg-coal/60 px-5 py-3.5 text-sm font-bold uppercase tracking-wider text-white">
              Sample vehicle compatibility
            </h2>
            <div className="p-5">
              <p className="text-sm leading-relaxed text-steel">
                Make-level guidance only (sample data): these makes commonly run
                fitments like this. Every order is checked against your exact
                vehicle before confirmation.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {wheel.vehicleCompatibility.map((make) => (
                  <li
                    key={make}
                    className="rounded-full border border-white/10 bg-coal px-3 py-1 text-xs font-semibold text-white"
                  >
                    {make}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-steel-dim">{DEMO_NOTICE}</p>
            </div>
          </div>
        </div>

        {/* Will this fit my car? + fitting information */}
        <div className="mt-12 grid items-start gap-6 lg:grid-cols-2">
          <FitmentChecker
            fitments={wheel.vehicleFitments}
            makes={wheel.vehicleCompatibility}
            productName={`${wheel.brand} ${wheel.name}`}
          />
          <FittingInfo wheel={wheel} />
        </div>
      </div>
    </section>
  );
}

/** Educational, factual fitting information — no guarantees, no claims. */
function FittingInfo({ wheel }: { wheel: Wheel }) {
  const points: { term: string; desc: string }[] = [
    {
      term: `Diameter (${wheel.size.diameter}")`,
      desc: "Rim size in inches. The tyre's rim diameter must match the wheel diameter exactly.",
    },
    {
      term: `Width (${wheel.size.width})`,
      desc: "Rim width in inches (the J is the bead profile). Width affects which tyre sizes are approved for the rim and how the wheel sits in the arch.",
    },
    {
      term: `PCD (${wheel.size.pcd})`,
      desc: "Pitch circle diameter — the bolt-hole pattern. 5x112 means five bolts on a 112 mm circle. The pattern must match your hub or the wheel cannot be fitted.",
    },
    {
      term: `Offset / ET (${wheel.size.offset})`,
      desc: "The offset (ET) is the distance in mm from the wheel's centreline to the hub mounting face. It controls how far the wheel sits in or out of the arch.",
    },
    {
      term: "Centre bore & spigot rings",
      desc: "The wheel's centre bore should match your hub. If the bore is larger, spigot/centric rings adapt it precisely — we confirm this (and rings are available in Accessories) before your order.",
    },
    {
      term: "TPMS / valves",
      desc: "Cars with factory tyre-pressure monitoring (TPMS) need compatible valves or sensors when wheels are changed. We check this against your exact vehicle before confirming.",
    },
    {
      term: "Bolts",
      desc: wheel.includedBolts
        ? `This sample wheel includes its bolts (${wheel.includedBolts}) — we still confirm the bolt seat, length and thread against your exact vehicle before confirming.`
        : "Bolts are confirmed against your exact vehicle before we confirm your order.",
    },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
      <h2 className="border-b border-line bg-coal/60 px-5 py-3.5 text-sm font-bold uppercase tracking-wider text-white">
        Fitting information
      </h2>
      <div className="p-5">
        <p className="text-sm leading-relaxed text-steel">
          The numbers on a wheel tell you whether it can physically go on your
          car. Here&apos;s what they mean:
        </p>
        <ul className="mt-4 space-y-3.5">
          {points.map((p) => (
            <li key={p.term} className="text-sm leading-relaxed">
              <span className="font-semibold text-white">{p.term} — </span>
              <span className="text-steel">{p.desc}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs leading-relaxed text-steel-dim">
          Every order is checked against your exact vehicle (geometry, PCD,
          offset, centre bore and brake clearance) before we confirm it — this
          guide is educational only and not a fitment guarantee.
        </p>
      </div>
    </div>
  );
}

function WheelNotFound() {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-20 text-center sm:py-28">
        <span className="sample-chip">Sample data</span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Wheel not found
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-steel sm:text-base">
          That wheel isn&apos;t in the sample catalogue — it may be part of a
          future feed update.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/wheels" className="btn btn-outline">
            Back to Alloy Wheels
          </Link>
          <Link to="/fitment" className="btn btn-red">
            Find Wheels For My Car
          </Link>
        </div>
      </div>
    </section>
  );
}
