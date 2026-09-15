/**
 * import.ts — supplier-feed parsing & mapping for N2 Wheels.
 *
 * ⚠️ FORZZA FEED INTEGRATION POINT ⚠️
 * parseSupplierCsv / parseSupplierXml / parseSupplierExcel map a
 * Forzza-shaped supplier feed
 * (fields: supplierId, product name, brand, images, diameter, width, PCD,
 * offset, colour, finish, supplier price, stock, category, included bolts)
 * onto the site's product model via the pricing engine, and validate every
 * row. The future REAL import flow is:
 *
 *   1. a server-side job fetches the supplier feed (URLs stay in server
 *      config — NEVER embedded in front-end code, and nothing in this module
 *      makes network calls),
 *   2. parseSupplierCsv / parseSupplierXml / parseSupplierExcel normalise it,
 *   3. mapFeedRowToProduct builds site products with settings-derived
 *      retail prices,
 *   4. syncStockFromFeed (stock.ts) applies live availability.
 *
 * Excel (.xls legacy + .xlsx): the Import UI reads the workbook's FIRST
 * worksheet with SheetJS (lazily loaded) and passes its rows to
 * parseSupplierExcel. Headers are matched permissively (normalizeHeaderName:
 * "Supplier ID" / "Price (EUR)" / "Stock Status" all map to their canonical
 * import columns), exactly like CSV/XML tolerate variants.
 *
 * For now every call site is the admin "demo import" — sample data only, no
 * live feed connected, no live stock or supplier pricing claimed.
 */
import type { Accessory, CategorySlug, StockStatus, Tyre, Wheel, WheelPackage } from "~/data/products";
import { priceForProduct, round2 } from "~/lib/pricing";
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
}

export interface ImportRowError {
  /** 1-based data-row number in the uploaded file (excluding the CSV header). */
  row: number;
  message: string;
}

export interface ParseResult {
  /** Rows that passed validation. */
  imported: number;
  /** Rows that failed validation. */
  failed: number;
  errors: ImportRowError[];
  /** Normalised, validated rows (already price-coerced, stock raw). */
  rows: SupplierFeedRow[];
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

/** Map any spreadsheet/CSV header (uppercase, spaced, punctuated…) to a canonical import key. */
export function normalizeHeaderName(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const canonical = trimmed.replace(/[^a-z0-9]+/g, "");
  return HEADER_ALIASES[canonical] ?? canonical;
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

/** Validate one record (lower-cased CSV/XML columns) -> row + per-field errors. */
export function validateFeedRow(
  record: Record<string, string>,
  _rowNo: number,
): { row: SupplierFeedRow | null; errors: string[] } {
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

/**
 * Shared tabular normaliser: takes a 2D row array (first row = headers), maps
 * every header through normalizeHeaderName and every non-empty data row
 * through validateFeedRow. Used by the CSV parser and by the Excel (.xls /
 * .xlsx via SheetJS) parser so both produce the exact same normalised columns.
 */
export function parseTabularRows(rows: readonly (readonly unknown[])[]): ParseResult {
  const errors: ImportRowError[] = [];
  const resultRows: SupplierFeedRow[] = [];
  if (rows.length === 0) {
    return { imported: 0, failed: 1, errors: [{ row: 0, message: "The file is empty or unreadable." }], rows: resultRows };
  }
  const header = rows[0].map((h) => normalizeHeaderName(String(h ?? "")));
  rows.slice(1).forEach((dataRow, i) => {
    const rowNo = i + 1; // 1-based data row (header excluded)
    const record: Record<string, string> = {};
    dataRow.forEach((cell, j) => {
      record[header[j] ?? `col${j}`] = String(cell ?? "").trim();
    });
    const { row, errors: rowErrs } = validateFeedRow(record, rowNo);
    if (row) resultRows.push(row);
    else {
      for (const m of rowErrs) errors.push({ row: rowNo, message: m });
    }
  });
  return { imported: resultRows.length, failed: errors.length, errors, rows: resultRows };
}

/** Parse a Forzza-shaped supplier CSV feed. Returns an import summary + validated rows. */
export function parseSupplierCsv(text: string): ParseResult {
  return parseTabularRows(parseCsvTable(text));
}

/**
 * Parse a Forzza-shaped supplier spreadsheet. `rows` is the FIRST worksheet
 * extracted by SheetJS (`XLSX.utils.sheet_to_json(ws, { header: 1, defval: "",
 * raw: true })`) — legacy .xls and modern .xlsx both land here with identical
 * results. Headers may use the canonical column names or human variants
 * ("Supplier ID", "price", "Stock Status"…) — normalizeHeaderName handles them.
 */
export function parseSupplierExcel(rows: readonly (readonly unknown[])[]): ParseResult {
  return parseTabularRows(rows);
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
    return { imported: 0, failed: 1, errors: [{ row: 0, message: "No <product> blocks found in the XML." }], rows };
  }
  blocks.forEach((block, i) => {
    const { row, errors: rowErrs } = validateFeedRow(extractChildTags(block), i + 1);
    if (row) rows.push(row);
    else {
      for (const m of rowErrs) errors.push({ row: i + 1, message: m });
    }
  });
  return { imported: rows.length, failed: errors.length, errors, rows };
}

/* ── Mapping onto the site product model (prices via the pricing engine) ──── */

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

/**
 * Map a validated feed row onto the site's product model. Retail prices are
 * computed by the PRICING ENGINE (priceForProduct at current settings) — the
 * import NEVER writes prices of its own. Returns null only for invalid rows
 * (the parse functions already exclude those, so callers can assume non-null
 * for anything that passed validation).
 */
export function mapFeedRowToProduct(
  row: SupplierFeedRow,
): Wheel | Tyre | WheelPackage | Accessory | null {
  const id = `imp-${slugify(row.supplierId)}`;
  const image = row.images[0] ?? CATEGORY_IMAGE[row.category];
  const stockStatus: StockStatus = mapFeedStockToStatus(row.stock);
  const priced = { id, category: row.category, supplierPriceEur: row.supplierPriceEur, retailPriceIncVat: 0 };
  const retail = round2(priceForProduct(priced));

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