#!/usr/bin/env bun
/**
 * scripts/test-catalogue-facets.ts — the catalogue filter facet rules.
 *
 * Run:  bun run test:facets   (or: bun ./scripts/test-catalogue-facets.ts)
 *
 * Covers src/lib/facets.ts — the normalisation that turns the supplier rows'
 * verbatim stored values into clean filter dropdowns, WITHOUT touching stored
 * data or the import pipeline:
 *
 *   1. BRAND — the feed's brand column carries sub-brand strings ("Wolfrace
 *      Eurosport", "Wolfrace 71", "Wolfrace Explorer", "Wolfrace Vanspeed",
 *      "Wolfrace Eurosport TUV", "Wolfhart Flowformed"). The facet collapses
 *      every Wolfrace-family value onto "Wolfrace" (prefix rule; Wolfhart is
 *      Wolfrace's flow-formed range — same feed, same wolfrace.co.uk
 *      catalogue). Unknown brands pass through verbatim, so a future supplier
 *      ("Automotive Wheels UK") facets correctly with no code change.
 *   2. MODEL — the feed's design column is NOT persisted separately: the
 *      importer composes name = design + " " + colour. The facet recovers the
 *      design by stripping the colour suffix (exact inverse of the importer's
 *      composition); names that do not end in the colour are models as-is.
 *   3. OFFSET (ET) — stored as "ET38"…/"ET25" plus a bare "0". The facet value
 *      is the leading numeric ET; labelled display shows the bare number under
 *      the "Offset (ET)" label; anything with extra supplier content (the
 *      importer's "(blank)" range markers) is never rewritten.
 *   4. LOAD — tyre rows store the marking with the speed letter fused on
 *      ("91Y", "96Y XL", "91H"). The facet is the leading number only; the
 *      speed letter and the "XL" marker are NOT load index. No number → no
 *      facet value (never invented) until the owner re-imports the tyre feeds.
 *   5. IMPORT ROUND-TRIP — a Wolfrace trade-export row mapped by
 *      mapFeedRowToProduct, persisted with productToRow and read back with
 *      rowToProduct still facets correctly: re-imports cannot break these
 *      dropdowns.
 */
import {
  facetOptions,
  normaliseWheelBrand,
  tyreLoadIndexValue,
  wheelModelFromName,
  wheelOffsetDisplay,
  wheelOffsetEt,
} from "../src/lib/facets";
import { mapFeedRowToProduct, parseSupplierCsv } from "../src/lib/import";
import { productToRow } from "../src/lib/importPersistence";
import { rowToProduct } from "../src/lib/store";
import type { Product, ProductRow } from "../src/lib/store";
import type { Wheel } from "../src/data/products";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ── 1. Brand normalisation (values observed in the live DB) ──────────────── */
console.log("brand — sub-brand strings collapse to the real brand");
check("Wolfrace Eurosport → Wolfrace", normaliseWheelBrand("Wolfrace Eurosport") === "Wolfrace");
check("Wolfrace 71 → Wolfrace", normaliseWheelBrand("Wolfrace 71") === "Wolfrace");
check("Wolfrace Explorer → Wolfrace", normaliseWheelBrand("Wolfrace Explorer") === "Wolfrace");
check("Wolfrace Vanspeed → Wolfrace", normaliseWheelBrand("Wolfrace Vanspeed") === "Wolfrace");
check(
  "Wolfrace Eurosport TUV → Wolfrace",
  normaliseWheelBrand("Wolfrace Eurosport TUV") === "Wolfrace",
);
check("Wolfhart Flowformed → Wolfrace", normaliseWheelBrand("Wolfhart Flowformed") === "Wolfrace");
check("Forzza stays Forzza", normaliseWheelBrand("Forzza") === "Forzza");
check(
  "Automotive Wheels UK (the coming feed) stays whole",
  normaliseWheelBrand("Automotive Wheels UK") === "Automotive Wheels UK",
);
check(
  "case-insensitive prefix match",
  normaliseWheelBrand("wolfrace eurosport") === "Wolfrace" &&
    normaliseWheelBrand("AUTOMOTIVE WHEELS UK") === "Automotive Wheels UK",
);
check("unknown brand passes through verbatim", normaliseWheelBrand("Borbet") === "Borbet");
check("empty brand → empty", normaliseWheelBrand("") === "" && normaliseWheelBrand(undefined) === "");

/** The seven brand values exactly as stored on the live wheel rows today. */
const LIVE_DB_BRANDS = [
  "Forzza",
  "Wolfrace 71",
  "Wolfrace Eurosport",
  "Wolfrace Explorer",
  "Wolfhart Flowformed",
  "Wolfrace Vanspeed",
  "Wolfrace Eurosport TUV",
];
check(
  "the 7 live brand values facet to exactly Forzza + Wolfrace",
  JSON.stringify(facetOptions(LIVE_DB_BRANDS.map(normaliseWheelBrand)).map((o) => o.value)) ===
    JSON.stringify(["Forzza", "Wolfrace"]),
);

/* ── 2. Model (design) recovery from the importer-composed name ───────────── */
console.log("model — the feed's design value recovered from the product name");
// Shapes straight from the importer's own composition (design + " " + colour):
check(
  "Venom Gloss Raven Black − colour → Venom",
  wheelModelFromName("Venom Gloss Raven Black", "Gloss Raven Black") === "Venom",
);
check(
  "Wolfsburg GTR Gloss Raven Black − colour → Wolfsburg GTR",
  wheelModelFromName("Wolfsburg GTR Gloss Raven Black", "Gloss Raven Black") === "Wolfsburg GTR",
);
check(
  "Genesis 2 Gloss Black Polished Face − colour → Genesis 2",
  wheelModelFromName("Genesis 2 Gloss Black Polished Face", "Gloss Black Polished Face") ===
    "Genesis 2",
);
check(
  "Astorga Polar Silver − colour → Astorga",
  wheelModelFromName("Astorga Polar Silver", "Polar Silver") === "Astorga",
);
check(
  "Slotmag Matt Black Matt Gunmetal − colour → Slotmag",
  wheelModelFromName("Slotmag Matt Black Matt Gunmetal", "Matt Black Matt Gunmetal") === "Slotmag",
);
check(
  "Sahara Matt Black Black Rivets − colour → Sahara",
  wheelModelFromName("Sahara Matt Black Black Rivets", "Matt Black Black Rivets") === "Sahara",
);
// The sample Forzza rows: the name does NOT end with the colour → the full name
// is the model (nothing invented, nothing stripped).
check(
  "Grip G-9 keeps its full name (colour is not a suffix)",
  wheelModelFromName("Grip G-9", "Gloss Black") === "Grip G-9",
);
check("no colour → the full name", wheelModelFromName("Forza R1", "") === "Forza R1");
check("colour longer than name → the full name", wheelModelFromName("Venom", "Gloss Raven Black Longer") === "Venom");
check("case-insensitive suffix match", wheelModelFromName("venom GLOSS RAVEN BLACK", "Gloss Raven Black") === "venom");
check("empty name → empty", wheelModelFromName("", "Gloss Black") === "");

/* ── 3. Offset (ET) ───────────────────────────────────────────────────────── */
console.log("offset — stored 'ET38'/'0' shapes → numeric facet + labelled display");
check("ET38 → 38", wheelOffsetEt("ET38") === "38");
check("bare 38 → 38", wheelOffsetEt("38") === "38");
check("zero offset '0' → 0", wheelOffsetEt("0") === "0");
check("lowercase et40 → 40", wheelOffsetEt("et40") === "40");
check("ET25 → 25", wheelOffsetEt("ET25") === "25");
check(
  "blank-wheel range marker keeps its leading ET",
  wheelOffsetEt("ET35–ET42 (blank)") === "35",
);
check("empty offset → empty", wheelOffsetEt("") === "" && wheelOffsetEt(undefined) === "");
check("unparseable offset passes through verbatim (never invented)", wheelOffsetEt("varies") === "varies");
check(
  "display: ET38 → 38 under the Offset (ET) label",
  wheelOffsetDisplay("ET38") === "38" && wheelOffsetDisplay("0") === "0",
);
check(
  "display: the (blank) range marker is NEVER rewritten",
  wheelOffsetDisplay("ET35–ET42 (blank)") === "ET35–ET42 (blank)",
);
/** The sixteen offset values exactly as stored on the live wheel rows today. */
const LIVE_DB_OFFSETS = [
  "ET38","ET40","ET42","ET49","ET45","ET48","ET50","ET35",
  "ET34","ET32","ET30","ET46","ET28","ET36","0","ET25",
];
check(
  "the 16 live offset values facet to 16 numeric values in numeric order",
  JSON.stringify(facetOptions(LIVE_DB_OFFSETS.map(wheelOffsetEt), "numeric").map((o) => o.value)) ===
    JSON.stringify(["0","25","28","30","32","34","35","36","38","40","42","45","46","48","49","50"]),
);

/* ── 4. Tyre load index ───────────────────────────────────────────────────── */
console.log("load — the numeric weight code, never the speed letter / XL marker");
check("91Y → 91", tyreLoadIndexValue("91Y") === "91");
check("96Y XL → 96", tyreLoadIndexValue("96Y XL") === "96");
check("91H → 91", tyreLoadIndexValue("91H") === "91");
check("marking with spaces ('Load 91 Y' style) → 91", tyreLoadIndexValue("Load 91 Y") === "91");
check("empty marking → empty (never invented)", tyreLoadIndexValue("") === "" && tyreLoadIndexValue(undefined) === "");
check("marking with no number → empty", tyreLoadIndexValue("XL") === "");
check(
  "speed letter is NOT the load index",
  tyreLoadIndexValue("91Y") !== "Y" && tyreLoadIndexValue("91H") !== "H",
);
check(
  "live tyre markings facet to a numeric order",
  JSON.stringify(facetOptions(["91Y", "96Y XL", "91H"].map(tyreLoadIndexValue), "numeric").map((o) => o.value)) ===
    JSON.stringify(["91", "96"]),
);

/* ── facetOptions plumbing ────────────────────────────────────────────────── */
console.log("facetOptions — dedupe, drop empties, numeric/alpha order");
check(
  "dedupe + drop empties",
  JSON.stringify(facetOptions(["38", "", "38", "25"])) ===
    JSON.stringify([{ value: "25", label: "25" }, { value: "38", label: "38" }]),
);
check(
  "alpha sort",
  JSON.stringify(facetOptions(["Wolfrace", "Forzza", "Borbet"]).map((o) => o.value)) ===
    JSON.stringify(["Borbet", "Forzza", "Wolfrace"]),
);
check(
  "numeric sort puts non-numeric leftovers last",
  JSON.stringify(facetOptions(["38", "varies", "9"], "numeric").map((o) => o.value)) ===
    JSON.stringify(["9", "38", "varies"]),
);
check("value === label (URL param, filter and option text cannot drift)", facetOptions(["38"]).every((o) => o.value === o.label));

/* ── 5. Import round-trip: facets survive map → persist → readback ────────── */
console.log("import round-trip — re-imports cannot break the facets");
// Real, trimmed rows from the owner's Wolfrace trade export (same fixtures the
// wheel-pricing suite uses): sub-brand + design + colour + offset in the feed's
// own column names.
const WOLFRACE_HEADER =
  "UK stock,Europe stock,Total stock,sku,blank part number,brand,design,color,width,diameter,wheelSize,offset,offset blanks,pcd,pcd_2,loadRating,centreBore,weight,tradePrice,retailExVat,retailIncVat,image url,origin,EAN,TUV";
const WOLFRACE_ROWS = [
  "217,0,217,WOF12058020BLK38,,Wolfrace Eurosport,Wolfsburg,Gloss Black,8,20,8x20,38,,5x120,,1100,110,12.2,112.5,135,162,https://www.wolfrace.co.uk/images/alloywheels/WOFBLK2.webp,china,,",
  "1,0,1,WVN11211458518GBBE40,,Wolfrace 71,Venom,Gloss Raven Black,8.5,18,8.5x18,40,,5x112,5x114.3,900,110,11.7,94.5,131.25,157.5,https://www.wolfrace.co.uk/images/71/WVNGBBE.png,china,,",
  "58,0,58,WGEN11259020BKM38,,Wolfhart Flowformed,Genesis 2,Gloss Black Polished Face,9,20,9x20,38,,5x112,,875,72.6,,75,90,108,https://www.wolfrace.co.uk/images/alloywheels/progen2.webp,china,,",
  "0,100,100,AST60537V71-0,,Wolfrace Eurosport TUV,Astorga,Polar Silver,6,15,6x15,37,,5x100,,590,70.1,7.41,88.75,106.5,127.8,https://www.wolfrace.co.uk/images/alloywheels/wolfrace_eurosport_astorga_polar_silver1.webp,poland,4.0597710253e+12,yes",
];
const parsed = parseSupplierCsv([WOLFRACE_HEADER, ...WOLFRACE_ROWS].join("\n") + "\n");
const mapped = parsed.rows.map((r) => mapFeedRowToProduct(r) as Wheel);
check(
  "all four Wolfrace rows map (EXAMPLE-row skip logic is covered by test:wheel-pricing)",
  mapped.length === 4 && mapped.every((w) => !!w.name && !!w.image),
);
check(
  "mapped brand facets to Wolfrace",
  mapped.map((w) => normaliseWheelBrand(w.brand)).every((b) => b === "Wolfrace"),
);
check(
  "mapped name/colour recover the feed's design values",
  JSON.stringify(mapped.map((w) => wheelModelFromName(w.name, w.colour))) ===
    JSON.stringify(["Wolfsburg", "Venom", "Genesis 2", "Astorga"]),
);
check(
  "mapped offsets facet to the feed's numeric ETs",
  JSON.stringify(mapped.map((w) => wheelOffsetEt(w.size.offset))) ===
    JSON.stringify(["38", "40", "38", "37"]),
);
const roundTripped: Product[] = mapped.map((w) => {
  const r = productToRow(w);
  if (!r.ok) throw new Error(`productToRow failed: ${r.reason}`);
  return rowToProduct({ ...(r.row as ProductRow) })!;
});
check(
  "persisted + read-back rows facet identically (brand/model/offset)",
  JSON.stringify(roundTripped.map((p) => (p as Wheel).brand)) ===
    JSON.stringify(mapped.map((w) => w.brand)) &&
    JSON.stringify(roundTripped.map((p) => wheelModelFromName((p as Wheel).name, (p as Wheel).colour))) ===
      JSON.stringify(["Wolfsburg", "Venom", "Genesis 2", "Astorga"]) &&
    JSON.stringify(roundTripped.map((p) => wheelOffsetEt((p as Wheel).size.offset))) ===
      JSON.stringify(["38", "40", "38", "37"]),
);
check(
  "the full imported set facets to exactly one Wolfrace brand option",
  JSON.stringify(facetOptions(roundTripped.map((p) => normaliseWheelBrand((p as Wheel).brand))).map((o) => o.value)) ===
    JSON.stringify(["Wolfrace"]),
);

/* ── summary ──────────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("failures:");
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
