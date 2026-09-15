import { useMemo } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { CataloguePage } from "~/components/CataloguePage";
import { SortSelect } from "~/components/CatalogueFilters";
import { ProductCard } from "~/components/ProductCard";
import { demoAccessories, STOCK_STATUSES } from "~/data/products";
import { useLiveCatalogue } from "~/lib/liveCatalogue";
import type { Accessory } from "~/data/products";
import { formatGBP } from "~/lib/pricing";
import { applyPriceSort, SORT_OPTIONS, toSearchString } from "~/lib/catalogue";
import type { PriceSort } from "~/lib/catalogue";

interface AccessoriesSearch {
  q?: string;
  brand?: string;
  priceMin?: string;
  priceMax?: string;
  availability?: string;
  sort?: string;
}

const FILTER_KEYS = ["brand", "priceMin", "priceMax", "availability"];

const unique = (values: string[]): string[] => [...new Set(values)];

/** The accessory lines N2 Wheels will stock (honest list, no stock claimed). */
const ACCESSORY_LINES = [
  "Wheel bolts",
  "Wheel nuts",
  "Locking wheel nuts",
  "Hub / centric rings",
  "Centre caps",
  "Fitting accessories",
];

export const Route = createFileRoute("/accessories")({
  validateSearch: (search: Record<string, unknown>): AccessoriesSearch => ({
    q: toSearchString(search.q),
    brand: toSearchString(search.brand),
    priceMin: toSearchString(search.priceMin),
    priceMax: toSearchString(search.priceMax),
    availability: toSearchString(search.availability),
    sort: toSearchString(search.sort),
  }),
  head: () => ({
    meta: [
      { title: "Wheel Accessories | N2 Wheels" },
      {
        name: "description",
        content:
          "Wheel bolts, nuts, locking wheel nuts, hub centric rings, centre caps and fitting accessories. Demo catalogue — sample products, no live stock claimed.",
      },
    ],
  }),
  component: AccessoriesPage,
});

function AccessoriesPage() {
  // All hooks run unconditionally (before the <Outlet/> hand-off) so the hook
  // order stays identical whether this layout renders the list or a child
  // detail route.
  const matches = useRouterState({ select: (st) => st.matches });
  const search = Route.useSearch();
  const navigate = useNavigate();
  // Live catalogue hydration: sample (prerendered) data until a Supabase read
  // succeeds in the browser; then the database rows take over.
  const live = useLiveCatalogue();
  const liveItems =
    live.source === "supabase" && live.products
      ? (live.products.filter((p) => p.category === "accessories") as Accessory[])
      : null;
  const items = liveItems ?? demoAccessories;
  const brandOptions = useMemo(() => unique(items.map((a) => a.brand)), [items]);

  // A child ($id) route is matched (e.g. /accessories/acc-hub-rings) — hand off
  // to the child instead of rendering this list page (this list route is the
  // parent/layout of the $id detail routes).
  if (matches.length > 2) return <Outlet />;

  const setFilter = (key: string, value: string | undefined) => {
    navigate({
      to: "/accessories",
      search: (prev) => {
        const next: AccessoriesSearch = { ...prev };
        if (value === undefined) delete next[key as keyof AccessoriesSearch];
        else (next as Record<string, string>)[key] = value;
        return next;
      },
    });
  };

  const clearFilters = () => {
    navigate({ to: "/accessories", search: { q: search.q } });
  };

  const min = search.priceMin !== undefined ? Number(search.priceMin) : undefined;
  const max = search.priceMax !== undefined ? Number(search.priceMax) : undefined;
  const hasMin = min !== undefined && !Number.isNaN(min);
  const hasMax = max !== undefined && !Number.isNaN(max);

  const filtered = useMemo(() => {
    const ql = search.q?.toLowerCase();
    const list = items.filter((a: Accessory) => {
      if (ql) {
        const hay = `${a.name} ${a.brand} ${a.description}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (search.brand && a.brand !== search.brand) return false;
      if (hasMin && a.retailPriceIncVat < min!) return false;
      if (hasMax && a.retailPriceIncVat > max!) return false;
      if (search.availability && a.stockStatus !== search.availability) return false;
      return true;
    });
    return applyPriceSort(list, search.sort as PriceSort, (a) => a.retailPriceIncVat);
  }, [items, search, hasMin, hasMax, min, max]);

  return (
    <CataloguePage
      title="Wheel Accessories"
      blurb="The finishing touches for your wheel set — bolts, nuts, locking security, hub rings, centre caps and fitting accessories. All items shown are sample products; no live stock or availability is claimed."
      fields={[
        { key: "q", label: "Search", type: "text", placeholder: "Search accessories…" },
        { key: "brand", label: "Brand", type: "select", options: brandOptions.map((v) => ({ value: v, label: v })) },
        { key: "priceMin", label: "Min price (£)", type: "number", placeholder: "e.g. 5", min: 0 },
        { key: "priceMax", label: "Max price (£)", type: "number", placeholder: "e.g. 50", min: 0 },
        { key: "availability", label: "Availability", type: "select", options: STOCK_STATUSES.map((v) => ({ value: v, label: v })) },
      ]}
      values={search}
      filterKeys={FILTER_KEYS}
      onChange={setFilter}
      onClearAll={clearFilters}
      sortControl={
        <SortSelect value={search.sort} onChange={(v) => setFilter("sort", v)} options={SORT_OPTIONS} />
      }
      resultCount={filtered.length}
      emptyMessage="No accessories match your filters — clear filters to see the sample range."
    >
      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((a) => (
          <ProductCard
            key={a.id}
            href={`/accessories/${a.id}`}
            image={a.image}
            imageAlt={`${a.name} wheel accessory`}
            eyebrow={a.brand}
            title={a.name}
            price={formatGBP(a.retailPriceIncVat)}
            stockStatus={a.stockStatus}
            dimmed={a.stockStatus === "Out of stock"}
          />
        ))}
      </div>
      {/* Honest lines list — the categories we will stock once the real feed lands */}
      <div className="mt-10 rounded-xl border border-white/10 bg-carbon p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">
          Accessory lines we stock
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-steel">
          When the full product feed is connected, these lines will have the complete range:
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACCESSORY_LINES.map((line) => (
            <li key={line} className="flex items-center gap-2 text-sm text-steel">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-race" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </CataloguePage>
  );
}