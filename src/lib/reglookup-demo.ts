/**
 * N2 Wheels — DEMO vehicle / fitment dataset + demo provider adapter.
 *
 * ⚠️  ALL DATA HERE IS SAMPLE/DEMO DATA. No live registration lookup and no
 * licence-backed fitment database are claimed. This module exists so the site
 * ships with a fully working, honest fitment flow from day one, and so a real
 * provider (Boughto-style fits API and/or a UK DVLA-based reg API) can be
 * dropped in later by replacing the *adapter*, not the UI.
 *
 * The adapter contract lives in src/lib/reglookup.ts (`VehicleDataProvider`).
 * This file implements that contract for the demo dataset:
 *   - `demoLookupVehicleByReg(reg)` — deliberately returns an "unavailable"
 *     outcome: no key configured means we NEVER fabricate a vehicle from a
 *     plate. The UI routes the customer to the manual make/model/year path.
 *   - `demoGetFitments(make, model, year?, variant?)` — returns labelled
 *     sample wheel-fitting guidance drawn from the demo fleet
 *     (src/data/demo-fleet.ts).
 *
 * To go live: copy this file to `reglookup-<provider>.ts`, implement the same
 * `VehicleDataProvider` interface against the provider's API, and register it
 * in `reglookup.ts` next to the demo adapter. Set the matching VITE_ key (see
 * `reglookup.ts` docblock) and the layer switches automatically.
 */
import type {
  FitmentOption,
  FitmentsResult,
  Vehicle,
  VehicleDataProvider,
  VehicleLookupOutcome,
} from "./reglookup";

/** Shown whenever a result (or lack of one) comes from the demo dataset. */
export const DEMO_FITMENTS_NOTICE =
  "Sample fitment data — we confirm exact compatibility with your exact vehicle before you order.";
/** Shown when a registration plate is entered but no live reg API is connected. */
export const DEMO_REG_UNAVAILABLE_NOTICE =
  "Live registration lookup isn't connected yet — choose your car manually below. Results are never invented from a plate.";
/** Generic demo vehicle-data label (kept for backwards compatibility). */
export const DEMO_LOOKUP_NOTICE = DEMO_FITMENTS_NOTICE;

/**
 * Demo fleet (makes -> models) powering the make/model/year selects.
 *
 * The data lives in `src/data/demo-fleet.ts` — ONE source of truth shared with
 * the per-product sample fitment records in `src/data/products.ts`, so the
 * dropdown options and the fitment verdict can never drift apart. Re-exported
 * here (and from reglookup.ts) so every existing import keeps working.
 */
export { DEMO_FLEET } from "~/data/demo-fleet";
import { DEMO_FLEET } from "~/data/demo-fleet";

export const DEMO_MAKES: string[] = Object.keys(DEMO_FLEET);

export const DEMO_YEARS: number[] = Array.from({ length: 2026 - 2006 }, (_, i) => 2006 + i).reverse();

export const DIAMETER_OPTIONS: number[] = [16, 17, 18, 19, 20, 21, 22];

/** Model options for the given make (drives the Model select). */
export function modelsForMake(make: string): string[] {
  return DEMO_FLEET[make] ?? [];
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Normalise a UK plate: uppercase, no spaces. (kept here for the adapter) */
export function normalizeRegistration(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Sample wheel-fitting guidance per make (width / PCD / offset). ⚠️ Sample
 * data only — never a fitment guarantee; always surfaced with the demo label.
 */
export interface DemoFitmentProfile {
  /** Rim width used in the sample options, e.g. "7.5J". */
  width: string;
  /** Pitch circle diameter, e.g. "5x112". */
  pcd: string;
  /** Offset representative sample / range, e.g. "ET40–ET50". */
  offset: string;
}

export const DEMO_FITMENT_PROFILES: Record<string, DemoFitmentProfile> = {
  Audi: { width: "7.5J", pcd: "5x112", offset: "ET40–ET50" },
  BMW: { width: "8J", pcd: "5x120", offset: "ET30–ET45" },
  BYD: { width: "8.5J", pcd: "5x120", offset: "ET40–ET50" },
  Changan: { width: "7.5J", pcd: "5x114.3", offset: "ET38–ET48" },
  Chery: { width: "7.5J", pcd: "5x114.3", offset: "ET40–ET50" },
  Ford: { width: "7.5J", pcd: "5x108", offset: "ET45–ET55" },
  Kia: { width: "7.5J", pcd: "5x114.3", offset: "ET40–ET50" },
  "Mercedes-Benz": { width: "8J", pcd: "5x112", offset: "ET35–ET55" },
  MG: { width: "7.5J", pcd: "5x114.3", offset: "ET40–ET50" },
  Nissan: { width: "7.5J", pcd: "5x114.3", offset: "ET38–ET48" },
  Toyota: { width: "7.5J", pcd: "5x114.3", offset: "ET40–ET50" },
  Volkswagen: { width: "7.5J", pcd: "5x112", offset: "ET40–ET50" },
  Vauxhall: { width: "7J", pcd: "5x105", offset: "ET40–ET50" },
};

/** Fallback profile for any make not in the list above. */
const DEFAULT_PROFILE: DemoFitmentProfile = { width: "7.5J", pcd: "5x112", offset: "ET40–ET50" };

/** Sample diameters offered per make (diameter options cover every make). */
function diametersFor(make: string): number[] {
  const base = { Audi: [17, 18, 19], BMW: [17, 18, 19], BYD: [18, 19], "Mercedes-Benz": [17, 18, 19, 20] };
  return (base as Record<string, number[]>)[make] ?? [16, 17, 18];
}

/**
 * Demo adapter: registration lookup. Deliberately does NOT invent a vehicle —
 * without a live reg API no plate can be resolved, so we return an honest
 * "unavailable" outcome and the UI keeps the customer on the manual path.
 */
export async function demoLookupVehicleByReg(reg: string): Promise<VehicleLookupOutcome> {
  await delay(450 + Math.random() * 400); // simulate network latency
  void reg; // validated/normalised by the layer before we get here
  return {
    source: "demo",
    status: "unavailable",
    providerId: "demo",
    notice: DEMO_REG_UNAVAILABLE_NOTICE,
  };
}

/**
 * Demo adapter: make / model / year -> sample fitment options. Every result is
 * labelled demo fitment data; nothing here is a fitment guarantee.
 */
export async function demoGetFitments(
  make: string,
  model: string,
  year?: number,
  variant?: string,
): Promise<FitmentsResult> {
  await delay(350 + Math.random() * 300); // simulate network latency
  const profile = DEMO_FITMENT_PROFILES[make] ?? DEFAULT_PROFILE;
  const options: FitmentOption[] = diametersFor(make).map((diameter) => ({
    diameter,
    width: profile.width,
    pcd: profile.pcd,
    offset: profile.offset,
    note: "Sample fitment guidance — verified against your exact vehicle before order confirmation.",
  }));
  return {
    source: "demo",
    providerId: "demo",
    make,
    model,
    year,
    variant,
    options,
    notice: DEMO_FITMENTS_NOTICE,
  };
}

/** Demo dataset helper used by the layer's `vehicleByDetails` convenience. */
export function demoVehicleFor(make: string, model: string, year?: number): Vehicle {
  const models = DEMO_FLEET[make] ?? [];
  const resolvedModel = model && models.includes(model) ? model : models[0] ?? model;
  return { make, model: resolvedModel, year: year ?? 2021 };
}

/** The demo provider registered with the layer (see src/lib/reglookup.ts). */
export const demoProvider: VehicleDataProvider = {
  id: "demo",
  label: "Demo dataset",
  // No API key needed — keyName undefined keeps this provider always usable.
  lookupVehicleByReg: demoLookupVehicleByReg,
  getFitments: demoGetFitments,
};