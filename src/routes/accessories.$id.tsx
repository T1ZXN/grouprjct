import { createFileRoute, Link } from "@tanstack/react-router";
import { Breadcrumb, SpecTable } from "~/components/SpecTable";
import { StockChip } from "~/components/ProductCard";
import { DEMO_NOTICE, demoAccessories } from "~/data/products";
import type { Accessory } from "~/data/products";
import { formatGBP } from "~/lib/pricing";
import { useLiveProduct } from "~/lib/liveCatalogue";
import { AddToBasket } from "~/components/AddToBasket";

export const Route = createFileRoute("/accessories/$id")({
  loader: ({ params }) =>
    demoAccessories.find((a) => a.id === params.id) ?? null,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.name} — N2 Wheels`
          : "Accessory not found | N2 Wheels",
      },
      {
        name: "description",
        content: loaderData
          ? loaderData.description
          : "The wheel accessory you were looking for isn't in our sample catalogue.",
      },
    ],
  }),
  component: AccessoryDetailPage,
});

function AccessoryDetailPage() {
  const sample = Route.useLoaderData();
  const params = Route.useParams();
  // Live catalogue hydration: the sample (prerendered) row is shown until a
  // Supabase read succeeds in the browser; then the database row takes over
  // (price, stock, name come from the live row; the URL slug is the row id).
  const live = useLiveProduct<Accessory>(params.id, "accessories");
  const accessory = live ?? sample;
  if (!accessory) return <AccessoryNotFound />;
  return <AccessoryDetail accessory={accessory} />;
}

function AccessoryDetail({ accessory }: { accessory: Accessory }) {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-10 sm:py-14">
        <Breadcrumb
          items={[
            { label: "Home", to: "/" },
            { label: "Accessories", to: "/accessories" },
            { label: accessory.name },
          ]}
        />

        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
            <img
              src={accessory.image}
              alt={accessory.name}
              className="aspect-square w-full object-cover"
            />
          </div>

          <div>
            <span className="sample-chip">Sample data</span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-steel">
              {accessory.brand} · Wheel accessory
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {accessory.name}
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <p className="text-3xl font-bold text-white">
                {formatGBP(accessory.retailPriceIncVat)}
              </p>
              <StockChip status={accessory.stockStatus} />
            </div>
            <p className="mt-1 text-xs text-steel-dim">
              Price includes UK VAT at 20%.
            </p>

            <p className="mt-5 text-sm leading-relaxed text-steel">
              {accessory.description}
            </p>

            <div className="mt-5 rounded-lg border border-race/30 bg-race/5 p-4 text-sm leading-relaxed text-steel">
              Check thread size, seat type and fitment details with our team
              before ordering — we verify compatibility with your exact wheel
              and vehicle before confirming any order.
            </div>

            <AddToBasket product={accessory} />
            <Link to="/accessories" className="btn btn-outline mt-3">
              Browse Accessories
            </Link>
          </div>
        </div>

        <div className="mt-12 max-w-2xl">
          <SpecTable
            title="Details"
            rows={[
              { label: "Brand", value: accessory.brand },
              { label: "Type", value: "Wheel accessory" },
              {
                label: "Price inc. VAT",
                value: formatGBP(accessory.retailPriceIncVat),
              },
            ]}
          />
          <p className="mt-5 text-xs text-steel-dim">{DEMO_NOTICE}</p>
        </div>
      </div>
    </section>
  );
}

function AccessoryNotFound() {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-20 text-center sm:py-28">
        <span className="sample-chip">Sample data</span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Accessory not found
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-steel sm:text-base">
          That accessory isn&apos;t in the sample catalogue — it may be part of
          a future feed update.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/accessories" className="btn btn-outline">
            Back to Accessories
          </Link>
          <Link to="/fitment" className="btn btn-red">
            Find Wheels For My Car
          </Link>
        </div>
      </div>
    </section>
  );
}
