/**
 * N2 Wheels — UK REGISTRATION-LOOKUP ADAPTER (plate -> vehicle), LIVE MODE.
 *
 * Implements `VehicleDataProvider` (see src/lib/reglookup.ts) against the UK
 * registration record for a plate (make, model, year, fuel, engine size, …).
 *
 * ── TRANSPORT: SAME-ORIGIN PROXY BY DEFAULT ─────────────────────────────────
 * The default base URL is the site's OWN path — `/api/reglookup` — served by the
 * server-side proxy function (netlify/functions/reglookup.js, generated at export
 * time). It is a same-origin GET: NO key is sent from the browser, and the
 * provider key never enters the client bundle.
 *   GET /api/reglookup/{VRM}      (Netlify rewrites it to the function)
 *
 * Why: the upstream provider (VehicleMatic) sends NO CORS headers, so a direct
 * browser call is blocked (verified live 2026-09-17). The proxy makes the call
 * server-side and mirrors the upstream status + body, so the mapping below is
 * identical either way.
 *
 * ── EXPLICIT OVERRIDE (debugging / another provider) ────────────────────────
 *   VITE_REG_LOOKUP_URL   absolute base URL — e.g. the direct provider endpoint
 *                         https://vehiclematic.com/products/vehicle-details/api/live
 *                         (see VEHICLEMATIC_DIRECT_BASE_URL) or another vendor
 *   VITE_REG_LOOKUP_KEY   the key for that DIRECT url (build-stripped from the
 *                         client env — see vite.config.ts — so this path exists
 *                         for scripts/tests and a deliberate local build)
 *   VITE_REG_LOOKUP_AUTH  "vehiclematic" (default) | "bearer" | "x-api-key"
 * An absolute URL means "call it directly and attach the key"; a root-relative
 * URL means "same-origin proxy, no key". The provider payload is unchanged:
 *   200 -> { "data": { "registration_number", "make", "model", "colour",
 *            "fuel_type", "engine_capacity", "year_of_manufacture", … },
 *          "credit_balance": n }
 *   400/404/422 -> no usable record for that plate (honest "no-match");
 *   401 -> key missing/invalid, 402 -> no lookup credits left,
 *   403 -> key not authorised for this product, 429/5xx -> provider error.
 *
 * VALIDATED LIVE (2026-09-17): the upstream base URL, the X-VEHICLEMATIC-KEY
 * header and the payload shape below were confirmed against the real endpoint
 * (the provider answered 404 "no data" with the platform key while it still had
 * 150 credits). See the team's VehicleMatic API findings for the probe log.
 *
 * HONESTY CONTRACT (never relax):
 *   • a plate is NEVER turned into a guessed vehicle — an unrecognised payload is
 *     an honest error, and a no-record response is an honest "no-match" with no vehicle;
 *   • provider errors are surfaced as errors (never silently replaced by sample data);
 *   • a lookup that failed is never reported as a found vehicle;
 *   • if the proxy route isn't there, the adapter says so and stops — it never
 *     reports a failed call as "no match for that plate".
 */
import type {
  FitmentsResult,
  Vehicle,
  VehicleDataProvider,
  VehicleLookupOutcome,
} from "./reglookup";
import type { ClientEnv } from "./reglookup-env";
import { envString, readClientEnv } from "./reglookup-env";

/** Env var carrying the UK registration-lookup API key for the DIRECT override. */
export const REG_LOOKUP_ENV_KEY = "VITE_REG_LOOKUP_KEY" as const;
/** Optional: override the provider base URL without a code change. */
export const REG_LOOKUP_URL_ENV_KEY = "VITE_REG_LOOKUP_URL" as const;
/** Optional: "vehiclematic" (default) | "bearer" | "x-api-key". */
export const REG_LOOKUP_AUTH_ENV_KEY = "VITE_REG_LOOKUP_AUTH" as const;
/** Public build flag: this build ships the same-origin proxy (plate lookup live). */
export const REG_LOOKUP_PROXY_ENV_KEY = "VITE_REG_LOOKUP_PROXY" as const;
/**
 * Same-origin proxy path the site calls (root-relative => no key is ever sent
 * from the browser). `_redirects` rewrites it to the proxy function.
 */
export const DEFAULT_UK_VRM_PROXY_PATH = "/api/reglookup";

/**
 * The proxy function's own Netlify path. Tried as a FALLBACK when the clean
 * route above answers with something that isn't our JSON (a host that serves
 * the function but not the rewrite). Cheap, honest, and never invents a vehicle.
 */
export const REG_LOOKUP_FUNCTION_FALLBACK_PATH = "/.netlify/functions/reglookup";

/**
 * Default base URL for plate lookups: the SAME-ORIGIN proxy — never the provider
 * itself, so the key stays server-side. (Kept under the historical constant name
 * so existing imports keep meaning "the base URL this adapter uses by default".)
 */
export const DEFAULT_UK_VRM_BASE_URL = DEFAULT_UK_VRM_PROXY_PATH;

/**
 * The provider's own endpoint, for the explicit `VITE_REG_LOOKUP_URL` override
 * (debugging, or a build that deliberately talks to the provider directly).
 * Live-validated 2026-09-17 (do NOT reintroduce an `api.` subdomain: it does not
 * resolve; the API lives on the public web host).
 */
export const VEHICLEMATIC_DIRECT_BASE_URL = "https://vehiclematic.com/products/vehicle-details/api/live";

/**
 * Auth scheme the adapter emits **for a direct (absolute) URL**.
 *   "vehiclematic" — `X-VEHICLEMATIC-KEY: <key>` (this provider's own scheme, the default)
 *   "bearer"       — `Authorization: Bearer <key>` (other providers)
 *   "x-api-key"    — `x-api-key: <key>` (e.g. DVLA VES style)
 * A same-origin (root-relative) URL is never sent a key.
 */
export type UkVrmAuthMode = "vehiclematic" | "bearer" | "x-api-key";

/** Provider id used in outcomes/labels. */
export const UK_VRM_PROVIDER_ID = "uk-vrm";

/** Default cap on live plate lookups per browser session (cost guard). */
export const DEFAULT_SESSION_LOOKUP_LIMIT = 40;

/** Shown on every successful live plate match. */
export const LIVE_REG_NOTICE =
  "Vehicle matched live from the UK registration record. We still verify exact compatibility (PCD, offset, centre bore, brake clearance) with your exact vehicle before confirming your order.";

/** Honest message when the provider could not be reached at all. */
export const REG_LOOKUP_UNREACHABLE_NOTICE =
  "The live registration service couldn't be reached. No vehicle details were invented — please try again or search by make and model.";

/** Honest message when the same-origin proxy route isn't answering on this host. */
export const REG_LOOKUP_PROXY_ABSENT_NOTICE =
  "The plate-lookup service isn't available on this site right now. No vehicle details were invented — please try again or search by make and model.";

/** Honest message when the proxy says no provider key is configured server-side. */
export const REG_LOOKUP_NOT_CONFIGURED_NOTICE =
  "Live registration lookups aren't configured on this site yet. No vehicle details were invented — please search by make and model below and we'll verify compatibility before your order.";

/**
 * Build-time flag injected by vite.config.ts (a bare boolean, never the key).
 * Undeclared outside a Vite build — `typeof` keeps that safe.
 */
declare const __N2_REG_LOOKUP_PROXY__: boolean | undefined;

/** Status codes whose meaning is fully carried by the status itself. */
const STATUS_DECIDED_OUTCOMES = [400, 402, 403, 404, 422];

/** Minimal fetch contract so tests can inject a fake transport. */
export interface HttpResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<HttpResponseLike>;

export interface UkVrmProviderOptions {
  /**
   * API key for a DIRECT (absolute) provider URL. When omitted it is read lazily
   * from the client env. A same-origin proxy URL never receives it.
   */
  apiKey?: string;
  baseUrl?: string;
  authMode?: UkVrmAuthMode;
  /** Transport override (tests). Defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Client env override (tests). Defaults to import.meta.env. */
  env?: ClientEnv;
  /** Per-session live-lookup cap; 0 disables the cap. */
  sessionLimit?: number;
}

/**
 * True for a root-relative URL ("/api/reglookup") — i.e. the same-origin proxy:
 * no key is sent, and the Netlify function path is tried as a fallback.
 */
export function isSameOriginPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

/** True when a parsed body came from our own proxy. */
export function isProxyPayload(payload: unknown): payload is Record<string, unknown> {
  return Boolean(payload) && typeof payload === "object" && (payload as Record<string, unknown>).n2proxy === 1;
}

/**
 * True when plate lookups go through the same-origin proxy — the shipped
 * configuration. Read from `VITE_REG_LOOKUP_PROXY`, which is identical in the
 * prerendered (SSR) output and the client bundle: unset = proxy build (live),
 * "0" = a labelled demo build (no proxy deployed). It is a public flag and never
 * carries the key.
 */
export function isRegLookupProxyBuild(env: ClientEnv = readClientEnv()): boolean {
  // Deliberate off-switch only: an unset flag means "this is the proxy build".
  // Deciding it from a Vite define instead would risk the SSR/prerender bundle
  // and the client bundle disagreeing (hydration mismatch in the fitment
  // labels), so the single source of truth is this env var, identical in both.
  return envString(env, REG_LOOKUP_PROXY_ENV_KEY) !== "0";
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

/**
 * URLs to try, in order. A direct (absolute) URL is tried once; the same-origin
 * proxy route is tried first and the function's own Netlify path is the backup.
 */
export function endpointCandidates(baseUrl: string, vrm: string): string[] {
  const primary = `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(vrm)}`;
  if (!isSameOriginPath(baseUrl)) return [primary];
  const fallback = `${REG_LOOKUP_FUNCTION_FALLBACK_PATH}?vrm=${encodeURIComponent(vrm)}`;
  return primary === fallback ? [primary] : [primary, fallback];
}

/** Build the live UK registration-lookup provider (proxy by default). */
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

  /** Headers for one attempt: a key ONLY for an absolute (direct) URL. */
  function requestHeaders(base: string): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    // Same-origin proxy: the key lives server-side. Nothing to send — ever.
    if (isSameOriginPath(base)) return headers;
    const apiKey = key();
    if (!apiKey) return headers;
    const mode = authMode();
    if (mode === "vehiclematic") headers["X-VEHICLEMATIC-KEY"] = apiKey;
    else if (mode === "x-api-key") headers["x-api-key"] = apiKey;
    else headers["Authorization"] = `Bearer ${apiKey}`;
    return headers;
  }

  /** Status-driven outcome (identical for the proxy and the direct override). */
  function interpret(status: number, payload: unknown): VehicleLookupOutcome {
    if (status === 400 || status === 404 || status === 422) {
      return {
        status: "no-match",
        source: "live",
        providerId: UK_VRM_PROVIDER_ID,
        notice: `No live vehicle record matched that registration. Check the plate and try again, or choose your car manually below — we never guess a vehicle from a plate.`,
      };
    }
    if (status === 403) {
      // The provider recognises the key but it isn't authorised for this product.
      throw new Error(
        "Live registration lookups are temporarily unavailable. No vehicle details were invented — please search by make and model below and we'll verify compatibility before your order.",
      );
    }
    if (status === 402) {
      // The provider account has no lookup credit left.
      throw new Error(
        "Live registration lookups are paused right now. No vehicle details were invented — please search by make and model below and we'll verify compatibility before your order.",
      );
    }
    if (status === 503 && isProxyPayload(payload) && payload.proxyError === "not_configured") {
      throw new Error(REG_LOOKUP_NOT_CONFIGURED_NOTICE);
    }
    if (status === 429 && isProxyPayload(payload)) {
      throw new Error(
        "Too many registration lookups just now. No vehicle details were invented — please search by make and model, or try again in a minute.",
      );
    }
    if (status === 502 && isProxyPayload(payload)) {
      throw new Error(REG_LOOKUP_UNREACHABLE_NOTICE);
    }
    if (status < 200 || status >= 300) {
      throw new Error(
        `The live registration lookup failed (HTTP ${status}). No vehicle details were invented — please try again or search by make and model.`,
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

  async function lookupVehicleByReg(reg: string): Promise<VehicleLookupOutcome> {
    const base = baseUrl();
    const sameOrigin = isSameOriginPath(base);
    if (!sameOrigin && !key()) {
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
    const headers = requestHeaders(base);
    const urls = endpointCandidates(base, reg);
    let failure: "unreachable" | "unreadable" = "unreachable";

    for (const url of urls) {
      let res: HttpResponseLike;
      try {
        res = await fetchImpl()(url, { method: "GET", headers });
      } catch {
        failure = "unreachable";
        continue;
      }
      let payload: unknown;
      let readable = true;
      try {
        payload = await res.json();
      } catch {
        readable = false;
      }
      if (!readable) {
        // Our proxy always answers JSON, so an unreadable body means this route
        // didn't reach it -> next candidate (direct calls: honour the status).
        if (sameOrigin || !STATUS_DECIDED_OUTCOMES.includes(res.status)) {
          failure = "unreadable";
          continue;
        }
        return interpret(res.status, undefined);
      }
      return interpret(res.status, payload);
    }
    throw new Error(sameOrigin ? proxyFailureNotice(failure) : directFailureNotice(failure));
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

// ── honest failure wording (kept in one place, never invents a vehicle) ──────
function directFailureNotice(failure: "unreachable" | "unreadable"): string {
  return failure === "unreachable"
    ? REG_LOOKUP_UNREACHABLE_NOTICE
    : "The live registration service returned a response we couldn't read. No vehicle details were invented — please try again or search by make and model.";
}
/** Proxy failures: unreachable host vs a route that isn't answering with our JSON. */
function proxyFailureNotice(failure: "unreachable" | "unreadable"): string {
  return failure === "unreachable" ? REG_LOOKUP_UNREACHABLE_NOTICE : REG_LOOKUP_PROXY_ABSENT_NOTICE;
}

/** Provider instance used by the seam (same-origin proxy; no client key). */
export const ukVrmProvider = createUkVrmProvider();
