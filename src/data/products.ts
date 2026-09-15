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
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee.
    vehicleFitments: [
      { make: "BMW", model: "3 Series", generation: "F30", yearsStart: 2012, yearsEnd: 2018 },
      { make: "Volkswagen", model: "Golf", generation: "MK7", yearsStart: 2013, yearsEnd: 2020 },
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
    vehicleCompatibility: ["Nissan", "Toyota", "Honda"],
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee.
    vehicleFitments: [
      { make: "Nissan", model: "Qashqai", generation: "J11", yearsStart: 2014, yearsEnd: 2021 },
      { make: "Toyota", model: "Corolla", generation: "E210", yearsStart: 2019, yearsEnd: 2022 },
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
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee.
    vehicleFitments: [
      { make: "Ford", model: "Fiesta", generation: "MK7", yearsStart: 2008, yearsEnd: 2017 },
      { make: "Toyota", model: "Yaris", generation: "XP130", yearsStart: 2011, yearsEnd: 2020 },
      { make: "Vauxhall", model: "Corsa", generation: "D", yearsStart: 2006, yearsEnd: 2014 },
    ],
  },
];

/** 3 sample tyres (all use one illustrative tyre image for now). */
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
    // ⚠️ SAMPLE fitment records — demo data, not a fitment guarantee.
    vehicleFitments: [
      { make: "BMW", model: "3 Series", generation: "F30", yearsStart: 2012, yearsEnd: 2018 },
      { make: "Volkswagen", model: "Golf", generation: "MK7", yearsStart: 2013, yearsEnd: 2020 },
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

export const categories: Category[] = [
  {
    slug: "wheels",
    name: "Wheels",
    blurb: "Alloy wheels in gloss, matte and machined finishes — 16\" to 20\".",
    image: "/images/category-wheels.jpg",
    href: "/wheels",
  },
  {
    slug: "tyres",
    name: "Tyres",
    blurb: "Performance summer, all-season and winter tyres to match your fitment.",
    image: "/images/category-tyres.jpg",
    href: "/tyres",
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