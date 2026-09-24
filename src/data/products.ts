/**
 * N2 Wheels — SAMPLE product data model.
 *
 * ⚠️  ALL DATA IN THIS FILE IS SAMPLE/DEMO DATA. No live stock, availability or
 * supplier prices are claimed. It exists to power the homepage and give the
 * catalogue build a head start. Field names deliberately match the supplier
 * (Forzza) feed fields so a future CSV/XML import can populate models built on
 * these interfaces without a redesign.
 *
 * Pricing rule (see src/lib/pricing.ts): products store ONLY a supplier price
 * in EUR. The retail price the site displays is derived from central pricing
 * settings — never hard-coded here.
 */
import { recalculateAllPrices, retailPriceIncVat, round2 } from "~/lib/pricing";
// Model strings for the sample fitment records come from the SAME fleet list
// that populates the make/model dropdowns, so the two can never drift apart.
import { fleetFitments } from "~/data/demo-fleet";

export const DEMO_NOTICE =
  "Sample data — demo products only. No live stock or availability is claimed.";

export type StockStatus = "In Stock" | "Available to order" | "Out of stock" | "Contact us";
export type CategorySlug = "wheels" | "tyres" | "packages" | "accessories";

/** The four stock statuses, in display order (drives the availability filter). */
export const STOCK_STATUSES: StockStatus[] = [
  "In Stock",
  "Available to order",
  "Out of stock",
  "Contact us",
];

/** Wheel fitment geometry — matches the supplier-feed size fields. */
export interface WheelSize {
  /** Rim diameter in inches, e.g. 18 */
  diameter: number;
  /** Rim width, e.g. "8.5J" */
  width: string;
  /** Pitch circle diameter, e.g. "5x112" */
  pcd: string;
  /** Offset, e.g. "ET45" */
  offset: string;
}

/**
 * One SAMPLE vehicle-fitment record for a wheel/package. Mirrors the shape the
 * future supplier feed is expected to carry (make / model / generation /
 * model-years). ⚠️ These are SAMPLE records — never a fitment guarantee. They
 * are surfaced on the site ONLY with a visible "sample fitment data" label.
 */
export interface VehicleFitment {
  make: string;
  model: string;
  /** Platform/generation code, e.g. "F30" (optional). */
  generation?: string;
  /** Optional model-year range the record is valid for. */
  yearsStart?: number;
  yearsEnd?: number;
}

/**
 * Tyre spec carried by wheel & tyre packages — matches the supplier-feed tyre
 * fields (see Tyre) so a package breakdown can render brand / model / size.
 */
export interface PackageTyreSpec {
  brand: string;
  model: string;
  /** Section width in mm, e.g. 225 */
  width: number;
  /** Aspect ratio, e.g. 45 ("225/45R18") */
  aspect: number;
  /** Rim diameter in inches, e.g. 18 */
  rimDiameter: number;
}

export interface Wheel {
  id: string;
  /** Supplier catalogue / feed ID (the future import key). */
  supplierId: string;
  brand: string;
  name: string;
  category: "wheels";
  size: WheelSize;
  colour: string;
  finish: string;
  /** Sample supplier list price in EUR — retail is derived, see pricing.ts. */
  supplierPriceEur: number;
  /** Derived via central pricing settings. Do not hand-edit. */
  retailPriceIncVat: number;
  stockStatus: StockStatus;
  /** What's included / needed, e.g. "20x conical bolts included". */
  includedBolts: string;
  image: string;
  description: string;
  /** Example compatible vehicles (make-level). Sample guidance only. */
  vehicleCompatibility: string[];
  /**
   * SAMPLE model-level fitment records (see VehicleFitment). Demo data only —
   * always surfaced with a "sample fitment data" label; never a guarantee.
   */
  vehicleFitments?: VehicleFitment[];
}

export interface Tyre {
  id: string;
  supplierId: string;
  brand: string;
  name: string;
  category: "tyres";
  /** Section width in mm, e.g. 225 */
  width: number;
  /** Aspect ratio, e.g. 45 ("225/45R18") */
  aspect: number;
  /** Rim diameter in inches, e.g. 18 */
  rimDiameter: number;
  loadIndex: string;
  speedRating: string;
  season: "Summer" | "All-season" | "Winter";
  supplierPriceEur: number;
  retailPriceIncVat: number;
  stockStatus: StockStatus;
  image: string;
  description: string;
  /**
   * SAMPLE model-level fitment records (see VehicleFitment) — the models this
   * tyre SIZE plausibly serves in our sample fleet, built with the same
   * `fleetFitments()` builder the wheels use so a model string can never drift
   * from the make/model dropdown. Demo data only: a size range is not a fitment
   * guarantee, and we confirm the exact size against the vehicle before
   * confirming an order.
   */
  vehicleFitments?: VehicleFitment[];
}

export interface WheelPackage {
  id: string;
  name: string;
  category: "packages";
  /** Diameter of the wheels in the package, inches. */
  diameter: number;
  /** Human-readable contents ("4x Forza R1 18\" wheels, 4x tyres, bolts..."). */
  includes: string[];
  /**
   * Wheel spec inside this package (mirrors the wheel's WheelSize) so the
   * package detail can render a proper spec breakdown.
   */
  wheelSpec?: WheelSize;
  /** Tyres inside this package — brand/model/size as in the supplier feed. */
  tyreSpec?: PackageTyreSpec;
  /**
   * SAMPLE model-level fitment records (see VehicleFitment). Demo data only —
   * always surfaced with a "sample fitment data" label; never a guarantee.
   */
  vehicleFitments?: VehicleFitment[];
  supplierPriceEur: number;
  retailPriceIncVat: number;
  stockStatus: StockStatus;
  image: string;
  description: string;
}

export interface Category {
  slug: CategorySlug;
  name: string;
  blurb: string;
  image: string;
  href: string;
}

export interface Accessory {
  id: string;
  supplierId: string;
  name: string;
  brand: string;
  category: "accessories";
  supplierPriceEur: number;
  retailPriceIncVat: number;
  stockStatus: StockStatus;
  image: string;
  description: string;
}

const retail = (supplierEur: number): number => round2(retailPriceIncVat(supplierEur));

/**
 * SAMPLE fitment spread for the EV-first fleet (owner direction 2026-09-17).
 *
 * The electric makes added to the fleet (Tesla, Xpeng, Polestar, NIO, Zeekr,
 * Smart) are overwhelmingly 5x112 / 5x114.3 / 5x120, so they are added to the
 * German-compatible wheels and the Track Day pack — NEVER to the small-car
 * patterns (Grip G-9 is 4x100, Apex A-7 is 5x100, Drifter D-5 is 5x108), which
 * keep their original records exactly as they were. Sample records only: the
 * exact geometry is verified against the vehicle before any order is confirmed.
 */
const EV_MAKE_FITMENTS: VehicleFitment[] = [
  ...fleetFitments("Tesla", ["Model 3", "Model Y", "Model S", "Model X"]),
  ...fleetFitments("Xpeng", ["G6", "G9", "P7"]),
  ...fleetFitments("Polestar", ["2", "3", "4"]),
  ...fleetFitments("NIO", ["ET5", "ET7", "ES6", "ES8"]),
  ...fleetFitments("Zeekr", ["001", "009", "X"]),
  ...fleetFitments("Smart", ["#1", "#3"]),
];

/** 6 sample wheels (4 unique images; extras reuse images illustratively). */
export const demoWheels: Wheel[] = [
  {
    id: "w-forza-r1-18",
    supplierId: "FZ-1001",
    brand: "Forzza",
    name: "Forza R1",
    category: "wheels",
    size: { diameter: 18, width: "8.5J", pcd: "5x112", offset: "ET45" },
    colour: "Gloss Black",
    finish: "Gloss",
    supplierPriceEur: 189,
    retailPriceIncVat: retail(189),
    stockStatus: "In Stock",
    includedBolts: "20x conical black bolts included",
    image: "/images/wheel-forza.jpg",
    description: "Five-spoke gloss black lightweight alloy with a deep concave face.",
    vehicleCompatibility: ["Audi", "BMW", "Mercedes-Benz", "Volkswagen"],
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee. These
    // records are built from the shared demo fleet (src/data/demo-fleet.ts), so
    // every model string below is one the make/model selects can produce.
    // Make/model level only — the demo dataset does not model per-generation
    // geometry, and every order is checked against the exact vehicle.
    vehicleFitments: [
      { make: "BMW", model: "3 Series", generation: "F30", yearsStart: 2012, yearsEnd: 2018 },
      { make: "Volkswagen", model: "Golf", generation: "MK7", yearsStart: 2013, yearsEnd: 2020 },
      ...fleetFitments("Audi", ["A3", "A4", "A5", "A6", "S3", "S4", "S5", "Q3", "Q5"]),
      ...fleetFitments("BMW", [
        "1 Series",
        "2 Series",
        "4 Series",
        "5 Series",
        "X1",
        "X2",
        "X3",
        "X4",
        "X5",
        "M3",
        "M4",
      ]),
      ...fleetFitments("Mercedes-Benz", [
        "A-Class",
        "A180",
        "A200",
        "A45",
        "C-Class",
        "C180",
        "C200",
        "C63",
        "E200",
        "GLA",
        "GLC",
        "GLE",
      ]),
      ...fleetFitments("Volkswagen", ["Golf R", "Passat", "Tiguan", "T-Roc", "Arteon"]),
      ...EV_MAKE_FITMENTS,
    ],
  },
  {
    id: "w-vortex-vx9-19",
    supplierId: "FZ-1002",
    brand: "Forzza",
    name: "Vortex VX-9",
    category: "wheels",
    size: { diameter: 19, width: "8.5J", pcd: "5x114.3", offset: "ET38" },
    colour: "Gunmetal",
    finish: "Satin",
    supplierPriceEur: 214,
    retailPriceIncVat: retail(214),
    stockStatus: "In Stock",
    includedBolts: "20x conical bolts included",
    image: "/images/wheel-vortex.jpg",
    description: "Split-spoke satin gunmetal wheel with an aggressive motorsport profile.",
    vehicleCompatibility: ["Audi", "BMW", "Mercedes-Benz", "Volkswagen", "Nissan", "Toyota", "Honda"],
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee. Built
    // from the shared demo fleet (src/data/demo-fleet.ts) so every model string
    // is one the make/model selects can produce. This wheel is our most popular
    // fitment search hit, so it carries the widest sample coverage: the German
    // premium makes the owner asked for, plus the Nissan / Toyota models that
    // already had records. Geometry is verified per vehicle before any order.
    vehicleFitments: [
      { make: "Nissan", model: "Qashqai", generation: "J11", yearsStart: 2014, yearsEnd: 2021 },
      { make: "Toyota", model: "Corolla", generation: "E210", yearsStart: 2019, yearsEnd: 2022 },
      ...fleetFitments("Audi", ["A3", "A4", "A5", "S3", "S4", "Q3", "Q5"]),
      ...fleetFitments("BMW", [
        "1 Series",
        "2 Series",
        "3 Series",
        "4 Series",
        "5 Series",
        "X1",
        "X2",
        "X3",
        "X4",
        "X5",
        "M3",
        "M4",
      ]),
      ...fleetFitments("Mercedes-Benz", [
        "A-Class",
        "A180",
        "A200",
        "A45",
        "C-Class",
        "C180",
        "C200",
        "C63",
        "GLA",
        "GLC",
      ]),
      ...fleetFitments("Volkswagen", ["Golf", "Golf R", "Passat", "Tiguan", "T-Roc", "Arteon"]),
      ...fleetFitments("Nissan", ["Micra", "Juke", "X-Trail", "Leaf", "Ariya"]),
      ...fleetFitments("Toyota", ["RAV4", "C-HR", "Camry", "Supra"]),
      ...EV_MAKE_FITMENTS,
    ],
  },
  {
    id: "w-apex-a7-18",
    supplierId: "FZ-1003",
    brand: "Forzza",
    name: "Apex A-7",
    category: "wheels",
    size: { diameter: 18, width: "7.5J", pcd: "5x100", offset: "ET42" },
    colour: "Matte Bronze",
    finish: "Matte",
    supplierPriceEur: 175,
    retailPriceIncVat: retail(175),
    stockStatus: "Available to order",
    includedBolts: "20x conical bolts included",
    image: "/images/wheel-apex.jpg",
    description: "Twin-spoke matte bronze wheel with a refined, understated look.",
    vehicleCompatibility: ["Subaru", "Volkswagen", "Seat"],
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee. Only a
    // model whose geometry genuinely matches this 5x100 wheel is listed
    // (5x100 is the older VW/Audi platform pattern, not the current one).
    vehicleFitments: [
      { make: "Volkswagen", model: "Golf", generation: "MK4", yearsStart: 1998, yearsEnd: 2003 },
    ],
  },
  {
    id: "w-drifter-d5-17",
    supplierId: "FZ-1004",
    brand: "Forzza",
    name: "Drifter D-5",
    category: "wheels",
    size: { diameter: 17, width: "7.0J", pcd: "5x108", offset: "ET49" },
    colour: "Silver",
    finish: "Machined face, dark pockets",
    supplierPriceEur: 149,
    retailPriceIncVat: retail(149),
    stockStatus: "Out of stock",
    includedBolts: "20x bolts included",
    image: "/images/wheel-drifter.jpg",
    description: "Machined silver twin-spoke classic with dark recessed pockets.",
    vehicleCompatibility: ["Ford", "Volvo", "Vauxhall"],
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee. 5x108 is
    // Ford's pattern on this era of car; only genuinely matching models listed.
    vehicleFitments: [
      { make: "Ford", model: "Focus", generation: "MK3", yearsStart: 2011, yearsEnd: 2018 },
    ],
  },
  {
    id: "w-turbo-t6-19",
    supplierId: "FZ-1005",
    brand: "Forzza",
    name: "Turbo T-6",
    category: "wheels",
    size: { diameter: 19, width: "8.0J", pcd: "5x112", offset: "ET40" },
    colour: "Satin Graphite",
    finish: "Satin",
    supplierPriceEur: 198,
    retailPriceIncVat: retail(198),
    stockStatus: "Available to order",
    includedBolts: "20x conical bolts included",
    image: "/images/wheel-vortex.jpg", // illustrative
    description: "Six-spoke satin graphite wheel built for the daily driver.",
    vehicleCompatibility: ["Audi", "Mercedes-Benz", "Volkswagen"],
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee. 5x112 is
    // the shared Audi / Mercedes-Benz / Volkswagen pattern, and the make-level
    // list above matches the makes below.
    vehicleFitments: [
      ...fleetFitments("Audi", ["A4", "A5", "A6", "Q3", "Q5"]),
      ...fleetFitments("Mercedes-Benz", ["A-Class", "C-Class", "E200", "GLC"]),
      ...fleetFitments("Volkswagen", ["Golf", "Passat", "Tiguan", "Arteon"]),
      ...EV_MAKE_FITMENTS,
    ],
  },
  {
    id: "w-grip-g9-16",
    supplierId: "FZ-1006",
    brand: "Forzza",
    name: "Grip G-9",
    category: "wheels",
    size: { diameter: 16, width: "6.5J", pcd: "4x100", offset: "ET38" },
    colour: "Gloss Black",
    finish: "Gloss",
    supplierPriceEur: 124,
    retailPriceIncVat: retail(124),
    stockStatus: "Contact us",
    includedBolts: "16x bolts included",
    image: "/images/category-wheels.jpg", // illustrative
    description: "Smart five-spoke gloss black wheel for smaller city cars.",
    vehicleCompatibility: ["Ford", "Toyota", "Vauxhall"],
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee. 4x100 is
    // a small-car pattern, so only genuinely matching small models are listed.
    vehicleFitments: [
      { make: "Ford", model: "Fiesta", generation: "MK7", yearsStart: 2008, yearsEnd: 2017 },
      { make: "Toyota", model: "Yaris", generation: "XP130", yearsStart: 2011, yearsEnd: 2020 },
      { make: "Toyota", model: "Aygo", generation: "AB10", yearsStart: 2014, yearsEnd: 2022 },
      { make: "Vauxhall", model: "Corsa", generation: "D", yearsStart: 2006, yearsEnd: 2014 },
    ],
  },
];

/**
 * 3 sample tyres (all use one illustrative tyre image for now).
 *
 * Each tyre now carries SAMPLE fitment records: the models its SIZE plausibly
 * serves, built from the shared demo fleet (`fleetFitments()`), so "tyres that
 * fit my car" and "wheels that fit my car" both work off the same fleet list.
 * A tyre size range is guidance, never a fitment guarantee — the site always
 * confirms the exact size against the vehicle before confirming an order.
 */
export const demoTypes: Tyre[] = [
  {
    id: "t-strada-sp01",
    supplierId: "FZ-T201",
    brand: "Strada",
    name: "SP-01",
    category: "tyres",
    width: 225,
    aspect: 45,
    rimDiameter: 18,
    loadIndex: "91Y",
    speedRating: "Y",
    season: "Summer",
    supplierPriceEur: 118,
    retailPriceIncVat: retail(118),
    stockStatus: "In Stock",
    image: "/images/category-tyres.jpg",
    description: "High-performance summer tyre for sports and executive cars.",
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee. 225/45R18
    // is a mid-size/executive fitment, so the compact-executive class below is
    // the plausible spread (hatchbacks and saloons in the 17–18" class, plus the
    // EV saloons and crossovers that run this size).
    vehicleFitments: [
      ...fleetFitments("Audi", ["A3", "A4", "A5", "S3", "Q3"]),
      ...fleetFitments("BMW", ["1 Series", "3 Series", "4 Series", "X1", "X2"]),
      ...fleetFitments("Mercedes-Benz", ["A-Class", "A180", "A200", "C-Class", "C180", "C200", "GLA", "GLC"]),
      ...fleetFitments("Volkswagen", ["Golf", "Golf R", "Passat", "Tiguan", "T-Roc", "Arteon"]),
      ...fleetFitments("Tesla", ["Model 3", "Model Y"]),
      ...fleetFitments("Polestar", ["2"]),
      ...fleetFitments("Xpeng", ["G6"]),
      ...fleetFitments("NIO", ["ET5"]),
      ...fleetFitments("Zeekr", ["X"]),
      ...fleetFitments("Smart", ["#1", "#3"]),
      ...fleetFitments("BYD", ["Atto 3", "Seal", "Han"]),
      ...fleetFitments("MG", ["HS", "ZS", "MG4", "MG5"]),
      ...fleetFitments("Toyota", ["Corolla", "Camry"]),
      ...fleetFitments("Nissan", ["Qashqai", "Leaf"]),
      ...fleetFitments("Ford", ["Focus", "Kuga"]),
      ...fleetFitments("Kia", ["Ceed", "Sportage", "Niro", "EV6"]),
      ...fleetFitments("Hyundai", ["i30", "Tucson", "Kona", "Ioniq 5"]),
      ...fleetFitments("Honda", ["Civic", "Accord", "CR-V", "HR-V"]),
      ...fleetFitments("SEAT", ["Leon", "Ateca"]),
      ...fleetFitments("Škoda", ["Octavia", "Superb", "Kamiq", "Karoq", "Enyaq"]),
      ...fleetFitments("Renault", ["Megane", "Arkana", "Kadjar", "Austral"]),
      ...fleetFitments("Peugeot", ["308", "3008", "508"]),
      ...fleetFitments("Citroën", ["C4", "C5 Aircross"]),
      ...fleetFitments("Volvo", ["XC40", "V60", "S60", "V40"]),
      ...fleetFitments("Jaguar", ["XE", "XF", "E-Pace"]),
      ...fleetFitments("Mini", ["Cooper", "Clubman", "Countryman"]),
      ...fleetFitments("Mazda", ["Mazda3", "Mazda6", "CX-30", "CX-5", "MX-30"]),
      ...fleetFitments("Subaru", ["Impreza", "Forester", "Levorg"]),
      ...fleetFitments("Vauxhall", ["Astra", "Insignia", "Mokka", "Grandland"]),
      ...fleetFitments("Mitsubishi", ["Outlander", "Eclipse Cross", "Lancer"]),
      ...fleetFitments("Lexus", ["IS", "ES", "NX", "UX"]),
      ...fleetFitments("Alfa Romeo", ["Giulia", "Stelvio", "Giulietta"]),
      ...fleetFitments("Jeep", ["Compass", "Renegade", "Avenger"]),
      ...fleetFitments("Changan", ["CS35 Plus", "Eado", "UNI-V", "UNI-K"]),
      ...fleetFitments("Chery", ["Omoda 5", "Tiggo 7", "Tiggo 8"]),
    ],
  },
  {
    id: "t-strada-sp02",
    supplierId: "FZ-T202",
    brand: "Strada",
    name: "SP-02 XL",
    category: "tyres",
    width: 235,
    aspect: 40,
    rimDiameter: 19,
    loadIndex: "96Y XL",
    speedRating: "Y",
    season: "Summer",
    supplierPriceEur: 132,
    retailPriceIncVat: retail(132),
    stockStatus: "Available to order",
    image: "/images/category-tyres.jpg",
    description: "Ultra-high-performance summer tyre with reinforced sidewalls.",
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee. 235/40R19
    // is a performance/executive fitment: the larger saloons, hot hatches,
    // performance SUVs and the bigger EV models.
    vehicleFitments: [
      ...fleetFitments("Audi", ["A4", "A5", "A6", "S4", "S5", "Q5"]),
      ...fleetFitments("BMW", ["3 Series", "4 Series", "5 Series", "M3", "M4", "X3", "X4"]),
      ...fleetFitments("Mercedes-Benz", ["C-Class", "C63", "E200", "E63", "GLC", "GLE"]),
      ...fleetFitments("Volkswagen", ["Golf R", "Arteon", "Tiguan", "Touareg"]),
      ...fleetFitments("Tesla", ["Model 3", "Model Y", "Model S"]),
      ...fleetFitments("Polestar", ["2"]),
      ...fleetFitments("Xpeng", ["G6", "G9", "P7"]),
      ...fleetFitments("NIO", ["ET5", "ET7"]),
      ...fleetFitments("Zeekr", ["001", "009", "X"]),
      ...fleetFitments("Smart", ["#1", "#3"]),
      ...fleetFitments("BYD", ["Seal", "Han"]),
      ...fleetFitments("Porsche", ["911", "Cayman", "Boxster", "Macan", "Panamera", "Cayenne"]),
      ...fleetFitments("Jaguar", ["XE", "XF", "F-Pace", "F-Type"]),
      ...fleetFitments("Land Rover", ["Range Rover Sport", "Range Rover Velar", "Discovery", "Defender"]),
      ...fleetFitments("Volvo", ["XC60", "XC90", "S60", "V60", "S90", "V90"]),
      ...fleetFitments("Ford", ["Mustang", "Focus", "Kuga"]),
      ...fleetFitments("Nissan", ["Qashqai", "X-Trail", "Ariya", "Skyline"]),
      ...fleetFitments("Toyota", ["Supra", "RAV4", "Camry", "C-HR"]),
      ...fleetFitments("Kia", ["EV6", "Sportage", "Sorento", "Ceed"]),
      ...fleetFitments("Hyundai", ["Tucson", "Santa Fe", "Kona", "Ioniq 5", "Ioniq 6"]),
      ...fleetFitments("Honda", ["Civic", "Accord", "CR-V", "ZR-V"]),
      ...fleetFitments("MG", ["MG4", "HS", "ZS"]),
      ...fleetFitments("Škoda", ["Octavia", "Superb", "Kodiaq", "Enyaq"]),
      ...fleetFitments("SEAT", ["Leon", "Ateca", "Tarraco"]),
      ...fleetFitments("Peugeot", ["308", "3008", "508"]),
      ...fleetFitments("Renault", ["Megane", "Arkana"]),
      ...fleetFitments("Citroën", ["C4", "C5 Aircross"]),
      ...fleetFitments("Mini", ["Cooper", "Clubman", "Countryman"]),
      ...fleetFitments("Mazda", ["Mazda3", "Mazda6", "CX-5", "CX-60"]),
      ...fleetFitments("Subaru", ["WRX", "Forester", "Outback", "BRZ"]),
      ...fleetFitments("Mitsubishi", ["Outlander", "Eclipse Cross"]),
      ...fleetFitments("Jeep", ["Compass", "Wrangler", "Grand Cherokee"]),
      ...fleetFitments("Lexus", ["IS", "ES", "NX", "RX", "GS"]),
      ...fleetFitments("Alfa Romeo", ["Giulia", "Stelvio"]),
      ...fleetFitments("Vauxhall", ["Astra", "Insignia", "Grandland"]),
      ...fleetFitments("Chery", ["Omoda 5", "Tiggo 8"]),
      ...fleetFitments("Changan", ["UNI-K"]),
    ],
  },
  {
    id: "t-allgrip-ag4",
    supplierId: "FZ-T203",
    brand: "AllGrip",
    name: "AG-4",
    category: "tyres",
    width: 205,
    aspect: 55,
    rimDiameter: 16,
    loadIndex: "91H",
    speedRating: "H",
    season: "All-season",
    supplierPriceEur: 96,
    retailPriceIncVat: retail(96),
    stockStatus: "In Stock",
    image: "/images/category-tyres.jpg",
    description: "All-season tyre offering year-round grip for family cars.",
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee. 205/55R16
    // is the compact/family class: superminis, family hatchbacks, small
    // crossovers and light vans. The big EV models deliberately do NOT appear —
    // a 16" tyre is not a plausible fitment for them.
    vehicleFitments: [
      ...fleetFitments("Audi", ["A1", "A2", "A3", "Q2"]),
      ...fleetFitments("BMW", ["1 Series", "2 Series"]),
      ...fleetFitments("Mercedes-Benz", ["A-Class", "A180", "A200", "EQA", "EQB"]),
      ...fleetFitments("Volkswagen", ["Golf", "Polo", "T-Roc"]),
      ...fleetFitments("Ford", ["Fiesta", "Focus", "Puma", "Transit"]),
      ...fleetFitments("Vauxhall", ["Corsa", "Astra", "Mokka", "Vivaro"]),
      ...fleetFitments("Toyota", ["Yaris", "Aygo", "Corolla"]),
      ...fleetFitments("Nissan", ["Micra", "Juke", "Qashqai", "Leaf"]),
      ...fleetFitments("Kia", ["Ceed", "Picanto", "Niro", "Sportage"]),
      ...fleetFitments("MG", ["MG3", "MG5", "ZS"]),
      ...fleetFitments("Hyundai", ["i10", "i20", "i30", "Bayon", "Kona"]),
      ...fleetFitments("Honda", ["Jazz", "Civic"]),
      ...fleetFitments("SEAT", ["Ibiza", "Leon", "Arona"]),
      ...fleetFitments("Škoda", ["Fabia", "Scala", "Octavia", "Kamiq"]),
      ...fleetFitments("Renault", ["Clio", "Captur", "Zoe", "Megane"]),
      ...fleetFitments("Peugeot", ["208", "2008", "108", "Rifter"]),
      ...fleetFitments("Citroën", ["C1", "C3", "C3 Aircross", "Berlingo", "C4 Cactus"]),
      ...fleetFitments("Dacia", ["Sandero", "Duster", "Jogger", "Spring"]),
      ...fleetFitments("Suzuki", ["Swift", "Vitara", "Ignis", "S-Cross", "Baleno", "Jimny"]),
      ...fleetFitments("Mazda", ["Mazda2", "CX-3", "MX-5"]),
      ...fleetFitments("Fiat", ["500", "500X", "Panda", "Tipo", "500L"]),
      ...fleetFitments("Alfa Romeo", ["MiTo", "Giulietta"]),
      ...fleetFitments("Subaru", ["Impreza", "XV"]),
      ...fleetFitments("Mitsubishi", ["ASX", "Lancer", "Mirage"]),
      ...fleetFitments("Jeep", ["Renegade"]),
      ...fleetFitments("Lexus", ["CT", "LBX"]),
      ...fleetFitments("Mini", ["Cooper", "Hatch", "Convertible", "Electric"]),
      ...fleetFitments("Volvo", ["V40"]),
      ...fleetFitments("BYD", ["Dolphin"]),
    ],
  },
];

/** 3 sample wheel & tyre packages. */
export const demoPackages: WheelPackage[] = [
  {
    id: "pkg-track-day",
    name: "Track Day Pack",
    category: "packages",
    diameter: 18,
    includes: [
      "4x Forza R1 18\" alloy wheels (8.5J)",
      "4x Strada SP-01 225/45R18 tyres",
      "4x TPMS-compatible valves",
      "20x conical bolts included",
    ],
    wheelSpec: { diameter: 18, width: "8.5J", pcd: "5x112", offset: "ET45" },
    tyreSpec: { brand: "Strada", model: "SP-01", width: 225, aspect: 45, rimDiameter: 18 },
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee. This pack
    // uses the same 5x112 wheel as the Forza R1, so it carries the same sample
    // coverage of the German premium makes (see src/data/demo-fleet.ts).
    vehicleFitments: [
      { make: "BMW", model: "3 Series", generation: "F30", yearsStart: 2012, yearsEnd: 2018 },
      { make: "Volkswagen", model: "Golf", generation: "MK7", yearsStart: 2013, yearsEnd: 2020 },
      ...fleetFitments("Audi", ["A3", "A4", "A5", "S3", "Q5"]),
      ...fleetFitments("BMW", ["1 Series", "2 Series", "4 Series", "5 Series", "X1", "X3", "M4"]),
      ...fleetFitments("Mercedes-Benz", ["A-Class", "A180", "C-Class", "GLA", "GLC"]),
      ...fleetFitments("Volkswagen", ["Golf R", "Passat", "Tiguan", "T-Roc"]),
      ...EV_MAKE_FITMENTS,
    ],
    supplierPriceEur: 624,
    retailPriceIncVat: retail(624),
    stockStatus: "In Stock",
    image: "/images/package-track.jpg",
    description: "A complete 18\" wheel and tyre setup for the track-driven daily.",
  },
  {
    id: "pkg-street-pro",
    name: "Street Pro Pack",
    category: "packages",
    diameter: 17,
    includes: [
      "4x Drifter D-5 17\" alloy wheels (7.0J)",
      "4x AllGrip AG-4 205/55R17 tyres",
      "4x valves",
      "20x bolts included",
    ],
    wheelSpec: { diameter: 17, width: "7.0J", pcd: "5x108", offset: "ET49" },
    tyreSpec: { brand: "AllGrip", model: "AG-4", width: 205, aspect: 55, rimDiameter: 17 },
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee.
    vehicleFitments: [
      { make: "Ford", model: "Fiesta", generation: "MK7", yearsStart: 2008, yearsEnd: 2017 },
      { make: "Vauxhall", model: "Corsa", generation: "D", yearsStart: 2006, yearsEnd: 2014 },
    ],
    supplierPriceEur: 540,
    retailPriceIncVat: retail(540),
    stockStatus: "Available to order",
    image: "/images/package-street.jpg",
    description: "A smart, comfortable all-season setup for everyday driving.",
  },
  {
    id: "pkg-gt-sport",
    name: "GT Sport Pack",
    category: "packages",
    diameter: 19,
    includes: [
      "4x Vortex VX-9 19\" alloy wheels (8.5J)",
      "4x Strada SP-02 235/40R19 tyres",
      "4x TPMS-compatible valves",
      "20x conical bolts included",
    ],
    wheelSpec: { diameter: 19, width: "8.5J", pcd: "5x114.3", offset: "ET38" },
    tyreSpec: { brand: "Strada", model: "SP-02 XL", width: 235, aspect: 40, rimDiameter: 19 },
    // Intentionally NO vehicleFitments — exercises the honest "no sample
    // fitment data yet — we'll verify with your vehicle" verdict path.
    supplierPriceEur: 720,
    retailPriceIncVat: retail(720),
    stockStatus: "Contact us",
    image: "/images/category-packages.jpg", // illustrative
    description: "A premium 19\" sports setup with ultra-high-performance tyres.",
  },
];

/** Featured wheels shown on the homepage (first four sample wheels). */
export const featuredWheels: Wheel[] = demoWheels.slice(0, 4);

/**
 * 6 sample accessories across the lines we will stock: wheel bolts, locking
 * wheel nuts, hub/centric rings, centre caps, valves and a fitting kit.
 * SAMPLE data — no live stock or availability is claimed.
 */
export const demoAccessories: Accessory[] = [
  {
    id: "acc-conical-bolts-20",
    supplierId: "FZ-A101",
    name: "Conical Alloy Wheel Bolts — M14 x 1.5 (20-pack)",
    brand: "Forzza",
    category: "accessories",
    supplierPriceEur: 21,
    retailPriceIncVat: retail(21),
    stockStatus: "In Stock",
    image: "/images/accessory-bolts.jpg",
    description: "Black conical alloy wheel bolts, M14 x 1.5 thread, 20 per pack. Sample item.",
  },
  {
    id: "acc-locking-nuts-4",
    supplierId: "FZ-A102",
    name: "Locking Wheel Nuts — Set of 4 with Key",
    brand: "Forzza",
    category: "accessories",
    supplierPriceEur: 32,
    retailPriceIncVat: retail(32),
    stockStatus: "In Stock",
    image: "/images/accessory-locking-nut.jpg",
    description: "Security locking wheel nuts with a unique key, set of 4. Sample item.",
  },
  {
    id: "acc-hub-rings",
    supplierId: "FZ-A103",
    name: "Hub Centric Rings — 73.1 to 66.6 mm (set of 4)",
    brand: "Forzza",
    category: "accessories",
    supplierPriceEur: 8.5,
    retailPriceIncVat: retail(8.5),
    stockStatus: "Available to order",
    image: "/images/category-accessories.jpg",
    description: "Plastic hub centric rings that adapt the centre bore to your vehicle's hub. Sample item.",
  },
  {
    id: "acc-centre-caps-70",
    supplierId: "FZ-A104",
    name: "Centre Caps — 70 mm Gloss Black (set of 4)",
    brand: "Forzza",
    category: "accessories",
    supplierPriceEur: 12,
    retailPriceIncVat: retail(12),
    stockStatus: "Out of stock",
    image: "/images/category-accessories.jpg",
    description: "Gloss black 70 mm centre caps to finish off your wheel set. Sample item.",
  },
  {
    id: "acc-tpms-valves",
    supplierId: "FZ-A105",
    name: "TPMS-Compatible Valve Stems (set of 4)",
    brand: "AllGrip",
    category: "accessories",
    supplierPriceEur: 7.5,
    retailPriceIncVat: retail(7.5),
    stockStatus: "In Stock",
    image: "/images/accessory-bolts.jpg",
    description: "Valve stems compatible with factory TPMS sensors, set of 4. Sample item.",
  },
  {
    id: "acc-fitting-kit",
    supplierId: "FZ-A106",
    name: "Wheel Fitting Kit — Bolts, Caps & Valves",
    brand: "Forzza",
    category: "accessories",
    supplierPriceEur: 26,
    retailPriceIncVat: retail(26),
    stockStatus: "Contact us",
    image: "/images/accessory-locking-nut.jpg",
    description: "Everything for a clean fit: bolts, centre caps and valves in one kit. Sample item.",
  },
];

/**
 * The four product lines, in SALES-PRIORITY order (owner direction 2026-09-17):
 * tyres first — the most frequent purchase and the main line — then wheels as
 * the bonus/upsell line, then packages and accessories. Every listing that maps
 * this array (e.g. the homepage category grid) therefore shows tyres first.
 */
export const categories: Category[] = [
  {
    slug: "tyres",
    name: "Tyres",
    blurb: "Performance summer, all-season and winter tyres to match your fitment.",
    image: "/images/category-tyres.jpg",
    href: "/tyres",
  },
  {
    slug: "wheels",
    name: "Wheels",
    blurb: "Alloy wheels in gloss, matte and machined finishes — 16\" to 20\".",
    image: "/images/category-wheels.jpg",
    href: "/wheels",
  },
  {
    slug: "packages",
    name: "Wheel & Tyre Packages",
    blurb: "Wheels and tyres together, delivered as a complete ready-to-fit set.",
    image: "/images/category-packages.jpg",
    href: "/packages",
  },
  {
    slug: "accessories",
    name: "Accessories",
    blurb: "Bolts, locking nuts, valves and the finishing touches for your set.",
    image: "/images/category-accessories.jpg",
    href: "/accessories",
  },
];

/** Human-readable size summary, e.g. `18" × 8.5J · 5x112 · ET45`. */
export function wheelSizeLabel(size: WheelSize): string {
  return `${size.diameter}" × ${size.width} · ${size.pcd} · ${size.offset}`;
}

/** Human-readable tyre size, e.g. "225/45R18" (from supplier-feed size fields). */
export function tyreSizeLabel(t: Pick<Tyre, "width" | "aspect" | "rimDiameter">): string {
  return `${t.width}/${t.aspect}R${t.rimDiameter}`;
}

/** Stock chip tone per status (tailwind colour name, used with "/10" bg). */
export const stockTone: Record<StockStatus, string> = {
  "In Stock": "emerald-400",
  "Available to order": "amber-300",
  "Out of stock": "race",
  "Contact us": "steel",
};

/* ── Settings-driven price recalculation (admin/import groundwork) ────────── */
/**
 * Every sample product, flattened for the admin UI and bulk price work. The
 * arrays above seed retailPriceIncVat from the pricing settings at module
 * load; the pass below re-derives them with the pricing engine's unified
 * model (per-wheel-set margin for wheels/packages, per-item margin for
 * tyres/accessories) so the live catalogue always matches /admin's bulk
 * recalculate — the admin "Save & recalculate" button runs the same helper.
 */
export const demoAllProducts: (Wheel | Tyre | WheelPackage | Accessory)[] = [
  ...demoWheels,
  ...demoTypes,
  ...demoPackages,
  ...demoAccessories,
];

/** Module-load recalculation report (kept for tooling/tests; not customer-facing). */
export const initialRecalcReport = recalculateAllPrices([...demoAllProducts]);