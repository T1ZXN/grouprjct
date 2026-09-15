import { useMemo } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { CataloguePage } from "~/components/CataloguePage";
import { SortSelect } from "~/components/CatalogueFilters";
import { ProductCard } from "~/components/ProductCard";
import { demoWheels, STOCK_STATUSES, wheelSizeLabel } from "~/data/products";
import type { Wheel } from "~/data/products";
import { useLiveCatalogue } from "~/lib/liveCatalogue";
import { formatGBP } from "~/lib/pricing";
import {
  applyPriceSort,
  isCompatible,
  parseVehicleParam,
  SORT_OPTIONS,
  toSearchString,
} from "~/lib/catalogue";
import type { PriceSort } from "~/lib/catalogue";

interface WheelsSearch {
  q?: string;
  vehicle?: string;
  diameter?: string;
  width?: string;
  pcd?: string;
  colour?: string;
  finish?: string;
  brand?: string;
  priceMin?: string;
  priceMax?: string;
  availability?: string;
  sort?: string;
}

/** Filter keys that count toward the "N active filters" badge (not context/sort). */
const FILTER_KEYS = [
  "diameter",
  "width",
  "pcd",
  "colour",
  "finish",
  "brand",
  "priceMin",
  "priceMax",
  "availability",
];

const unique = (values: string[]): string[] => [...new Set(values)];

export const Route = createFileRoute("/wheels")({
  validateSearch: (search: Record<string, unknown>): WheelsSearch => ({
    q: toSearchString(search.q),
    vehicle: toSearchString(search.vehicle),
    diameter: toSearchString(search.diameter),
    width: toSearchString(search.width),
    pcd: toSearchString(search.pcd),
    colour: toSearchString(search.colour),
    finish: toSearchString(search.finish),
    brand: toSearchString(search.brand),
    priceMin: toSearchString(search.priceMin),
    priceMax: toSearchString(search.priceMax),
    availability: toSearchString(search.availability),
    sort: toSearchString(search.sort),
  }),
  head: () => ({
    meta: [
      { title: "Alloy Wheels UK | N2 Wheels" },
      {
        name: "description",
        content:
          "Browse our sample range of aftermarket alloy wheels — diameters, PCDs, offsets and finishes. Demo catalogue; we verify compatibility with your exact vehicle before confirming any order.",
      },
    ],
  }),
  component: WheelsPage,
});

function WheelsPage() {
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
      ? (live.products.filter((p) => p.category === "wheels") as Wheel[])
      : null;
  const items = liveItems ?? demoWheels;
  const diameterOptions = useMemo(
    () => unique(items.map((w) => String(w.size.diameter))).sort((a, b) => +a - +b),
    [items],
  );
  const widthOptions = useMemo(() => unique(items.map((w) => w.size.width)), [items]);
  const pcdOptions = useMemo(() => unique(items.map((w) => w.size.pcd)), [items]);
  const colourOptions = useMemo(() => unique(items.map((w) => w.colour)), [items]);
  const finishOptions = useMemo(() => unique(items.map((w) => w.finish)), [items]);
  const brandOptions = useMemo(() => unique(items.map((w) => w.brand)), [items]);

  // A child ($id) route is matched (e.g. /wheels/w-forza-r1-18) — hand off to
  // the child instead of rendering this list page (this list route is the
  // parent/layout of the $id detail routes).
  if (matches.length > 2) return <Outlet />;
  const { q, vehicle, sort } = search;

  const setFilter = (key: string, value: string | undefined) => {
    navigate({
      to: "/wheels",
      search: (prev) => {
        const next: WheelsSearch = { ...prev };
        if (value === undefined) delete next[key as keyof WheelsSearch];
        else (next as Record<string, string>)[key] = value;
        return next;
      },
    });
  };

  const clearFilters = () => {
    navigate({ to: "/wheels", search: { q, vehicle } });
  };

  const min = search.priceMin !== undefined ? Number(search.priceMin) : undefined;
  const max = search.priceMax !== undefined ? Number(search.priceMax) : undefined;
  const hasMin = min !== undefined && !Number.isNaN(min);
  const hasMax = max !== undefined && !Number.isNaN(max);

  const filtered = useMemo(() => {
    const ql = q?.toLowerCase();
    let list = items.filter((w: Wheel) => {
      if (ql) {
        const hay = `${w.brand} ${w.name} ${w.colour} ${w.finish} ${w.description} ${wheelSizeLabel(w.size)}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (search.diameter && String(w.size.diameter) !== search.diameter) return false;
      if (search.width && w.size.width !== search.width) return false;
      if (search.pcd && w.size.pcd !== search.pcd) return false;
      if (search.colour && w.colour !== search.colour) return false;
      if (search.finish && w.finish !== search.finish) return false;
      if (search.brand && w.brand !== search.brand) return false;
      if (hasMin && w.retailPriceIncVat < min!) return false;
      if (hasMax && w.retailPriceIncVat > max!) return false;
      if (search.availability && w.stockStatus !== search.availability) return false;
      return true;
    });
    // ?vehicle= — honestly prioritise sample wheels whose make-level
    // compatibility covers the vehicle; the banner explains the rest.
    const parsed = parseVehicleParam(vehicle);
    if (parsed?.make && !sort) {
      list = [
        ...list.filter((w) => isCompatible(w.vehicleCompatibility, parsed.make)),
        ...list.filter((w) => !isCompatible(w.vehicleCompatibility, parsed.make)),
      ];
    }
    return applyPriceSort(list, sort as PriceSort, (w) => w.retailPriceIncVat);
  }, [items, search, q, vehicle, sort, hasMin, hasMax, min, max]);

  const parsedVehicle = parseVehicleParam(vehicle);

  return (
    <CataloguePage
      title="Alloy Wheels"
      blurb="Performance alloy wheels in gloss, matte, satin and machined finishes. Filter by diameter, width, PCD, offset and colour — every price is settings-driven from central pricing."
      fields={[
        { key: "q", label: "Search", type: "text", placeholder: "Search wheels…" },
        {
          key: "diameter",
          label: "Diameter",
          type: "select",
          options: diameterOptions.map((v) => ({ value: v, label: `${v}"` })),
        },
        { key: "width", label: "Width", type: "select", options: widthOptions.map((v) => ({ value: v, label: v })) },
        { key: "pcd", label: "PCD", type: "select", options: pcdOptions.map((v) => ({ value: v, label: v })) },
        { key: "colour", label: "Colour", type: "select", options: colourOptions.map((v) => ({ value: v, label: v })) },
        { key: "finish", label: "Finish", type: "select", options: finishOptions.map((v) => ({ value: v, label: v })) },
        { key: "brand", label: "Brand", type: "select", options: brandOptions.map((v) => ({ value: v, label: v })) },
        { key: "priceMin", label: "Min price (£)", type: "number", placeholder: "e.g. 150", min: 0 },
        { key: "priceMax", label: "Max price (£)", type: "number", placeholder: "e.g. 300", min: 0 },
        {
          key: "availability",
          label: "Availability",
          type: "select",
          options: STOCK_STATUSES.map((v) => ({ value: v, label: v })),
        },
      ]}
      values={search}
      filterKeys={FILTER_KEYS}
      onChange={setFilter}
      onClearAll={clearFilters}
      sortControl={
        <SortSelect value={sort} onChange={(v) => setFilter("sort", v)} options={SORT_OPTIONS} />
      }
      vehicleBanner={
        parsedVehicle ? `Showing sample wheels for ${parsedVehicle.label}` : undefined
      }
      resultCount={filtered.length}
      emptyMessage="No wheels match your filters — clear filters to see the full sample range."
    >
      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((w) => (
          <ProductCard
            key={w.id}
            href={`/wheels/${w.id}`}
            image={w.image}
            imageAlt={`${w.brand} ${w.name} alloy wheel`}
            eyebrow={`${w.brand} · ${w.colour}`}
            title={w.name}
            meta={[wheelSizeLabel(w.size), w.finish]}
            price={formatGBP(w.retailPriceIncVat)}
            stockStatus={w.stockStatus}
            dimmed={w.stockStatus === "Out of stock"}
          />
        ))}
      </div>
    </CataloguePage>
  );
}