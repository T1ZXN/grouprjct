/**
 * N2 Wheels — UK REGISTRATION-LOOKUP ADAPTER (plate -> vehicle), LIVE MODE.
 *
 * Implements `VehicleDataProvider` (see src/lib/reglookup.ts) against a
 * commercial UK vehicle-registration API that returns the DVLA record plus a
 * model resolved from the MOT record.
 *
 *   GET {base}/{VRM}          e.g. https://api.vehiclematic.com/v1/vehicle/AB12CDE
 *   auth: "Authorization: Bearer <key>"  (VehicleMatic-style)
 *      or "x-api-key: <key>"             (VITE_REG_LOOKUP_AUTH=x-api-key / DVLA VES style)
 *   200 -> { "data": { "registration_number", "make", "model", "colour",
 *            "fuel_type", "engine_capacity", "year_of_manufacture",
 *            "month_of_first_registration", ... }, "credit_balance": n }
 *   404 -> no vehicle in the register; 429/5xx -> provider error.
 *
 * HONESTY CONTRACT (never relax):
 *   • live mode is only reachable when a real key is configured (VITE_REG_LOOKUP_KEY);
 *   • a plate is NEVER turned into a guessed vehicle — an unrecognised payload is
 *     an honest error, and a 404 is an honest "no-match" with no vehicle;
 *   • provider errors are surfaced as errors (never silently replaced by sample data).
 *
 * ⚠️ The request shape above is coded from the provider's published documentation
 * and has NOT been executed against the live endpoint (no key available in this
 * environment). Base URL and auth scheme are therefore env-overridable, so
 * switching them after the owner pastes a key needs no code change:
 *   VITE_REG_LOOKUP_URL   (default https://api.vehiclematic.com/v1/vehicle)
 *   VITE_REG_LOOKUP_AUTH  "bearer" (default) | "x-api-key"
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
/** Optional: "bearer" (default) | "x-api-key". */
export const REG_LOOKUP_AUTH_ENV_KEY = "VITE_REG_LOOKUP_AUTH" as const;

/** VehicleMatic-style single-vehicle endpoint (documented shape). */
export const DEFAULT_UK_VRM_BASE_URL = "https://api.vehiclematic.com/v1/vehicle";

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
  authMode?: "bearer" | "x-api-key";
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
  const authMode = () => {
    const m = (options.authMode ?? envString(envOf(), REG_LOOKUP_AUTH_ENV_KEY) ?? "bearer").toLowerCase();
    return m === "x-api-key" || m === "apikey" || m === "api-key" ? "x-api-key" : "bearer";
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
    if (authMode() === "x-api-key") headers["x-api-key"] = apiKey;
    else headers["Authorization"] = `Bearer ${apiKey}`;

    let res: HttpResponseLike;
    try {
      res = await fetchImpl()(url, { method: "GET", headers });
    } catch {
      throw new Error(
        "The live registration service couldn't be reached. No vehicle details were invented — please try again or search by make and model.",
      );
    }
    if (res.status === 404 || res.status === 400) {
      return {
        status: "no-match",
        source: "live",
        providerId: UK_VRM_PROVIDER_ID,
        notice: `No live vehicle record matched that registration. Check the plate and try again, or choose your car manually below — we never guess a vehicle from a plate.`,
      };
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
