#!/usr/bin/env bun
/**
 * scripts/test-wheel-pricing.ts — the owner's WHEEL PRICING + SHIPPING rules.
 *
 * Run:  bun run test:wheel-pricing   (or: bun ./scripts/test-wheel-pricing.ts)
 *
 * Covers, end to end:
 *   1. THE OWNER'S PRICE RULE (src/lib/pricing.ts, retailIncVatFromFeedPrices):
 *        retailIncVat as published  >  retailExVat × (1 + VAT)  >  trade × 1.2 × 1.2
 *      including the settings that drive it (VAT rate, trade margin multiplier)
 *      and the honest "no usable price" case.
 *   2. THE WOLFRACE EXPORT SHAPE (src/lib/import.ts, feed shape "wheelTrade"):
 *      column mapping, the supplier file's own EXAMPLE row being SKIPPED, rows
 *      with no usable price being SKIPPED, stock counts → stock status, the
 *      geometry/colour mapping, and the price landing as the site retail price.
 *   3. THE COMING TRADE-ONLY FEED (Automotive Wheels UK: trade price WITHOUT
 *      VAT, no retail columns): the SAME trade × 1.2 × 1.2 fallback, proven now
 *      with a synthetic fixture shaped like that feed.
 *   4. PERSISTENCE ROUND-TRIP: the feed's own prices/specs are written into
 *      public.products specs.feed and read back, and a bulk price recalculation
 *      never overwrites a supplier-published retail price.
 *   5. DELIVERY: £20 per wheel, £80 for four, on the basket/checkout totals.
 *
 * Fixtures: real, trimmed rows from the owner's Wolfrace trade export are
 * written to /home/team/shared/fixtures/wolfrace-sample.csv (the EXAMPLE row
 * included on purpose, to prove it is skipped), and the synthetic trade-only
 * feed to /home/team/shared/fixtures/wheels-trade-only-sample.csv.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  DEFAULT_PRICING_SETTINGS,
  gbpToEur,
  getPricingSettings,
  recalculateAllPrices,
  resetPricingSettings,
  retailIncVatFromFeedPrices,
  round2,
  shippingForQuantity,
  wheelShippingPerUnit,
} from "../src/lib/pricing";
import type { PricingSettings } from "../src/lib/pricing";
import {
  detectFeedShape,
  FEED_SHAPES,
  mapFeedRowToProduct,
  parseSupplierCsv,
  SAMPLE_WHEEL_TRADE_CSV,
  stockCodeFromCounts,
  validateWheelTradeRow,
  wheelOffsetLabel,
  wheelWidthLabel,
} from "../src/lib/import";
import { productToRow } from "../src/lib/importPersistence";
import { rowToProduct } from "../src/lib/store";
import type { Product } from "../src/lib/store";
import { addToBasket, basketTotals, shippingLinesForBasket } from "../src/lib/basket";
import { demoAccessories, demoTypes, demoWheels } from "../src/data/products";
import type { Wheel } from "../src/data/products";
import { mapFeedStockToStatus } from "../src/lib/stock";

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
const money = (n: number) => `£${n.toFixed(2)}`;

/* ── The fixture: real, trimmed rows from the owner's Wolfrace export ──────── */
/**
 * Verbatim rows from "wolfrace_trade_export (1).csv" (the owner's file), with
 * the trailing fixed-price/flags columns kept but the middle empty columns
 * trimmed to the ones this pipeline maps. Row 1 is the file's own EXAMPLE
 * template row — included deliberately so the test proves it is skipped.
 */
const WOLFRACE_HEADER =
  "UK stock,Europe stock,Total stock,sku,blank part number,brand,design,color,width,diameter,wheelSize,offset,offset blanks,pcd,pcd_2,loadRating,centreBore,weight,tradePrice,retailExVat,retailIncVat,image url,origin,EAN,TUV";

const WOLFRACE_ROWS: string[] = [
  // The supplier's own template row — must NEVER be imported.
  '0,0,0,EXAMPLE,EXAMPLE,EXAMPLE,Example,EXAMPLE,8,18,8x18,38,,5x100,,1000,84.1,10,90,140,168,,UK,,',
  // UK stock 217; trade 112.50, retail ex VAT 135, retail inc VAT 162 (135 × 1.2).
  "217,0,217,WOF12058020BLK38,,Wolfrace Eurosport,Wolfsburg,Gloss Black,8,20,8x20,38,,5x120,,1100,110,12.2,112.5,135,162,https://www.wolfrace.co.uk/images/alloywheels/WOFBLK2.webp,china,,",
  // Dual PCD (5x112 / 5x114.3) — both must survive; retail inc VAT 157.50.
  "1,0,1,WVN11211458518GBBE40,,Wolfrace 71,Venom,Gloss Raven Black,8.5,18,8.5x18,40,,5x112,5x114.3,900,110,11.7,94.5,131.25,157.5,https://www.wolfrace.co.uk/images/71/WVNGBBE.png,china,,",
  // UK stock 10, retail inc VAT 180.
  "10,0,10,WGTR11211458519GBBE45,,Wolfrace 71,Wolfsburg GTR,Gloss Raven Black,8.5,19,8.5x19,45,,5x112,5x114.3,900,110,12.25,108,150,180,https://www.wolfrace.co.uk/images/alloywheels/WGTRGBBE2.webp,china,,",
  // Europe stock only (UK 0) → orderable, not "In Stock"; TÜV flag + EAN (as the
  // supplier's own file stores it) carried verbatim.
  "0,100,100,AST60537V71-0,,Wolfrace Eurosport TUV,Astorga,Polar Silver,6,15,6x15,37,,5x100,,590,70.1,7.41,88.75,106.5,127.8,https://www.wolfrace.co.uk/images/alloywheels/wolfrace_eurosport_astorga_polar_silver1.webp,poland,4.0597710253e+12,yes",
  // Weight column blank in the source file — nothing may be invented for it.
  "58,0,58,WGEN11259020BKM38,,Wolfhart Flowformed,Genesis 2,Gloss Black Polished Face,9,20,9x20,38,,5x112,,875,72.6,,75,90,108,https://www.wolfrace.co.uk/images/alloywheels/progen2.webp,china,,",
];

const WOLFRACE_FIXTURE = [WOLFRACE_HEADER, ...WOLFRACE_ROWS].join("\n") + "\n";

/**
 * The COMING feed (Automotive Wheels UK): trade price WITHOUT VAT and no retail
 * columns at all — a synthetic fixture in that shape, so the trade × 1.2 × 1.2
 * fallback is proven before the file arrives.
 */
const TRADE_ONLY_FIXTURE = `SKU,Brand,Design,Colour,Width,Diameter,Offset,PCD,UK Stock,Trade Price
AWU-BM18-01,Automotive Wheels UK,Rivet,Gloss Black,8,18,45,5x120,24,120
AWU-BM19-02,Automotive Wheels UK,Rivet,Anthracite,8.5,19,40,5x112,3,145.5
AWU-AU20-03,Automotive Wheels UK,Rivet,Silver,9,20,35,5x114.3,0,99.99
AWU-NOPRICE-04,Automotive Wheels UK,Rivet,Black,8,18,45,5x100,5,
AWU-ZEROSTOCK-05,Automotive Wheels UK,Rivet,Gunmetal,8,17,38,5x100,0,110
`;

const FIXTURE_DIR = "/home/team/shared/fixtures";
const WOLFRACE_FIXTURE_PATH = `${FIXTURE_DIR}/wolfrace-sample.csv`;
const TRADE_ONLY_FIXTURE_PATH = `${FIXTURE_DIR}/wheels-trade-only-sample.csv`;

/* ── 1. The owner's price rule (pure, settings-driven) ────────────────────── */

console.log("pricing — the owner's feed price rule");
const d = DEFAULT_PRICING_SETTINGS;
check(
  "retailIncVat is used exactly as published (Wolfrace: £165.60)",
  retailIncVatFromFeedPrices({ retailIncVatGbp: 165.6 }, d).priceIncVat === 165.6 &&
    retailIncVatFromFeedPrices({ retailIncVatGbp: 165.6 }, d).source === "retailIncVat",
);
check(
  "retailIncVat present wins over the other columns",
  retailIncVatFromFeedPrices({ retailIncVatGbp: 162, retailExVatGbp: 135, tradePriceGbp: 112.5 }, d)
    .priceIncVat === 162,
);
check(
  "retailExVat missing → retailExVat × (1 + VAT): £138 → £165.60",
  retailIncVatFromFeedPrices({ retailExVatGbp: 138 }, d).priceIncVat === 165.6 &&
    retailIncVatFromFeedPrices({ retailExVatGbp: 138 }, d).source === "retailExVat",
);
check(
  "retailIncVat of 0 falls through to retailExVat (never a £0 product)",
  retailIncVatFromFeedPrices({ retailIncVatGbp: 0, retailExVatGbp: 135 }, d).priceIncVat === 162,
);
check(
  "trade-only feed → trade × 1.2 margin × 1.2 VAT = ×1.44: £112.50 → £162.00",
  retailIncVatFromFeedPrices({ tradePriceGbp: 112.5 }, d).priceIncVat === 162 &&
    retailIncVatFromFeedPrices({ tradePriceGbp: 112.5 }, d).source === "tradePrice",
);
check(
  "trade-only: £115 → £165.60 (the Wolfrace EXAMPLE row's own numbers)",
  retailIncVatFromFeedPrices({ tradePriceGbp: 115 }, d).priceIncVat === 165.6,
);
check(
  "trade-only: £90 → £129.60",
  retailIncVatFromFeedPrices({ tradePriceGbp: 90 }, d).priceIncVat === 129.6,
);
check(
  "no usable price at all → 0 with source 'none' (the importer skips such a row)",
  retailIncVatFromFeedPrices({}, d).priceIncVat === 0 &&
    retailIncVatFromFeedPrices({}, d).source === "none" &&
    retailIncVatFromFeedPrices({ retailIncVatGbp: 0, retailExVatGbp: 0, tradePriceGbp: 0 }, d).source === "none",
);
const lowVat: PricingSettings = { ...d, vatRate: 0.05 };
check(
  "the VAT step is settings-driven, not hard-coded",
  retailIncVatFromFeedPrices({ retailExVatGbp: 100 }, lowVat).priceIncVat === 105 &&
    retailIncVatFromFeedPrices({ tradePriceGbp: 100 }, lowVat).priceIncVat === 126,
);
const bigMargin: PricingSettings = { ...d, tradeMarginMultiplier: 1.5 };
check(
  "the trade margin multiplier is settings-driven (×1.5 → £112.50 → £202.50)",
  retailIncVatFromFeedPrices({ tradePriceGbp: 112.5 }, bigMargin).priceIncVat === 202.5,
);
check(
  "a GBP feed price converts to the engine's EUR figure at the settings rate",
  gbpToEur(115, d) === round2(115 / 0.86) && gbpToEur(0, d) === 0,
);

/* ── 2. The Wolfrace export shape ─────────────────────────────────────────── */

console.log("\nimport — Wolfrace trade export (real rows, EXAMPLE row included)");
mkdirSync(FIXTURE_DIR, { recursive: true });
writeFileSync(WOLFRACE_FIXTURE_PATH, WOLFRACE_FIXTURE, "utf8");
writeFileSync(TRADE_ONLY_FIXTURE_PATH, TRADE_ONLY_FIXTURE, "utf8");
check(
  "fixtures written to /home/team/shared/fixtures",
  existsSync(WOLFRACE_FIXTURE_PATH) && existsSync(TRADE_ONLY_FIXTURE_PATH),
  `${WOLFRACE_FIXTURE_PATH} + ${TRADE_ONLY_FIXTURE_PATH}`,
);

const fromDisk = readFileSync(WOLFRACE_FIXTURE_PATH, "utf8");
const parsed = parseSupplierCsv(fromDisk);
check(
  "the header row selects the GBP wheel-trade mapping",
  parsed.shape === "wheelTrade" && parsed.shapeLabel === FEED_SHAPES.wheelTrade.label,
  parsed.shape,
);
check(
  "5 real rows imported, 1 skipped (the file's own EXAMPLE row), 0 rejected",
  parsed.imported === 5 && parsed.skipped === 1 && parsed.failed === 0,
  `imported=${parsed.imported} skipped=${parsed.skipped} failed=${parsed.failed}`,
);
check(
  "the skip reason names the EXAMPLE/template row",
  /EXAMPLE/i.test(parsed.skips[0]?.message ?? "") && parsed.skips[0]?.row === 1,
  parsed.skips[0]?.message,
);
check(
  "the EXAMPLE row is nowhere in the imported rows",
  !parsed.rows.some((r) => r.supplierId.toUpperCase() === "EXAMPLE") &&
    !parsed.rows.some((r) => r.name.toUpperCase().includes("EXAMPLE")),
);

const wof = parsed.rows[0];
check(
  "column mapping: sku → supplierId, brand+design+colour → name, colour → colour/finish",
  wof.supplierId === "WOF12058020BLK38" &&
    wof.brand === "Wolfrace Eurosport" &&
    wof.name === "Wolfsburg Gloss Black" &&
    wof.colour === "Gloss Black" &&
    wof.finish === "Gloss Black",
  `${wof.supplierId} · ${wof.brand} · ${wof.name}`,
);
check(
  "geometry mapping: width → 8J, diameter → 20, offset → ET38, pcd → 5x120",
  wof.width === "8J" && wof.diameter === 20 && wof.offset === "ET38" && wof.pcd === "5x120",
  `${wof.diameter}" × ${wof.width} · ${wof.pcd} · ${wof.offset}`,
);
check(
  "a dual-drilled wheel keeps BOTH pcd values",
  parsed.rows[1].pcd === "5x112 / 5x114.3",
  parsed.rows[1].pcd,
);
check(
  "helper labels: bare widths get the J bead profile, offsets get ET",
  wheelWidthLabel("8") === "8J" &&
    wheelWidthLabel("8.5") === "8.5J" &&
    wheelWidthLabel("8.5J") === "8.5J" &&
    wheelOffsetLabel("38") === "ET38" &&
    wheelOffsetLabel("ET40") === "ET40",
  `${wheelWidthLabel("8.5")} / ${wheelOffsetLabel("38")}`,
);
check(
  "blank (undrilled) wheels report an offset RANGE, not an invented offset",
  wheelOffsetLabel("", "20", "40") === "ET20–ET40 (blank)",
  wheelOffsetLabel("", "20", "40"),
);
check(
  "feed values we carry verbatim: wheelSize, loadRating, centreBore, weight",
  wof.feedExtra?.wheelSize === "8x20" &&
    wof.feedExtra?.loadRating === "1100" &&
    wof.feedExtra?.centreBore === "110" &&
    wof.feedExtra?.weight === "12.2" &&
    wof.feedExtra?.origin === "china",
  JSON.stringify(wof.feedExtra),
);
check(
  "a blank weight cell stays absent (nothing invented)",
  parsed.rows[4].supplierId === "WGEN11259020BKM38" &&
    parsed.rows[4].feedExtra?.weight === undefined,
  JSON.stringify(parsed.rows[4].feedExtra),
);
check(
  "the TÜV flag and EAN the supplier publishes are carried verbatim",
  parsed.rows[3].feedExtra?.tuv === "yes" && parsed.rows[3].feedExtra?.ean === "4.0597710253e+12",
  JSON.stringify(parsed.rows[3].feedExtra),
);
check(
  "the feed's own price columns are carried on the row",
  wof.tradePriceGbp === 112.5 && wof.retailExVatGbp === 135 && wof.retailIncVatGbp === 162,
  `${wof.tradePriceGbp} / ${wof.retailExVatGbp} / ${wof.retailIncVatGbp}`,
);
check(
  "the file's own numbers agree with the owner's rule (trade ×1.44 = retailIncVat)",
  round2(wof.tradePriceGbp! * 1.44) === wof.retailIncVatGbp &&
    round2(wof.retailExVatGbp! * 1.2) === wof.retailIncVatGbp,
);

console.log("\nimport — stock counts → stock status");
check(
  "UK stock 217 → in_stock",
  wof.stock === "in_stock" && mapFeedStockToStatus(wof.stock) === "In Stock",
  `${wof.stock} (uk ${wof.ukStock}, eu ${wof.europeStock}, total ${wof.totalStock})`,
);
check(
  "UK 0 with Europe stock 100 → available_to_order (orderable, NOT claimed in stock)",
  parsed.rows[3].stock === "available_to_order" &&
    mapFeedStockToStatus(parsed.rows[3].stock) === "Available to order",
  `uk ${parsed.rows[3].ukStock} / eu ${parsed.rows[3].europeStock}`,
);
check(
  "no stock anywhere → out_of_stock (never a guessed status)",
  stockCodeFromCounts(0, 0) === "out_of_stock" &&
    stockCodeFromCounts(undefined, undefined) === "out_of_stock" &&
    mapFeedStockToStatus(stockCodeFromCounts(0, 0)) === "Out of stock",
);
check(
  "the raw counts are kept on the row, so the status is not all we know",
  parsed.rows[0].ukStock === 217 && parsed.rows[0].totalStock === 217 && parsed.rows[3].europeStock === 100,
);

console.log("\nimport — mapped products + the owner's retail price");
const mapped = parsed.rows.map((r) => mapFeedRowToProduct(r));
check("every imported row maps to a wheel", mapped.every((p) => p?.category === "wheels"), `${mapped.length} rows`);
const wofWheel = mapped[0] as Wheel;
check(
  "the site retail price IS the feed's retailIncVat (£162.00), not a re-derived figure",
  wofWheel.retailPriceIncVat === 162,
  money(wofWheel.retailPriceIncVat),
);
check(
  "the EUR figure stored on the model is the feed's trade price converted",
  wofWheel.supplierPriceEur === gbpToEur(112.5, d),
  `${wofWheel.supplierPriceEur} EUR`,
);
check(
  "the wheel carries the feed's published prices + counts + spec columns",
  wofWheel.feedAttributes?.priceSource === "retailIncVat" &&
    wofWheel.feedAttributes?.retailIncVatGbp === 162 &&
    wofWheel.feedAttributes?.tradePriceGbp === 112.5 &&
    wofWheel.feedAttributes?.ukStock === 217 &&
    wofWheel.feedAttributes?.extra?.centreBore === "110",
  JSON.stringify(wofWheel.feedAttributes),
);
check(
  "no mapped product can be the EXAMPLE row",
  !mapped.some((p) => (p?.id ?? "").includes("example") || p?.supplierId.toUpperCase() === "EXAMPLE"),
);
const defaultParse = parseSupplierCsv(SAMPLE_WHEEL_TRADE_CSV);
check(
  "the embedded GBP sample row set parses and prices too",
  defaultParse.shape === "wheelTrade" &&
    defaultParse.imported === 2 &&
    defaultParse.failed === 0 &&
    (mapFeedRowToProduct(defaultParse.rows[1]) as Wheel).retailPriceIncVat === 157.5,
  `imported=${defaultParse.imported} failed=${defaultParse.failed}`,
);

console.log("\nimport — persistence round-trip stays honest");
const row = productToRow(wofWheel);
check(
  "productToRow writes specs.feed (the feed's own prices/specs) alongside the price",
  row.ok &&
    row.row.price_gbp === 162 &&
    row.row.id === "imp-wof12058020blk38" &&
    (row.row.specs as Record<string, unknown>).feed !== undefined &&
    (row.row.specs as Record<string, unknown>).width === "8J",
  row.ok ? `id=${row.row.id} price=${String(row.row.price_gbp)}` : row.reason,
);
const back = row.ok ? rowToProduct({ ...row.row, created_at: undefined, updated_at: undefined }) : null;
check(
  "the row reads back with its feed prices, stock status and geometry intact",
  !!back &&
    back.category === "wheels" &&
    "size" in back &&
    back.size.width === "8J" &&
    back.retailPriceIncVat === 162 &&
    back.stockStatus === "In Stock" &&
    (back as Wheel).feedAttributes?.priceSource === "retailIncVat",
  back ? `${back.id} ${money(back.retailPriceIncVat)} ${back.stockStatus}` : "no round-trip",
);
const catalogue: Product[] = [...(mapped.filter(Boolean) as Product[])];
const before = catalogue.map((p) => p.retailPriceIncVat);
const recalc = recalculateAllPrices(catalogue);
check(
  "a bulk recalculation leaves feed-published retail prices untouched (and says so)",
  recalc.skippedFeedPriced === catalogue.length &&
    catalogue.every((p, i) => p.retailPriceIncVat === before[i]),
  `skipped=${recalc.skippedFeedPriced}/${catalogue.length}, changed=${recalc.changed}`,
);
resetPricingSettings();
const sampleRecalc = recalculateAllPrices([demoWheels[0]]);
check(
  "sample (EUR-list) wheels ARE still recalculated by the engine",
  sampleRecalc.skippedFeedPriced === 0 && sampleRecalc.count === 1,
  `skipped=${sampleRecalc.skippedFeedPriced}`,
);

/* ── 3. The coming trade-only feed (no retail columns at all) ─────────────── */

console.log("\nimport — trade-only feed (Automotive Wheels UK shape, trade price ex VAT only)");
const tradeOnly = parseSupplierCsv(readFileSync(TRADE_ONLY_FIXTURE_PATH, "utf8"));
check(
  "the trade-only header row also selects the wheel-trade mapping",
  tradeOnly.shape === "wheelTrade",
  tradeOnly.shape,
);
check(
  "3 priced rows imported, 1 skipped for having NO price, 1 zero-stock row imported",
  tradeOnly.imported === 4 && tradeOnly.skipped === 1 && tradeOnly.failed === 0,
  `imported=${tradeOnly.imported} skipped=${tradeOnly.skipped} failed=${tradeOnly.failed}`,
);
check(
  "the no-price row is skipped with an honest reason (never priced by guesswork)",
  tradeOnly.skips[0]?.row === 4 && /No usable price/i.test(tradeOnly.skips[0]?.message ?? ""),
  tradeOnly.skips[0]?.message,
);
const tradeMapped = tradeOnly.rows.map((r) => mapFeedRowToProduct(r) as Wheel);
check(
  "trade £120 → retail £172.80 (×1.2 margin ×1.2 VAT)",
  tradeMapped[0].retailPriceIncVat === 172.8,
  money(tradeMapped[0].retailPriceIncVat),
);
check(
  "trade £145.50 → retail £209.52 (the £/p fractions are not rounded away)",
  tradeMapped[1].retailPriceIncVat === 209.52,
  money(tradeMapped[1].retailPriceIncVat),
);
check(
  "the price source is recorded as tradePrice on every trade-only wheel",
  tradeMapped.every((w) => w.feedAttributes?.priceSource === "tradePrice"),
);
check(
  "no-price row: nothing at all was made up for it",
  tradeOnly.rows.every((r) => r.supplierId !== "AWU-NOPRICE-04"),
);
check(
  "alternate headers still map (SKU/Brand/Design/Colour/Width/Diameter/PCD/UK Stock/Trade Price)",
  tradeOnly.rows[0].supplierId === "AWU-BM18-01" &&
    tradeOnly.rows[0].name === "Rivet Gloss Black" &&
    tradeOnly.rows[0].width === "8J" &&
    tradeOnly.rows[0].offset === "ET45" &&
    tradeOnly.rows[0].stock === "in_stock",
  `${tradeOnly.rows[0].supplierId} · ${tradeOnly.rows[0].name} · ${tradeOnly.rows[0].offset}`,
);
check(
  "zero-stock trade-only row maps to out_of_stock but is still imported",
  tradeOnly.rows[2].stock === "out_of_stock" &&
    (mapFeedRowToProduct(tradeOnly.rows[2]) as Wheel).stockStatus === "Out of stock",
  tradeOnly.rows[2].stock,
);
const tradeRow = validateWheelTradeRow({ supplierid: "X", brand: "B", design: "D" }, 1);
check(
  "a wheel-trade row with no price is a SKIP, not a validation error",
  tradeRow.row === null && tradeRow.errors.length === 0 && /No usable price/i.test(tradeRow.skip ?? ""),
);
const exampleRow = validateWheelTradeRow(
  { supplierid: "EXAMPLE", brand: "EXAMPLE", design: "Example", tradeprice: "90" },
  1,
);
check(
  "the EXAMPLE row is skipped even though it carries a perfectly good price",
  exampleRow.row === null && /EXAMPLE/i.test(exampleRow.skip ?? ""),
);

/* ── 4. Delivery: £20 per wheel ──────────────────────────────────────────── */

console.log("\ndelivery — £20 per wheel, settings-driven");
resetPricingSettings();
const s = getPricingSettings();
check("the per-wheel rate is the owner's £20", wheelShippingPerUnit(s) === 20, money(wheelShippingPerUnit(s)));
check(
  "1 / 2 / 4 wheels = £20 / £40 / £80",
  shippingForQuantity(1, s) === 20 && shippingForQuantity(2, s) === 40 && shippingForQuantity(4, s) === 80,
  `${money(shippingForQuantity(1, s))} / ${money(shippingForQuantity(2, s))} / ${money(shippingForQuantity(4, s))}`,
);
check("no wheels, no delivery charge", shippingForQuantity(0, s) === 0);
check(
  "the per-wheel rate is a setting, not a hard-coded number",
  shippingForQuantity(4, { ...s, wheelShippingPerUnit: 12.5 }) === 50,
  money(shippingForQuantity(4, { ...s, wheelShippingPerUnit: 12.5 })),
);

const wheel = demoWheels[0];
const tyre = demoTypes[0];
const accessory = demoAccessories[0];
const oneWheel = basketTotals(addToBasket([], wheel, 1), s);
const fourWheels = basketTotals(addToBasket([], wheel, 4), s);
const mixed = basketTotals(addToBasket(addToBasket(addToBasket([], wheel, 1), tyre, 1), accessory, 1), s);
check("basket: 1 wheel → £20 delivery", oneWheel.shipping === 20, money(oneWheel.shipping));
check("basket: 4 wheels → £80 delivery", fourWheels.shipping === 80, money(fourWheels.shipping));
check(
  "basket: mixed wheel/tyre/accessory → £20 + £14 + £6",
  mixed.shipping === 40,
  money(mixed.shipping),
);
check(
  "the delivery line spells the per-wheel calculation out for the customer",
  shippingLinesForBasket(addToBasket([], wheel, 4), s)[0]?.label === "4 wheels × £20.00 per wheel",
  shippingLinesForBasket(addToBasket([], wheel, 4), s)[0]?.label,
);
check(
  "delivery is added ON TOP of the parts total (what checkout shows)",
  fourWheels.totalIncVat === round2(fourWheels.subtotalIncVat + 80) &&
    fourWheels.totalIncVat - fourWheels.subtotalIncVat === 80,
  `${money(fourWheels.subtotalIncVat)} + ${money(fourWheels.shipping)} = ${money(fourWheels.totalIncVat)}`,
);
check(
  "tyres/accessories keep their existing per-order delivery (unchanged)",
  basketTotals(addToBasket([], tyre, 4), s).shipping === 14 &&
    basketTotals(addToBasket([], accessory, 2), s).shipping === 6,
);

/* ── 5. The owner's real export, end to end (when the file is present) ────── */

console.log("\nimport — the owner's full export on disk (sanity check)");
const OWNER_FILE = "/home/team/shared/wolfrace_trade_export (1).csv";
if (existsSync(OWNER_FILE)) {
  const full = parseSupplierCsv(readFileSync(OWNER_FILE, "utf8"));
  check(
    "3,749 data rows → 3,660 wheels imported, the EXAMPLE row skipped (1)",
    full.imported === 3660 && full.skipped === 1,
    `imported=${full.imported} skipped=${full.skipped} failed=${full.failed}`,
  );
  // 89 rows in the owner's export carry no PCD at all (blank/undrilled wheels).
  // They are REJECTED with one honest reason each — never given an invented PCD.
  check(
    "every rejected row is a blank-wheel row with no PCD (one honest reason each)",
    full.failed === 89 &&
      full.errors.length === 89 &&
      full.errors.every((e) => e.message === "wheels require a pcd."),
    `failed=${full.failed}: ${[...new Set(full.errors.map((e) => e.message))].join(" | ")}`,
  );
  check(
    "every full-file row carries the supplier's own retailIncVat price",
    full.rows.every((r) => r.retailIncVatGbp !== undefined) &&
      full.rows.every((r) => Number.isFinite(r.retailIncVatGbp)),
  );
  const fullMapped = mapFeedRowToProduct(full.rows[0]) as Wheel;
  check(
    "a mapped row from the full file prices at its published retailIncVat",
    fullMapped.retailPriceIncVat === full.rows[0].retailIncVatGbp,
    `${fullMapped.supplierId} → ${money(fullMapped.retailPriceIncVat)}`,
  );
} else {
  console.log("  (owner's export not on disk — full-file sanity check skipped)");
}

console.log("---");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fails.length) console.log(fails.map((f) => ` - ${f}`).join("\n"));
process.exit(fail === 0 ? 0 : 1);
