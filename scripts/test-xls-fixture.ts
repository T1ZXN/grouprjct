/**
 * XLS/XLSX fixture + parse proof for the N2 Wheels admin Import tab.
 * Generates /home/team/shared/n2wheels-import-sample.xlsx (a realistic
 * Forzza-shaped supplier sheet), reads it back exactly the way admin.tsx
 * does (SheetJS, first worksheet, header:1), and runs the shared
 * parseTabularRows() pipeline so we can see normalised rows + validation.
 *
 * Run: cd /home/team/shared/site && bun scripts/test-xls-fixture.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { SUPPLIER_CSV_COLUMNS, parseTabularRows } from "../src/lib/import";

// Header row: a deliberate mix of canonical + human-readable variants to
// prove permissive matching (Supplier ID vs supplierId, "Price (£)" etc.).
const HEADER = [
  "Supplier ID",
  "name",
  "brand",
  "images",
  "diameter",
  "width",
  "PCD",
  "offset",
  "colour",
  "finish",
  "Price (£)",
  "stock",
  "category",
  "includedBolts",
  "tyreWidth",
  "tyreAspect",
  "tyreRim",
  "loadIndex",
  "speedRating",
  "season",
];

const WHEEL_ROW = [
  "FZ-XLS1", "XLS Racer R1", "Forzza", "/images/wheel-vortex.jpg",
  "18", "8.5J", "5x112", "ET45", "Gloss Black", "Gloss", "199.99",
  "In Stock", "wheels", "20x conical bolts included",
  "", "", "", "", "", "",
];

const TYRE_ROW = [
  "FZ-XLS2", "XLS Sport SP-9", "Strada", "/images/category-tyres.jpg",
  "", "", "", "", "", "", "129.50", "Available to order", "tyres", "",
  "225", "45", "18", "91Y", "Y", "Summer",
];

const ws = XLSX.utils.aoa_to_sheet([HEADER, WHEEL_ROW, TYRE_ROW]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Products");
const out = "/home/team/shared/n2wheels-import-sample.xlsx";
writeFileSync(out, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);

// --- read back the same way admin.tsx does ---
const buf = readFileSync(out);
const wb2 = XLSX.read(new Uint8Array(buf));
const ws2 = wb2.Sheets[wb2.SheetNames[0]]!;
const rows = XLSX.utils.sheet_to_json<unknown[]>(ws2, { header: 1, defval: "", raw: true });
const result = parseTabularRows(rows);

console.log("fixture written:", out);
console.log("raw rows read back:", rows.length - 1, "(excluding header)");
console.log("valid rows:", result.rows.length);
console.log("errors:", result.errors.length);
for (const r of result.rows.slice(0, 5)) {
  console.log(" -", r.supplierId, "|", r.name, "|", r.price, "|", r.stock, "|", r.category);
}
if (result.errors.length) {
  console.log("first error:", JSON.stringify(result.errors[0]));
}
const ok =
  result.rows.length === 2 &&
  result.rows.some((r) => r.supplierId === "FZ-XLS1") &&
  result.rows.some((r) => r.supplierId === "FZ-XLS2");
console.log(ok ? "PARSE: PASS (2/2 rows matched incl. human-variant headers)" : "PARSE: FAIL");
process.exit(ok ? 0 : 1);