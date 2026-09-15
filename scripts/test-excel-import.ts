#!/usr/bin/env bun
/**
 * scripts/test-excel-import.ts — XLS/XLSX import verification for the admin
 * Import tab (Phase 3 import tooling).
 *
 * Generates REAL spreadsheet fixtures (a modern .xlsx and a legacy .xls) with
 * HUMAN-variant headers ("Supplier ID", "Price (EUR)", "Stock Status"…) into
 * /home/team/shared/fixtures/, then reads each back the same way the admin UI
 * does (SheetJS first worksheet → sheet_to_json → parseSupplierExcel) and
 * asserts the normalised rows match the expected import columns.
 *
 * Also proves the UI round-trip stays lossless: the rows rendered to CSV text
 * (renderRowsToCsv, what the textarea shows) parse through the CSV path to the
 * exact same normalised rows.
 *
 * Run:  bun run test:excel-import   (or: bun ./scripts/test-excel-import.ts)
 */
import { mkdirSync } from "node:fs";
import * as XLSX from "xlsx";
import { parseSupplierCsv, parseSupplierExcel, renderRowsToCsv } from "../src/lib/import";

const FIXTURE_DIR = "/home/team/shared/fixtures";

/** Human-variant headers — deliberately NOT the canonical CSV column names. */
const HEADERS = [
  "Supplier ID", "Product Name", "Brand", "Image", "Diameter", "Width", "PCD",
  "Offset", "Colour", "Finish", "Price (EUR)", "Stock Status", "Category",
  "Included Bolts", "Tyre Width", "Tyre Aspect", "Tyre Rim", "Load Index",
  "Speed Rating", "Season",
];

const ROWS = [
  // Wheel — full geometry, gloss black finish.
  ["FZ-X01", "Vortex XLS-01", "Forzza", "/images/wheel-vortex.jpg", 18, "8.5J", "5x112", "ET45", "Gloss Black", "Gloss", 238, "in_stock", "wheels", "20x conical bolts included"],
  // Tyre — uses the tyre-width/aspect/rim columns; no wheel geometry.
  ["FZ-X02", "Strada SP-XLS", "Strada", "/images/category-tyres.jpg", null, null, null, null, null, null, 122, "available", "tyres", null, 225, 45, 18, 94, "Y", "Summer"],
  // Accessory — only the base columns matter.
  ["FZ-X03", "Valve Stems 6-pack", "AllGrip", "/images/accessory-bolts.jpg", null, null, null, null, null, null, 9.5, "in_stock", "accessories", null],
];

let failures = 0;
const log = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "  PASS" : "  FAIL"} ${label} → ${detail}`);
  if (!ok) failures++;
};
const assert = (label: string, cond: boolean, detail: string) => log(label, cond, detail);

function firstSheetRows(wb: XLSX.WorkBook): unknown[][] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("workbook has no worksheets");
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
}

function main() {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const aoa = [HEADERS, ...ROWS];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Forzza feed");
  const xlsxPath = `${FIXTURE_DIR}/forzza-sample.xlsx`;
  const xlsPath = `${FIXTURE_DIR}/forzza-sample.xls`;
  XLSX.writeFile(wb, xlsxPath, { bookType: "xlsx" });
  XLSX.writeFile(wb, xlsPath, { bookType: "biff8" }); // legacy .xls
  console.log(`Fixtures written: ${xlsxPath}, ${xlsPath}\n`);

  // ── Parse both formats and compare ──
  const xlsxRows = firstSheetRows(XLSX.readFile(xlsxPath));
  const xlsRows = firstSheetRows(XLSX.readFile(xlsPath));
  const rXlsx = parseSupplierExcel(xlsxRows);
  const rXls = parseSupplierExcel(xlsRows);

  log("fixture files on disk", true, `${xlsxPath} + ${xlsPath} (xls is legacy biff8)`);

  // Expected normalised rows (both formats must be identical).
  const expected: Array<{ supplierId: string; name: string; category: string; price: number; extra: string }> = [
    { supplierId: "FZ-X01", name: "Vortex XLS-01", category: "wheels", price: 238, extra: "18\" 8.5J 5x112 ET45" },
    { supplierId: "FZ-X02", name: "Strada SP-XLS", category: "tyres", price: 122, extra: "225/45R18, 94 Y, Summer" },
    { supplierId: "FZ-X03", name: "Valve Stems 6-pack", category: "accessories", price: 9.5, extra: "—" },
  ];

  for (const [fmt, r] of [["xlsx", rXlsx], ["xls", rXls]] as const) {
    assert(`${fmt} import count`, r.imported === 3 && r.failed === 0, `imported=${r.imported} failed=${r.failed} (${r.errors.map((e) => e.message).join("; ") || "no errors"})`);
    assert(`${fmt} row count matches`, r.rows.length === expected.length, `${r.rows.length} rows`);
    r.rows.forEach((row, i) => {
      const e = expected[i];
      assert(
        `${fmt} row ${i + 1} "${e.supplierId}" normalised`,
        row.supplierId === e.supplierId && row.name === e.name && row.category === e.category && row.supplierPriceEur === e.price,
        `supplierId=${row.supplierId} name=${row.name} category=${row.category} price=${row.supplierPriceEur}`,
      );
    });
  }

  // Wheel geometry survived (human headers → canonical columns).
  const w = rXlsx.rows[0];
  assert("xlsx wheel geometry", w.diameter === 18 && w.width === "8.5J" && w.pcd === "5x112" && w.offset === "ET45" && w.colour === "Gloss Black" && w.includedBolts === "20x conical bolts included",
    `diameter=${w.diameter} width=${w.width} pcd=${w.pcd} offset=${w.offset} colour=${w.colour} bolts="${w.includedBolts}"`);
  // Tyre fields survived.
  const t = rXlsx.rows[1];
  assert("xlsx tyre spec", t.tyreWidth === 225 && t.tyreAspect === 45 && t.tyreRim === 18 && t.loadIndex === "94" && t.speedRating === "Y" && t.season === "Summer",
    `tyreWidth=${t.tyreWidth} tyreAspect=${t.tyreAspect} tyreRim=${t.tyreRim} loadIndex=${t.loadIndex} speedRating=${t.speedRating} season=${t.season}`);

  // ── xls and xlsx must produce byte-identical normalised rows ──
  assert("xls ≡ xlsx rows", JSON.stringify(rXls.rows) === JSON.stringify(rXlsx.rows), "identical normalised output");

  // ── UI round-trip: rows → CSV text (what the textarea shows) → CSV parser ──
  const csvText = renderRowsToCsv(xlsxRows);
  const rViaCsv = parseSupplierCsv(csvText);
  assert("CSV round-trip count", rViaCsv.imported === 3 && rViaCsv.failed === 0, `imported=${rViaCsv.imported} failed=${rViaCsv.failed}`);
  assert("CSV round-trip ≡ Excel parse", JSON.stringify(rViaCsv.rows) === JSON.stringify(rXlsx.rows), "identical normalised rows through renderRowsToCsv→parseSupplierCsv");

  // ── Canonical headers must keep working (regression, existing CSV behaviour) ──
  const canonicalCsv = `supplierId,name,brand,images,diameter,width,pcd,offset,colour,finish,price,stock,category,includedBolts,tyreWidth,tyreAspect,tyreRim,loadIndex,speedRating,season
FZ-2001,Vanta V-8,Forzza,/images/wheel-vortex.jpg,18,8.5J,5x112,ET45,Gloss Black,Gloss,238,in_stock,wheels,20x conical bolts included,,,,,,`;
  const rCanon = parseSupplierCsv(canonicalCsv);
  assert("canonical CSV regression", rCanon.imported === 1, `imported=${rCanon.imported}`);

  console.log(`\n${failures === 0 ? "ALL EXCEL IMPORT TESTS PASSED" : `${failures} TEST(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();