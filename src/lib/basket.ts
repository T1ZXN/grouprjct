/**
 * N2 Wheels — BASKET (client-side cart) model.
 *
 * Pure, browser-free logic: lines, quantities, order totals and the
 * localStorage serialisation. The React state layer lives in
 * src/components/BasketProvider.tsx and the pages are src/routes/basket.tsx +
 * src/routes/checkout.tsx. Keeping the maths here means it is unit-testable
 * without a DOM (see scripts/test-basket.ts).
 *
 * ── WHAT A LINE STORES ───────────────────────────────────────────────────────
 * A basket line is a SNAPSHOT of what the customer saw on the product page:
 * product id + category (the catalogue keys), the display name, the spec line
 * (exactly the same formatting the product page uses), the unit price that was
 * displayed (retail inc. VAT) and the quantity. Nothing here invents prices:
 * `unitPriceIncVat` is copied from the product's own `retailPriceIncVat`, which
 * the pricing engine (src/lib/pricing.ts) derives from the central settings —
 * never hard-coded per product.
 *
 * ── ORDER-LEVEL DELIVERY (settings-driven, never hard-coded) ─────────────────
 * Delivery comes from the same pricing settings as everywhere else on the site:
 *   • wheels / packages -> the quantity tier (shippingForQuantity); a package
 *     counts as its 4 wheels
 *   • tyres / accessories -> the flat per-category charge, charged once per
 *     order when at least one such line is present
 * Those are the numbers /delivery publishes, so the basket can never quote a
 * delivery figure the rest of the site disagrees with.
 *
 * HONESTY: all catalogue data is sample data (labelled in the UI). The basket
 * makes no stock, availability or payment claim — it is a list the customer
 * builds, and checkout (src/lib/checkout.ts) is honest about the fact that the
 * site cannot take online card payments yet.
 */
import type { Accessory, Tyre, Wheel, WheelPackage } from "~/data/products";
import { tyreSizeLabel, wheelSizeLabel } from "~/data/products";
import {
  getPricingSettings,
  round2,
  shippingForCategory,
  shippingForQuantity,
} from "~/lib/pricing";
import type { PricingSettings } from "~/lib/pricing";

/** Basket categories = the four catalogue categories. */
export type BasketCategory = "wheels" | "tyres" | "packages" | "accessories";

/** Any catalogue product that can go into a basket. */
export type BasketProduct = Wheel | Tyre | WheelPackage | Accessory;

/** localStorage key (versioned so a future shape change can't corrupt a basket). */
export const BASKET_STORAGE_KEY = "n2wheels.basket.v1";

/** Per-line quantity cap (sanity bound for typed input / corrupted storage). */
export const MAX_LINE_QUANTITY = 99;

/** Upper bound on distinct lines (guards against a corrupted/absurd basket). */
export const MAX_BASKET_LINES = 40;

/** One basket line — a snapshot of the product as displayed. */
export interface BasketLine {
  /** Catalogue id (the product URL slug) — the line key with `category`. */
  id: string;
  category: BasketCategory;
  /** Display name, e.g. "Forza R1". */
  name: string;
  /** Brand, e.g. "N2 Forged" (may be empty for some accessories). */
  brand: string;
  /** Spec line, formatted exactly as the product detail page shows it. */
  spec: string;
  /** Unit price INCLUDING VAT as displayed on the product page. */
  unitPriceIncVat: number;
  image: string;
  quantity: number;
}

const CATEGORY_LABELS: Record<BasketCategory, string> = {
  wheels: "Wheel",
  tyres: "Tyre",
  packages: "Wheel & tyre package",
  accessories: "Accessory",
};

/** Human label for a category ("Wheel", "Tyre", …). */
export function basketCategoryLabel(category: BasketCategory): string {
  return CATEGORY_LABELS[category] ?? "Item";
}

/**
 * How a unit is sold, stated per category — derived from the pricing model
 * (wheels are priced per wheel: the per-set margin is shared across 4).
 */
export function unitNoteForCategory(category: BasketCategory): string {
  switch (category) {
    case "wheels":
      return "Priced per wheel — add 4 for a full set.";
    case "packages":
      return "A package is a complete 4-wheel set with tyres.";
    case "tyres":
      return "Priced per tyre.";
    default:
      return "Priced per item.";
  }
}

/**
 * Spec line for a product, formatted the same way its detail page formats it
 * (so the basket never shows a different spec to the page it was added from).
 */
export function specForProduct(product: BasketProduct): string {
  switch (product.category) {
    case "wheels": {
      const finish = product.finish?.trim();
      return finish
        ? `${wheelSizeLabel(product.size)} · ${finish}`
        : wheelSizeLabel(product.size);
    }
    case "tyres": {
      const extra = [product.loadIndex, product.speedRating]
        .map((s) => s?.trim())
        .filter(Boolean);
      return [tyreSizeLabel(product), extra.join(" "), product.season]
        .filter(Boolean)
        .join(" · ");
    }
    case "packages": {
      const parts = [`${product.diameter}" wheel & tyre package`];
      if (product.wheelSpec) {
        parts.push(wheelSizeLabel(product.wheelSpec));
      }
      if (product.tyreSpec) {
        parts.push(tyreSizeLabel(product.tyreSpec));
      }
      return parts.join(" · ");
    }
    default:
      return "Wheel accessory";
  }
}

/** Stable identity of a line (product id is unique per category). */
export function lineKey(line: Pick<BasketLine, "category" | "id">): string {
  return `${line.category}:${line.id}`;
}

/** Clamp a quantity to the supported 1..MAX_LINE_QUANTITY range. */
export function clampQuantity(qty: number): number {
  if (!Number.isFinite(qty)) return 1;
  const whole = Math.floor(qty);
  if (whole < 1) return 1;
  if (whole > MAX_LINE_QUANTITY) return MAX_LINE_QUANTITY;
  return whole;
}

/** Build a basket line from a catalogue product (snapshot of what's displayed). */
export function lineFromProduct(
  product: BasketProduct,
  quantity = 1,
): BasketLine {
  return {
    id: product.id,
    category: product.category,
    name: product.name,
    brand: product.brand,
    spec: specForProduct(product),
    unitPriceIncVat: product.retailPriceIncVat,
    image: product.image,
    quantity: clampQuantity(quantity),
  };
}

/**
 * Add a product to the basket, returning a NEW array (never mutates). Adding a
 * product already in the basket increases its quantity instead of duplicating
 * the line, and refreshes the snapshot fields from the product passed in.
 */
export function addToBasket(
  lines: BasketLine[],
  product: BasketProduct,
  quantity = 1,
): BasketLine[] {
  const key = lineKey({ category: product.category, id: product.id });
  const existing = lines.find((l) => lineKey(l) === key);
  if (existing) {
    return lines.map((l) =>
      lineKey(l) === key
        ? {
            ...l,
            ...lineFromProduct(product, 1),
            quantity: clampQuantity(l.quantity + quantity),
          }
        : l,
    );
  }
  if (lines.length >= MAX_BASKET_LINES) return lines;
  return [...lines, lineFromProduct(product, quantity)];
}

/** Set one line's quantity (clamped to 1..MAX; use removeFromBasket to delete). */
export function setLineQuantity(
  lines: BasketLine[],
  key: string,
  quantity: number,
): BasketLine[] {
  return lines.map((l) =>
    lineKey(l) === key ? { ...l, quantity: clampQuantity(quantity) } : l,
  );
}

/** Remove a line entirely. */
export function removeFromBasket(
  lines: BasketLine[],
  key: string,
): BasketLine[] {
  return lines.filter((l) => lineKey(l) !== key);
}

/** Empty basket. */
export function clearBasket(): BasketLine[] {
  return [];
}

/** Number of UNITS in the basket (what the header badge shows). */
export function basketCount(lines: BasketLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

/** Money total for one line. */
export function lineTotal(line: BasketLine): number {
  return round2(line.unitPriceIncVat * line.quantity);
}

/** One delivery charge row, as it is displayed and summed. */
export interface ShippingLine {
  label: string;
  amount: number;
}

export interface BasketTotals {
  /** Units in the basket. */
  itemCount: number;
  /** Distinct lines. */
  lineCount: number;
  /** Goods total inc. VAT (sum of line totals). */
  subtotalIncVat: number;
  /** Total delivery charge for the order (sum of shippingLines). */
  shipping: number;
  /** The delivery charges, itemised (settings-driven). */
  shippingLines: ShippingLine[];
  /** The VAT already inside subtotalIncVat (goods) — not added on top. */
  vatIncluded: number;
  /** subtotalIncVat + shipping. */
  totalIncVat: number;
}

/**
 * Order-level delivery charges, from the pricing settings (see module docblock).
 * An empty basket ships for nothing.
 */
export function shippingLinesForBasket(
  lines: BasketLine[],
  settings: PricingSettings = getPricingSettings(),
): ShippingLine[] {
  if (lines.length === 0) return [];
  const out: ShippingLine[] = [];
  // Wheels: a package IS a 4-wheel set, so its wheels join the wheel count and
  // the whole order is charged on the wheel quantity tiers.
  const wheelUnits = lines.reduce(
    (sum, l) =>
      l.category === "wheels"
        ? sum + l.quantity
        : l.category === "packages"
          ? sum + 4 * l.quantity
          : sum,
    0,
  );
  if (wheelUnits > 0) {
    out.push({
      label: `Wheels (${wheelUnits} wheel${wheelUnits === 1 ? "" : "s"})`,
      amount: shippingForQuantity(wheelUnits, settings),
    });
  }
  if (lines.some((l) => l.category === "tyres")) {
    out.push({
      label: "Tyres",
      amount: shippingForCategory("tyres", settings),
    });
  }
  if (lines.some((l) => l.category === "accessories")) {
    out.push({
      label: "Accessories",
      amount: shippingForCategory("accessories", settings),
    });
  }
  return out;
}

/**
 * Totals for the whole basket. The displayed unit prices already include UK
 * VAT, so the VAT figure is the portion ALREADY INSIDE the goods total — it is
 * never added on top. Delivery is the flat settings charge for the order.
 */
export function basketTotals(
  lines: BasketLine[],
  settings: PricingSettings = getPricingSettings(),
): BasketTotals {
  const subtotalIncVat = round2(
    lines.reduce((sum, l) => sum + lineTotal(l), 0),
  );
  const shippingLines = shippingLinesForBasket(lines, settings);
  const shipping = round2(shippingLines.reduce((sum, s) => sum + s.amount, 0));
  const exVat = subtotalIncVat / (1 + settings.vatRate);
  return {
    itemCount: basketCount(lines),
    lineCount: lines.length,
    subtotalIncVat,
    shipping,
    shippingLines,
    vatIncluded: round2(subtotalIncVat - exVat),
    totalIncVat: round2(subtotalIncVat + shipping),
  };
}

/**
 * Plain-text line summaries (used by the basket UI and by the order-enquiry
 * email the checkout seam prepares) — one string per line.
 */
export function basketSummaryLines(lines: BasketLine[]): string[] {
  return lines.map((l) => {
    const unit = `£${l.unitPriceIncVat.toFixed(2)}`;
    const total = `£${lineTotal(l).toFixed(2)}`;
    const brand = l.brand ? `${l.brand} ` : "";
    const spec = l.spec ? ` (${l.spec})` : "";
    return `${l.quantity} x ${brand}${l.name}${spec} — ${unit} each, ${total}`;
  });
}

/** Serialise the basket for localStorage. */
export function serializeBasket(lines: BasketLine[]): string {
  return JSON.stringify({ v: 1, lines });
}

/**
 * Parse a persisted basket. TOLERANT BY DESIGN: any malformed, partial or
 * hand-edited value yields the valid subset (or an empty basket) — never a
 * throw, never a fabricated product. Prices are sanity-checked, not trusted
 * into nonsense (a negative or non-finite unit price drops the line).
 */
export function parseBasket(raw: unknown): BasketLine[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const container = parsed as { lines?: unknown } | unknown[] | null;
  const rawLines = Array.isArray(container)
    ? container
    : container && typeof container === "object"
      ? (container as { lines?: unknown }).lines
      : undefined;
  if (!Array.isArray(rawLines)) return [];
  const categories: BasketCategory[] = [
    "wheels",
    "tyres",
    "packages",
    "accessories",
  ];
  const lines: BasketLine[] = [];
  for (const item of rawLines) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const category = r.category as BasketCategory;
    const unitPriceIncVat =
      typeof r.unitPriceIncVat === "number" ? r.unitPriceIncVat : NaN;
    if (!id || !categories.includes(category)) continue;
    if (!Number.isFinite(unitPriceIncVat) || unitPriceIncVat < 0) continue;
    const quantity =
      typeof r.quantity === "number" ? clampQuantity(r.quantity) : 1;
    const key = lineKey({ category, id });
    const duplicate = lines.find((l) => lineKey(l) === key);
    if (duplicate) {
      // Merge a duplicated stored line rather than showing (and charging) it twice.
      duplicate.quantity = clampQuantity(duplicate.quantity + quantity);
      continue;
    }
    if (lines.length >= MAX_BASKET_LINES) break;
    lines.push({
      id,
      category,
      name: typeof r.name === "string" && r.name.trim() !== "" ? r.name : id,
      brand: typeof r.brand === "string" ? r.brand : "",
      spec: typeof r.spec === "string" ? r.spec : "",
      unitPriceIncVat,
      image: typeof r.image === "string" ? r.image : "",
      quantity,
    });
  }
  return lines;
}
