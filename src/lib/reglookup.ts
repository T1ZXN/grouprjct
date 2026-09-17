/**
 * N2 Wheels — VEHICLE LOOKUP & FITMENT PROVIDER LAYER
 *
 * THIS FILE IS THE SINGLE SEAM between the site UI and vehicle data. All reg /
 * fitment flows (homepage hero search, /fitment page, per-product "Will this
 * fit my car?" checker) go through the functions in this module:
 *
 *   lookupVehicleByReg(reg)        -> VehicleLookupOutcome  (plate -> vehicle)
 *   getFitments(make, model, year) -> FitmentsResult        (vehicle -> wheel fitting options)
 *   vehicleByDetails(params)       -> VehicleLookupOutcome  (convenience: manual entry)
 *
 * ── HOW THE DEFAULT (DEMO) PROVIDER WORKS ────────────────────────────────────
 * With no API key configured, every lookup is served by the demo adapter in
 * src/lib/reglookup-demo.ts (`demoProvider`). The demo adapter:
 *   • NEVER fabricates a vehicle from a registration plate — it returns an
 *     honest `status: "unavailable"` outcome and the UI keeps the customer on
 *     the manual make/model/year path. No fake reg results, ever.
 *   • Returns labelled sample wheel-fitting guidance for manual searches,
 *     always surfaced with the "Sample fitment data" notice.
 *
 * ── LIVE MODE: HOW IT IS SWITCHED ON ────────────────────────────────────────
 * Plate -> vehicle is LIVE in the site's own build: the lookup goes to the
 * SAME-ORIGIN proxy (/api/reglookup/{VRM}, served by the server-side function
 * generated at export time), so the provider key never enters the browser.
 *   • production/export build  -> `__N2_REG_LOOKUP_PROXY__` is true because the
 *     build was given the provider key to inline into that proxy (vite.config.ts
 *     derives the flag from the key's PRESENCE and then strips the key itself).
 *   • no proxy and no key      -> honest demo mode (labelled sample data).
 *   • VITE_REG_LOOKUP_URL + VITE_REG_LOOKUP_KEY (absolute URL) -> direct call to
 *     the provider, for debugging with a deliberately built key — never the
 *     shipped path, and never a key in the bundle.
 *   • VITE_REG_LOOKUP_PROXY=1  -> forces the proxy mode outside a Vite build
 *     (used by the child-process tests to pin the mode).
 * The site builds and runs with NO .env file at all — nothing configured simply
 * means demo mode.
 */
import { demoProvider } from "./reglookup-demo";
import { FITS_API_ENV_KEY as FITS_API_ENV_KEY_CONST, fitsProvider } from "./reglookup-fits";
import { createLiveProvider, LIVE_PROVIDER_ID } from "./reglookup-live";
import { REG_LOOKUP_ENV_KEY as REG_LOOKUP_ENV_KEY_CONST, isRegLookupProxyBuild, ukVrmProvider } from "./reglookup-ukvrm";

/** A vehicle as identified by a registration lookup (or manual details). */
export interface Vehicle {
  make: string;
  model: string;
  year: number;
  variant?: string;
  engine?: string;
  fuel?: string;
}

/** Where the data came from — drives the honest labelling in the UI. */
export type LookupSource = "live" | "demo";

/** Outcome of a registration-plate lookup. */
export interface VehicleLookupOutcome {
  /** "matched" = a vehicle was resolved; "unavailable" = no live reg API; "no-match" = live API had no hit. */
  status: "matched" | "unavailable" | "no-match";
  source: LookupSource;
  vehicle?: Vehicle;
  /** Provider id ("demo" today; e.g. "boughto" / "dvla" when wired). */
  providerId: string;
  /** Human-readable notice shown verbatim under the result. */
  notice: string;
  /** Normalised registration plate (when the lookup was by plate). */
  registration?: string;
}

/** One sample/live wheel-fitting option returned for a vehicle. */
export interface FitmentOption {
  /** Rim diameter in inches, e.g. 18. */
  diameter: number;
  /** Rim width, e.g. "7.5J". */
  width: string;
  /** Pitch circle diameter, e.g. "5x112". */
  pcd: string;
  /** Offset sample/range, e.g. "ET40–ET50". */
  offset: string;
  /** Optional per-option note (labelled sample where applicable). */
  note?: string;
}

/** Result of a make/model/year fitment search. */
export interface FitmentsResult {
  source: LookupSource;
  providerId: string;
  make: string;
  model: string;
  year?: number;
  variant?: string;
  options: FitmentOption[];
  /** Label shown with every result (demo or live). */
  notice: string;
}

/** Manual-entry parameters (make/model/year, optional diameter filter). */
export interface ManualLookupParams {
  make: string;
  model?: string;
  year?: number;
  /** Optional wheel diameter (inches) the customer is interested in. */
  diameter?: number;
}

/**
 * THE ADAPTER CONTRACT. A real provider implements exactly this interface and
 * registers itself with `registerProvider`. See reglookup-demo.ts for a full
 * reference implementation.
 */
export interface VehicleDataProvider {
  /** Unique id, e.g. "demo" | "boughto" | "dvla". */
  id: string;
  /** Human label, e.g. "Boughto fits database". */
  label: string;
  /**
   * Vite client-env var that carries this provider's API key. Undefined for
   * the demo provider (no key needed). A real provider sets e.g. "VITE_FITS_API_KEY".
   */
  keyName?: typeof REG_LOOKUP_ENV_KEY | typeof FITS_API_ENV_KEY;
  lookupVehicleByReg(reg: string): Promise<VehicleLookupOutcome>;
  getFitments(
    make: string,
    model: string,
    year?: number,
    variant?: string,
  ): Promise<FitmentsResult>;
}

// ── Provider registry (single seam; see docblock at the top) ─────────────────
const providers = new Map<string, VehicleDataProvider>();
const DEMO_PROVIDER_ID = "demo";

/** Register a provider (demo is registered by default; real ones join it). */
export function registerProvider(provider: VehicleDataProvider): void {
  providers.set(provider.id, provider);
}
providers.set(demoProvider.id, demoProvider);

/**
 * LIVE providers, registered at startup. The reg provider is active when the
 * build ships the same-origin proxy (production) or when an explicit keyed
 * override is configured; the fits provider when its key is present. Neither
 * does anything until then, so the site ships in honest demo mode by default.
 *   • ukVrmProvider  — plate -> vehicle   (same-origin proxy; VITE_REG_LOOKUP_KEY
 *                                          only for the direct debug override)
 *   • fitsProvider   — vehicle -> fitments (VITE_FITS_API_KEY)
 */
registerProvider(ukVrmProvider);
registerProvider(fitsProvider);

/** Env keys for the real providers (Vite client env, see top docblock). */
const REG_LOOKUP_ENV_KEY = REG_LOOKUP_ENV_KEY_CONST;
const FITS_API_ENV_KEY = FITS_API_ENV_KEY_CONST;

/** The Vite client env object (import.meta.env); {} when absent. */
function readClientEnv(): Record<string, string | boolean | undefined> {
  const env = (import.meta as { env?: Record<string, string | boolean | undefined> }).env;
  return env ?? {};
}

/**
 * How plate lookups are configured in THIS build:
 *   `proxy`  — the build ships the same-origin proxy (production; no client key)
 *   `key`    — an explicit direct-override key is present (debug/scripts)
 *   `active` — either of the above, i.e. live mode rather than demo mode
 */
export interface RegLookupConfig {
  proxy: boolean;
  key?: string;
  active: boolean;
}

/** Read the reg-lookup configuration for this build/env. */
export function getRegLookupConfig(env: Record<string, string | boolean | undefined> = readClientEnv()): RegLookupConfig {
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  const proxy = isRegLookupProxyBuild(env);
  const key = str(env[REG_LOOKUP_ENV_KEY]);
  return { proxy, key, active: proxy || Boolean(key) };
}

/** Which provider keys/sources are configured (nothing configured -> demo mode). */
export function getConfiguredKeys(): {
  regLookupKey?: string;
  regLookupProxy: boolean;
  fitsApiKey?: string;
} {
  const env = readClientEnv();
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  const { key, proxy } = getRegLookupConfig(env);
  return {
    regLookupKey: key,
    regLookupProxy: proxy,
    fitsApiKey: str(env[FITS_API_ENV_KEY]),
  };
}

/**
 * Pick the active provider:
 *  1. the first REGISTERED provider that is configured for this build, else
 *  2. the demo provider (always available, always clearly labelled).
 *
 * "Configured" for the reg provider means the build ships the same-origin proxy
 * (`__N2_REG_LOOKUP_PROXY__`, derived from the provider key's presence at build
 * time) or an explicit direct-override key is set — NEVER the key itself
 * reaching the browser.
 *
 * ═══ SEAM: wire real providers here ═══
 * Once a real adapter exists, import it and register it, e.g.:
 *   import { boughtoProvider } from "./reglookup-boughto";
 *   registerProvider(boughtoProvider);       // keyName: "VITE_FITS_API_KEY"
 *   import { dvlaProvider } from "./reglookup-dvla";
 *   registerProvider(dvlaProvider);          // keyName: "VITE_REG_LOOKUP_KEY"
 * Setting the corresponding VITE_ key in the build environment then switches
 * the layer to live lookups automatically — no component changes needed.
 */
export function getActiveProvider(): VehicleDataProvider {
  const { regLookupKey, regLookupProxy, fitsApiKey } = getConfiguredKeys();
  const reg = regLookupProxy || regLookupKey ? providers.get(ukVrmProvider.id) : undefined;
  const fits = fitsApiKey ? providers.get(fitsProvider.id) : undefined;
  // ═══ LIVE MODE: proxy build or any real key -> the composite live provider ═══
  // Exactly which capability is live is named in the provider label, and each
  // result carries its own source label, so nothing here is ever mislabelled.
  if (reg || fits) return createLiveProvider({ reg, fits });
  // Any other registered provider whose key is configured (future providers).
  for (const provider of providers.values()) {
    if (!provider.keyName || provider.id === DEMO_PROVIDER_ID) continue;
    const hasKey =
      (provider.keyName === REG_LOOKUP_ENV_KEY && (Boolean(regLookupKey) || regLookupProxy)) ||
      (provider.keyName === FITS_API_ENV_KEY && Boolean(fitsApiKey));
    if (hasKey) return provider;
  }
  return providers.get(DEMO_PROVIDER_ID) ?? demoProvider;
}

/** True when a real, keyed provider is active (vs honest demo data). */
export function isLiveMode(): boolean {
  return getActiveProvider().id !== DEMO_PROVIDER_ID;
}

/** Label of the active provider ("Demo dataset" today). */
export function getProviderLabel(): string {
  return getActiveProvider().label;
}

/** Normalise a UK plate: uppercase, no spaces. */
export function normalizeRegistration(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Registration-plate lookup. Plate -> VehicleLookupOutcome.
 * In demo mode (no key) this NEVER invents a vehicle: it returns
 * `status: "unavailable"` and the UI routes the customer to manual entry.
 */
export async function lookupVehicleByReg(plate: string): Promise<VehicleLookupOutcome> {
  // Validate content first (only letters, digits, spaces and dashes) so
  // clearly-invalid input like "!!!bad" is rejected rather than normalised
  // away, then check the normalised plate length (2-7 chars).
  const trimmed = plate.trim();
  if (!/^[A-Z0-9][A-Z0-9 -]*$/i.test(trimmed)) {
    throw new Error("Enter a valid UK registration, e.g. AB12 CDE.");
  }
  const registration = normalizeRegistration(trimmed);
  if (registration.length < 2 || registration.length > 7) {
    throw new Error("Enter a valid UK registration, e.g. AB12 CDE.");
  }
  const outcome = await getActiveProvider().lookupVehicleByReg(registration);
  return { ...outcome, registration };
}

/**
 * Fitment search by vehicle details (make/model/year/variant). Returns the
 * assigned vehicle plus wheel-fitting options, labelled live or demo.
 */
export async function getFitments(
  make: string,
  model: string,
  year?: number,
  variant?: string,
): Promise<FitmentsResult> {
  if (!make || !model) {
    throw new Error("Choose a make and model to search.");
  }
  return getActiveProvider().getFitments(make.trim(), model.trim(), year, variant);
}

/**
 * Manual-entry path: make/model/year -> vehicle outcome (then call
 * `getFitments` to get the fitting options for that vehicle).
 */
export async function vehicleByDetails(params: ManualLookupParams): Promise<VehicleLookupOutcome> {
  if (!params.make) {
    throw new Error("Choose a make to search.");
  }
  const fits = await getFitments(params.make, params.model ?? "", params.year);
  return {
    status: "matched",
    source: fits.source,
    providerId: fits.providerId,
    vehicle: { make: fits.make, model: fits.model, year: fits.year ?? 2021 },
    notice: fits.notice,
  };
}

// ── Demo selection data, re-exported so the UI imports one module ───────────
export {
  DEMO_LOOKUP_NOTICE,
  DEMO_FLEET,
  DEMO_MAKES,
  DEMO_YEARS,
  DIAMETER_OPTIONS,
  modelsForMake,
  DEMO_FITMENTS_NOTICE,
  DEMO_REG_UNAVAILABLE_NOTICE,
} from "./reglookup-demo";