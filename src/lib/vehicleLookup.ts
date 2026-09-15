/**
 * VEHICLE LOOKUP — N2 Wheels
 *
 * This module is the single abstraction point for all vehicle / registration
 * lookups on the site (homepage fitment search, /fitment page, and later the
 * catalogue's "will this fit my car?" checks).
 *
 * ── INTEGRATION POINT FOR THE REAL UK REGISTRATION-LOOKUP API ───────────────
 * Today the functions below are STUBS: they return a small hard-coded demo
 * vehicle set after a fake network delay, and every result is flagged
 * `demo: true` so the UI can label it "Demo data — registration lookup isn't
 * connected yet".
 *
 * When a real UK registration-lookup service is connected (DVLA vehicle data
 * via an accredited partner, or a commercial reg-API), ONLY the bodies of
 * `lookupByRegistration` and `lookupByDetails` need to change. Everything else
 * on the site depends on the exported types (`Vehicle`, `*LookupResult`), so
 * no component, route or search form has to be redesigned.
 *
 * Expected real-API contract (for the future implementer):
 *   - input:  a UK registration plate string (e.g. "AB12 CDE")
 *   - output: { make, model, year, variant?, engine?, fuel? } — i.e. `Vehicle`
 *   - failures: throw an Error with a human-readable message, or return
 *     `{ vehicle: null }` shape if a no-match is a normal outcome.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A vehicle as identified by a registration lookup (or manual details). */
export interface Vehicle {
  make: string;
  model: string;
  year: number;
  variant?: string;
  engine?: string;
  fuel?: string;
}

export interface RegistrationLookupResult {
  registration: string; // normalised plate, e.g. "AB12CDE"
  vehicle: Vehicle;
  /** Always true until the real API is connected — drives the demo label. */
  demo: true;
  notice: string;
}

export interface ManualLookupResult {
  vehicle: Vehicle;
  demo: true;
  notice: string;
}

export interface ManualLookupParams {
  make: string;
  model?: string;
  year?: number;
  /** Optional wheel diameter (inches) the customer is interested in. */
  diameter?: number;
}

export const DEMO_LOOKUP_NOTICE =
  "Demo data — registration lookup isn't connected yet.";

/** Demo fleet used by the stubs (makes -> models). */
export const DEMO_FLEET: Record<string, string[]> = {
  Audi: ["A3", "A4", "Q5"],
  BMW: ["1 Series", "3 Series", "X3"],
  Ford: ["Fiesta", "Focus", "Kuga"],
  "Mercedes-Benz": ["A-Class", "C-Class", "GLA"],
  Nissan: ["Micra", "Juke", "Qashqai"],
  Toyota: ["Yaris", "Corolla", "RAV4"],
  Volkswagen: ["Golf", "Passat", "Tiguan"],
  Vauxhall: ["Corsa", "Astra", "Mokka"],
};

export const DEMO_MAKES: string[] = Object.keys(DEMO_FLEET);

export const DEMO_YEARS: number[] = Array.from({ length: 2026 - 2006 }, (_, i) => 2006 + i).reverse();

export const DIAMETER_OPTIONS: number[] = [16, 17, 18, 19, 20, 21, 22];

/** Model options for the given make (drives the Model select). */
export function modelsForMake(make: string): string[] {
  return DEMO_FLEET[make] ?? [];
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Normalise a UK plate: uppercase, no spaces. */
export function normalizeRegistration(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Deterministic pseudo-random pick so the same plate always returns the same demo car. */
function pickForReg(reg: string): Vehicle {
  let hash = 0;
  for (let i = 0; i < reg.length; i++) hash = (hash * 31 + reg.charCodeAt(i)) >>> 0;
  const makes = DEMO_MAKES;
  const make = makes[hash % makes.length];
  const models = DEMO_FLEET[make];
  const model = models[(hash >>> 3) % models.length];
  const year = 2012 + ((hash >>> 7) % 14);
  return { make, model, year };
}

/**
 * Stub: looks up a UK registration plate.
 *
 * ⚠️ STUB — see the module docblock for the real-API integration point.
 * Replace the body with a call to the UK registration-lookup API while keeping
 * the `RegistrationLookupResult` return shape.
 */
export async function lookupByRegistration(plate: string): Promise<RegistrationLookupResult> {
  const registration = normalizeRegistration(plate);
  if (!/^[A-Z0-9]{2,7}$/.test(registration)) {
    throw new Error("Enter a valid UK registration, e.g. AB12 CDE.");
  }
  await delay(450 + Math.random() * 400); // fake network latency
  return {
    registration,
    vehicle: pickForReg(registration),
    demo: true,
    notice: DEMO_LOOKUP_NOTICE,
  };
}

/**
 * Stub: looks up a vehicle from manual details (make / model / year).
 *
 * ⚠️ STUB — same integration point as above. When the real API is live this
 * path can query a vehicle database by attributes instead of a plate.
 */
export async function lookupByDetails(params: ManualLookupParams): Promise<ManualLookupResult> {
  if (!params.make || !DEMO_FLEET[params.make]) {
    throw new Error("Choose a make to search.");
  }
  await delay(350 + Math.random() * 300); // fake network latency
  const models = DEMO_FLEET[params.make];
  const model = params.model && models.includes(params.model) ? params.model : models[0];
  const year = params.year ?? 2021;
  return {
    vehicle: { make: params.make, model, year },
    demo: true,
    notice: DEMO_LOOKUP_NOTICE,
  };
}