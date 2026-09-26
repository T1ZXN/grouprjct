/**
 * Central pricing settings engine for N2 Wheels.
 *
 * RETAIL PRICES ARE NEVER HARD-CODED PER PRODUCT. Every price the site shows is
 * derived here from the central settings.
 *
 * ── TWO FEED FAMILIES, TWO PRICE RULES ───────────────────────────────────────
 * 1. TRADE/RETAIL-GBP feeds (the owner's Wolfrace trade export, and the
 *    Automotive Wheels UK feed when it arrives). These publish prices in £ and
 *    get the OWNER'S RULE (see retailIncVatFromFeedPrices):
 *      • `retailIncVat` present                        -> use it as the site price
 *      • else `retailExVat` present                    -> × (1 + vatRate)        [£×1.20]
 *      • else only `tradePrice` (no retail columns)    -> × tradeMarginMultiplier
 *                                                         × (1 + vatRate)        [£×1.44]
 *    The margin multiplier (1.2) and the VAT rate (0.2) are settings, so the
 *    fallback is tunable, never hard-coded per row.
 * 2. EUR supplier-list feeds (the Forzza-shaped demo feed). These keep the
 *    original engine: supplier list price (EUR) − supplier discount % × EUR→GBP
 *    + margin, + UK VAT — per-item percentage margin for single items, flat
 *    per-SET margin for wheels/packages (see priceForProduct).
 *
 * ── DELIVERY (owner rule) ────────────────────────────────────────────────────
 * Wheels ship at a flat £ PER WHEEL (`wheelShippingPerUnit`, default £20), so a
 * full set of 4 is £80 — exactly the owner's rule. Tyres and accessories keep
 * their flat per-order rates. Every figure is exposed as DATA from this module;
 * the basket/checkout pages read it and never hard-code a delivery charge.
 *
 * The settings live in a mutable in-memory store (the server-side "backend"
 * model): getPricingSettings()/setPricingSettings() change them at runtime and
 * recalculateAllPrices() re-derives every engine-priced catalogue retail price.
 * NOTE: nothing here does network or storage I/O. Persisting settings is the
 * store layer's job (src/lib/store.ts) — the functional surface below is where
 * that persistence plugs in.
 */

export interface PricingSettings {
  /** % discount negotiated off the supplier's EUR list price. */
  supplierDiscountPct: number;
  /** Exchange rate used to convert supplier (EUR) prices to GBP. */
  eurToGbp: number;
  /** Legacy per-item margin % — applied to tyres/accessories (single items). */
  retailMarginPct: number;
  /** Flat £ margin added per wheel SET (4 wheels) in the EUR-list model. */
  retailMarginPerSetGBP: number;
  /**
   * Markup applied to a supplier TRADE price to reach retail ex. VAT
   * (owner's rule: 1.2 = +20% on trade). Used by the trade-only fallback, so a
   * feed that publishes trade prices without VAT prices lands on trade × 1.2 × 1.2.
   */
  tradeMarginMultiplier: number;
  /** UK VAT rate (0.2 = 20%) — also the ×1.2 step of the feed fallbacks. */
  vatRate: number;
  /** Flat per-order fallback used only when a category has no configured rate. */
  shippingGBP: number;
  /** Delivery £ per WHEEL unit (owner rule: £20 per wheel → £80 for 4 wheels). */
  wheelShippingPerUnit: number;
  /** Flat per-order shipping for non-wheel categories. */
  shippingByCategory: Record<"tyres" | "accessories", number>;
}

/** Defaults seeded from the owner's rules (trade ×1.2 margin, 20% VAT, £20/wheel). */
export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  supplierDiscountPct: 25,
  eurToGbp: 0.86,
  retailMarginPct: 55,
  retailMarginPerSetGBP: 75,
  tradeMarginMultiplier: 1.2,
  vatRate: 0.2,
  shippingGBP: 80,
  wheelShippingPerUnit: 20,
  shippingByCategory: { tyres: 14, accessories: 6 },
};

/** Deep-clone a settings object (records are copied, never shared). */
export function cloneSettings(s: PricingSettings): PricingSettings {
  return {
    ...s,
    shippingByCategory: { ...s.shippingByCategory },
  };
}

/** Current runtime settings — an exported mutable store (backend model). */
export let pricingSettings: PricingSettings = cloneSettings(DEFAULT_PRICING_SETTINGS);

/** Read the current settings (safe accessor for render/import code). */
export function getPricingSettings(): PricingSettings {
  return pricingSettings;
}

/** Merge a partial update into the runtime settings store. */
export function setPricingSettings(next: Partial<PricingSettings>): PricingSettings {
  pricingSettings = {
    ...pricingSettings,
    ...next,
    // Deep-replace the collection field when provided so callers can't share refs.
    shippingByCategory: next.shippingByCategory
      ? { ...next.shippingByCategory }
      : pricingSettings.shippingByCategory,
  };
  return pricingSettings;
}

/** Restore the owner-rule defaults (admin "reset" button / tests). */
export function resetPricingSettings(): PricingSettings {
  pricingSettings = cloneSettings(DEFAULT_PRICING_SETTINGS);
  return pricingSettings;
}

/* ── Price pipeline: EUR supplier list ───────────────────────────────────── */

/**
 * Supplier price in EUR -> retail price EXCLUDING VAT (GBP), per single item,
 * using the legacy percentage-margin model. Wheels/packages use the per-SET
 * model instead (see retailPricePerSetIncVat) — this function remains the
 * per-item component used for tyres, accessories and generic items.
 */
export function retailPriceExVat(
  supplierPriceEur: number,
  settings: PricingSettings = pricingSettings,
): number {
  const discounted = supplierPriceEur * (1 - settings.supplierDiscountPct / 100);
  const inGbp = discounted * settings.eurToGbp;
  return inGbp * (1 + settings.retailMarginPct / 100);
}

/**
 * Supplier price in EUR -> retail price INCLUDING VAT (what customers see),
 * per single item.
 */
export function retailPriceIncVat(
  supplierPriceEur: number,
  settings: PricingSettings = pricingSettings,
): number {
  return retailPriceExVat(supplierPriceEur, settings) * (1 + settings.vatRate);
}

/**
 * The EUR-list wheel-SET model: supplier price per wheel -> total retail price
 * INCLUDING VAT for a complete set, applying the flat per-set margin:
 *   (qty × discounted EUR→GBP cost) + retailMarginPerSetGBP, then + VAT.
 * Defaults to a 4-wheel set; a per-wheel share is total / qty.
 */
export function retailPricePerSetIncVat(
  supplierPriceEurPerWheel: number,
  qty: number = 4,
  settings: PricingSettings = pricingSettings,
): number {
  const setCostGbp =
    qty *
    supplierPriceEurPerWheel *
    (1 - settings.supplierDiscountPct / 100) *
    settings.eurToGbp;
  return (setCostGbp + settings.retailMarginPerSetGBP) * (1 + settings.vatRate);
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Format a GBP amount for display, e.g. 272.086 -> "£272.09". */
export function formatGBP(amount: number): string {
  return `£${amount.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ── Price pipeline: GBP trade/retail feeds (the owner's rule) ────────────── */

/** The GBP price columns a trade/retail feed may publish for a row. */
export interface FeedPriceFields {
  /** Supplier's recommended retail price INC. VAT (the owner's rule: use as-is). */
  retailIncVatGbp?: number;
  /** Supplier's retail price EX. VAT (× (1 + vatRate) → inc. VAT). */
  retailExVatGbp?: number;
  /** Supplier's trade price (£, ex. VAT) — × tradeMarginMultiplier × (1 + vatRate). */
  tradePriceGbp?: number;
}

/** Which feed column the retail price came from (reported, never guessed). */
export type FeedPriceSource = "retailIncVat" | "retailExVat" | "tradePrice" | "none";

function positive(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * THE OWNER'S RULE for a GBP trade/retail feed row — settings-driven, in strict
 * order of preference:
 *   1. `retailIncVat` present  -> the supplier's own recommended retail price
 *      (inc. VAT) is the site price, used EXACTLY as published.
 *   2. else `retailExVat`      -> × (1 + vatRate)  [£135 → £162 at 20% VAT].
 *   3. else only `tradePrice`  -> × tradeMarginMultiplier × (1 + vatRate)
 *      [£112.50 → £162, i.e. trade × 1.2 × 1.2].
 * A row with none of the three has NO usable price: the source is "none" and
 * the price is 0 — the importer skips such a row rather than inventing a price.
 */
export function retailIncVatFromFeedPrices(
  feed: FeedPriceFields,
  settings: PricingSettings = pricingSettings,
): { priceIncVat: number; source: FeedPriceSource } {
  const incVat = positive(feed.retailIncVatGbp);
  if (incVat !== null) return { priceIncVat: round2(incVat), source: "retailIncVat" };
  const exVat = positive(feed.retailExVatGbp);
  if (exVat !== null) {
    return { priceIncVat: round2(exVat * (1 + settings.vatRate)), source: "retailExVat" };
  }
  const trade = positive(feed.tradePriceGbp);
  if (trade !== null) {
    return {
      priceIncVat: round2(trade * settings.tradeMarginMultiplier * (1 + settings.vatRate)),
      source: "tradePrice",
    };
  }
  return { priceIncVat: 0, source: "none" };
}

/**
 * A GBP feed price expressed in EUR at the current settings rate. GBP feeds
 * carry no EUR list price, but the catalogue model (and the bulk recalculation
 * that reads `supplierPriceEur`) needs a supplier figure, so the feed's trade
 * price is converted with the SAME settings rate the engine uses. Returns 0
 * when there is no trade price or no usable rate — never a guessed number.
 */
export function gbpToEur(amountGbp: number, settings: PricingSettings = pricingSettings): number {
  if (!Number.isFinite(amountGbp) || amountGbp <= 0) return 0;
  if (!Number.isFinite(settings.eurToGbp) || settings.eurToGbp <= 0) return 0;
  return round2(amountGbp / settings.eurToGbp);
}

/* ── Shipping (settings-driven, exposed as data) ──────────────────────────── */

/**
 * The settings' flat delivery rate PER WHEEL in £ (0 when not configured).
 * Exposed so /delivery, the admin panel and the basket all quote the SAME
 * per-wheel figure the wheel-shipping line is built from.
 */
export function wheelShippingPerUnit(settings: PricingSettings = pricingSettings): number {
  const perUnit = settings.wheelShippingPerUnit;
  return Number.isFinite(perUnit) && perUnit > 0 ? perUnit : 0;
}

/**
 * Delivery for a wheel order: the flat settings rate PER WHEEL × the number of
 * wheel units (owner's rule — £20/wheel, so £80 for a set of 4, £40 for 2).
 * A package counts as its 4 wheels (see shippingForOrder / basket.ts).
 */
export function shippingForQuantity(qty: number, settings: PricingSettings = pricingSettings): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const perUnit = wheelShippingPerUnit(settings);
  return perUnit > 0 ? round2(Math.floor(qty) * perUnit) : settings.shippingGBP;
}

/** Flat per-order shipping for a non-wheel category (tyres / accessories). */
export function shippingForCategory(
  category: "tyres" | "accessories",
  settings: PricingSettings = pricingSettings,
): number {
  return settings.shippingByCategory[category] ?? settings.shippingGBP;
}

/** Order-level shipping for any catalogue line: wheels by unit, others by category. */
export function shippingForOrder(
  category: "wheels" | "tyres" | "packages" | "accessories",
  qty: number,
  settings: PricingSettings = pricingSettings,
): number {
  if (category === "wheels") return shippingForQuantity(qty, settings);
  if (category === "packages") return shippingForQuantity(4 * Math.max(1, Math.floor(qty)), settings); // a package IS a 4-wheel set
  return shippingForCategory(category, settings);
}

/* ── Bulk recalculation over the catalogue ────────────────────────────────── */

/** Minimal shape any catalogue product exposes to the pricing engine. */
export interface PriceableProduct {
  id: string;
  /** "wheels" | "tyres" | "packages" | "accessories" */
  category: string;
  supplierPriceEur: number;
  retailPriceIncVat: number;
}

/**
 * Retail price (inc. VAT) the CURRENT settings produce for a catalogue line:
 * wheels -> per-wheel share of the per-SET model (4 per set); packages ->
 * whole-set model (the package IS the set); tyres/accessories -> per-item
 * percentage model. This is the single source of truth used by recalc and by
 * every "computed" price in the admin UI.
 *
 * NOTE: this is the EUR-list model only. Rows imported from a GBP trade/retail
 * feed keep the price the feed published (retailIncVatFromFeedPrices) — that is
 * the owner's rule and it is deliberately NOT re-derived here.
 */
export function priceForProduct(p: PriceableProduct, settings: PricingSettings = pricingSettings): number {
  if (p.category === "wheels") return retailPricePerSetIncVat(p.supplierPriceEur, 4, settings) / 4;
  if (p.category === "packages") return retailPricePerSetIncVat(p.supplierPriceEur, 4, settings);
  return retailPriceIncVat(p.supplierPriceEur, settings);
}

export interface RecalcReport {
  count: number;
  changed: number;
  changedIds: string[];
  /** Lines left untouched because they carry a supplier's own GBP retail price. */
  skippedFeedPriced: number;
}

/** Any catalogue line that carries verbatim GBP feed pricing (see FeedAttributes). */
interface FeedPricedProduct {
  feedAttributes?: { priceSource?: string };
}

/**
 * Recompute retailPriceIncVat for every catalogue product from the CURRENT
 * settings (mutates the passed products in place — that is the "bulk price
 * update" the admin performs). Returns how many products actually changed.
 *
 * Products carrying GBP feed prices (`feedPrices`) are SKIPPED: their price is
 * the supplier's published retail figure per the owner's rule, so a bulk
 * recalculation must not silently overwrite it.
 */
export function recalculateAllPrices(products: PriceableProduct[]): RecalcReport {
  const changedIds: string[] = [];
  let changed = 0;
  let skippedFeedPriced = 0;
  for (const p of products) {
    const feedPriced = (p as FeedPricedProduct).feedAttributes?.priceSource;
    if (feedPriced) {
      skippedFeedPriced += 1;
      continue;
    }
    const next = round2(priceForProduct(p));
    if (p.retailPriceIncVat !== next) {
      changed += 1;
      changedIds.push(p.id);
    }
    p.retailPriceIncVat = next;
  }
  return { count: products.length, changed, changedIds, skippedFeedPriced };
}
