/**
 * Central pricing settings engine for N2 Wheels.
 *
 * RETAIL PRICES ARE NEVER HARD-CODED PER PRODUCT. Each product in the sample
 * catalogue stores only its SUPPLIER price (EUR, matching the supplier-feed
 * price column); every retail price the site displays is derived from the
 * settings in this module.
 *
 * Business-brief pricing model (per the plan):
 *   supplier list price (EUR)
 *     - supplier discount %              (~25% off list)
 *     * EUR→GBP exchange rate            (~0.86)
 *     + retail margin per wheel SET      (+£75 per SET of 4 wheels — the brief)
 *     + UK VAT (20%)
 *     = retail price inc. VAT (what the site displays)
 *
 * Single items (tyres, accessories) keep the legacy per-item percentage
 * margin (retailMarginPct) — the flat "per wheel set" margin only applies to
 * wheel sets and complete packages.
 *
 * Delivery is settings-driven too and exposed as DATA, not page copy:
 *   shippingForQuantity(qty)  -> £80 for a 4-wheel order (brief), with 1-2
 *                                wheel placeholder tiers below it
 *   shippingForCategory(...)  -> lower flat rates for tyres / accessories
 *
 * The settings live in a mutable in-memory store (the server-side "backend"
 * model): getPricingSettings()/setPricingSettings() change them at runtime
 * and recalculateAllPrices() re-derives every retail price in the catalogue.
 * NOTE for the milestone: nothing here does network or storage I/O. Persisting
 * settings (database) is a future step — the functional surface below is
 * where that persistence layer will plug in.
 */
export interface ShippingTier {
  /** Minimum number of wheels the tier applies to. */
  minQty: number;
  priceGBP: number;
  label: string;
}

export interface PricingSettings {
  /** % discount negotiated off the supplier's list price. */
  supplierDiscountPct: number;
  /** Exchange rate used to convert supplier (EUR) prices to GBP. */
  eurToGbp: number;
  /** Legacy per-item margin % — applied to tyres/accessories (single items). */
  retailMarginPct: number;
  /** Brief's model: flat £ margin added per wheel SET (4 wheels). */
  retailMarginPerSetGBP: number;
  /** UK VAT rate (0.2 = 20%). */
  vatRate: number;
  /** Legacy standard-delivery figure kept for copy; tiers below are the engine. */
  shippingGBP: number;
  /** Quantity-tied wheel-shipping tiers (highest minQty first). */
  shippingTiers: ShippingTier[];
  /** Flat per-order shipping for non-wheel categories. */
  shippingByCategory: Record<"tyres" | "accessories", number>;
}

/** Defaults seeded to match the business brief (~25% off, 0.86 rate, £75/set, £80/4-wheel, 20% VAT). */
export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  supplierDiscountPct: 25,
  eurToGbp: 0.86,
  retailMarginPct: 55,
  retailMarginPerSetGBP: 75,
  vatRate: 0.2,
  shippingGBP: 80,
  shippingTiers: [
    { minQty: 4, priceGBP: 80, label: "4+ wheels (full set)" },
    { minQty: 2, priceGBP: 55, label: "2 wheels" },
    { minQty: 1, priceGBP: 35, label: "1 wheel" },
  ],
  shippingByCategory: { tyres: 14, accessories: 6 },
};

/** Deep-clone a settings object (arrays/records are copied, never shared). */
export function cloneSettings(s: PricingSettings): PricingSettings {
  return {
    ...s,
    shippingTiers: s.shippingTiers.map((t) => ({ ...t })),
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
    // Deep-replace collection fields when provided so callers can't share refs.
    shippingTiers: next.shippingTiers
      ? next.shippingTiers.map((t) => ({ ...t }))
      : pricingSettings.shippingTiers,
    shippingByCategory: next.shippingByCategory
      ? { ...next.shippingByCategory }
      : pricingSettings.shippingByCategory,
  };
  return pricingSettings;
}

/** Restore the brief-seeded defaults (admin "reset" button / tests). */
export function resetPricingSettings(): PricingSettings {
  pricingSettings = cloneSettings(DEFAULT_PRICING_SETTINGS);
  return pricingSettings;
}

/* ── Price pipeline ───────────────────────────────────────────────────────── */

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
 * The brief's wheel-SET model: supplier price per wheel -> total retail price
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

/* ── Shipping (settings-driven, exposed as data) ──────────────────────────── */

/** Shipping for a wheel-quantity order: 4 wheels = £80 (brief), 2 = £55, 1 = £35. */
export function shippingForQuantity(qty: number, settings: PricingSettings = pricingSettings): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  for (const tier of settings.shippingTiers) {
    if (qty >= tier.minQty) return tier.priceGBP;
  }
  return settings.shippingGBP;
}

/** Flat per-order shipping for a non-wheel category (tyres / accessories). */
export function shippingForCategory(
  category: "tyres" | "accessories",
  settings: PricingSettings = pricingSettings,
): number {
  return settings.shippingByCategory[category] ?? settings.shippingGBP;
}

/** Order-level shipping for any catalogue line: wheels by qty, others by category. */
export function shippingForOrder(
  category: "wheels" | "tyres" | "packages" | "accessories",
  qty: number,
  settings: PricingSettings = pricingSettings,
): number {
  if (category === "wheels") return shippingForQuantity(qty, settings);
  if (category === "packages") return shippingForQuantity(4, settings); // a package IS a 4-wheel set
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
}

/**
 * Recompute retailPriceIncVat for every catalogue product from the CURRENT
 * settings (mutates the passed products in place — that is the "bulk price
 * update" the admin performs). Returns how many products actually changed.
 */
export function recalculateAllPrices(products: PriceableProduct[]): RecalcReport {
  const changedIds: string[] = [];
  let changed = 0;
  for (const p of products) {
    const next = round2(priceForProduct(p));
    if (p.retailPriceIncVat !== next) {
      changed += 1;
      changedIds.push(p.id);
    }
    p.retailPriceIncVat = next;
  }
  return { count: products.length, changed, changedIds };
}