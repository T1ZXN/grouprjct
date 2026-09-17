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
 */
import { mapFeedRowToProduct, parseSupplierCsv, parseSupplierXml, SAMPLE_CSV, SAMPLE_XML } from "../src/lib/import";
import {
  assertCatalogueReady,
  CATALOGUE_NOT_READY_MSG,
  importToCatalogue,
  importWroteAnything,
  isMissingTableError,
  mapProductsToRows,
  NOTHING_MAPPED_MSG,
  NOT_SIGNED_IN_MSG,
  productToRow,
} from "../src/lib/importPersistence";
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