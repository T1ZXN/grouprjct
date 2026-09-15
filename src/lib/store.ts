/**
 * N2 Wheels — data layer (Phase 1: Supabase foundation).
 *
 * Supabase-first reads with hard sample-data fallback. The static Netlify host
 * has no secrets and no guarantees about network: EVERY function here returns
 * sample/demo data (or null) instead of throwing when Supabase is missing,
 * unconfigured, unreachable or has no data yet. The UI must never see an error
 * from this module.
 *
 * The table shapes below match /home/team/shared/supabase-setup.sql:
 *   public.products (id = slug, price_gbp = retail inc. VAT, specs/fitment/
 *     bullets/package_contents as jsonb) — supplier cost is deliberately NOT
 *     stored (pricing derives retail from central settings; see pricing.ts).
 *   public.pricing_settings (single row id=1 mirroring brief defaults).
 *
 * Future phase: wire catalogue routes + admin forms to these loaders. Today
 * nothing on the site consumes them yet — they are the foundation + test
 * surface for that phase.
 */
import type {
  PackageTyreSpec,
  StockStatus,
  Tyre,
  VehicleFitment,
  Wheel,
  WheelPackage,
  WheelSize,
  Accessory,
} from "~/data/products";
import { demoAllProducts } from "~/data/products";
import {
  cloneSettings,
  DEFAULT_PRICING_SETTINGS,
  getPricingSettings,
  recalculateAllPrices,
  round2,
} from "~/lib/pricing";
import type { PricingSettings, RecalcReport, ShippingTier } from "~/lib/pricing";
import { supabase } from "~/lib/supabase";

/** Unified catalogue line — exactly the four sample-product shapes. */
export type Product = Wheel | Tyre | WheelPackage | Accessory;

/** A row of public.products as created by supabase-setup.sql. */
export interface ProductRow {
  id: string;
  category: string;
  name: string | null;
  brand: string | null;
  price_gbp: number | null;
  rrp_gbp: number | null;
  stock_status: string | null;
  images: unknown; // jsonb: string[] of image paths
  specs: unknown; // jsonb: per-category spec (see rowToProduct)
  fitment: unknown; // jsonb: { compatibility: string[], fitments: VehicleFitment[] }
  description: string | null;
  bullets: unknown; // jsonb: string[]
  package_contents: unknown; // jsonb: string[] (packages only)
  created_at?: string;
  updated_at?: string;
}

/** A row of public.pricing_settings as created by supabase-setup.sql. */
export interface PricingSettingsRow {
  id: number;
  margin_pct: number | null;
  supplier_discount_pct: number | null;
  eur_gbp: number | null;
  vat_pct: number | null;
  shipping_4: number | null;
  shipping_2: number | null;
  updated_at?: string;
}

const STOCK_STATUSES: StockStatus[] = [
  "In Stock",
  "Available to order",
  "Out of stock",
  "Contact us",
];

const CATEGORY_IMAGES: Record<string, string> = {
  wheels: "/images/category-wheels.jpg",
  tyres: "/images/category-tyres.jpg",
  packages: "/images/category-packages.jpg",
  accessories: "/images/category-accessories.jpg",
};

function toStock(v: unknown): StockStatus {
  const s = typeof v === "string" ? v.trim() : "";
  return (STOCK_STATUSES as string[]).includes(s) ? (s as StockStatus) : "Contact us";
}

function toStr(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

function toNum(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function firstImage(images: unknown): string | null {
  if (Array.isArray(images)) {
    const found = images.find((x) => typeof x === "string" && x.trim() !== "");
    return typeof found === "string" ? found : null;
  }
  if (typeof images === "string" && images.trim() !== "") return images;
  return null;
}

/** Parse product.fitment jsonb -> make-level compatibility list. */
function fitmentCompatibility(fitment: unknown): string[] {
  if (!fitment || typeof fitment !== "object") return [];
  const f = fitment as Record<string, unknown>;
  return toStrArray(f.compatibility);
}

/** Parse product.fitment jsonb -> sample model-level fitment records. */
function fitmentRecords(fitment: unknown): VehicleFitment[] | undefined {
  if (!fitment || typeof fitment !== "object") return undefined;
  const f = fitment as Record<string, unknown>;
  const raw = f.fitments ?? f.vehicleFitments;
  if (!Array.isArray(raw)) return undefined;
  const records = raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      make: toStr(x.make),
      model: toStr(x.model),
      generation: x.generation ? toStr(x.generation) : undefined,
      yearsStart: typeof x.yearsStart === "number" ? x.yearsStart : undefined,
      yearsEnd: typeof x.yearsEnd === "number" ? x.yearsEnd : undefined,
    }))
    .filter((r) => r.make !== "" && r.model !== "");
  return records.length > 0 ? records : undefined;
}

/**
 * Inverse of the pricing engine (pricing.ts): a stored retail price (inc. VAT)
 * back to a supplier EUR figure, using the CURRENT runtime settings. Products
 * rows never store supplier cost, but the app's Wheel/Tyre/... shapes require
 * supplierPriceEur, so we reverse-derive it for full round-trip fidelity under
 * the current settings. Approximate by design; replaced by real supplier
 * pricing when the live feed connects.
 */
function supplierEurFromRetail(priceGbp: number, category: string): number {
  if (!Number.isFinite(priceGbp) || priceGbp <= 0) return 0;
  const s = getPricingSettings();
  const discountFactor = 1 - s.supplierDiscountPct / 100;
  if (category === "wheels" || category === "packages") {
    const setExVat =
      category === "wheels" ? (priceGbp * 4) / (1 + s.vatRate) : priceGbp / (1 + s.vatRate);
    return round2(
      (setExVat - s.retailMarginPerSetGBP) / (4 * discountFactor * s.eurToGbp),
    );
  }
  return round2(
    priceGbp /
      (1 + s.vatRate) /
      (discountFactor * s.eurToGbp * (1 + s.retailMarginPct / 100)),
  );
}

/** Map a DB row back onto the app's catalogue model. Never throws. */
export function rowToProduct(row: ProductRow): Product | null {
  const priceGbp = toNum(row.price_gbp);
  if (!row.id || !row.category || priceGbp <= 0) return null;
  const category = row.category as Product["category"];
  const specs = (row.specs ?? {}) as Record<string, unknown>;
  const image = firstImage(row.images) ?? CATEGORY_IMAGES[category] ?? "/images/category-wheels.jpg";
  const description = toStr(row.description);
  const stockStatus = toStock(row.stock_status);
  const common = {
    id: row.id,
    supplierId: toStr(specs.supplierId, row.id),
    brand: toStr(row.brand),
    retailPriceIncVat: priceGbp,
    stockStatus,
    image,
    description,
  };

  if (category === "wheels") {
    const size: WheelSize = {
      diameter: toNum(specs.diameter),
      width: toStr(specs.width),
      pcd: toStr(specs.pcd),
      offset: toStr(specs.offset),
    };
    const wheel: Wheel = {
      ...common,
      name: toStr(row.name, row.id),
      category,
      size,
      colour: toStr(specs.colour),
      finish: toStr(specs.finish),
      supplierPriceEur: supplierEurFromRetail(priceGbp, "wheels"),
      includedBolts: toStr(specs.includedBolts),
      vehicleCompatibility: fitmentCompatibility(row.fitment),
      vehicleFitments: fitmentRecords(row.fitment),
    };
    return wheel;
  }

  if (category === "tyres") {
    const tyre: Tyre = {
      ...common,
      name: toStr(row.name, row.id),
      category,
      width: toNum(specs.width),
      aspect: toNum(specs.aspect),
      rimDiameter: toNum(specs.rimDiameter),
      loadIndex: toStr(specs.loadIndex),
      speedRating: toStr(specs.speedRating),
      season: (["Summer", "All-season", "Winter"] as const).includes(specs.season as "Summer")
        ? (specs.season as Tyre["season"])
        : "Summer",
      supplierPriceEur: supplierEurFromRetail(priceGbp, "tyres"),
    };
    return tyre;
  }

  if (category === "packages") {
    const wheelSpecRaw = specs.wheelSpec as Record<string, unknown> | undefined;
    const tyreSpecRaw = specs.tyreSpec as Record<string, unknown> | undefined;
    const wheelSpec: WheelSize | undefined = wheelSpecRaw
      ? {
          diameter: toNum(wheelSpecRaw.diameter),
          width: toStr(wheelSpecRaw.width),
          pcd: toStr(wheelSpecRaw.pcd),
          offset: toStr(wheelSpecRaw.offset),
        }
      : undefined;
    const tyreSpec: PackageTyreSpec | undefined = tyreSpecRaw
      ? {
          brand: toStr(tyreSpecRaw.brand),
          model: toStr(tyreSpecRaw.model),
          width: toNum(tyreSpecRaw.width),
          aspect: toNum(tyreSpecRaw.aspect),
          rimDiameter: toNum(tyreSpecRaw.rimDiameter),
        }
      : undefined;
    const pkg: WheelPackage = {
      ...common,
      name: toStr(row.name, row.id),
      category,
      diameter: toNum(specs.diameter),
      includes: toStrArray(row.package_contents),
      wheelSpec,
      tyreSpec,
      vehicleFitments: fitmentRecords(row.fitment),
      supplierPriceEur: supplierEurFromRetail(priceGbp, "packages"),
    };
    return pkg;
  }

  if (category === "accessories") {
    const acc: Accessory = {
      ...common,
      name: toStr(row.name, row.id),
      category,
      supplierPriceEur: supplierEurFromRetail(priceGbp, "accessories"),
    };
    return acc;
  }

  return null;
}

/**
 * Where the LAST loadProducts() result came from — "supabase" when real rows
 * were read from the database, "demo" otherwise (unconfigured / unreachable /
 * empty). Public pages use this to decide whether live hydration applies;
 * SSR always starts at "demo" so the prerendered sample baseline is stable.
 */
export let productsSource: "supabase" | "demo" = "demo";

/**
 * Load the catalogue: Supabase-first (SELECT public.products), falling back to
 * the in-repo sample products on ANY error, empty result or missing config.
 * Never throws to the UI — callers get a valid array either way.
 */
export async function loadProducts(): Promise<Product[]> {
  if (!supabase) {
    productsSource = "demo";
    return [...demoAllProducts];
  }
  try {
    const { data, error } = await supabase.from("products").select("*");
    if (error) {
      productsSource = "demo";
      return [...demoAllProducts];
    }
    const rows = (data ?? []) as ProductRow[];
    if (rows.length === 0) {
      productsSource = "demo";
      return [...demoAllProducts];
    }
    const products = rows.map(rowToProduct).filter((p): p is Product => p !== null);
    if (products.length === 0) {
      productsSource = "demo";
      return [...demoAllProducts];
    }
    productsSource = "supabase";
    return products;
  } catch {
    productsSource = "demo";
    return [...demoAllProducts];
  }
}

/**
 * Load central pricing settings (row id=1). Returns `null` when unconfigured /
 * unavailable so the app keeps using the built-in brief defaults — the caller
 * decides whether to merge. Non-persisted fields (per-set margin £75, the
 * 1-wheel placeholder shipping tier, per-category tyre/accessory shipping)
 * stay on DEFAULT_PRICING_SETTINGS; the seeded row mirrors those defaults, so
 * the merged result is identical to today's behaviour.
 */
export async function loadSettings(): Promise<PricingSettings | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("pricing_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as PricingSettingsRow;
    const num = (v: number | null | undefined, fallback: number): number =>
      typeof v === "number" && Number.isFinite(v) ? v : fallback;
    const base = cloneSettings(DEFAULT_PRICING_SETTINGS);
    const twoTier = base.shippingTiers.find((t) => t.minQty === 2)?.priceGBP ?? base.shippingGBP;
    const shipping4 = num(row.shipping_4, base.shippingGBP);
    const shippingTiers: ShippingTier[] = base.shippingTiers.map((t) =>
      t.minQty === 4 ? { ...t, priceGBP: shipping4 } : t.minQty === 2 ? { ...t, priceGBP: num(row.shipping_2, twoTier) } : t,
    );
    const settings: PricingSettings = {
      ...base,
      supplierDiscountPct: num(row.supplier_discount_pct, base.supplierDiscountPct),
      eurToGbp: num(row.eur_gbp, base.eurToGbp),
      retailMarginPct: num(row.margin_pct, base.retailMarginPct),
      vatRate: num(row.vat_pct, base.vatRate * 100) / 100,
      shippingGBP: shipping4,
      shippingTiers,
    };
    return settings;
  } catch {
    return null;
  }
}

/** Sync helper returned to callers so they can check the data source. */
export const getSupabaseClient = () => supabase;

/* ─── Phase 2: signed-in persistence (admin) ─────────────────────────────────
 * Everything below writes through the SHARED supabase client — after the owner
 * signs in, supabase-js attaches the session JWT to every request and the
 * `authenticated` role (RLS) grants products CRUD and pricing_settings
 * select/update. These functions must NEVER run for anonymous visitors: the
 * pricing_settings ones, in particular, are only reachable from /admin.
 * Each function returns { ok, error? } and never throws.
 */

export interface WriteResult {
  ok: boolean;
  error?: string;
}

function writeError(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown write error";
}

/**
 * Upsert the six DB-backed pricing knobs into public.pricing_settings (row
 * id=1): per-item margin %, supplier discount %, EUR→GBP, VAT % (whole
 * percent), shipping for 4+ and 2 wheels. The £75-per-set margin and
 * per-category tyre/accessory shipping have NO columns in the current schema —
 * they stay on the built-in defaults and apply for the session that runs the
 * recalculation (their effect persists via the product prices they produce).
 */
export async function savePricingSettings(
  settings: PricingSettings,
): Promise<WriteResult> {
  if (!supabase) return { ok: false, error: "Supabase is not configured on this build." };
  const client = supabase;
  try {
    const shipping4 =
      settings.shippingTiers.find((t) => t.minQty === 4)?.priceGBP ?? settings.shippingGBP;
    const shipping2 =
      settings.shippingTiers.find((t) => t.minQty === 2)?.priceGBP ?? shipping4;
    const { error } = await client
      .from("pricing_settings")
      .update({
        margin_pct: settings.retailMarginPct,
        supplier_discount_pct: settings.supplierDiscountPct,
        eur_gbp: settings.eurToGbp,
        vat_pct: round2(settings.vatRate * 100),
        shipping_4: shipping4,
        shipping_2: shipping2,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: writeError(e) };
  }
}

/**
 * Update the inline-editable key fields of ONE public.products row (id = slug).
 * Only the fields named in the admin Products tab are accepted.
 */
export async function saveProductRow(
  id: string,
  patch: { name?: string; price_gbp?: number; stock_status?: string },
): Promise<WriteResult> {
  if (!supabase) return { ok: false, error: "Supabase is not configured on this build." };
  const client = supabase;
  try {
    const update: Record<string, unknown> = {
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from("products").update(update).eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: writeError(e) };
  }
}

/**
 * Run the pricing engine over the given catalogue lines with the CURRENT
 * runtime settings and persist the updated price_gbp for every row whose
 * retail price actually changed. Mutates the passed products in place (their
 * retailPriceIncVat becomes the new value — same contract as
 * recalculateAllPrices). rrp_gbp is deliberately left untouched: the engine
 * has no RRP source (the seed stores NULL and the demo data has no rrp), so
 * there is nothing "applicable" to write.
 */
export async function recalcAndPersistPrices(
  products: Product[],
): Promise<{ ok: boolean; error?: string; report: RecalcReport; written: number }> {
  const report = recalculateAllPrices(products);
  if (!supabase) {
    return {
      ok: false,
      error: "Supabase is not configured — prices recalculated in-memory only.",
      report,
      written: 0,
    };
  }
  const client = supabase;
  const changed = products.filter((p) => report.changedIds.includes(p.id));
  if (changed.length === 0) return { ok: true, report, written: 0 };
  try {
    const results = await Promise.all(
      changed.map((p) =>
        client
          .from("products")
          .update({ price_gbp: p.retailPriceIncVat, updated_at: new Date().toISOString() })
          .eq("id", p.id),
      ),
    );
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) return { ok: false, error: firstError.message, report, written: 0 };
    return { ok: true, report, written: changed.length };
  } catch (e) {
    return { ok: false, error: writeError(e), report, written: 0 };
  }
}