/**
 * customerProfile.ts — the per-account SAVED VEHICLE (customer_profiles row).
 *
 * WHAT IT DOES
 * Reads and writes ONE row per signed-in account in `public.customer_profiles`
 * (id = the auth user's uid, `vehicle` jsonb, `updated_at`). The vehicle is the
 * same shape the site's make/model/year selects already produce (see
 * src/data/demo-fleet.ts — the fleet is the single source of truth for the
 * options), plus an OPTIONAL registration plate. Make/model/year is required.
 *
 * HONESTY CONTRACT (hard requirements — never relax):
 *   1. Supabase not configured -> honest error, NOTHING read or written.
 *   2. No real session -> honest error, NOTHING read or written (we never even
 *      query: an anonymous request could not return a profile anyway).
 *   3. Table missing (the owner applies scripts/customer-profiles.sql by hand,
 *      exactly like sync-fitment-records.sql) -> the UI says "saved vehicles
 *      aren't set up yet" and the save reports a failure. A save is NEVER
 *      faked and a local-only value is NEVER presented as saved.
 *   4. `ok: true` on a write means the row came back from the database. A
 *      write that changed nothing, or that the service rejected, is a failure.
 *
 * The pure half (input parsing, row mapping, labels) is unit-tested in
 * scripts/test-account.ts; the Supabase half is thin on purpose.
 */
import { isInFleet } from "~/data/demo-fleet";
import { isMissingTableError } from "~/lib/importPersistence";
import { isSignedIn } from "~/lib/customerAuth";
import { supabase } from "~/lib/supabase";

/** The table the owner creates by hand (see scripts/customer-profiles.sql). */
export const PROFILE_TABLE = "customer_profiles";

/** A saved vehicle: what the dropdowns produced, plus an optional plate. */
export interface SavedVehicle {
  make: string;
  model: string;
  year: number | null;
  /** Optional UK registration the customer typed (upper-case, no spaces). */
  registration: string | null;
}

/** Loose input as it comes off the form. */
export interface VehicleInput {
  make: string;
  model: string;
  year?: string | number | null;
  registration?: string | null;
}

/* ── Honest messages (single source of truth for UI + tests) ────────────── */

export const PROFILE_NOT_CONFIGURED_MSG =
  "Accounts aren't available on this build — the site can't reach its database, so nothing can be saved. Nothing has been saved.";
export const PROFILE_NOT_SIGNED_IN_MSG =
  "Sign in to see the vehicle saved on your account. Nothing has been saved.";
export const PROFILE_NOT_READY_MSG =
  "Saved vehicles aren't set up yet — the customer_profiles table hasn't been created in the database. Nothing has been saved for you. (The team needs to run scripts/customer-profiles.sql in the Supabase SQL Editor first.)";
export const PROFILE_READ_FAILED_MSG =
  "We couldn't read your account details just now — reload the page and try again.";
export const PROFILE_SAVE_FAILED_MSG =
  "We couldn't save that vehicle — please try again in a moment.";
export const VEHICLE_MAKE_REQUIRED_MSG = "Choose your car's make from the list.";
export const VEHICLE_MODEL_REQUIRED_MSG = "Choose your car's model from the list.";
export const VEHICLE_NOT_IN_LIST_MSG =
  "That make and model aren't in our list — pick both from the dropdowns, or use the registration checker to find your car.";
export const VEHICLE_YEAR_INVALID_MSG = "Pick a model year between 1990 and next year.";

/** Oldest model year the picker offers (fleet-wide sanity bound). */
export const MIN_VEHICLE_YEAR = 1990;
/** Years ahead of the current one we accept (new-model-year plates). */
export const YEAR_SLACK = 1;

/* ── Pure helpers ──────────────────────────────────────────────────────── */

/** Upper-case, strip spaces — the form a UK plate is stored in. */
export function normaliseRegistration(raw: string | null | undefined): string | null {
  const value = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return value === "" ? null : value;
}

/** The latest model year we accept, given "now". */
export function maxVehicleYear(now: Date = new Date()): number {
  return now.getFullYear() + YEAR_SLACK;
}

/** Parse a form year ("2015", "", null) into a number or null. */
export function parseVehicleYear(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.trunc(raw) : null;
  const value = String(raw ?? "").trim();
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Validate + normalise the form's vehicle into the exact object we store.
 * Returns `error` (and no vehicle) for anything that isn't a real, listable
 * car — we never store a half-filled row and never invent a model.
 */
export function parseVehicleInput(
  input: VehicleInput,
  now: Date = new Date(),
): { vehicle: SavedVehicle | null; error?: string } {
  const make = String(input.make ?? "").trim();
  const model = String(input.model ?? "").trim();
  if (make === "") return { vehicle: null, error: VEHICLE_MAKE_REQUIRED_MSG };
  if (model === "") return { vehicle: null, error: VEHICLE_MODEL_REQUIRED_MSG };
  if (!isInFleet(make, model)) return { vehicle: null, error: VEHICLE_NOT_IN_LIST_MSG };
  const year = parseVehicleYear(input.year);
  if (year !== null && (year < MIN_VEHICLE_YEAR || year > maxVehicleYear(now))) {
    return { vehicle: null, error: VEHICLE_YEAR_INVALID_MSG };
  }
  return {
    vehicle: { make, model, year, registration: normaliseRegistration(input.registration) },
  };
}

/** The jsonb payload written into the `vehicle` column (pure + pinned by tests). */
export function vehicleJsonPayload(vehicle: SavedVehicle): Record<string, unknown> {
  return {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year ?? null,
    registration: vehicle.registration ?? null,
  };
}

/** Read a stored `vehicle` jsonb value back, or null when it isn't a vehicle. */
export function vehicleFromJson(raw: unknown): SavedVehicle | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const make = typeof v.make === "string" ? v.make.trim() : "";
  const model = typeof v.model === "string" ? v.model.trim() : "";
  if (make === "" || model === "") return null;
  const year =
    v.year === null || v.year === undefined || v.year === "" ? null : parseVehicleYear(v.year as number);
  return {
    make,
    model,
    year: year !== null && year >= MIN_VEHICLE_YEAR ? year : null,
    registration: normaliseRegistration(typeof v.registration === "string" ? v.registration : null),
  };
}

/** Map a customer_profiles row onto a SavedVehicle (null = no vehicle saved). */
export function rowToSavedVehicle(row: unknown): SavedVehicle | null {
  if (!row || typeof row !== "object") return null;
  return vehicleFromJson((row as { vehicle?: unknown }).vehicle);
}

/** Human label for the saved-vehicle card: "2015 BMW 3 Series (SA15 VPR)". */
export function vehicleLabel(vehicle: SavedVehicle): string {
  const parts = [vehicle.year ? String(vehicle.year) : null, vehicle.make, vehicle.model].filter(
    (p): p is string => typeof p === "string" && p !== "",
  );
  const base = parts.join(" ");
  return vehicle.registration ? `${base} (${vehicle.registration})` : base;
}

/** A form draft for the save form, pre-filled from a saved vehicle. */
export function draftFromVehicle(vehicle: SavedVehicle | null): {
  make: string;
  model: string;
  year: string;
  registration: string;
} {
  return {
    make: vehicle?.make ?? "",
    model: vehicle?.model ?? "",
    year: vehicle?.year ? String(vehicle.year) : "",
    registration: vehicle?.registration ?? "",
  };
}

/* ── Supabase read/write ──────────────────────────────────────────────── */

/** Outcome of reading the account's saved vehicle. */
export interface LoadVehicleResult {
  /** True only when a real session was present. */
  signedIn: boolean;
  vehicle: SavedVehicle | null;
  /** Set when the table is missing, so the UI can show the "not set up yet" card. */
  tableMissing?: boolean;
  error?: string;
}

/**
 * Load the signed-in account's saved vehicle. Never throws, never needs a
 * session to be *checked* first: with no session it reports that honestly and
 * issues no query.
 */
export async function loadCustomerVehicle(): Promise<LoadVehicleResult> {
  if (!supabase) return { signedIn: false, vehicle: null, error: PROFILE_NOT_CONFIGURED_MSG };
  const client = supabase;
  try {
    const { data: sessionData } = await client.auth.getSession();
    if (!isSignedIn(sessionData.session)) {
      return { signedIn: false, vehicle: null, error: PROFILE_NOT_SIGNED_IN_MSG };
    }
    const id = sessionData.session?.user.id as string;
    const { data, error } = await client
      .from(PROFILE_TABLE)
      .select("vehicle, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) {
        return { signedIn: true, vehicle: null, tableMissing: true, error: PROFILE_NOT_READY_MSG };
      }
      return { signedIn: true, vehicle: null, error: `${PROFILE_READ_FAILED_MSG} (${error.message})` };
    }
    return { signedIn: true, vehicle: rowToSavedVehicle(data) };
  } catch (e) {
    return {
      signedIn: false,
      vehicle: null,
      error: `${PROFILE_READ_FAILED_MSG} (${e instanceof Error ? e.message : String(e)})`,
    };
  }
}

/** Outcome of a save/clear. `vehicle` is the value the DATABASE now holds. */
export interface SaveVehicleResult {
  ok: boolean;
  vehicle?: SavedVehicle | null;
  /** Set when the table is missing (owner hasn't run the SQL yet). */
  tableMissing?: boolean;
  error?: string;
}

/**
 * Save (or clear) the signed-in account's vehicle. Validation and the
 * configured/signed-in gates all run BEFORE any query, so a blocked call is
 * provably write-free.
 */
export async function saveCustomerVehicle(
  input?: VehicleInput,
  now: Date = new Date(),
): Promise<SaveVehicleResult> {
  let vehicle: SavedVehicle | null = null;
  if (input) {
    const parsed = parseVehicleInput(input, now);
    if (!parsed.vehicle) return { ok: false, error: parsed.error ?? PROFILE_SAVE_FAILED_MSG };
    vehicle = parsed.vehicle;
  }
  if (!supabase) return { ok: false, error: PROFILE_NOT_CONFIGURED_MSG };
  const client = supabase;
  try {
    const { data: sessionData } = await client.auth.getSession();
    if (!isSignedIn(sessionData.session)) {
      return { ok: false, error: PROFILE_NOT_SIGNED_IN_MSG };
    }
    const id = sessionData.session?.user.id as string;
    const row = {
      id,
      vehicle: vehicle ? vehicleJsonPayload(vehicle) : null,
      updated_at: now.toISOString(),
    };
    const { error } = await client.from(PROFILE_TABLE).upsert(row, { onConflict: "id" });
    if (error) {
      if (isMissingTableError(error)) {
        return { ok: false, tableMissing: true, error: PROFILE_NOT_READY_MSG };
      }
      return { ok: false, error: `${PROFILE_SAVE_FAILED_MSG} (${error.message})` };
    }
    return { ok: true, vehicle };
  } catch (e) {
    return {
      ok: false,
      error: `${PROFILE_SAVE_FAILED_MSG} (${e instanceof Error ? e.message : String(e)})`,
    };
  }
}

/** Remove the saved vehicle from the account (the row stays; vehicle -> null). */
export async function clearCustomerVehicle(now: Date = new Date()): Promise<SaveVehicleResult> {
  return saveCustomerVehicle(undefined, now);
}
