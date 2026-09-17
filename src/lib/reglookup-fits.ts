/**
 * N2 Wheels — LICENSED FITMENT-DATA ADAPTER (vehicle -> wheel fitting options), LIVE MODE.
 *
 * Implements `VehicleDataProvider` (see src/lib/reglookup.ts) against a licensed
 * wheel/tyre fitment database (the "Boughto-style" fits API described in
 * /home/team/shared/fitment-lookup-research.md).
 *
 *   GET {base}?user_key=<key>&make=Audi&model=A3&year=2018&region=uk
 *   200 -> { "data": [ { "make","model","generation", "wheel": {
 *              "front": { "rim": "7.5Jx17 ET54", "rim_diameter": 17, "rim_width": 7.5,
 *                         "rim_offset": 54, "pcd": "5x112" }, "rear": {...} } } ] }
 *
 * HONESTY CONTRACT (never relax):
 *   • live fitment data is only reachable when a real key is configured (VITE_FITS_API_KEY);
 *   • this adapter only ever reports what the database returns — no fitment is invented,
 *     and an empty/unreadable result is reported as "no records", never as a fitment;
 *   • a provider error is surfaced as an error (it never falls back to sample data).
 *
 * ⚠️ The request/response shape above is coded from the provider's published
 * documentation and has NOT been executed against a live endpoint (no key in this
 * environment). It is deliberately tolerant of the documented field variants, and
 * the base URL is env-overridable, so adjusting it after the owner pastes a key
 * needs no code change:
 *   VITE_FITS_API_URL  (default https://api.wheel-size.com/v2/search/by_model/)
 */
import type { FitmentOption, FitmentsResult, VehicleDataProvider } from "./reglookup";
import { envString, readClientEnv } from "./reglookup-env";

/** Env var carrying the licensed fitment-database API key (the switch to live fits). */
export const FITS_API_ENV_KEY = "VITE_FITS_API_KEY" as const;
/** Optional: override the fitment provider base URL without a code change. */
export const FITS_API_URL_ENV_KEY = "VITE_FITS_API_URL" as const;
/** Documented search-by-model endpoint of the licensed fitment database. */
export const DEFAULT_FITS_BASE_URL = "https://api.wheel-size.com/v2/search/by_model/";

export const FITS_PROVIDER_ID = "fits";

/** Shown on every successful live fitment lookup. */
export const LIVE_FITS_NOTICE =
  "Wheel fitting options returned live from our licensed fitment database for this vehicle. We still verify exact compatibility (PCD, offset, centre bore, brake clearance) with your exact vehicle before confirming your order.";

/** Shown when the live database has no record for the vehicle (never invented). */
export const LIVE_FITS_EMPTY_NOTICE =
  "Our licensed fitment database returned no wheel fitment records for this exact vehicle. We don't invent fitment data — send us your registration and we'll verify compatibility manually before confirming your order.";

/** Shown when only a fits key is configured: plates cannot be decoded by this provider. */
export const FITS_ONLY_REG_NOTICE =
  "Registration-plate decoding isn't connected on this site — live fitment data is available from the make/model search instead. We never guess a vehicle from a plate.";

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<HttpResponseLike>;

export interface FitsProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  env?: Record<string, string | boolean | undefined>;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** "7.5" -> "7.5J"; "8" -> "8J"; "7.5J" -> "7.5J". */
function widthLabel(width: unknown, rim?: string): string | undefined {
  const n = num(width);
  if (n !== undefined) return `${n}J`;
  const m = rim ? /(\d+(?:\.\d+)?)\s*J/i.exec(rim) : null;
  return m ? `${m[1]}J` : undefined;
}

/** Offset label: "ET45" or a range "ET40–ET50" when the DB gives a range. */
function offsetLabel(node: Record<string, unknown>): string | undefined {
  const single = num(node.rim_offset ?? node.offset ?? node.et);
  if (single !== undefined) return `ET${single}`;
  const min = num(node.offset_min ?? node.rim_offset_min);
  const max = num(node.offset_max ?? node.rim_offset_max);
  if (min !== undefined && max !== undefined && min !== max) return `ET${min}–ET${max}`;
  if (min !== undefined) return `ET${min}`;
  const s = str(node.offset_range ?? node.rim_offset_range);
  return s ? (s.toUpperCase().startsWith("ET") ? s : `ET${s}`) : undefined;
}

/** PCD label from "pcd"/"bolt_pattern"/bolts+stud pattern fields. */
function pcdLabel(node: Record<string, unknown>): string | undefined {
  const direct = str(node.pcd ?? node.bolt_pattern ?? node.pcdStr);
  if (direct) return direct.replace(/\s+/g, "").replace(/^(\d)x/i, "$1x");
  const bolts = num(node.bolts ?? node.bolt_count);
  const stud = num(node.stud_pattern ?? node.bolt_circle ?? node.pcd_value);
  if (bolts !== undefined && stud !== undefined) return `${bolts}x${stud}`;
  return undefined;
}

/**
 * Map a raw fitment payload (documented `{ data: [...] }` wrapper, plus tolerant
 * fallbacks for `results`/`wheels` and front/rear or flat wheel nodes) into
 * FitmentOption[]. Pure mapping — no fabrication: entries lacking diameter/PCD
 * are skipped rather than filled in.
 */
export function mapFitmentOptions(payload: unknown): FitmentOption[] {
  const rows: Record<string, unknown>[] = [];
  const collect = (v: unknown) => {
    if (Array.isArray(v)) for (const item of v) collect(item);
    else if (v && typeof v === "object") rows.push(v as Record<string, unknown>);
  };
  if (payload && typeof payload === "object") {
    const root = payload as Record<string, unknown>;
    collect(root.data ?? root.results ?? root.wheels ?? root);
  }
  const options: FitmentOption[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const wheel = (row.wheel ?? row.wheels ?? row) as Record<string, unknown> | unknown[];
    const nodes: Record<string, unknown>[] = Array.isArray(wheel)
      ? (wheel as Record<string, unknown>[])
      : (() => {
          const w = wheel as Record<string, unknown>;
          // Documented shape carries BOTH axles: { front: {...}, rear: {...} }.
          if (w.front || w.rear) return [w.front, w.rear].filter(Boolean) as Record<string, unknown>[];
          return [w];
        })();
    const rimText = nodes.map((n) => str(n?.rim ?? n?.rims)).find(Boolean);
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const diameter =
        num(node.rim_diameter ?? node.diameter ?? node.rimDiameter) ??
        (rimText ? num(/x\s*(\d+(?:\.\d+)?)/.exec(rimText)?.[1]) : undefined);
      if (diameter === undefined) continue; // never invent a diameter
      const width = widthLabel(node.rim_width ?? node.width ?? node.rimWidth, str(node.rim));
      const pcd = pcdLabel(node);
      if (!width || !pcd) continue; // geometry must come from the database
      const offset = offsetLabel(node) ?? "";
      const key = `${diameter}|${width}|${pcd}|${offset}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        diameter,
        width,
        pcd,
        offset,
        note: "Live fitment-database record — verified against your exact vehicle before order confirmation.",
      });
    }
  }
  return options.sort((a, b) => a.diameter - b.diameter).slice(0, 12);
}

export function createFitsProvider(options: FitsProviderOptions = {}): VehicleDataProvider {
  const envOf = () => options.env ?? readClientEnv();
  const fetchImpl = (): FetchLike => options.fetchImpl ?? ((globalThis.fetch as unknown) as FetchLike);
  const key = () => options.apiKey ?? envString(envOf(), FITS_API_ENV_KEY);
  const baseUrl = () =>
    options.baseUrl ?? envString(envOf(), FITS_API_URL_ENV_KEY) ?? DEFAULT_FITS_BASE_URL;

  async function getFitments(
    make: string,
    model: string,
    year?: number,
    variant?: string,
  ): Promise<FitmentsResult> {
    const apiKey = key();
    if (!apiKey) {
      throw new Error(
        "Live fitment data isn't configured on this site yet — we confirm compatibility with your exact vehicle before confirming your order.",
      );
    }
    const query = new URLSearchParams({ user_key: apiKey, make, model, region: "uk" });
    if (year !== undefined) query.set("year", String(year));
    if (variant) query.set("trim", variant);
    const url = `${baseUrl()}?${query.toString()}`;

    let res: HttpResponseLike;
    try {
      res = await fetchImpl()(url, { method: "GET", headers: { Accept: "application/json" } });
    } catch {
      throw new Error(
        "The live fitment database couldn't be reached. We didn't substitute any fitment data — please try again, or we'll verify compatibility manually.",
      );
    }
    if (!res.ok) {
      throw new Error(
        `The live fitment lookup failed (HTTP ${res.status}). No fitment data was invented — please try again, or we'll verify compatibility manually.`,
      );
    }
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new Error(
        "The live fitment database returned a response we couldn't read. No fitment data was invented — we'll verify compatibility manually.",
      );
    }
    const mapped = mapFitmentOptions(payload);
    return {
      source: "live",
      providerId: FITS_PROVIDER_ID,
      make,
      model,
      year,
      variant,
      options: mapped,
      notice: mapped.length > 0 ? LIVE_FITS_NOTICE : LIVE_FITS_EMPTY_NOTICE,
    };
  }

  async function lookupVehicleByReg(): Promise<never> {
    throw new Error(FITS_ONLY_REG_NOTICE);
  }

  return {
    id: FITS_PROVIDER_ID,
    label: "Live fitment data (licensed database)",
    keyName: FITS_API_ENV_KEY,
    lookupVehicleByReg: lookupVehicleByReg as VehicleDataProvider["lookupVehicleByReg"],
    getFitments,
  };
}

/** Provider instance used by the seam (reads the key from the client env). */
export const fitsProvider = createFitsProvider();
