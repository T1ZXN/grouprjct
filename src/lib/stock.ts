/**
 * stock.ts — supplier-feed stock mapping for N2 Wheels.
 *
 * ⚠️ FORZZA FEED INTEGRATION POINT ⚠️
 * These functions are the seam where the real supplier feed (XML/CSV) will be
 * connected later. They are deliberately pure and synchronous so a future
 * SCHEDULED SYNC job (server-side, on a timer) can call
 *
 *   const feed = await fetchSupplierFeed();        // future: server-only fetch
 *   syncStockFromFeed(feed.products, catalogue);   // this module
 *
 * without changing any calling code. The real feed URLs are NEVER embedded in
 * front-end code — they live in server-side configuration only, and nothing
 * in this function ever touches the network.
 *
 * For now every call site is the admin "demo import" — sample data only, no
 * live stock or supplier data is claimed anywhere on the site.
 */
import type { StockStatus } from "~/data/products";

/** One stock record as a supplier feed would carry it. */
export interface FeedStockItem {
  /** Supplier catalogue ID (the future import key), e.g. "FZ-1001". */
  supplierId: string;
  /** Raw stock code from the feed: "in_stock", "out_of_stock", "on_order", ... */
  stock: string;
  /** Optional feed quantity where supplied. */
  qty?: number;
}

/** Minimal catalogue shape syncStockFromFeed needs (products expose this). */
export interface StockableProduct {
  supplierId: string;
  stockStatus: StockStatus;
}

/**
 * Map a raw feed stock code to the site's StockStatus vocabulary.
 *   in_stock / available / 1 / true / yes      -> "In Stock"
 *   out_of_stock / 0 / false / discontinued    -> "Out of stock"
 *   on_order / backorder / available_to_order  -> "Available to order"
 *   anything unrecognised                      -> "Contact us" (honest fallback:
 *                                                  we never guess a status).
 */
export function mapFeedStockToStatus(code: string | number | null | undefined): StockStatus {
  const c = String(code ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (["in_stock", "instock", "available", "delivery", "1", "true", "yes", "y", "in"].includes(c)) {
    return "In Stock";
  }
  if (
    ["out_of_stock", "outofstock", "out", "unavailable", "discontinued", "0", "false", "no", "n"].includes(c)
  ) {
    return "Out of stock";
  }
  if (
    [
      "on_order",
      "onorder",
      "order",
      "backorder",
      "available_to_order",
      "availabletoorder",
      "preorder",
      "eta",
      "awaiting",
    ].includes(c)
  ) {
    return "Available to order";
  }
  return "Contact us";
}

export interface StockSyncReport {
  /** Number of feed items matched to catalogue products. */
  updated: number;
  /** Number of matched products whose status actually changed. */
  changed: number;
  /** supplierIds in the feed with no matching catalogue product. */
  unmatched: string[];
}

/**
 * Apply feed stock values to a catalogue (stub for the future scheduled sync).
 * Mutates `products` in place for matched supplierIds; unmatched IDs are
 * reported, never fabricated. Unknown feed codes map to "Contact us" so the
 * site never claims availability it cannot verify.
 */
export function syncStockFromFeed(
  feed: FeedStockItem[],
  products: StockableProduct[],
): StockSyncReport {
  const bySupplierId = new Map(products.map((p) => [p.supplierId, p]));
  let updated = 0;
  let changed = 0;
  const unmatched: string[] = [];

  for (const item of feed) {
    const product = bySupplierId.get(item.supplierId);
    if (!product) {
      unmatched.push(item.supplierId);
      continue;
    }
    updated += 1;
    const next = mapFeedStockToStatus(item.stock);
    if (product.stockStatus !== next) {
      product.stockStatus = next;
      changed += 1;
    }
  }

  return { updated, changed, unmatched };
}