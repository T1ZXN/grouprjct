/**
 * Small helpers shared by the catalogue list routes (wheels / tyres /
 * packages / accessories): search-param coercion, the ?vehicle= param ->
 * make parse used for honest sample-data fitment prioritisation, and the
 * price sort options.
 */
import { DEMO_MAKES } from "~/lib/vehicleLookup";

/**
 * Coerce a search-param value to a trimmed string. TanStack's default search
 * parser turns numeric-looking values ("18") into numbers, so accept both.
 */
export function toSearchString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && !Number.isNaN(v)) return String(v);
  return undefined;
}

/** A parsed ?vehicle= param ("BMW 3 Series (2018)") -> optional make. */
export interface ParsedVehicle {
  /** The raw label, rendered in the honesty banner verbatim. */
  label: string;
  /** The vehicle's make when we can parse one from the label (e.g. "BMW"). */
  make?: string;
}

/**
 * Parse a ?vehicle= search param. Makes come from the shared demo fleet so
 * the parse can never drift from what the fitment search actually produces.
 */
export function parseVehicleParam(vehicle: string | undefined): ParsedVehicle | undefined {
  if (!vehicle) return undefined;
  const lower = vehicle.toLowerCase();
  const make = DEMO_MAKES.find((m) => lower.startsWith(m.toLowerCase()));
  return { label: vehicle, make };
}

/** True when `compatList` (e.g. wheel.vehicleCompatibility) contains `make`. */
export function isCompatible(compatList: string[], make?: string): boolean {
  if (!make) return false;
  const lower = make.toLowerCase();
  return compatList.some((c) => c.toLowerCase() === lower);
}

export type PriceSort = "price-asc" | "price-desc" | undefined;

/** Sort options rendered by the results toolbar ("" = featured/source order). */
export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

/** Apply the toolbar sort; returns the input unchanged for the default sort. */
export function applyPriceSort<T>(items: T[], sort: PriceSort, getPrice: (item: T) => number): T[] {
  if (sort === "price-asc") return [...items].sort((a, b) => getPrice(a) - getPrice(b));
  if (sort === "price-desc") return [...items].sort((a, b) => getPrice(b) - getPrice(a));
  return items;
}

/**
 * Clean URL search serialisation for the catalogue routes. TanStack's default
 * JSON-ish serializer quotes string values that look like numbers, producing
 * URLs such as ?diameter="18" — this keeps plain strings unquoted so filters
 * share as ?diameter=18&brand=Forzza&... . Non-string values (none in the
 * catalogue routes today) fall back to JSON.
 */
export function cleanStringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    params.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const str = params.toString();
  return str === "" ? "" : `?${str}`;
}