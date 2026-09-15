import { createFileRoute, Link } from "@tanstack/react-router";
import { Breadcrumb, SpecTable } from "~/components/SpecTable";
import { StockChip } from "~/components/ProductCard";
import { DEMO_NOTICE, demoTypes, tyreSizeLabel } from "~/data/products";
import type { Tyre } from "~/data/products";
import { formatGBP } from "~/lib/pricing";
import { useLiveProduct } from "~/lib/liveCatalogue";

export const Route = createFileRoute("/tyres/$id")({
  loader: ({ params }) => demoTypes.find((t) => t.id === params.id) ?? null,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.brand} ${loaderData.name} ${tyreSizeLabel(loaderData)} — N2 Wheels`
          : "Tyre not found | N2 Wheels",
      },
      {
        name: "description",
        content: loaderData
          ? loaderData.description
          : "The tyre you were looking for isn't in our sample catalogue.",
      },
    ],
  }),
  component: TyreDetailPage,
});

function TyreDetailPage() {
  const sample = Route.useLoaderData();
  const params = Route.useParams();
  // Live catalogue hydration: the sample (prerendered) row is shown until a
  // Supabase read succeeds in the browser; then the database row takes over
  // (price, stock, name come from the live row; the URL slug is the row id).
  const live = useLiveProduct<Tyre>(params.id, "tyres");
  const tyre = live ?? sample;
  if (!tyre) return <TyreNotFound />;
  return <TyreDetail tyre={ tyre } />;
}

function TyreDetail({ tyre }: { tyre: Tyre }) {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-10 sm:py-14">
        <Breadcrumb
          items={[
            { label: "Home", to: "/" },
            { label: "Tyres", to: "/tyres" },
            { label: tyre.name },
          ]}
        />

        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
            <img
              src={tyre.image}
              alt={`${tyre.brand} ${tyre.name} tyre ${tyreSizeLabel(tyre)}`}
              className="aspect-square w-full object-cover"
            />
          </div>

          <div>
            <span className="sample-chip">Sample data</span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-steel">
              {tyre.brand} · {tyre.season}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {tyre.name}
            </h1>
            <p className="mt-2 text-lg font-semibold text-white">{tyreSizeLabel(tyre)}</p>
            <p className="mt-1 text-sm text-steel">
              Load index {tyre.loadIndex.split(" ")[0]} · Speed rating {tyre.speedRating}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <p className="text-3xl font-bold text-white">{formatGBP(tyre.retailPriceIncVat)}</p>
              <StockChip status={tyre.stockStatus} />
            </div>
            <p className="mt-1 text-xs text-steel-dim">Price includes UK VAT at 20%.</p>

            <p className="mt-5 text-sm leading-relaxed text-steel">{tyre.description}</p>

            <div className="mt-5 rounded-lg border border-race/30 bg-race/5 p-4 text-sm leading-relaxed text-steel">
              Check your current tyre size before ordering — we verify the exact fitment for your
              vehicle before confirming any order.
            </div>

            <Link to="/tyres" className="btn btn-red mt-6">
              Browse Tyres
            </Link>
          </div>
        </div>

        <div className="mt-12 max-w-2xl">
          <SpecTable
            title="Specifications"
            rows={[
              { label: "Section width", value: `${tyre.width} mm` },
              { label: "Aspect ratio", value: `${tyre.aspect}` },
              { label: "Rim diameter", value: `${tyre.rimDiameter}"` },
              { label: "Size", value: tyreSizeLabel(tyre) },
              { label: "Load index", value: tyre.loadIndex },
              { label: "Speed rating", value: tyre.speedRating },
              { label: "Season", value: tyre.season },
              { label: "Price inc. VAT", value: formatGBP(tyre.retailPriceIncVat) },
            ]}
          />
          <p className="mt-5 text-xs text-steel-dim">{DEMO_NOTICE}</p>
        </div>
      </div>
    </section>
  );
}

function TyreNotFound() {
  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-20 text-center sm:py-28">
        <span className="sample-chip">Sample data</span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Tyre not found
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-steel sm:text-base">
          That tyre isn&apos;t in the sample catalogue — it may be part of a future feed update.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/tyres" className="btn btn-outline">
            Back to Tyres
          </Link>
          <Link to="/fitment" className="btn btn-red">
            Find Wheels For My Car
          </Link>
        </div>
      </div>
    </section>
  );
}