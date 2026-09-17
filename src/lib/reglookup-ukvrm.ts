/**
 * N2 Wheels — UK REGISTRATION-LOOKUP ADAPTER (plate -> vehicle), LIVE MODE.
 *
 * Implements `VehicleDataProvider` (see src/lib/reglookup.ts) against the
 * VehicleMatic "Vehicle Details" API, which returns the DVLA registration
 * record for a plate (make, model, year, fuel, engine size, colour, …).
 *
 *   GET {base}/{VRM}   e.g. https://vehiclematic.com/products/vehicle-details/api/live/AB12CDE
 *   auth: "X-VEHICLEMATIC-KEY: <key>"   (VehicleMatic — the default here)
 *      or "Authorization: Bearer <key>"  (VITE_REG_LOOKUP_AUTH=bearer, other providers)
 *      or "x-api-key: <key>"             (VITE_REG_LOOKUP_AUTH=x-api-key, e.g. DVLA VES style)
 *   200 -> { "data": { "registration_number", "make", "model", "colour",
 *            "fuel_type", "engine_capacity", "year_of_manufacture",
 *            "month_of_first_registration", ... }, "credit_balance": n }
 *   400/404/422 -> no usable record for that plate (honest "no-match");
 *   401 -> key missing/invalid, 402 -> no lookup credits left,
 *   403 -> key not authorised for this product, 429/5xx -> provider error.
 *
 * VALIDATED LIVE (2026-09-17): the base URL above, the X-VEHICLEMATIC-KEY
 * header and the payload shape below were confirmed against the real endpoint
 * (the provider answered 403 "not authorised for this product" with the key
 * configured at that time — i.e. host + header are right, the account's
 * product scope/credits are the remaining owner-side step). See the team's
 * VehicleMatic API findings for the exact probe log.
 *
 * HONESTY CONTRACT (never relax):
 *   • live mode is only reachable when a real key is configured (VITE_REG_LOOKUP_KEY);
 *   • a plate is NEVER turned into a guessed vehicle — an unrecognised payload is
 *     an honest error, and a no-record response is an honest "no-match" with no vehicle;
 *   • provider errors are surfaced as errors (never silently replaced by sample data);
 *   • a lookup that failed is never reported as a found vehicle.
 *
 * Base URL and auth scheme stay env-overridable, so swapping providers needs no
 * code change:
 *   VITE_REG_LOOKUP_URL   (default https://vehiclematic.com/products/vehicle-details/api/live)
 *   VITE_REG_LOOKUP_AUTH  "vehiclematic" (default) | "bearer" | "x-api-key"
 */
import type {
  FitmentsResult,
  Vehicle,
  VehicleDataProvider,
  VehicleLookupOutcome,
} from "./reglookup";
import { envString, readClientEnv } from "./reglookup-env";

/** Env var carrying the UK registration-lookup API key (the switch to live mode). */
export const REG_LOOKUP_ENV_KEY = "VITE_REG_LOOKUP_KEY" as const;
/** Optional: override the provider base URL without a code change. */
export const REG_LOOKUP_URL_ENV_KEY = "VITE_REG_LOOKUP_URL" as const;
/** Optional: "vehiclematic" (default) | "bearer" | "x-api-key". */
export const REG_LOOKUP_AUTH_ENV_KEY = "VITE_REG_LOOKUP_AUTH" as const;

/**
 * VehicleMatic "Vehicle Details" single-vehicle endpoint — `GET {base}/{VRM}`.
 * Live-validated 2026-09-17 (do NOT reintroduce an `api.` subdomain: it does
 * not resolve; the API lives on the public web host).
 */
export const DEFAULT_UK_VRM_BASE_URL = "https://vehiclematic.com/products/vehicle-details/api/live";

/**
 * Auth scheme the adapter emits.
 *   "vehiclematic" — `X-VEHICLEMATIC-KEY: <key>` (this provider's own scheme, the default)
 *   "bearer"       — `Authorization: Bearer <key>` (other providers)
 *   "x-api-key"    — `x-api-key: <key>` (e.g. DVLA VES style)
 */
export type UkVrmAuthMode = "vehiclematic" | "bearer" | "x-api-key";

/** Provider id used in outcomes/labels. */
export const UK_VRM_PROVIDER_ID = "uk-vrm";

/** Default cap on live plate lookups per browser session (cost guard). */
export const DEFAULT_SESSION_LOOKUP_LIMIT = 40;

/** Shown on every successful live plate match. */
export const LIVE_REG_NOTICE =
  "Vehicle matched live from the UK registration record. We still verify exact compatibility (PCD, offset, centre bore, brake clearance) with your exact vehicle before confirming your order.";

/** Minimal fetch contract so tests can inject a fake transport. */
export interface HttpResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<HttpResponseLike>;

export interface UkVrmProviderOptions {
  /** The API key. When omitted it is read lazily from the client env. */
  apiKey?: string;
  baseUrl?: string;
  authMode?: UkVrmAuthMode;
  /** Transport override (tests). Defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Client env override (tests). Defaults to import.meta.env. */
  env?: Record<string, string | boolean | undefined>;
  /** Per-session live-lookup cap; 0 disables the cap. */
  sessionLimit?: number;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

/**
 * Map a provider payload to our `Vehicle`. Accepts the documented
 * `{ data: {...} }` wrapper (and common flat/camelCase variants). Returns
 * undefined when make/model/year cannot be read — the caller then reports an
 * honest error instead of guessing.
 */
export function mapVehicleFromPayload(payload: unknown): Vehicle | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const root = payload as Record<string, unknown>;
  const data = (root.data ?? root.vehicle ?? root.result ?? root) as Record<string, unknown>;
  const inner = (data.vehicle ?? data) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = inner[k] ?? data[k] ?? root[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  };
  const make = str(pick("make", "Make", "manufacturer", "vehicleMake"));
  const model = str(pick("model", "Model", "vehicleModel")) ?? str(pick("derivative", "variant", "trim"));
  if (!make || !model) return undefined;
  // Year: only real date fields — never invented.
  const yearRaw = num(pick("year_of_manufacture", "yearOfManufacture", "year", "manufactureYear"));
  const firstReg = str(pick("month_of_first_registration", "dateOfFirstRegistration", "monthOfFirstRegistration"));
  const year = yearRaw ?? (firstReg ? num(firstReg.slice(0, 4)) : undefined);
  if (!year) return undefined;
  const cc = num(pick("engine_capacity", "engineCapacity", "engineSize"));
  const vehicle: Vehicle = { make, model, year };
  const variant = str(pick("derivative", "variant", "trim", "generation"));
  if (variant) vehicle.variant = variant;
  if (cc) vehicle.engine = `${cc}cc`;
  const fuel = str(pick("fuel_type", "fuelType", "fuel"));
  if (fuel) vehicle.fuel = fuel;
  return vehicle;
}

/** Build the live UK registration-lookup provider (keyed off VITE_REG_LOOKUP_KEY). */
export function createUkVrmProvider(options: UkVrmProviderOptions = {}): VehicleDataProvider {
  let used = 0;
  const envOf = () => options.env ?? readClientEnv();
  const fetchImpl = (): FetchLike => options.fetchImpl ?? ((globalThis.fetch as unknown) as FetchLike);

  const key = () => options.apiKey ?? envString(envOf(), REG_LOOKUP_ENV_KEY);
  const baseUrl = () =>
    options.baseUrl ?? envString(envOf(), REG_LOOKUP_URL_ENV_KEY) ?? DEFAULT_UK_VRM_BASE_URL;
  const authMode = (): UkVrmAuthMode => {
    const m = (options.authMode ?? envString(envOf(), REG_LOOKUP_AUTH_ENV_KEY) ?? "vehiclematic")
      .toLowerCase()
      .replace(/[^a-z-]/g, "");
    if (m === "bearer" || m === "authorization" || m === "authorization-bearer") return "bearer";
    if (m === "x-api-key" || m === "apikey" || m === "api-key") return "x-api-key";
    // "vehiclematic" / "x-vehiclematic-key" / anything unrecognised -> this
    // provider's own scheme, which is the correct default for VehicleMatic.
    return "vehiclematic";
  };

  async function lookupVehicleByReg(reg: string): Promise<VehicleLookupOutcome> {
    const apiKey = key();
    if (!apiKey) {
      // Never reachable via getActiveProvider(), but keep the adapter honest on its own.
      return {
        status: "unavailable",
        source: "demo",
        providerId: UK_VRM_PROVIDER_ID,
        notice:
          "Live registration lookup isn't configured on this site yet — choose your car manually below. Results are never invented from a plate.",
      };
    }
    const limit = options.sessionLimit ?? DEFAULT_SESSION_LOOKUP_LIMIT;
    if (limit > 0 && used >= limit) {
      throw new Error(
        "Live registration lookups are paused for this session. Please search by make and model, or try again later.",
      );
    }
    used += 1;
    const url = `${baseUrl().replace(/\/+$/, "")}/${encodeURIComponent(reg)}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    const mode = authMode();
    if (mode === "vehiclematic") headers["X-VEHICLEMATIC-KEY"] = apiKey;
    else if (mode === "x-api-key") headers["x-api-key"] = apiKey;
    else headers["Authorization"] = `Bearer ${apiKey}`;

    let res: HttpResponseLike;
    try {
      res = await fetchImpl()(url, { method: "GET", headers });
    } catch {
      throw new Error(
        "The live registration service couldn't be reached. No vehicle details were invented — please try again or search by make and model.",
      );
    }
    if (res.status === 400 || res.status === 404 || res.status === 422) {
      return {
        status: "no-match",
        source: "live",
        providerId: UK_VRM_PROVIDER_ID,
        notice: `No live vehicle record matched that registration. Check the plate and try again, or choose your car manually below — we never guess a vehicle from a plate.`,
      };
    }
    if (res.status === 403) {
      // The provider recognises the key but it isn't authorised for this product.
      throw new Error(
        "Live registration lookups are temporarily unavailable. No vehicle details were invented — please search by make and model below and we'll verify compatibility before your order.",
      );
    }
    if (res.status === 402) {
      // The provider account has no lookup credit left.
      throw new Error(
        "Live registration lookups are paused right now. No vehicle details were invented — please search by make and model below and we'll verify compatibility before your order.",
      );
    }
    if (!res.ok) {
      throw new Error(
        `The live registration lookup failed (HTTP ${res.status}). No vehicle details were invented — please try again or search by make and model.`,
      );
    }
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new Error(
        "The live registration service returned a response we couldn't read. No vehicle details were invented — please search by make and model.",
      );
    }
    const vehicle = mapVehicleFromPayload(payload);
    if (!vehicle) {
      throw new Error(
        "The live register returned no usable make/model for that plate. We don't guess vehicle details — please search by make and model below.",
      );
    }
    return {
      status: "matched",
      source: "live",
      providerId: UK_VRM_PROVIDER_ID,
      vehicle,
      notice: LIVE_REG_NOTICE,
    };
  }

  async function getFitments(): Promise<FitmentsResult> {
    throw new Error(
      "This provider only decodes registration plates — fitment data comes from the fitment provider.",
    );
  }

  return {
    id: UK_VRM_PROVIDER_ID,
    label: "Live UK registration lookup",
    keyName: REG_LOOKUP_ENV_KEY,
    lookupVehicleByReg,
    getFitments,
  };
}

/** Provider instance used by the seam (reads the key from the client env). */
export const ukVrmProvider = createUkVrmProvider();
