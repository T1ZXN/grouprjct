#!/usr/bin/env bun
/**
 * scripts/test-basket.ts — basket model tests (src/lib/basket.ts).
 *
 * Covers: add / merge / quantity / remove / clear, order-level totals built
 * from the pricing settings (never hard-coded), localStorage round-trip and
 * tolerance to corrupted stored baskets, and that every sample product can be
 * put in the basket with its displayed price and spec line.
 *
 * Run:  bun run test:basket     (or: bun ./scripts/test-basket.ts)
 */
import {
  addToBasket,
  basketCategoryLabel,
  basketCount,
  basketSummaryLines,
  basketTotals,
  BASKET_STORAGE_KEY,
  clampQuantity,
  clearBasket,
  lineFromProduct,
  lineKey,
  lineTotal,
  MAX_LINE_QUANTITY,
  parseBasket,
  removeFromBasket,
  serializeBasket,
  setLineQuantity,
  shippingLinesForBasket,
  specForProduct,
  unitNoteForCategory,
} from "../src/lib/basket";
import type { BasketLine } from "../src/lib/basket";
import {
  demoAccessories,
  demoAllProducts,
  demoPackages,
  demoTypes,
  demoWheels,
  tyreSizeLabel,
  wheelSizeLabel,
} from "../src/data/products";
import {
  DEFAULT_PRICING_SETTINGS,
  resetPricingSettings,
  round2,
} from "../src/lib/pricing";

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

resetPricingSettings();
const settings = DEFAULT_PRICING_SETTINGS;
const wheel = demoWheels[0];
const tyre = demoTypes[0];
const pkg = demoPackages[0];
const accessory = demoAccessories[0];

console.log("basket — add / merge / remove");
const empty: BasketLine[] = [];
const withWheel = addToBasket(empty, wheel, 1);
check("empty basket stays empty until something is added", empty.length === 0);
check(
  "adding a wheel creates one line with quantity 1",
  withWheel.length === 1 && withWheel[0].quantity === 1,
);
check(
  "the line snapshots the price the product page displays",
  withWheel[0].unitPriceIncVat === wheel.retailPriceIncVat &&
    withWheel[0].unitPriceIncVat > 0,
);
check(
  "the line spec matches the product page spec format",
  withWheel[0].spec === specForProduct(wheel) &&
    withWheel[0].spec.includes(wheelSizeLabel(wheel.size)),
  withWheel[0].spec,
);
check(
  "adding the same product again merges instead of duplicating",
  addToBasket(withWheel, wheel, 2).length === 1 &&
    addToBasket(withWheel, wheel, 2)[0].quantity === 3,
);
check(
  "addToBasket never mutates the array it was given",
  withWheel.length === 1 && withWheel[0].quantity === 1,
);
const mixed = addToBasket(addToBasket(withWheel, tyre, 1), accessory, 1);
check("different products create different lines", mixed.length === 3);
check(
  "lineKey is category + product id",
  lineKey(mixed[1]) === `tyres:${tyre.id}`,
  lineKey(mixed[1]),
);
check(
  "basketCount sums units across lines",
  basketCount([...mixed, ...addToBasket([], pkg, 2)]) === 1 + 1 + 1 + 2,
);

console.log("basket — quantities");
const qty3 = setLineQuantity(withWheel, lineKey(withWheel[0]), 3);
check("setting a quantity updates the line", qty3[0].quantity === 3);
check(
  "line total = unit price × quantity",
  lineTotal(qty3[0]) === round2(wheel.retailPriceIncVat * 3),
  money(lineTotal(qty3[0])),
);
check(
  "quantity is clamped to at least 1",
  setLineQuantity(qty3, lineKey(qty3[0]), 0)[0].quantity === 1,
);
check(
  "negative and NaN quantities clamp to 1",
  clampQuantity(-4) === 1 && clampQuantity(Number.NaN) === 1,
);
check(
  "quantity is clamped to the maximum",
  clampQuantity(5000) === MAX_LINE_QUANTITY &&
    setLineQuantity(qty3, lineKey(qty3[0]), 5000)[0].quantity ===
      MAX_LINE_QUANTITY,
);
check("fractional quantities become whole numbers", clampQuantity(2.9) === 2);
const removed = removeFromBasket(mixed, lineKey(mixed[1]));
check(
  "removing a line removes only that line",
  removed.length === 2 && !removed.some((l) => l.id === tyre.id),
);
check("clearing empties the basket", clearBasket().length === 0);
check(
  "unit notes are per category and honest about the unit",
  /per wheel/i.test(unitNoteForCategory("wheels")) &&
    /four-wheel|4-wheel set/i.test(unitNoteForCategory("packages")),
);
check(
  "every category has a display label",
  ["wheels", "tyres", "packages", "accessories"].every(
    (c) => basketCategoryLabel(c as BasketLine["category"]).length > 2,
  ),
);

console.log("basket — totals (settings-driven)");
const fourWheels = addToBasket([], wheel, 4);
const t4 = basketTotals(fourWheels, settings);
check(
  "4 wheels: goods total = 4 × displayed unit price",
  t4.subtotalIncVat === round2(wheel.retailPriceIncVat * 4),
  money(t4.subtotalIncVat),
);
check(
  "4 wheels: delivery uses the settings 4+ tier (£80)",
  t4.shipping === 80,
  money(t4.shipping),
);
check(
  "total = goods + delivery",
  t4.totalIncVat === round2(t4.subtotalIncVat + t4.shipping),
  money(t4.totalIncVat),
);
check(
  "VAT shown is the portion already inside the prices (20%), not added on top",
  t4.vatIncluded === round2(t4.subtotalIncVat - t4.subtotalIncVat / 1.2),
  money(t4.vatIncluded),
);
check(
  "VAT + net goods equals the goods total (nothing double-counted)",
  round2(t4.vatIncluded + t4.subtotalIncVat / 1.2) === t4.subtotalIncVat,
);
check(
  "1 wheel uses the single-wheel tier (£35)",
  basketTotals(addToBasket([], wheel, 1), settings).shipping === 35,
);
check(
  "2 wheels use the 2-wheel tier (£55)",
  basketTotals(addToBasket([], wheel, 2), settings).shipping === 55,
);
check(
  "itemCount / lineCount describe the basket",
  t4.itemCount === 4 && t4.lineCount === 1,
);
const mixedTotals = basketTotals(mixed, settings);
check(
  "mixed basket: wheel tier + flat tyre + accessory delivery (35 + 14 + 6)",
  mixedTotals.shipping === 35 + 14 + 6,
  money(mixedTotals.shipping),
);
check(
  "mixed basket subtotal is the sum of its lines",
  mixedTotals.subtotalIncVat ===
    round2(
      wheel.retailPriceIncVat +
        tyre.retailPriceIncVat +
        accessory.retailPriceIncVat,
    ),
);
check(
  "delivery rows are itemised (one per charged category)",
  shippingLinesForBasket(mixed, settings).length === 3 &&
    shippingLinesForBasket(mixed, settings).every(
      (r) => r.amount > 0 && r.label.length > 0,
    ),
);
const onePackage = basketTotals(addToBasket([], pkg, 1), settings);
check(
  "a package ships as its 4 wheels (£80)",
  onePackage.shipping === 80,
  money(onePackage.shipping),
);
check(
  "two packages stay on the 4+ wheel tier (not £80 twice)",
  basketTotals(addToBasket([], pkg, 2), settings).shipping === 80,
);
const emptyTotals = basketTotals([], settings);
check(
  "an empty basket totals zero with no delivery charge",
  emptyTotals.subtotalIncVat === 0 &&
    emptyTotals.shipping === 0 &&
    emptyTotals.totalIncVat === 0 &&
    emptyTotals.vatIncluded === 0,
);
check(
  "an empty basket has no delivery rows",
  shippingLinesForBasket([], settings).length === 0,
);
const customised = basketTotals(fourWheels, {
  ...settings,
  shippingTiers: [{ minQty: 4, priceGBP: 12.5, label: "test tier" }],
  shippingByCategory: { tyres: 3, accessories: 1 },
  vatRate: 0.05,
});
check(
  "totals follow the pricing settings rather than hard-coded numbers",
  customised.shipping === 12.5 &&
    customised.vatIncluded ===
      round2(customised.subtotalIncVat - customised.subtotalIncVat / 1.05),
  `${money(customised.shipping)} / ${money(customised.vatIncluded)}`,
);
const reversed = basketTotals([...mixed].reverse(), settings);
check(
  "totals do not depend on line order",
  reversed.totalIncVat === mixedTotals.totalIncVat &&
    reversed.shipping === mixedTotals.shipping,
);

console.log("basket — summary text");
const summary = basketSummaryLines(fourWheels);
check("summary has one row per line", summary.length === 1);
check(
  "summary row states quantity, unit price and line total",
  summary[0].startsWith("4 x ") &&
    summary[0].includes(money(wheel.retailPriceIncVat)) &&
    summary[0].includes(money(round2(wheel.retailPriceIncVat * 4))),
  summary[0],
);

console.log("basket — persistence");
const roundTrip = parseBasket(serializeBasket(mixed));
check(
  "a serialised basket round-trips unchanged",
  JSON.stringify(roundTrip) === JSON.stringify(mixed),
);
check(
  "the storage key is versioned",
  /^n2wheels\.basket\.v\d+$/.test(BASKET_STORAGE_KEY),
  BASKET_STORAGE_KEY,
);
check(
  "garbage stored values yield an empty basket, never a crash",
  [
    "",
    "   ",
    "not json",
    "{}",
    "[]",
    "null",
    "42",
    '{"lines":"nope"}',
    '{"lines":[null,7]}',
  ].every((raw) => parseBasket(raw).length === 0),
);
const partial = parseBasket(
  JSON.stringify({
    v: 1,
    lines: [
      {
        id: wheel.id,
        category: "wheels",
        name: wheel.name,
        unitPriceIncVat: wheel.retailPriceIncVat,
        quantity: 2,
      },
      { id: "junk", category: "spaceships", unitPriceIncVat: 10, quantity: 1 },
      { id: "free", category: "wheels", unitPriceIncVat: -5, quantity: 1 },
      { id: "", category: "tyres", unitPriceIncVat: 10, quantity: 1 },
      {
        id: wheel.id,
        category: "wheels",
        unitPriceIncVat: wheel.retailPriceIncVat,
        quantity: 5000,
      },
    ],
  }),
);
check(
  "corrupted lines are dropped, valid ones kept",
  partial.length === 1,
  String(partial.length),
);
check(
  "a duplicated stored line is merged and clamped",
  partial[0].quantity === MAX_LINE_QUANTITY,
  String(partial[0].quantity),
);
check(
  "a bare array (older shape) is still readable",
  parseBasket(JSON.stringify([mixed[0]])).length === 1,
);
check(
  "restored lines keep their id, category and price",
  partial[0].id === wheel.id &&
    partial[0].category === "wheels" &&
    partial[0].unitPriceIncVat === wheel.retailPriceIncVat,
);

console.log("basket — every sample product");
const allOk = demoAllProducts.every((p) => {
  const line = lineFromProduct(p, 1);
  return (
    line.id === p.id &&
    line.category === p.category &&
    line.unitPriceIncVat === p.retailPriceIncVat &&
    line.unitPriceIncVat > 0 &&
    line.spec.trim().length > 0 &&
    line.quantity === 1
  );
});
check(
  `all ${demoAllProducts.length} sample products build a valid basket line`,
  allOk,
);
check(
  "wheel lines carry the wheel spec fields the product page shows",
  lineFromProduct(wheel).spec.includes(wheel.size.pcd) &&
    lineFromProduct(wheel).spec.includes(wheel.size.offset),
  lineFromProduct(wheel).spec,
);
check(
  "tyre lines carry the tyre size label",
  lineFromProduct(tyre).spec.includes(tyreSizeLabel(tyre)),
  lineFromProduct(tyre).spec,
);
const everyCategory = (
  ["wheels", "tyres", "packages", "accessories"] as const
).every((category) =>
  demoAllProducts.some(
    (p) => p.category === category && lineFromProduct(p).spec.length > 0,
  ),
);
check("all four categories produce a spec line", everyCategory);

console.log("---");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fails.length) console.log(fails.map((f) => ` - ${f}`).join("\n"));
process.exit(fail === 0 ? 0 : 1);
