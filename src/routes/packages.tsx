import { useMemo } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { CataloguePage } from "~/components/CataloguePage";
import { SortSelect } from "~/components/CatalogueFilters";
import { ProductCard } from "~/components/ProductCard";
import { demoPackages, STOCK_STATUSES } from "~/data/products";
import type { WheelPackage } from "~/data/products";
import { useLiveCatalogue } from "~/lib/liveCatalogue";
import { formatGBP } from "~/lib/pricing";
import {
  applyPriceSort,
  parseVehicleParam,
  SORT_OPTIONS,
  toSearchString,
} from "~/lib/catalogue";
import type { PriceSort } from "~/lib/catalogue";

interface PackagesSearch {
  q?: string;
  vehicle?: string;
  diameter?: string;
  brand?: string;
  text?: string;
  priceMin?: string;
  priceMax?: string;
  availability?: string;
  sort?: string;
}

const FILTER_KEYS = ["diameter", "brand", "text", "priceMin", "priceMax", "availability"];

const unique = (values: string[]): string[] => [...new Set(values)];

/** Brands named anywhere in the package contents (kept simple — text match on includes). */
const PACKAGE_BRAND_TOKENS = ["Forza", "Vortex", "Drifter", "Strada", "AllGrip"] as const;

const includesText = (p: WheelPackage): string => p.includes.join(" ");

export const Route = createFileRoute("/packages")({
  validateSearch: (search: Record<string, unknown>): PackagesSearch => ({
    q: toSearchString(search.q),
    vehicle: toSearchString(search.vehicle),
    diameter: toSearchString(search.diameter),
    brand: toSearchString(search.brand),
    text: toSearchString(search.text),
    priceMin: toSearchString(search.priceMin),
    priceMax: toSearchString(search.priceMax),
    availability: toSearchString(search.availability),
    sort: toSearchString(search.sort),
  }),
  head: () => ({
    meta: [
      { title: "Wheel & Tyre Packages UK | N2 Wheels" },
      {
        name: "description",
        content:
          "Complete wheel and tyre packages — wheels, tyres, valves and bolts together as a ready-to-fit set. Demo catalogue; sample data only.",
      },
    ],
  }),
  component: PackagesPage,
});

function PackagesPage() {
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
      ? (live.products.filter((p) => p.category === "packages") as WheelPackage[])
      : null;
  const items = liveItems ?? demoPackages;
  const brandOptions = useMemo(
    () =>
      unique(
        items.flatMap((p) =>
          PACKAGE_BRAND_TOKENS.filter((b) => p.includes.join(" ").includes(b)),
        ),
      ),
    [items],
  );
  const diameterOptions = useMemo(
    () => unique(items.map((p) => String(p.diameter))).sort((a, b) => +a - +b),
    [items],
  );


  const setFilter = (key: string, value: string | undefined) => {
    navigate({
      to: "/packages",
      search: (prev) => {
        const next: PackagesSearch = { ...prev };
        if (value === undefined) delete next[key as keyof PackagesSearch];
        else (next as Record<string, string>)[key] = value;
        return next;
      },
    });
  };

  const clearFilters = () => {
    navigate({ to: "/packages", search: { q: search.q, vehicle: search.vehicle } });
  };

  const min = search.priceMin !== undefined ? Number(search.priceMin) : undefined;
  const max = search.priceMax !== undefined ? Number(search.priceMax) : undefined;
  const hasMin = min !== undefined && !Number.isNaN(min);
  const hasMax = max !== undefined && !Number.isNaN(max);

  const filtered = useMemo(() => {
    const ql = search.q?.toLowerCase();
    const tl = search.text?.toLowerCase();
    const list = items.filter((p: WheelPackage) => {
      const text = includesText(p);
      if (ql) {
        const hay = `${p.name} ${text} ${p.description}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (search.diameter && String(p.diameter) !== search.diameter) return false;
      if (search.brand && !text.includes(search.brand)) return false;
      if (tl && !text.toLowerCase().includes(tl)) return false;
      if (hasMin && p.retailPriceIncVat < min!) return false;
      if (hasMax && p.retailPriceIncVat > max!) return false;
      if (search.availability && p.stockStatus !== search.availability) return false;
      return true;
    });
    return applyPriceSort(list, search.sort as PriceSort, (p) => p.retailPriceIncVat);
  }, [items, search, hasMin, hasMax, min, max]);

  const parsedVehicle = parseVehicleParam(search.vehicle);

  // A child ($id) route is matched (e.g. /packages/pkg-track-day) — hand off to
  // the child instead of rendering this list page (this list route is the
  // parent/layout of the $id detail routes).
  //
  // KEEP THIS CHECK BELOW EVERY HOOK of this component. The list route stays
  // MOUNTED while its $id child is shown, so returning early from further up
  // made the list→detail click render fewer hooks than the list render did,
  // and React threw error #300 — which the app's error boundary surfaced as
  // "Something went wrong" on every product card click (direct loads were
  // fine, because there the component mounts already in this branch).
  if (matches.length > 2) return <Outlet />;
  return (
    <CataloguePage
      title="Wheel & Tyre Packages"
      blurb="A complete ready-to-fit four-wheel set — alloys, tyres, valves and bolts in one package. Every price is derived from central pricing settings."
      fields={[
        { key: "q", label: "Search", type: "text", placeholder: "Search packages…" },
        { key: "diameter", label: "Wheel diameter", type: "select", options: diameterOptions.map((v) => ({ value: v, label: `${v}"` })) },
        { key: "brand", label: "Brand in set", type: "select", options: brandOptions.map((v) => ({ value: v, label: v })) },
        { key: "text", label: "Tyre size", type: "text", placeholder: "e.g. 225/45R18" },
        { key: "priceMin", label: "Min price (£)", type: "number", placeholder: "e.g. 500", min: 0 },
        { key: "priceMax", label: "Max price (£)", type: "number", placeholder: "e.g. 1200", min: 0 },
        { key: "availability", label: "Availability", type: "select", options: STOCK_STATUSES.map((v) => ({ value: v, label: v })) },
      ]}
      values={search}
      filterKeys={FILTER_KEYS}
      onChange={setFilter}
      onClearAll={clearFilters}
      sortControl={
        <SortSelect value={search.sort} onChange={(v) => setFilter("sort", v)} options={SORT_OPTIONS} />
      }
      vehicleBanner={
        parsedVehicle ? `Showing sample packages for ${parsedVehicle.label}` : undefined
      }
      resultCount={filtered.length}
      emptyMessage="No packages match your filters — clear filters to see the full sample range."
    >
      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => {
          const restCount = p.includes.length - 1;
          return (
            <ProductCard
              key={p.id}
              href={`/packages/${p.id}`}
              image={p.image}
              imageAlt={`${p.name} wheel and tyre package`}
              eyebrow={`${p.diameter}" setup · complete set`}
              title={p.name}
              meta={[p.includes[0], ...(restCount > 0 ? [`+${restCount} more items`] : [])]}
              price={formatGBP(p.retailPriceIncVat)}
              stockStatus={p.stockStatus}
              dimmed={p.stockStatus === "Out of stock"}
            />
          );
        })}
      </div>
    </CataloguePage>
  );
}