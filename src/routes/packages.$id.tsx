import { createFileRoute, Link } from "@tanstack/react-router";
import { Breadcrumb, SpecTable } from "~/components/SpecTable";
import { StockChip } from "~/components/ProductCard";
import { FitmentChecker } from "~/components/FitmentChecker";
import {
  DEMO_NOTICE,
  demoPackages,
  tyreSizeLabel,
  wheelSizeLabel,
} from "~/data/products";
import type { WheelPackage } from "~/data/products";
import { formatGBP } from "~/lib/pricing";
import { useLiveProduct } from "~/lib/liveCatalogue";
import { AddToBasket } from "~/components/AddToBasket";

export const Route = createFileRoute("/packages/$id")({
  loader: ({ params }) => demoPackages.find((p) => p.id === params.id) ?? null,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.name} — Wheel & Tyre Package | N2 Wheels`
          : "Package not found | N2 Wheels",
      },
      {
        name: "description",
        content: loaderData
          ? `${loaderData.description} View the package breakdown and check "will this fit my car?" against our sample fitment data.`
          : "The wheel & tyre package you were looking for isn't in our sample catalogue.",
      },
    ],
  }),
  component: PackageDetailPage,
});

function PackageDetailPage() {
  const sample = Route.useLoaderData();
  const params = Route.useParams();
  // Live catalogue hydration: the sample (prerendered) row is shown until a
  // Supabase read succeeds in the browser; then the database row takes over
  // (price, stock, name come from the live row; the URL slug is the row id).
  const live = useLiveProduct<WheelPackage>(params.id, "packages");
  const pkg = live ?? sample;
  if (!pkg) return <PackageNotFound />;
  return <PackageDetail pkg={pkg} />;
}

function PackageDetail({ pkg }: { pkg: WheelPackage }) {
  const tyreLine = pkg.tyreSpec
    ? `${pkg.tyreSpec.brand} ${pkg.tyreSpec.model} — ${tyreSizeLabel(pkg.tyreSpec)}`
    : (pkg.includes.find((l) => /tyre/i.test(l)) ?? "—");

  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-10 sm:py-14">
        <Breadcrumb
          items={[
            { label: "Home", to: "/" },
            { label: "Wheel & Tyre Packages", to: "/packages" },
            { label: pkg.name },
          ]}
        />

        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
            <img
              src={pkg.image}
              alt={`${pkg.name} wheel and tyre package`}
              className="aspect-square w-full object-cover"
            />
          </div>
          <div>
            <span className="sample-chip">Sample data</span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-steel">
              {pkg.diameter}" setup · complete set
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {pkg.name}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <p className="text-3xl font-bold text-white">
                {formatGBP(pkg.retailPriceIncVat)}
              </p>
              <StockChip status={pkg.stockStatus} />
            </div>
            <p className="mt-1 text-xs text-steel-dim">
              Price includes UK VAT at 20%.
            </p>
            <p className="mt-5 text-sm leading-relaxed text-steel">
              {pkg.description}
            </p>
            <div className="mt-5 rounded-lg border border-race/30 bg-race/5 p-4 text-sm leading-relaxed text-steel">
              Package contents are fixed sample sets — we verify the complete
              fitment for your exact vehicle before confirming any order.
            </div>
            <AddToBasket product={pkg} />
            <Link to="/packages" className="btn btn-outline mt-3">
              Browse Packages
            </Link>
          </div>
        </div>

        {/* Package contents breakdown */}
        <div className="mt-12 grid items-start gap-6 lg:grid-cols-2">
          <SpecTable
            title="Package contents"
            rows={[
              { label: "Wheel", value: pkg.includes[0] },
              {
                label: "Wheel fitment",
                value: pkg.wheelSpec ? wheelSizeLabel(pkg.wheelSpec) : "—",
              },
              { label: "Tyres", value: tyreLine },
              {
                label: "Tyres supplied fitted & balanced",
                value: (
                  <span className="text-right">
                    Yes
                    <sup className="ml-0.5 text-steel-dim">*</sup>
                  </span>
                ),
              },
              {
                label: "Includes",
                value: (
                  <ul className="space-y-1 text-right">
                    {pkg.includes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ),
              },
              {
                label: "Price inc. VAT",
                value: formatGBP(pkg.retailPriceIncVat),
              },
            ]}
          />
          <div className="flex flex-col gap-6">
            <div className="rounded-lg border border-white/10 bg-coal p-4 text-xs leading-relaxed text-steel-dim">
              <p>
                *Sample package detail — these are demo packages and we
                don&apos;t currently operate a fitting service. Fitting,
                balancing and any fitting charges are confirmed with you before
                any order is placed.
              </p>
              <p className="mt-3">{DEMO_NOTICE}</p>
            </div>
            <FitmentChecker
              fitments={pkg.vehicleFitments}
              productName={`the ${pkg.name}`}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PackageNotFound() {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-20 text-center sm:py-28">
        <span className="sample-chip">Sample data</span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Package not found
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-steel sm:text-base">
          That package isn&apos;t in the sample catalogue — it may be part of a
          future feed update.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/packages" className="btn btn-outline">
            Back to Packages
          </Link>
          <Link to="/fitment" className="btn btn-red">
            Find Wheels For My Car
          </Link>
        </div>
      </div>
    </section>
  );
}
