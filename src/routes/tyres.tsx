import { useMemo } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { CataloguePage } from "~/components/CataloguePage";
import { SortSelect } from "~/components/CatalogueFilters";
import { ProductCard } from "~/components/ProductCard";
import { demoTypes, STOCK_STATUSES, tyreSizeLabel } from "~/data/products";
import type { Tyre } from "~/data/products";
import { useLiveCatalogue } from "~/lib/liveCatalogue";
import { formatGBP } from "~/lib/pricing";
import { applyPriceSort, SORT_OPTIONS, toSearchString } from "~/lib/catalogue";
import type { PriceSort } from "~/lib/catalogue";

interface TyresSearch {
  q?: string;
  width?: string;
  aspect?: string;
  rim?: string;
  brand?: string;
  season?: string;
  priceMin?: string;
  priceMax?: string;
  availability?: string;
  sort?: string;
}

const FILTER_KEYS = ["width", "aspect", "rim", "brand", "season", "priceMin", "priceMax", "availability"];

const unique = (values: string[]): string[] => [...new Set(values)];

export const Route = createFileRoute("/tyres")({
  validateSearch: (search: Record<string, unknown>): TyresSearch => ({
    q: toSearchString(search.q),
    width: toSearchString(search.width),
    aspect: toSearchString(search.aspect),
    rim: toSearchString(search.rim),
    brand: toSearchString(search.brand),
    season: toSearchString(search.season),
    priceMin: toSearchString(search.priceMin),
    priceMax: toSearchString(search.priceMax),
    availability: toSearchString(search.availability),
    sort: toSearchString(search.sort),
  }),
  head: () => ({
    meta: [
      { title: "Tyres UK | N2 Wheels" },
      {
        name: "description",
        content:
          "Performance summer, all-season and winter tyres in popular UK sizes. Demo catalogue — sample data only; no live stock or availability is claimed.",
      },
    ],
  }),
  component: TyresPage,
});

function TyresPage() {
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
      ? (live.products.filter((p) => p.category === "tyres") as Tyre[])
      : null;
  const items = liveItems ?? demoTypes;
  const widthOptions = useMemo(
    () => unique(items.map((t) => String(t.width))).sort((a, b) => +a - +b),
    [items],
  );
  const aspectOptions = useMemo(
    () => unique(items.map((t) => String(t.aspect))).sort((a, b) => +a - +b),
    [items],
  );
  const rimOptions = useMemo(
    () => unique(items.map((t) => String(t.rimDiameter))).sort((a, b) => +a - +b),
    [items],
  );
  const brandOptions = useMemo(() => unique(items.map((t) => t.brand)), [items]);
  const seasonOptions = useMemo(() => unique(items.map((t) => t.season)), [items]);

  // A child ($id) route is matched (e.g. /tyres/t-strada-sp01) — hand off to
  // the child instead of rendering this list page (this list route is the
  // parent/layout of the $id detail routes).
  if (matches.length > 2) return <Outlet />;

  const setFilter = (key: string, value: string | undefined) => {
    navigate({
      to: "/tyres",
      search: (prev) => {
        const next: TyresSearch = { ...prev };
        if (value === undefined) delete next[key as keyof TyresSearch];
        else (next as Record<string, string>)[key] = value;
        return next;
      },
    });
  };

  const clearFilters = () => {
    navigate({ to: "/tyres", search: { q: search.q } });
  };

  const min = search.priceMin !== undefined ? Number(search.priceMin) : undefined;
  const max = search.priceMax !== undefined ? Number(search.priceMax) : undefined;
  const hasMin = min !== undefined && !Number.isNaN(min);
  const hasMax = max !== undefined && !Number.isNaN(max);

  const filtered = useMemo(() => {
    const ql = search.q?.toLowerCase();
    const list = items.filter((t: Tyre) => {
      if (ql) {
        const hay = `${t.brand} ${t.name} ${t.season} ${t.description} ${tyreSizeLabel(t)}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (search.width && String(t.width) !== search.width) return false;
      if (search.aspect && String(t.aspect) !== search.aspect) return false;
      if (search.rim && String(t.rimDiameter) !== search.rim) return false;
      if (search.brand && t.brand !== search.brand) return false;
      if (search.season && t.season !== search.season) return false;
      if (hasMin && t.retailPriceIncVat < min!) return false;
      if (hasMax && t.retailPriceIncVat > max!) return false;
      if (search.availability && t.stockStatus !== search.availability) return false;
      return true;
    });
    return applyPriceSort(list, search.sort as PriceSort, (t) => t.retailPriceIncVat);
  }, [items, search, hasMin, hasMax, min, max]);

  return (
    <CataloguePage
      title="Tyres"
      blurb="Performance summer, all-season and winter tyres to match your fitment — filter by size, season, brand and price."
      fields={[
        { key: "q", label: "Search", type: "text", placeholder: "Search tyres…" },
        { key: "width", label: "Width (mm)", type: "select", options: widthOptions.map((v) => ({ value: v, label: v })) },
        { key: "aspect", label: "Aspect / profile", type: "select", options: aspectOptions.map((v) => ({ value: v, label: v })) },
        { key: "rim", label: "Rim diameter", type: "select", options: rimOptions.map((v) => ({ value: v, label: `${v}"` })) },
        { key: "brand", label: "Brand", type: "select", options: brandOptions.map((v) => ({ value: v, label: v })) },
        { key: "season", label: "Season", type: "select", options: seasonOptions.map((v) => ({ value: v, label: v })) },
        { key: "priceMin", label: "Min price (£)", type: "number", placeholder: "e.g. 80", min: 0 },
        { key: "priceMax", label: "Max price (£)", type: "number", placeholder: "e.g. 200", min: 0 },
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
      emptyMessage="No tyres match your filters — clear filters to see the full sample range."
    >
      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((t) => (
          <ProductCard
            key={t.id}
            href={`/tyres/${t.id}`}
            image={t.image}
            imageAlt={`${t.brand} ${t.name} tyre ${tyreSizeLabel(t)}`}
            eyebrow={`${t.brand} · ${t.season}`}
            title={t.name}
            meta={[tyreSizeLabel(t), `Load ${t.loadIndex}`]}
            price={formatGBP(t.retailPriceIncVat)}
            stockStatus={t.stockStatus}
            dimmed={t.stockStatus === "Out of stock"}
          />
        ))}
      </div>
    </CataloguePage>
  );
}