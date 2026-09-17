/**
 * N2 Wheels — DEMO fleet: the SINGLE source of truth for make → model options.
 *
 * ⚠️  SAMPLE/DEMO DATA. This is the list of models the site's make/model/year
 * selects offer (homepage search, /fitment, and the "Will this fit my car?"
 * checker on product pages). It is NOT a licensed fitment database and it is
 * NOT a statement that we stock wheels for every one of these models.
 *
 * WHY THIS FILE EXISTS
 * The model dropdown options (this file) and the per-product sample fitment
 * records (`src/data/products.ts`) must agree CHARACTER-FOR-CHARACTER: the
 * fitment verdict matches a chosen make+model against a product's records by
 * string equality, so a drifted label ("A3" vs "A3 Sportback") silently loses
 * its verdict. Keeping both sides on these exported constants — and typing the
 * record builder with `FleetModel<M>` — makes a mismatch a COMPILE error
 * instead of a silent "not listed" in the UI.
 *
 * Imported by:
 *   - src/lib/reglookup-demo.ts   (re-exported as DEMO_FLEET → dropdown options)
 *   - src/data/products.ts        (fleetFitments() → sample fitment records)
 */
export const FLEET_MODELS = {
  // German premium — full A/S/RS + Q range the way a UK buyer shops by model.
  Audi: [
    "A1",
    "A2",
    "A3",
    "A4",
    "A5",
    "A6",
    "A7",
    "A8",
    "S3",
    "S4",
    "S5",
    "S6",
    "S8",
    "RS3",
    "RS4",
    "RS5",
    "RS6",
    "Q2",
    "Q3",
    "Q4",
    "Q5",
    "Q7",
    "Q8",
  ],
  BMW: [
    "1 Series",
    "2 Series",
    "3 Series",
    "4 Series",
    "5 Series",
    "6 Series",
    "7 Series",
    "8 Series",
    "M2",
    "M3",
    "M4",
    "M5",
    "M8",
    "X1",
    "X2",
    "X3",
    "X4",
    "X5",
    "X6",
    "X7",
  ],
  BYD: ["Atto 3", "Dolphin", "Seal", "Han", "Tang"],
  Changan: ["CS35 Plus", "Eado", "UNI-V", "UNI-K"],
  Chery: ["Omoda 5", "Tiggo 7", "Tiggo 8"],
  Ford: ["Fiesta", "Focus", "Kuga", "Puma", "Mondeo", "Mustang", "Ranger", "Transit"],
  Kia: ["Ceed", "Sportage", "Niro", "Picanto", "EV6", "Sorento"],
  // A-Class / C-Class kept alongside the engine variants: existing product
  // records and the live database rows already use those exact strings.
  "Mercedes-Benz": [
    "A-Class",
    "A180",
    "A200",
    "A45",
    "C-Class",
    "C180",
    "C200",
    "C63",
    "E200",
    "E63",
    "S500",
    "GLA",
    "GLC",
    "GLE",
    "EQA",
    "EQB",
  ],
  MG: ["ZS", "HS", "MG4", "MG3", "MG5"],
  Nissan: ["Micra", "Juke", "Qashqai", "X-Trail", "Leaf", "Ariya", "Navara", "Skyline"],
  Toyota: ["Yaris", "Corolla", "RAV4", "Aygo", "Camry", "C-HR", "Land Cruiser", "Supra"],
  Volkswagen: ["Golf", "Golf R", "Polo", "Passat", "Tiguan", "T-Roc", "ID.3", "ID.4", "Arteon", "Touareg"],
  Vauxhall: ["Corsa", "Astra", "Mokka", "Insignia", "Grandland", "Vivaro"],
} as const satisfies Record<string, readonly string[]>;

/** Makes we offer in the demo fleet (dropdown order = declaration order). */
export type FleetMake = keyof typeof FLEET_MODELS;

/** Every model string valid for a given make (compile-time checked). */
export type FleetModel<M extends FleetMake> = (typeof FLEET_MODELS)[M][number];

/**
 * Mutable, plain-object view of the fleet for the dropdown code (kept as a
 * fresh copy so no caller can mutate the `as const` source above).
 */
export const DEMO_FLEET: Record<string, string[]> = Object.fromEntries(
  Object.entries(FLEET_MODELS).map(([make, models]) => [make, [...models]]),
);

/**
 * One SAMPLE vehicle-fitment record, shape-compatible with `VehicleFitment` in
 * src/data/products.ts (declared structurally here so this module stays
 * dependency-free and cannot create an import cycle).
 */
export interface FleetFitmentRecord {
  make: string;
  model: string;
  /** Platform/generation code, e.g. "F30" (optional). */
  generation?: string;
  /** Optional model-year range the record is valid for. */
  yearsStart?: number;
  yearsEnd?: number;
}

/**
 * Build sample fitment records for a make, guaranteeing that every model
 * string is one the dropdown can actually produce. TypeScript rejects a typo,
 * so a record can never drift away from the fleet list.
 *
 * Added records deliberately carry NO generation/model-year range: the demo
 * dataset does not model per-generation geometry, and an invented year span
 * would read like more precision than we have. Records that already carried a
 * range keep it (they are passed in explicitly).
 */
export function fleetFitments<M extends FleetMake>(
  make: M,
  models: readonly FleetModel<M>[],
): FleetFitmentRecord[] {
  return models.map((model) => ({ make, model }));
}

/** Validate a hand-written fitment record's make/model against the fleet. */
export function isInFleet(make: string, model: string): boolean {
  return (DEMO_FLEET[make] ?? []).includes(model);
}
