/**
 * scripts/test-supabase-import.ts — Phase 4 regression for the admin
 * Import → catalogue persistence path (src/lib/importPersistence.ts).
 *
 * Run:  bun run test:supabase-import
 *
 * NO JUNK IS EVER WRITTEN TO THE OWNER'S DB. The only real-project probes are
 * (a) the signed-in gate on importToCatalogue, which fires BEFORE any query,
 * and (b) assertCatalogueReady(), a READ-ONLY anon SELECT with .limit(1) —
 * both are safe whether or not the owner has run supabase-setup.sql yet.
 *
 * Covers:
 *   1. Feed → mapping → DB-row shape for wheels/tyres/accessories (and the XML
 *      sample), pinning every column importPersistence writes.
 *   2. Row → rowToProduct round-trip fidelity (the store layer must read back
 *      exactly what we write).
 *   3. Skip semantics: products missing required fields are reported as
 *      skipped, never mapped to a row.
 *   3b. "Nothing written is never a success": a fully-skipped run maps to zero
 *      writable rows and importWroteAnything() is false, so the admin UI cannot
 *      show a success message when no row was written.
 *   4. Missing-table error classification (synthetic 42P01 / PGRST205 / REST
 *      404 payloads) — the honest no-table contract.
 *   5. Real-project honest gates: NOT SIGNED IN → honest error, zero writes;
 *      catalogue readiness probe → either "ready" or the honest
 *      "run supabase-setup.sql" message. No writes in either branch.
 *   6. STOCK (the owner's bug): a feed's sellable quantity lands in the
 *      catalogue from every recognised column name (stock / qty / quantity /
 *      amount / balance / onhand / …), 0 is a real count, non-numeric is skipped
 *      without crashing, a feed with NO stock column leaves stock untouched
 *      (never zeroed), and a brand-new row with no stock figure is skipped
 *      rather than given an invented availability.
 *   7. Wolfrace / trade-only wheel feed mapping: SKU → supplierId, title from
 *      design+colour, rim size/PCD/offset, UK/Europe stock → quantity + status,
 *      retailIncVat used AS-IS, trade-only × 1.2 × 1.2 = ×1.44.
 */
import {
  mapFeedRowToProduct,
  parseStockQuantity,
  parseSupplierCsv,
  parseSupplierXml,
  resolveFeedStock,
  SAMPLE_CSV,
  SAMPLE_XML,
} from "../src/lib/import";
import {
  assertCatalogueReady,
  CATALOGUE_NOT_READY_MSG,
  feedStockSpec,
  importToCatalogue,
  importWroteAnything,
  isMissingTableError,
  mapProductsToRows,
  NO_STOCK_NEW_ROW_MSG,
  NOTHING_MAPPED_MSG,
  NOTHING_WRITTEN_MSG,
  NOT_SIGNED_IN_MSG,
  partitionWritableRows,
  productToRow,
  productWritesStock,
} from "../src/lib/importPersistence";
import type { Wheel } from "../src/data/products";
import type { ProductRowDraft } from "../src/lib/importPersistence";
import { rowToProduct } from "../src/lib/store";
import type { Product } from "../src/lib/store";
import { isSupabaseConfigured, supabase } from "../src/lib/supabase";

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail: string): void {
  if (ok) {
    pass++;
    console.log(`PASS ${label} → ${detail}`);
  } else {
    fail++;
    console.log(`FAIL ${label} → ${detail}`);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

async function main(): Promise<void> {
  console.log("supabase configured:", isSupabaseConfigured);

  // ── 1. Feed → mapping → DB-row shape (pure) ────────────────────────────────
  const csv = parseSupplierCsv(SAMPLE_CSV);
  check("CSV sample parses 4 valid rows", csv.imported === 4 && csv.failed === 2, `imported=${csv.imported} failed=${csv.failed} (FZ-2003 bad price + missing supplierId rejected)`);
  const mapped = csv.rows
    .map((r) => mapFeedRowToProduct(r))
    .filter((p): p is Product => p !== null);
  check("all valid feed rows map to products", mapped.length === 4, `${mapped.length} products`);
  const rows: ProductRowDraft[] = [];
  const skips: string[] = [];
  for (const p of mapped) {
    const out = productToRow(p);
    if (out.ok) rows.push(out.row);
    else skips.push(out.reason);
  }
  check("productToRow maps every valid product", rows.length === 4 && skips.length === 0, `rows=${rows.length} skips=${skips.length}`);

  const cols = ["id", "category", "name", "price_gbp", "rrp_gbp", "stock_status", "images", "specs", "fitment", "description", "bullets", "package_contents"];
  const missingCols = rows.length === 0 ? cols : cols.filter((c) => !(c in rows[0]));
  check("row has every public.products column", missingCols.length === 0, missingCols.length ? `missing: ${missingCols.join(",")}` : `${cols.length} columns`);

  const wheelRow = rows.find((r) => r.category === "wheels" && r.id === "imp-fz-2001");
  const tyreRow = rows.find((r) => r.category === "tyres");
  const accRow = rows.find((r) => r.category === "accessories");
  const wheelSpecs = wheelRow && isRecord(wheelRow.specs) ? wheelRow.specs : null;
  const wheelFitment = wheelRow && isRecord(wheelRow.fitment) ? wheelRow.fitment : null;
  check(
    "wheel row shape (specs geometry + fitment + stock mapping)",
    !!wheelRow &&
      !!wheelSpecs &&
      wheelSpecs.supplierId === "FZ-2001" &&
      wheelSpecs.diameter === 18 &&
      wheelSpecs.width === "8.5J" &&
      !!wheelFitment &&
      Array.isArray(wheelFitment.compatibility) &&
      wheelRow.stock_status === "In Stock" &&
      (wheelRow.price_gbp ?? -1) > 0 &&
      wheelRow.name === "Vanta V-8",
    wheelRow ? `id=${wheelRow.id} price=${String(wheelRow.price_gbp)} stock=${wheelRow.stock_status} name=${wheelRow.name}` : "wheel row missing",
  );
  check(
    "tyre row shape (tyre specs jsonb)",
    !!tyreRow &&
      isRecord(tyreRow.specs) &&
      tyreRow.specs.width === 225 &&
      tyreRow.specs.aspect === 45 &&
      tyreRow.specs.rimDiameter === 18 &&
      tyreRow.specs.season === "Summer",
    tyreRow ? JSON.stringify(tyreRow.specs) : "tyre row missing",
  );
  check(
    "accessory row shape (supplierId + null package_contents)",
    !!accRow &&
      isRecord(accRow.specs) &&
      accRow.specs.supplierId === "FZ-A201" &&
      accRow.package_contents === null &&
      Array.isArray(accRow.bullets) &&
      accRow.bullets.length === 0,
    accRow ? `specs=${JSON.stringify(accRow.specs)} package_contents=${String(accRow.package_contents)}` : "accessory row missing",
  );
  check("wheels keep images array from feed", !!wheelRow && Array.isArray(wheelRow.images) && wheelRow.images.includes("/images/wheel-vortex.jpg"), wheelRow ? wheelRow.images.join(",") : "no wheel row");

  const xml = parseSupplierXml(SAMPLE_XML);
  const xmlMapped = xml.rows
    .map((r) => mapFeedRowToProduct(r))
    .filter((p): p is Product => p !== null);
  const xmlRow = xmlMapped[0] ? productToRow(xmlMapped[0]) : null;
  check(
    "XML wheel maps too (multi-image feed keeps the first image)",
    xml.imported === 1 &&
      !!xmlRow &&
      xmlRow.ok &&
      isRecord(xmlRow.row.specs) &&
      xmlRow.row.specs.supplierId === "FZ-3001" &&
      Array.isArray(xmlRow.row.images) &&
      xmlRow.row.images.length === 1 &&
      xmlRow.row.images[0] === "/images/wheel-vortex.jpg",
    xmlRow?.ok ? `id=${xmlRow.row.id} images=${JSON.stringify(xmlRow.row.images)}` : `xml.imported=${xml.imported}`,
  );

  // ── 2. Row → rowToProduct round-trip fidelity (pure) ───────────────────────
  const roundTrips = rows.map((r) => rowToProduct({ ...r, created_at: undefined, updated_at: undefined }));
  const roundTripOk = roundTrips.every((p, i) => {
    const src = mapped[i];
    return (
      p !== null &&
      p.id === src.id &&
      p.category === src.category &&
      p.retailPriceIncVat === src.retailPriceIncVat &&
      p.stockStatus === src.stockStatus
    );
  });
  check("every written row round-trips through rowToProduct", roundTripOk, `${roundTrips.filter(Boolean).length}/${rows.length} rows`);
  const rtWheel = roundTrips.find((p) => p?.category === "wheels") as (typeof mapped)[0] | null | undefined;
  const srcWheel = mapped.find((p) => p.category === "wheels");
  check(
    "wheel round-trip keeps size/specs",
    !!rtWheel && !!srcWheel &&
      rtWheel.category === "wheels" && "size" in rtWheel && "size" in srcWheel &&
      rtWheel.size.diameter === srcWheel.size.diameter &&
      rtWheel.size.width === srcWheel.size.width,
    rtWheel && srcWheel ? `${rtWheel.size.diameter}" × ${rtWheel.size.width}` : "missing wheel round-trip",
  );

  // ── 3. Skip semantics: products missing required fields are skipped ────────
  const badNoName = productToRow({ id: "imp-x", category: "wheels", name: "", retailPriceIncVat: 10, stockStatus: "In Stock" } as unknown as Product);
  const badNoId = productToRow({ id: "", category: "wheels", name: "X", retailPriceIncVat: 10, stockStatus: "In Stock" } as unknown as Product);
  const badBadPrice = productToRow({ id: "imp-x", category: "wheels", name: "X", retailPriceIncVat: NaN, stockStatus: "In Stock" } as unknown as Product);
  check(
    "rows with missing required fields are skipped with a reason",
    !badNoName.ok && !badNoId.ok && !badBadPrice.ok,
    `reasons: ${[badNoName, badNoId, badBadPrice].map((b) => (b.ok ? "?" : b.reason)).join(" | ")}`,
  );

  // ── 3b. "Nothing written is never a success" contract ─────────────────────
  // The admin UI must not show a success message unless rows were really
  // written. importWroteAnything() is that gate, and a fully-skipped run must
  // come back as a failure carrying an honest message (never a silent ok).
  const unmappable = mapProductsToRows([
    { id: "imp-bad", category: "wheels", name: "", retailPriceIncVat: 10, stockStatus: "In Stock" } as unknown as Product,
  ]);
  check(
    "every row unmappable → 0 writable rows, skipped reported",
    unmappable.entries.length === 0 && unmappable.skips.length === 1 && !!unmappable.skips[0].reason,
    `entries=${unmappable.entries.length} skips=${unmappable.skips.length} reason="${unmappable.skips[0]?.reason ?? ""}"`,
  );
  check(
    "zero-write report is honest (NOTHING_MAPPED_MSG says nothing was written; not a success)",
    NOTHING_MAPPED_MSG.includes("Nothing was written") && NOTHING_MAPPED_MSG.includes("skipped list"),
    NOTHING_MAPPED_MSG,
  );
  const wroteNothing = {
    ok: false,
    error: NOTHING_MAPPED_MSG,
    created: 0,
    updated: 0,
    failed: 0,
    skipped: unmappable.skips.length,
    stockWritten: 0,
    stockUntouched: 0,
    stockSkipped: 0,
    failures: [],
    skips: unmappable.skips,
  };
  check(
    "importWroteAnything() is false for a fully-skipped run",
    !importWroteAnything(wroteNothing),
    `created=${wroteNothing.created} updated=${wroteNothing.updated} → ${String(importWroteAnything(wroteNothing))}`,
  );
  check(
    "importWroteAnything() is true only once a row is written",
    !importWroteAnything({ ...wroteNothing, ok: true, error: undefined }) &&
      importWroteAnything({ ...wroteNothing, created: 1 }) &&
      importWroteAnything({ ...wroteNothing, updated: 2 }),
    "0/0 → false · 1 created → true · 2 updated → true",
  );

  // ── 4. Missing-table error classification (synthetic payloads) ─────────────
  const missingCases: unknown[] = [
    { code: "42P01", message: 'relation "public.products" does not exist' },
    { code: "PGRST205", message: 'Could not find the table \'public.products\' in the schema cache' },
    { message: 'relation "public.products" does not exist' },
    { code: "404", message: "products relation does not exist" },
  ];
  const nonMissingCases: unknown[] = [
    { code: "42501", message: 'permission denied for table products' },
    { message: "fetch failed" },
    { code: "PGRST116", message: "The result contains 0 rows" },
  ];
  check(
    "isMissingTableError catches 42P01 / PGRST205 / 'does not exist'",
    missingCases.every((c) => isMissingTableError(c)),
    `${missingCases.length}/4 classified as missing-table`,
  );
  check(
    "isMissingTableError ignores permission/network errors",
    !nonMissingCases.some((c) => isMissingTableError(c)),
    `${nonMissingCases.length}/3 correctly not missing-table`,
  );

  // ── 6. STOCK ACTUALLY LANDS (the owner's bug: feed stock was dropped) ──────
  // The owner imported a supplier CSV: rows were written but stock was NOT
  // updated. Two real causes, both fixed and pinned here:
  //   a. a quantity column called qty / quantity / amount / balance / onhand /
  //      "stock qty" / "quantity available"… was not recognised at all, so the
  //      number never reached the catalogue;
  //   b. a NUMBER in a status-named column ("Stock" = 12) was read as a status
  //      word, so the count was lost AND the status became "Contact us".
  console.log("\n— stock mapping (quantity → catalogue) —");

  /** One valid wheel row plus the named stock column, through the CSV path. */
  const stockCsv = (header: string | null, value: string): string => {
    const cols = ["supplierId", "name", "brand", "diameter", "width", "pcd", "offset", "price", "category"];
    const vals = ["FZ-Q1", "Quantity Wheel", "Forzza", "18", "8.5J", "5x112", "ET45", "200", "wheels"];
    if (header !== null) {
      cols.push(header);
      vals.push(value);
    }
    return `${cols.join(",")}\n${vals.join(",")}`;
  };
  /** A full-size wheel row (parsed → mapped → productToRow → read back). */
  const stockRoundTrip = (header: string | null, value: string) => {
    const parsed = parseSupplierCsv(stockCsv(header, value)).rows[0];
    const product = parsed ? mapFeedRowToProduct(parsed) : null;
    const draft = product ? productToRow(product) : null;
    const specs = draft && draft.ok ? (draft.row.specs as Record<string, unknown>) : null;
    const specStock = specs ? (specs.stock as { quantity?: number; statusCode?: string } | undefined) : undefined;
    const back =
      draft && draft.ok ? rowToProduct({ ...draft.row, created_at: undefined, updated_at: undefined }) : null;
    return { parsed, product, draft, specStock, back };
  };

  const QUANTITY_HEADERS = [
    "Stock",
    "Qty",
    "Quantity",
    "Stock Qty",
    "Stock Quantity",
    "Amount",
    "Balance",
    "On Hand",
    "Quantity Available",
    "Stock Count",
    "Stock Level",
    "In Stock",
    "Free Stock",
    "Total Stock",
  ];
  const qtyChecks = QUANTITY_HEADERS.map((h) => {
    const { parsed, product, draft, specStock, back } = stockRoundTrip(h, "7");
    const ok =
      parsed?.stockQty === 7 &&
      product?.stockStatus === "In Stock" &&
      product?.feedStock?.quantity === 7 &&
      !!draft?.ok &&
      draft.row.stock_status === "In Stock" &&
      specStock?.quantity === 7 &&
      back?.feedStock?.quantity === 7;
    return { h, ok };
  });
  check(
    `stock quantity lands from every recognised column name (${QUANTITY_HEADERS.length} of them)`,
    qtyChecks.every((c) => c.ok),
    qtyChecks.every((c) => c.ok)
      ? `${QUANTITY_HEADERS.join(", ")} → quantity 7, status In Stock, written as stock_status + specs.stock.quantity, read back`
      : `failed on: ${qtyChecks.filter((c) => !c.ok).map((c) => c.h).join(", ")}`,
  );

  const unitCases: Array<[string, number | undefined]> = [
    ["12", 12],
    [" 12 ", 12],
    ["12.0", 12],
    ["1,234", 1234],
    ["12,5", 12.5],
    ["0", 0],
    ["", undefined],
    ["   ", undefined],
    ["-", undefined],
    ["n/a", undefined],
    ["-3", undefined],
    ["12 pcs", undefined],
    ["in_stock", undefined],
    ["undefined-ish text", undefined],
  ];
  const unitWrong = unitCases.filter(([raw, want]) => parseStockQuantity(raw) !== want);
  check(
    "quantity parsing: numbers pass, empty/non-numeric/negative → undefined (never a crash)",
    unitWrong.length === 0,
    unitWrong.length === 0
      ? unitCases.map(([r, w]) => `"${r}"→${w === undefined ? "skip" : w}`).join(" · ")
      : `wrong: ${unitWrong.map(([r, w]) => `"${r}" wanted ${w} got ${parseStockQuantity(r)}`).join(", ")}`,
  );

  const zero = stockRoundTrip("Qty", "0");
  check(
    "a published 0 is a real count → Out of stock with quantity 0 (not 'Contact us')",
    zero.parsed?.stockQty === 0 &&
      zero.product?.stockStatus === "Out of stock" &&
      zero.draft?.ok === true &&
      zero.draft.row.stock_status === "Out of stock" &&
      zero.specStock?.quantity === 0,
    `stockQty=${String(zero.parsed?.stockQty)} status=${zero.product?.stockStatus} specs.stock=${JSON.stringify(zero.specStock)}`,
  );

  const statusWord = stockRoundTrip("Stock Status", "in_stock");
  check(
    "a status-word feed still works: code kept, no quantity invented",
    statusWord.parsed?.hasFeedStock === true &&
      statusWord.parsed?.stockQty === undefined &&
      statusWord.product?.stockStatus === "In Stock" &&
      statusWord.draft?.ok === true &&
      statusWord.specStock?.quantity === undefined &&
      statusWord.specStock?.statusCode === "in_stock",
    `stock="${statusWord.parsed?.stock}" qty=${String(statusWord.parsed?.stockQty)} specs.stock=${JSON.stringify(statusWord.specStock)}`,
  );

  // A status column AND a quantity column together: the count must not be lost.
  const both = parseSupplierCsv(
    `supplierId,name,brand,diameter,width,pcd,offset,price,category,Stock Status,Qty\nFZ-Q2,Dual Wheel,Forzza,18,8.5J,5x112,ET45,200,wheels,available_to_order,3`,
  ).rows[0];
  check(
    "status + quantity columns together keep BOTH (status code and count)",
    both?.stock === "available_to_order" &&
      both?.stockQty === 3 &&
      both?.hasFeedStock === true &&
      (mapFeedRowToProduct(both) as Product).stockStatus === "Available to order" &&
      (mapFeedRowToProduct(both) as Product).feedStock?.quantity === 3,
    `stock=${both?.stock} qty=${String(both?.stockQty)}`,
  );

  const resolveBoth = resolveFeedStock({ stock: "in_stock", stockqty: "", qty: "9", amount: "1" });
  check(
    "resolveFeedStock prefers the dedicated quantity column and ignores empty cells",
    resolveBoth.statusCode === "in_stock" && resolveBoth.quantity === 9 && resolveBoth.fromFeed === true,
    JSON.stringify(resolveBoth),
  );
  const resolveNumericStatus = resolveFeedStock({ stock: "12" });
  check(
    "a NUMBER in a status-named column is read as a count → in_stock",
    resolveNumericStatus.statusCode === "in_stock" &&
      resolveNumericStatus.quantity === 12 &&
      resolveNumericStatus.fromFeed === true,
    JSON.stringify(resolveNumericStatus),
  );
  const resolveNothing = resolveFeedStock({ supplierid: "X", name: "Y" });
  check(
    "a feed with no stock column at all → fromFeed false (stock left untouched)",
    resolveNothing.fromFeed === false && resolveNothing.quantity === undefined && resolveNothing.statusCode === "",
    JSON.stringify(resolveNothing),
  );

  // ── stock UNTOUCHED when the feed has no stock column ─────────────────────
  const noStock = stockRoundTrip(null, "");
  const noStockDraft = noStock.draft;
  check(
    "no stock column in the feed → the written row OMITS stock_status (never zeroed)",
    noStock.parsed?.hasFeedStock === false &&
      !!noStockDraft?.ok &&
      !("stock_status" in noStockDraft.row) &&
      noStock.specStock === undefined &&
      productWritesStock(noStock.product as Product) === false,
    noStockDraft?.ok ? `row keys=${Object.keys(noStockDraft.row).join(",")}` : "no draft",
  );

  // An EXISTING catalogue row keeps its stock through a price-only re-import;
  // a BRAND-NEW row with no stock figure is skipped rather than invented.
  const existingRow = {
    id: "imp-fz-q1",
    category: "wheels",
    name: "Quantity Wheel (old name)",
    brand: "Forzza",
    price_gbp: 1,
    rrp_gbp: null,
    stock_status: "Out of stock",
    images: ["/images/category-wheels.jpg"],
    specs: { supplierId: "FZ-Q1" },
    fitment: { compatibility: [], fitments: [] },
    description: null,
    bullets: [],
    package_contents: null,
  };
  // Postgres upsert semantics: columns absent from the payload keep their value.
  const upsert = (target: Record<string, unknown> | null, draft: ProductRowDraft) => {
    const merged: Record<string, unknown> = { ...(target ?? {}), ...draft };
    if (!("stock_status" in merged) || merged.stock_status == null) {
      if (target === null) throw new Error("null value in column \"stock_status\" violates not-null constraint");
    }
    return merged as ProductRowDraft;
  };
  const merged = upsert(existingRow as unknown as Record<string, unknown>, noStockDraft!.ok ? noStockDraft!.row : ({} as ProductRowDraft));
  const mergedBack = rowToProduct({ ...merged, created_at: undefined, updated_at: undefined });
  check(
    "price-only re-import of an existing row leaves its stock status exactly as it was",
    merged.stock_status === "Out of stock" &&
      mergedBack?.stockStatus === "Out of stock" &&
      !!noStockDraft?.ok &&
      mergedBack?.retailPriceIncVat === noStockDraft.row.price_gbp &&
      merged.name !== existingRow.name,
    `stock=${String(merged.stock_status)} price=${String(mergedBack?.retailPriceIncVat)} (feed re-priced the row, stock kept)`,
  );
  check(
    "a brand-new row with no stock figure is SKIPPED (never an invented availability)",
    (() => {
      const fresh = partitionWritableRows([noStockDraft!.ok ? noStockDraft!.row : ({} as ProductRowDraft)], new Set());
      return (
        fresh.writable.length === 0 &&
        fresh.skipped.length === 1 &&
        fresh.skipped[0].reason.includes(NO_STOCK_NEW_ROW_MSG) &&
        NO_STOCK_NEW_ROW_MSG.includes("never") === false &&
        NO_STOCK_NEW_ROW_MSG.includes("skipped")
      );
    })(),
    `writable=0 skipped=1 reason="${NO_STOCK_NEW_ROW_MSG}"`,
  );
  check(
    "the same row IS written when the product already exists (stock preserved)",
    (() => {
      const known = partitionWritableRows([noStockDraft!.ok ? noStockDraft!.row : ({} as ProductRowDraft)], new Set(["imp-fz-q1"]));
      return known.writable.length === 1 && known.skipped.length === 0;
    })(),
    "existing id → writable, stock_status omitted",
  );

  // A row WITH a stock figure writes stock_status (the owner's whole ask).
  const withStockDraft = stockRoundTrip("Qty", "7");
  check(
    "a row WITH a stock column writes stock_status + specs.stock on upsert",
    withStockDraft.draft?.ok === true &&
      withStockDraft.draft.row.stock_status === "In Stock" &&
      withStockDraft.specStock?.quantity === 7 &&
      rowToProduct({ ...withStockDraft.draft.row, created_at: undefined, updated_at: undefined })?.feedStock?.quantity === 7,
    `stock_status=${withStockDraft.draft?.ok ? String(withStockDraft.draft.row.stock_status) : "?"} specs.stock=${JSON.stringify(withStockDraft.specStock)}`,
  );
  check(
    "feedStockSpec/productWritesStock pin the omit behaviour",
    feedStockSpec(undefined) === null &&
      feedStockSpec({ fromFeed: false }) === null &&
      feedStockSpec({ fromFeed: true }) === null &&
      JSON.stringify(feedStockSpec({ fromFeed: true, quantity: 4 })) === '{"quantity":4}' &&
      JSON.stringify(feedStockSpec({ fromFeed: true, statusCode: "in_stock" })) === '{"statusCode":"in_stock"}',
    "no feed stock → null (nothing written about stock)",
  );

  // ── 7. Wolfrace / trade-only wheel feed mapping ───────────────────────────
  console.log("\n— Wolfrace wheel feed: SKU, title, specs, price, stock —");
  const WOLF_CSV = `UK stock,Europe stock,Total stock,sku,blank part number,brand,design,color,width,diameter,wheelSize,offset,offset blanks,pcd,pcd_2,loadRating,centreBore,weight,tradePrice,retailExVat,retailIncVat,image url,origin
217,0,217,WOF12058020BLK38,OV12058020,Wolfrace Eurosport,Wolfsburg,Gloss Black,8,20,8x20,38,,5x120,,1100,110,12.2,112.5,135,162,https://www.wolfrace.co.uk/images/alloywheels/WOFBLK2.webp,china
0,100,100,WGEN11259020BKM38,,Wolfhart Flowformed,Genesis 2,Gloss Black Polished Face,9,20,9x20,38,,5x112,,875,72.6,11.9,90,112.5,135,https://www.wolfrace.co.uk/images/alloywheels/progen2.webp,china`;
  const wolf = parseSupplierCsv(WOLF_CSV);
  const wolfRow = wolf.rows[0];
  const wolfWheel = wolfRow ? (mapFeedRowToProduct(wolfRow) as Wheel) : null;
  const wolfDraft = wolfWheel ? productToRow(wolfWheel) : null;
  const wolfSpecs = wolfDraft && wolfDraft.ok ? (wolfDraft.row.specs as Record<string, unknown>) : null;
  check(
    "Wolfrace feed: SKU → supplierId, title from design+colour, rim size/PCD/offset as fields",
    wolf.shape === "wheelTrade" &&
      wolfRow?.supplierId === "WOF12058020BLK38" &&
      wolfRow?.name === "Wolfsburg Gloss Black" &&
      wolfWheel?.brand === "Wolfrace Eurosport" &&
      wolfWheel?.size.diameter === 20 &&
      wolfWheel?.size.width === "8J" &&
      wolfWheel?.size.pcd === "5x120" &&
      wolfWheel?.size.offset === "ET38",
    `shape=${wolf.shape} sku=${wolfRow?.supplierId} name=${wolfRow?.name} ${wolfWheel?.size.diameter}" ${wolfWheel?.size.width} ${wolfWheel?.size.pcd} ${wolfWheel?.size.offset}`,
  );
  check(
    "Wolfrace feed: retailIncVat is used AS-IS (no VAT/margin re-applied)",
    wolfWheel?.retailPriceIncVat === 162 &&
      wolfWheel?.feedAttributes?.priceSource === "retailIncVat" &&
      wolfDraft?.ok === true &&
      wolfDraft.row.price_gbp === 162,
    `retailIncVat 162 → price ${String(wolfDraft?.ok ? wolfDraft.row.price_gbp : wolfWheel?.retailPriceIncVat)} (source ${wolfWheel?.feedAttributes?.priceSource})`,
  );
  check(
    "Wolfrace feed: UK stock 217 lands as quantity + In Stock, and the row's own count is kept",
    wolfRow?.stockQty === 217 &&
      wolfRow?.hasFeedStock === true &&
      wolfWheel?.stockStatus === "In Stock" &&
      wolfWheel?.feedAttributes?.ukStock === 217 &&
      (wolfSpecs?.stock as { quantity?: number } | undefined)?.quantity === 217,
    `qty=${String(wolfRow?.stockQty)} status=${wolfWheel?.stockStatus} specs.stock=${JSON.stringify(wolfSpecs?.stock)}`,
  );
  const wolfEu = wolf.rows[1] ? (mapFeedRowToProduct(wolf.rows[1]) as Wheel) : null;
  check(
    "Wolfrace feed: Europe-only stock → Available to order, quantity 100 (never claimed UK stock)",
    wolf.rows[1]?.stock === "available_to_order" &&
      wolf.rows[1]?.stockQty === 100 &&
      wolfEu?.stockStatus === "Available to order",
    `stock=${wolf.rows[1]?.stock} qty=${String(wolf.rows[1]?.stockQty)}`,
  );
  check(
    "Wolfrace feed: blank part number + other columns carried verbatim",
    (wolfRow?.feedExtra?.blankPartNumber ?? "") === "OV12058020" && wolfRow?.feedExtra?.wheelSize === "8x20",
    `feedExtra=${JSON.stringify(wolfRow?.feedExtra)}`,
  );

  const TRADE_ONLY_CSV = `SKU,Brand,Design,Colour,Width,Diameter,Offset,PCD,UK Stock,Trade Price
AWU-BM18-01,Automotive Wheels UK,Rivet,Gloss Black,8,18,45,5x120,24,120
AWU-NOQTY-02,Automotive Wheels UK,Rivet,Anthracite,8.5,19,40,5x112,,145.5`;
  const trade = parseSupplierCsv(TRADE_ONLY_CSV);
  const tradeWheel = trade.rows[0] ? (mapFeedRowToProduct(trade.rows[0]) as Wheel) : null;
  check(
    "trade-only feed (no retail columns): trade × 1.2 margin × 1.2 VAT = ×1.44",
    trade.shape === "wheelTrade" &&
      trade.rows[0]?.tradePriceGbp === 120 &&
      tradeWheel?.retailPriceIncVat === 172.8 &&
      tradeWheel?.feedAttributes?.priceSource === "tradePrice",
    `trade 120 → ${String(tradeWheel?.retailPriceIncVat)} (source ${tradeWheel?.feedAttributes?.priceSource})`,
  );
  check(
    "trade-only feed: UK Stock 24 → quantity 24 In Stock; a blank stock cell leaves stock untouched",
    trade.rows[0]?.stockQty === 24 &&
      tradeWheel?.stockStatus === "In Stock" &&
      trade.rows[1]?.hasFeedStock === false &&
      trade.rows[1]?.stockQty === undefined &&
      (() => {
        const d = trade.rows[1] ? productToRow(mapFeedRowToProduct(trade.rows[1]) as Wheel) : null;
        return !!d?.ok && !("stock_status" in d.row);
      })(),
    `row0 qty=${String(trade.rows[0]?.stockQty)} · row1 hasFeedStock=${String(trade.rows[1]?.hasFeedStock)} → stock_status omitted`,
  );
  check(
    "a zero-write import is never a success (honest message exists for it)",
    NOTHING_WRITTEN_MSG.includes("Nothing was written") && NOTHING_WRITTEN_MSG.includes("skipped"),
    NOTHING_WRITTEN_MSG,
  );

  // ── 5. Real-project honest gates (safe: no writes) ─────────────────────────
  if (!supabase) {
    console.log("SKIP real-project gates — Supabase env vars missing; fallback-only behaviour expected.");
  } else {
    // 5a. NOT SIGNED IN → honest error, nothing written (runs with the anon
    //     key only; no session exists in this script, so the gate fires first).
    const res = await importToCatalogue(mapped);
    const countsZero = res.created === 0 && res.updated === 0 && res.failed === 0 && res.skipped === 0;
    check(
      "importToCatalogue without a session is blocked honestly",
      !res.ok && res.error === NOT_SIGNED_IN_MSG && countsZero && !importWroteAnything(res),
      res.error ?? "no error",
    );

    // 5b. Catalogue readiness probe (read-only anon SELECT, .limit(1)): the
    //     result must be either ready, or the honest "run supabase-setup.sql"
    //     message — never a fabricated success, never junk.
    const ready = await assertCatalogueReady();
    if (ready.ok) {
      check("catalogue readiness probe", ready.ok, "products table exists and is reachable (schema already run)");
    } else if (ready.error === CATALOGUE_NOT_READY_MSG) {
      check("catalogue readiness probe — honest no-table path", true, CATALOGUE_NOT_READY_MSG);
    } else {
      check("catalogue readiness probe", false, ready.error);
    }
  }

  console.log(`---\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("TEST CRASH:", e);
  process.exit(1);
});