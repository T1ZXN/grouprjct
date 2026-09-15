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
 * ── WIRING A REAL PROVIDER (UK reg API and/or Boughto-style fits API) ────────
 * 1. Implement the `VehicleDataProvider` interface in a new module, e.g.
 *    src/lib/reglookup-boughto.ts (fits) and/or src/lib/reglookup-dvla.ts (reg).
 * 2. `registerProvider(yourProvider)` next to the demo registration below.
 * 3. Set the matching key in the site environment (Vite client env, `VITE_*`):
 *      VITE_REG_LOOKUP_KEY  -> UK registration-lookup API key (plate -> vehicle)
 *      VITE_FITS_API_KEY    -> fitment-database API key (make/model -> fits data)
 *    With no key set, the layer stays in demo mode and labels everything.
 * 4. Wire providers to keys in `getActiveProvider()` (see the seam marker).
 * No component or route needs to change — the UI already renders whatever the
 * active provider returns, including the "live" vs "demo" label.
 *
 * Env vars are read from `import.meta.env` (Vite client env). The site builds
 * and runs with NO .env file at all — missing keys simply mean demo mode.
 */
import { demoProvider } from "./reglookup-demo";

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

/** Env keys for the future real providers (Vite client env, see top docblock). */
const REG_LOOKUP_ENV_KEY = "VITE_REG_LOOKUP_KEY" as const;
const FITS_API_ENV_KEY = "VITE_FITS_API_KEY" as const;

/** The Vite client env object (import.meta.env); {} when absent. */
function readClientEnv(): Record<string, string | boolean | undefined> {
  const env = (import.meta as { env?: Record<string, string | boolean | undefined> }).env;
  return env ?? {};
}

/** Which provider keys are configured (both empty -> demo mode). */
export function getConfiguredKeys(): { regLookupKey?: string; fitsApiKey?: string } {
  const env = readClientEnv();
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  return {
    regLookupKey: str(env[REG_LOOKUP_ENV_KEY]),
    fitsApiKey: str(env[FITS_API_ENV_KEY]),
  };
}

/**
 * Pick the active provider:
 *  1. the first REGISTERED provider whose API key is configured, else
 *  2. the demo provider (always available, always clearly labelled).
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
  const { regLookupKey, fitsApiKey } = getConfiguredKeys();
  for (const provider of providers.values()) {
    if (!provider.keyName) continue; // demo provider / keyless providers
    const hasKey =
      (provider.keyName === REG_LOOKUP_ENV_KEY && Boolean(regLookupKey)) ||
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