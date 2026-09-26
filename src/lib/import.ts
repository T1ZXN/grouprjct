/**
 * import.ts — supplier-feed parsing & mapping for N2 Wheels.
 *
 * ⚠️ SUPPLIER FEED INTEGRATION POINT ⚠️
 * The importer understands TWO feed families. A feed is recognised from its
 * HEADERS, and each family gets its own column-mapping strategy + row validator
 * — never a fork of the pipeline (parse → validate → map → price → persist):
 *
 *   1. `forzza` — the EUR supplier-list shape the site was first built against
 *      (supplierId, name, brand, images, diameter, width, pcd, offset, colour,
 *      finish, price[EUR], stock, category, includedBolts, tyreWidth/aspect/rim/
 *      loadIndex/speedRating/season). Prices run through the pricing engine.
 *   2. `wheelTrade` — a GBP WHEEL trade/retail export (the owner's Wolfrace
 *      trade export; the Automotive Wheels UK feed when it arrives, which
 *      publishes TRADE prices only). Columns: sku, brand, design, color, width,
 *      diameter, wheelSize, offset, pcd, pcd_2, loadRating, centreBore, weight,
 *      tradePrice, retailExVat, retailIncVat, image url, UK/Europe/Total stock…
 *      The site retail price follows THE OWNER'S RULE, settings-driven, in this
 *      order: retailIncVat as published → else retailExVat × 1.2 → else
 *      tradePrice × 1.2 × 1.2 (see retailIncVatFromFeedPrices in pricing.ts).
 *
 * The real import flow (unchanged in shape):
 *   1. a server-side job fetches the supplier feed (feed URLs stay in server
 *      config — NEVER embedded in front-end code, and nothing in this module
 *      makes network calls),
 *   2. parseSupplierCsv / parseSupplierXml / parseSupplierExcel normalise it,
 *   3. mapFeedRowToProduct builds site products with settings-derived prices,
 *   4. syncStockFromFeed (stock.ts) applies live availability.
 *
 * Excel (.xls legacy + .xlsx): the Import UI reads the workbook's FIRST
 * worksheet with SheetJS (lazily loaded) and passes its rows to
 * parseSupplierExcel. Headers are matched permissively (normalizeHeaderName:
 * "Supplier ID" / "Price (EUR)" / "Stock Status" all map to their canonical
 * import columns), exactly like CSV/XML tolerate variants.
 *
 * HONESTY: rows the file itself marks as templates (the Wolfrace "EXAMPLE"
 * row) or rows with NO usable price are reported as SKIPPED — never imported,
 * never priced by guesswork. Nothing here invents a price, a stock figure or a
 * product name.
 */
import type {
  Accessory,
  CategorySlug,
  FeedAttributes,
  StockStatus,
  Tyre,
  Wheel,
  WheelPackage,
} from "~/data/products";
import {
  getPricingSettings,
  gbpToEur,
  priceForProduct,
  retailIncVatFromFeedPrices,
  round2,
} from "~/lib/pricing";
import type { PricingSettings } from "~/lib/pricing";
import { mapFeedStockToStatus } from "~/lib/stock";

/** Feed columns in order, matching the Forzza-shaped sample CSV below. */
export const SUPPLIER_CSV_COLUMNS = [
  "supplierId",
  "name",
  "brand",
  "images",
  "diameter",
  "width",
  "pcd",
  "offset",
  "colour",
  "finish",
  "price",
  "stock",
  "category",
  "includedBolts",
  "tyreWidth",
  "tyreAspect",
  "tyreRim",
  "loadIndex",
  "speedRating",
  "season",
] as const;

/** Raw header names of the owner's Wolfrace trade export (33 columns). */
export const WOLFRACE_EXPORT_COLUMNS = [
  "UK stock",
  "Europe stock",
  "Total stock",
  "sku",
  "blank part number",
  "brand",
  "design",
  "color",
  "width",
  "diameter",
  "wheelSize",
  "offset",
  "offset blanks",
  "pcd",
  "pcd_2",
  "loadRating",
  "centreBore",
  "maxCentreBore",
  "weight",
  "tradePrice",
  "retailExVat",
  "retailIncVat",
  "image url",
  "origin",
  "blankminoffset",
  "blankmaxoffset",
  "original",
  "EAN",
  "TUV",
  "vanspeed",
  "5Year",
  "winter",
  "fixedprice",
] as const;

/** Which column-mapping strategy + validator a feed's headers select. */
export type FeedShape = "forzza" | "wheelTrade";

export interface FeedShapeInfo {
  id: FeedShape;
  label: string;
}

/** Human labels for the detected shape (shown in the admin Import tab). */
export const FEED_SHAPES: Record<FeedShape, FeedShapeInfo> = {
  forzza: {
    id: "forzza",
    label: "EUR supplier-list feed (Forzza-shaped: supplierId / price EUR / category)",
  },
  wheelTrade: {
    id: "wheelTrade",
    label: "GBP wheel trade/retail feed (Wolfrace export, Automotive Wheels UK)",
  },
};

/** One normalised feed row (all fields strings until validated/coerced). */
export interface SupplierFeedRow {
  supplierId: string;
  name: string;
  brand: string;
  images: string[];
  diameter?: number;
  width?: string;
  pcd?: string;
  offset?: string;
  colour?: string;
  finish?: string;
  supplierPriceEur: number;
  stock: string;
  category: CategorySlug;
  includedBolts?: string;
  /* Tyre-only fields (a tyre row uses these instead of wheel geometry). */
  tyreWidth?: number;
  tyreAspect?: number;
  tyreRim?: number;
  loadIndex?: string;
  speedRating?: string;
  season?: string;
  /* ── GBP trade/retail feed fields (priceCurrency "GBP") ─────────────────── */
  /** Which currency the row's price columns are in. EUR = Forzza list feed. */
  priceCurrency?: "EUR" | "GBP";
  /** Supplier's retail price inc. VAT (£), exactly as published. */
  retailIncVatGbp?: number;
  /** Supplier's retail price ex. VAT (£), exactly as published. */
  retailExVatGbp?: number;
  /** Supplier's trade price (£, ex. VAT), exactly as published. */
  tradePriceGbp?: number;
  /** UK warehouse stock count as published (undefined when the feed omits it). */
  ukStock?: number;
  /** European warehouse stock count as published. */
  europeStock?: number;
  /** Total stock count as published. */
  totalStock?: number;
  /** Other feed columns carried verbatim into the product's specs. */
  feedExtra?: Record<string, string>;
}

export interface ImportRowError {
  /** 1-based data-row number in the uploaded file (excluding the CSV header). */
  row: number;
  message: string;
}

export interface ParseResult {
  /** Rows that passed validation. */
  imported: number;
  /** Rows that failed validation (bad/missing required fields). */
  failed: number;
  /**
   * Rows deliberately NOT imported, with an honest reason: the supplier file's
   * own template/EXAMPLE row, or a row with no usable price. A skip is not an
   * error — but it is never a silent success either.
   */
  skipped: number;
  errors: ImportRowError[];
  skips: ImportRowError[];
  /** Normalised, validated rows. */
  rows: SupplierFeedRow[];
  /** Which column-mapping strategy the headers selected. */
  shape: FeedShape;
  /** Human label for the detected shape. */
  shapeLabel: string;
}

/** Outcome of validating ONE record (a skip is reported, not treated as an error). */
export interface RowOutcome {
  row: SupplierFeedRow | null;
  errors: string[];
  /** Honest reason the row was deliberately not imported. */
  skip?: string;
}

/* ── CSV parsing (quoted-field aware; no dependencies) ────────────────────── */

function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/* ── Header normalisation (shared by CSV and Excel paths) ─────────────────── */
/**
 * Canonical header → human-variant aliases. Headers are first lower-cased,
 * stripped of every non-alphanumeric character ("Supplier ID" → "supplierid",
 * "load index" → "loadindex"), then looked up here for the few synonyms that
 * do not reduce to the canonical key on their own.
 */
const HEADER_ALIASES: Record<string, string> = {
  product: "name",
  productname: "name",
  manufacturer: "brand",
  image: "images",
  imageurl: "images",
  imageurls: "images",
  imagepath: "images",
  imagepaths: "images",
  img: "images",
  photo: "images",
  picture: "images",
  wheeldiameter: "diameter",
  rimsizediameter: "diameter",
  priceeur: "price",
  unitprice: "price",
  unitpriceeur: "price",
  supplierprice: "price",
  supplierpriceeur: "price",
  cost: "price",
  costprice: "price",
  stockstatus: "stock",
  availability: "stock",
  stocklevel: "stock",
  inout: "stock",
  pcd: "pcd",
  boltpattern: "pcd",
  pitchcirclediameter: "pcd",
  offsetmm: "offset",
  etvalue: "offset",
  includednuts: "includedbolts",
  boltsincluded: "includedbolts",
  wheelbolts: "includedbolts",
  loadingindex: "loadindex",
  loadrating: "loadindex",
  speedindex: "speedrating",
  tyreseason: "season",
};

/** Lower-case + strip every non-alphanumeric character: "UK stock" → "ukstock". */
export function rawHeaderKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Map any spreadsheet/CSV header (uppercase, spaced, punctuated…) to a canonical import key. */
export function normalizeHeaderName(raw: string): string {
  const canonical = rawHeaderKey(raw);
  return HEADER_ALIASES[canonical] ?? canonical;
}

/**
 * The `wheelTrade` column-mapping strategy: the feed's OWN header names → the
 * canonical keys the wheel-trade row validator reads. Every column we carry is
 * listed; unmapped columns (blank part number, blank offset range, "original",
 * "offset blanks", max centre bore …) are deliberately ignored rather than
 * guessed at.
 */
export const WHEEL_TRADE_COLUMN_MAP: Record<string, string> = {
  sku: "supplierid",
  partnumber: "supplierid",
  productcode: "supplierid",
  brand: "brand",
  design: "design",
  model: "design",
  color: "colour",
  colour: "colour",
  width: "width",
  rimwidth: "width",
  diameter: "diameter",
  rimdiameter: "diameter",
  wheelsize: "wheelsize",
  offset: "offset",
  et: "offset",
  pcd: "pcd",
  boltpattern: "pcd",
  studpattern: "pcd",
  pcd2: "pcd2",
  loadrating: "loadrating",
  centrebore: "centrebore",
  centerbore: "centrebore",
  maxcentrebore: "maxcentrebore",
  weight: "weight",
  ukstock: "ukstock",
  stock: "ukstock",
  stocklevel: "ukstock",
  qty: "ukstock",
  quantity: "ukstock",
  europestock: "europestock",
  eustock: "europestock",
  europeanstock: "europestock",
  totalstock: "totalstock",
  tradeprice: "tradeprice",
  trade: "tradeprice",
  tradepriceexvat: "tradeprice",
  netprice: "tradeprice",
  cost: "tradeprice",
  retailexvat: "retailexvat",
  retailpriceexvat: "retailexvat",
  rrpexvat: "retailexvat",
  retailincvat: "retailincvat",
  retailpriceincvat: "retailincvat",
  rrpincvat: "retailincvat",
  imageurl: "images",
  image: "images",
  images: "images",
  origin: "origin",
  ean: "ean",
  tuv: "tuv",
  vanspeed: "vanspeed",
  fiveyear: "fiveyear",
  winter: "winter",
  fixedprice: "fixedprice",
};

/**
 * Raw header names that select the `wheelTrade` strategy. Deliberately an
 * explicit list of UNAMBIGUOUS price headers — a generic header like "cost" or
 * "stock" must never flip a EUR supplier-list feed onto the GBP path.
 */
const WHEEL_TRADE_DETECT_HEADERS = [
  "tradeprice",
  "tradepriceexvat",
  "trade",
  "retailexvat",
  "retailpriceexvat",
  "rrpexvat",
  "retailincvat",
  "retailpriceincvat",
  "rrpincvat",
];

/**
 * Detect which column-mapping strategy a header row selects. A feed that
 * publishes a trade price or an ex/inc-VAT retail price is a GBP wheel
 * trade/retail export; everything else is treated as the EUR supplier-list
 * (Forzza) shape. Detection only LOOKS at headers — it never guesses prices.
 */
export function detectFeedShape(headers: readonly unknown[]): FeedShape {
  for (const h of headers) {
    if (WHEEL_TRADE_DETECT_HEADERS.includes(rawHeaderKey(String(h ?? "")))) return "wheelTrade";
  }
  return "forzza";
}

/** Render tabular rows (as extracted from a spreadsheet or CSV) to CSV text — used to preview Excel content in the import textarea. */
export function renderRowsToCsv(rows: readonly (readonly unknown[])[]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell == null ? "" : String(cell);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

/* ── Shared row validation ────────────────────────────────────────────────── */

function fin(s: string | undefined): boolean {
  if (s === undefined || s.trim() === "") return false;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n);
}
function num(s: string | undefined): number | undefined {
  if (!fin(s)) return undefined;
  return Number(s!.replace(",", "."));
}
function posNum(s: string | undefined): number | undefined {
  const n = num(s);
  return n !== undefined && n > 0 ? n : undefined;
}

/** Validate one record (lower-cased CSV/XML columns) -> row + per-field errors. */
export function validateFeedRow(record: Record<string, string>, _rowNo: number): RowOutcome {
  const errors: string[] = [];
  const row: SupplierFeedRow = {
    supplierId: (record.supplierid ?? "").trim(),
    name: (record.name ?? "").trim(),
    brand: (record.brand ?? "").trim(),
    images: (record.images ?? "")
      .split(/[;|]/)
      .map((s) => s.trim())
      .filter(Boolean),
    supplierPriceEur: 0,
    stock: (record.stock ?? "").trim(),
    category: "wheels",
    includedBolts: (record.includedbolts ?? "").trim() || undefined,
  };

  if (!row.supplierId) errors.push("supplierId is required.");
  else if (row.supplierId.length > 64) errors.push("supplierId too long (max 64 chars).");
  if (!row.name) errors.push("name is required.");

  const price = num(record.price);
  if (price === undefined || price <= 0) errors.push(`price "${record.price ?? ""}" is not a valid positive number.`);
  else row.supplierPriceEur = price;

  const category = (record.category ?? "").trim().toLowerCase();
  if (!["wheels", "tyres", "packages", "accessories"].includes(category)) {
    errors.push(`category "${record.category ?? ""}" is not one of wheels|tyres|packages|accessories.`);
  } else {
    row.category = category as CategorySlug;
  }

  if (row.category === "wheels") {
    const diameter = num(record.diameter);
    if (diameter === undefined || diameter <= 0) errors.push("wheels require a numeric diameter.");
    else row.diameter = diameter;
    for (const k of ["width", "pcd", "offset"] as const) {
      if (!(record[k] ?? "").trim()) errors.push(`wheels require ${k}.`);
      else row[k] = record[k].trim();
    }
    row.colour = (record.colour ?? "").trim() || undefined;
    row.finish = (record.finish ?? "").trim() || undefined;
  } else if (row.category === "tyres") {
    const w = num(record.tyrewidth);
    const a = num(record.tyreaspect);
    const r = num(record.tyrerim);
    if (w === undefined || w <= 0) errors.push("tyres require a numeric tyreWidth.");
    if (a === undefined || a <= 0) errors.push("tyres require a numeric tyreAspect.");
    if (r === undefined || r <= 0) errors.push("tyres require a numeric tyreRim.");
    row.tyreWidth = w;
    row.tyreAspect = a;
    row.tyreRim = r;
    row.loadIndex = (record.loadindex ?? "").trim() || undefined;
    row.speedRating = (record.speedrating ?? "").trim() || undefined;
    row.season = (record.season ?? "").trim() || undefined;
  } else if (row.category === "packages") {
    const diameter = num(record.diameter);
    if (diameter !== undefined) row.diameter = diameter;
  }

  return errors.length === 0 ? { row, errors: [] } : { row: null, errors };
}

/* ── GBP wheel trade/retail row validation (the owner's feeds) ────────────── */

/** Rim width label: a bare number ("8", "8.5") becomes "8J"/"8.5J" (J bead profile). */
export function wheelWidthLabel(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (t === "") return "";
  if (/[a-z]/i.test(t)) return t;
  return `${t}J`;
}

/**
 * Offset label. A fixed offset ("38") becomes "ET38". A BLANK (undrilled) wheel
 * publishes a range instead of a fixed offset — we say so rather than inventing
 * a single figure. Anything already labelled (ET38) is passed through.
 */
export function wheelOffsetLabel(
  raw: string | undefined,
  blankMin?: string | undefined,
  blankMax?: string | undefined,
): string {
  const t = (raw ?? "").trim();
  const n = num(t);
  if (t !== "" && n !== undefined && n !== 0) {
    return /^et/i.test(t) ? `ET${t.slice(2)}` : `ET${t}`;
  }
  const min = blankMin !== undefined ? num(blankMin) : undefined;
  const max = blankMax !== undefined ? num(blankMax) : undefined;
  if (min !== undefined && max !== undefined) return `ET${min}–ET${max} (blank)`;
  if (min !== undefined) return `ET${min}+ (blank)`;
  if (t !== "") return /^et/i.test(t) ? `ET${t.slice(2)}` : t;
  return "";
}

/**
 * Stock status from the feed's own warehouse counts (owner: "UK stock" and
 * "Europe stock" are real counts, and many rows are 0):
 *   UK > 0                     -> in_stock
 *   UK 0, Europe > 0           -> available_to_order (orderable from the
 *                                 supplier's European warehouse, not in the UK)
 *   both 0 / both missing      -> out_of_stock
 * The raw counts are kept on the row (and land in the product's specs) so the
 * status is never the only thing we know.
 */
export function stockCodeFromCounts(ukStock?: number, europeStock?: number): string {
  const uk = ukStock ?? 0;
  const eu = europeStock ?? 0;
  if (uk > 0) return "in_stock";
  if (eu > 0) return "available_to_order";
  return "out_of_stock";
}

/** The supplier's own template/example row (Wolfrace's "EXAMPLE" sku) — never imported. */
export function isExampleRow(record: Record<string, string>): boolean {
  const marker = (v: string | undefined) => (v ?? "").trim().toUpperCase() === "EXAMPLE";
  return marker(record.supplierid) || marker(record.brand) || marker(record.design) || marker(record.name);
}

/**
 * Validate one GBP wheel trade/retail record (keys already mapped through
 * WHEEL_TRADE_COLUMN_MAP). Produces a normalised row whose prices stay in the
 * feed's own columns — the pricing RULE is applied later, in
 * mapFeedRowToProduct (settings-driven, see retailIncVatFromFeedPrices).
 */
export function validateWheelTradeRow(record: Record<string, string>, _rowNo: number): RowOutcome {
  const supplierId = (record.supplierid ?? "").trim();
  const brand = (record.brand ?? "").trim();
  const design = (record.design ?? "").trim();
  const colour = (record.colour ?? "").trim();

  // 1. The file's own template row must never reach the catalogue.
  if (isExampleRow(record)) {
    return {
      row: null,
      errors: [],
      skip: "EXAMPLE/template row from the supplier file — not a real product. Skipped.",
    };
  }

  const retailIncVatGbp = posNum(record.retailincvat);
  const retailExVatGbp = posNum(record.retailexvat);
  const tradePriceGbp = posNum(record.tradeprice);

  // 2. No usable price in ANY price column → skip (we never invent a price).
  if (retailIncVatGbp === undefined && retailExVatGbp === undefined && tradePriceGbp === undefined) {
    return {
      row: null,
      errors: [],
      skip: `No usable price (retailIncVat "${record.retailincvat ?? ""}", retailExVat "${record.retailexvat ?? ""}", tradePrice "${record.tradeprice ?? ""}") — row skipped rather than priced by guesswork.`,
    };
  }

  const errors: string[] = [];
  if (!supplierId) errors.push("sku is required.");
  else if (supplierId.length > 64) errors.push("sku too long (max 64 chars).");
  if (!brand && !design) errors.push("brand or design is required (nothing to name the wheel).");

  const diameter = num(record.diameter);
  if (diameter === undefined || diameter <= 0) errors.push(`wheels require a numeric diameter ("${record.diameter ?? ""}").`);

  const widthRaw = (record.width ?? "").trim();
  const width = wheelWidthLabel(widthRaw);
  if (!width) errors.push("wheels require a width.");

  const pcd = (record.pcd ?? "").trim();
  const pcd2 = (record.pcd2 ?? "").trim();
  if (!pcd) errors.push("wheels require a pcd.");

  const offset = wheelOffsetLabel(record.offset, record.blankminoffset, record.blankmaxoffset);
  if (!offset) errors.push("wheels require an offset (or a blank-wheel offset range).");

  if (errors.length > 0) return { row: null, errors };

  const ukStock = num(record.ukstock);
  const europeStock = num(record.europestock);
  const totalStock = num(record.totalstock);

  const feedExtra: Record<string, string> = {};
  const carry = (key: string, value: string | undefined) => {
    const v = (value ?? "").trim();
    if (v) feedExtra[key] = v;
  };
  carry(
    "wheelSize",
    (record.wheelsize ?? "").trim() || `${widthRaw || width}x${diameter}`,
  );
  carry("centreBore", record.centrebore);
  carry("maxCentreBore", record.maxcentrebore);
  carry("loadRating", record.loadrating);
  carry("weight", record.weight);
  carry("origin", record.origin);
  carry("ean", record.ean);
  carry("tuv", record.tuv);
  carry("vanSpeed", record.vanspeed);
  carry("fiveYearWarranty", record.fiveyear);
  carry("winter", record.winter);
  carry("fixedPrice", record.fixedprice);

  const name = [design || brand, colour].filter(Boolean).join(" ") || supplierId;

  const row: SupplierFeedRow = {
    supplierId,
    name,
    brand,
    images: (record.images ?? "")
      .split(/[;|]/)
      .map((s) => s.trim())
      .filter(Boolean),
    diameter,
    width,
    // A dual-drilled wheel publishes a second PCD — both are shown, none invented.
    pcd: pcd2 ? `${pcd} / ${pcd2}` : pcd,
    offset,
    colour: colour || undefined,
    // The Wolfrace-style export publishes ONE colour column ("color"): the site
    // shows it as both the colour and the finish (nothing is invented).
    finish: colour || undefined,
    supplierPriceEur: 0, // GBP feed — see priceCurrency / tradePriceGbp below
    stock: stockCodeFromCounts(ukStock, europeStock),
    category: "wheels",
    includedBolts: undefined,
    priceCurrency: "GBP",
    retailIncVatGbp,
    retailExVatGbp,
    tradePriceGbp,
    ukStock,
    europeStock,
    totalStock,
    feedExtra: Object.keys(feedExtra).length > 0 ? feedExtra : undefined,
  };
  return { row, errors: [] };
}

/* ── Shape-driven tabular parsing ─────────────────────────────────────────── */

function emptyResult(shape: FeedShape, message: string): ParseResult {
  return {
    imported: 0,
    failed: 1,
    skipped: 0,
    errors: [{ row: 0, message }],
    skips: [],
    rows: [],
    shape,
    shapeLabel: FEED_SHAPES[shape].label,
  };
}

/**
 * Shared tabular normaliser: takes a 2D row array (first row = headers), picks
 * the column-mapping strategy from those headers (or the one the caller names),
 * and runs every non-empty data row through that shape's validator. Used by the
 * CSV parser and by the Excel (.xls / .xlsx via SheetJS) parser so both produce
 * the exact same normalised columns.
 */
export function parseTabularRows(
  rows: readonly (readonly unknown[])[],
  shape?: FeedShape,
): ParseResult {
  const resolved = shape ?? detectFeedShape(rows.length > 0 ? rows[0] : []);
  if (rows.length === 0) {
    return emptyResult(resolved, "The file is empty or unreadable.");
  }
  const isWheelTrade = resolved === "wheelTrade";
  const header = rows[0].map((h) => {
    const key = rawHeaderKey(String(h ?? ""));
    return isWheelTrade ? (WHEEL_TRADE_COLUMN_MAP[key] ?? key) : normalizeHeaderName(key);
  });

  const errors: ImportRowError[] = [];
  const skips: ImportRowError[] = [];
  const resultRows: SupplierFeedRow[] = [];

  rows.slice(1).forEach((dataRow, i) => {
    const rowNo = i + 1; // 1-based data row (header excluded)
    const record: Record<string, string> = {};
    dataRow.forEach((cell, j) => {
      record[header[j] ?? `col${j}`] = String(cell ?? "").trim();
    });
    const outcome = isWheelTrade ? validateWheelTradeRow(record, rowNo) : validateFeedRow(record, rowNo);
    if (outcome.row) resultRows.push(outcome.row);
    else if (outcome.skip) skips.push({ row: rowNo, message: outcome.skip });
    else for (const m of outcome.errors) errors.push({ row: rowNo, message: m });
  });

  return {
    imported: resultRows.length,
    failed: errors.length,
    skipped: skips.length,
    errors,
    skips,
    rows: resultRows,
    shape: resolved,
    shapeLabel: FEED_SHAPES[resolved].label,
  };
}

/** Parse a supplier CSV feed (Forzza-shaped or a GBP wheel trade/retail export). Returns an import summary + validated rows. */
export function parseSupplierCsv(text: string): ParseResult {
  return parseTabularRows(parseCsvTable(text));
}

/**
 * Parse a supplier spreadsheet. `rows` is the FIRST worksheet extracted by
 * SheetJS (`XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true })`)
 * — legacy .xls and modern .xlsx both land here with identical results. Headers
 * may use the canonical column names or human variants ("Supplier ID",
 * "price", "Stock Status"…) — the shape's column map handles them.
 */
export function parseSupplierExcel(
  rows: readonly (readonly unknown[])[],
  shape?: FeedShape,
): ParseResult {
  return parseTabularRows(rows, shape);
}

/* ── XML parsing (regex-based, works server-side & client-side) ───────────── */

function extractChildTags(block: string): Record<string, string> {
  const record: Record<string, string> = {};
  // Strip the outer <product>…</product> wrapper first, otherwise the tag
  // regex matches the wrapper pair and swallows every child tag.
  const inner = block.replace(/^<product\b[^>]*>/i, "").replace(/<\/product>\s*$/i, "");
  const re = /<(\w+)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const tag = m[1].toLowerCase();
    if (record[tag] === undefined) record[tag] = m[2].trim().replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  }
  return record;
}

/** Parse a Forzza-shaped supplier XML feed (<feed><product>…</product></feed>). */
export function parseSupplierXml(text: string): ParseResult {
  const errors: ImportRowError[] = [];
  const rows: SupplierFeedRow[] = [];
  const blocks = text.match(/<product\b[^>]*>[\s\S]*?<\/product>/gi) ?? [];
  if (blocks.length === 0) {
    return emptyResult("forzza", "No <product> blocks found in the XML.");
  }
  blocks.forEach((block, i) => {
    const outcome = validateFeedRow(extractChildTags(block), i + 1);
    if (outcome.row) rows.push(outcome.row);
    else for (const m of outcome.errors) errors.push({ row: i + 1, message: m });
  });
  return {
    imported: rows.length,
    failed: errors.length,
    skipped: 0,
    errors,
    skips: [],
    rows,
    shape: "forzza",
    shapeLabel: FEED_SHAPES.forzza.label,
  };
}

/* ── Mapping onto the site product model (prices via the pricing rules) ───── */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Human-readable size summary for an admin row, e.g. `18" × 8.5J · 5x112 · ET45`. */
export function sizeSummary(row: SupplierFeedRow): string {
  if (row.category === "wheels") return `${row.diameter}" × ${row.width} · ${row.pcd} · ${row.offset}`;
  if (row.category === "tyres") return `${row.tyreWidth}/${row.tyreAspect}R${row.tyreRim}`;
  if (row.category === "packages") return `${row.diameter ?? "—"}" complete set`;
  return "—";
}

const CATEGORY_IMAGE: Record<CategorySlug, string> = {
  wheels: "/images/category-wheels.jpg",
  tyres: "/images/category-tyres.jpg",
  packages: "/images/category-packages.jpg",
  accessories: "/images/category-accessories.jpg",
};

/** Drop undefined keys so what we carry is exactly what the feed published. */
function pruneUndefined<T>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * Map a validated feed row onto the site's product model.
 *
 * TWO PRICE PATHS, both settings-driven (never a price written by hand here):
 *   • EUR list rows (Forzza) -> the pricing ENGINE (priceForProduct).
 *   • GBP trade/retail rows (Wolfrace export / Automotive Wheels UK) -> THE
 *     OWNER'S RULE (retailIncVatFromFeedPrices): retailIncVat as published,
 *     else retailExVat × 1.2, else tradePrice × 1.2 × 1.2. The feed's own
 *     prices and stock counts ride along in `feedAttributes`, and the raw trade
 *     price is converted to the engine's EUR figure at the settings rate so the
 *     model stays complete.
 *
 * Returns null for a row with no usable price (the parser already reports those
 * as skips, so callers can assume non-null for anything that passed validation).
 */
export function mapFeedRowToProduct(
  row: SupplierFeedRow,
  settings: PricingSettings = getPricingSettings(),
): Wheel | Tyre | WheelPackage | Accessory | null {
  const id = `imp-${slugify(row.supplierId)}`;
  const image = row.images[0] ?? CATEGORY_IMAGE[row.category];
  const stockStatus: StockStatus = mapFeedStockToStatus(row.stock);

  /* ── GBP trade/retail feed (owner's rule) ── */
  if (row.priceCurrency === "GBP") {
    const { priceIncVat, source } = retailIncVatFromFeedPrices(
      {
        retailIncVatGbp: row.retailIncVatGbp,
        retailExVatGbp: row.retailExVatGbp,
        tradePriceGbp: row.tradePriceGbp,
      },
      settings,
    );
    if (source === "none") return null;

    const feedAttributes: FeedAttributes = pruneUndefined({
      tradePriceGbp: row.tradePriceGbp,
      retailExVatGbp: row.retailExVatGbp,
      retailIncVatGbp: row.retailIncVatGbp,
      priceSource: source,
      ukStock: row.ukStock,
      europeStock: row.europeStock,
      totalStock: row.totalStock,
      extra: row.feedExtra,
    }) as FeedAttributes;

    const brand = row.brand || "Wolfrace";
    if (row.category === "wheels") {
      const wheel: Wheel = {
        id,
        supplierId: row.supplierId,
        brand,
        name: row.name,
        category: "wheels",
        size: {
          diameter: row.diameter ?? 0,
          width: row.width ?? "",
          pcd: row.pcd ?? "",
          offset: row.offset ?? "",
        },
        colour: row.colour ?? "—",
        finish: row.finish ?? row.colour ?? "—",
        // GBP feed: the EUR figure is the feed's trade price converted at the
        // settings rate (see gbpToEur) so the catalogue model stays complete.
        supplierPriceEur: gbpToEur(row.tradePriceGbp ?? 0, settings),
        retailPriceIncVat: priceIncVat,
        stockStatus,
        includedBolts: row.includedBolts ?? "",
        image,
        description: `${brand} ${row.name} — supplier feed import; the retail price and specs are exactly as published by the supplier. We confirm the exact fitment for your vehicle before confirming your order.`,
        vehicleCompatibility: [],
        feedAttributes,
      };
      return wheel;
    }

    // The owner's wheel feeds publish wheels; anything else is refused rather
    // than mapped into a category its columns do not describe.
    return null;
  }

  /* ── EUR supplier-list feed (Forzza-shaped) — the pricing engine ── */
  const priced = { id, category: row.category, supplierPriceEur: row.supplierPriceEur, retailPriceIncVat: 0 };
  const retail = round2(priceForProduct(priced, settings));

  if (row.category === "wheels") {
    const wheel: Wheel = {
      id,
      supplierId: row.supplierId,
      brand: row.brand || "Forzza",
      name: row.name,
      category: "wheels",
      size: {
        diameter: row.diameter ?? 0,
        width: row.width ?? "",
        pcd: row.pcd ?? "",
        offset: row.offset ?? "",
      },
      colour: row.colour ?? "—",
      finish: row.finish ?? "—",
      supplierPriceEur: row.supplierPriceEur,
      retailPriceIncVat: retail,
      stockStatus,
      includedBolts: row.includedBolts ?? "",
      image,
      description: `${row.brand || "Forzza"} ${row.name} — mapped from demo feed import. Sample data.`,
      vehicleCompatibility: [],
    };
    return wheel;
  }
  if (row.category === "tyres") {
    const season = ["Summer", "All-season", "Winter"].includes(row.season ?? "")
      ? (row.season as "Summer" | "All-season" | "Winter")
      : "Summer";
    const tyre: Tyre = {
      id,
      supplierId: row.supplierId,
      brand: row.brand || "Forzza",
      name: row.name,
      category: "tyres",
      width: row.tyreWidth ?? 0,
      aspect: row.tyreAspect ?? 0,
      rimDiameter: row.tyreRim ?? 0,
      loadIndex: row.loadIndex ?? "—",
      speedRating: row.speedRating ?? "—",
      season,
      supplierPriceEur: row.supplierPriceEur,
      retailPriceIncVat: retail,
      stockStatus,
      image,
      description: `${row.brand || "Forzza"} ${row.name} — mapped from demo feed import. Sample data.`,
    };
    return tyre;
  }
  if (row.category === "packages") {
    const pkg: WheelPackage = {
      id,
      name: row.name,
      category: "packages",
      diameter: row.diameter ?? 18,
      includes: [`${row.name} — complete set (mapped from demo feed)`, row.includedBolts ?? ""].filter(Boolean),
      wheelSpec: row.diameter
        ? { diameter: row.diameter, width: row.width ?? "—", pcd: row.pcd ?? "—", offset: row.offset ?? "—" }
        : undefined,
      supplierPriceEur: row.supplierPriceEur,
      retailPriceIncVat: retail,
      stockStatus,
      image,
      description: `${row.name} — mapped from demo feed import. Sample data.`,
    };
    return pkg;
  }
  const accessory: Accessory = {
    id,
    supplierId: row.supplierId,
    name: row.name,
    brand: row.brand || "Forzza",
    category: "accessories",
    supplierPriceEur: row.supplierPriceEur,
    retailPriceIncVat: retail,
    stockStatus,
    image,
    description: `${row.name} — mapped from demo feed import. Sample data.`,
  };
  return accessory;
}

/* ── Embedded demo feed (so the import UI works end-to-end with no network) ─ */

export const SAMPLE_CSV = `supplierId,name,brand,images,diameter,width,pcd,offset,colour,finish,price,stock,category,includedBolts,tyreWidth,tyreAspect,tyreRim,loadIndex,speedRating,season
FZ-2001,Vanta V-8,Forzza,/images/wheel-vortex.jpg,18,8.5J,5x112,ET45,Gloss Black,Gloss,238,in_stock,wheels,20x conical bolts included,,,,,,
FZ-2002,Ridge R-11,Forzza,/images/wheel-apex.jpg,19,8.0J,5x114.3,ET38,Satin Graphite,Satin,286,on_order,wheels,20x conical bolts included,,,,,,
FZ-T301,Strada SP-02,Strada,/images/category-tyres.jpg,,,,,,,122,in_stock,tyres,,225,45,18,94,Y,Summer
FZ-A201,Valve Stems 4-pack,AllGrip,/images/accessory-bolts.jpg,,,,,,,7.5,available,accessories,,,,,,
FZ-2003,Overpriced Wheel,Forzza,/images/wheel-drifter.jpg,17,7.0J,5x108,ET49,Silver,Machined,not-a-number,in_stock,wheels,20x bolts included,,,,,,
,mystery-item,Forzza,/images/category-wheels.jpg,17,7.0J,5x100,ET40,Black,Gloss,149,out_of_stock,wheels,,,,,,,,`;

/**
 * An embedded, trimmed Wolfrace-shaped demo row set (real header + the real
 * prices of two rows from the owner's export) so the Import tab can exercise
 * the GBP wheel-trade path with no file to hand. NOT the feed itself — the
 * owner's file is uploaded at /admin (its URLs are never embedded here).
 */
export const SAMPLE_WHEEL_TRADE_CSV = `UK stock,Europe stock,Total stock,sku,brand,design,color,width,diameter,wheelSize,offset,pcd,loadRating,centreBore,weight,tradePrice,retailExVat,retailIncVat,image url,origin
217,0,217,WOF12058020BLK38,Wolfrace Eurosport,Wolfsburg,Gloss Black,8,20,8x20,38,5x120,1100,110,12.2,112.5,135,162,,china
1,0,1,WVN11211458518GBBE40,Wolfrace 71,Venom,Gloss Raven Black,8.5,18,8.5x18,40,5x112,900,110,11.7,94.5,131.25,157.5,,china`;

export const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed>
  <!-- N2 Wheels sample supplier feed (Forzza-shaped). Demo import only, no live feed connected. -->
  <product>
    <supplierId>FZ-3001</supplierId>
    <name>Nova N-9</name>
    <brand>Forzza</brand>
    <images>/images/wheel-vortex.jpg;/images/wheel-vortex-b.jpg</images>
    <diameter>18</diameter>
    <width>8.0J</width>
    <pcd>5x112</pcd>
    <offset>ET40</offset>
    <colour>Gloss Black</colour>
    <finish>Gloss</finish>
    <price>224</price>
    <stock>in_stock</stock>
    <category>wheels</category>
    <includedBolts>20x conical bolts included</includedBolts>
  </product>
  <product>
    <supplierId>FZ-3002</supplierId>
    <name></name>
    <brand>Forzza</brand>
    <price>99</price>
    <stock>in_stock</stock>
    <category>wheels</category>
  </product>
</feed>`;

/**
 * Convenience: run whichever parser matches a file's extension.
 * .xls / .xlsx are NOT binary here — the Import UI decodes them with SheetJS
 * into rows, renders them as CSV text into the textarea and keeps the file
 * name, so they arrive at this dispatcher as CSV text (see parseSupplierExcel
 * for the real workbook entry point used by tests/server-side jobs).
 */
export function parseSupplierFeed(text: string, fileName: string): ParseResult {
  return /\.xml$/i.test(fileName) ? parseSupplierXml(text) : parseSupplierCsv(text);
}
