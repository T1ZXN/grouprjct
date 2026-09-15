/**
 * N2 Wheels — client-side live-catalogue hydration (Phase 2).
 *
 * Public catalogue routes keep the prerendered SAMPLE content as their SSR
 * baseline (SEO, static export, no-DB builds). In the BROWSER only, these
 * hooks attempt one shared Supabase read of public.products and swap the
 * rendered data to the live rows when (a) the client is configured AND
 * (b) the table is reachable AND (c) it returned real rows — productsSource
 * says which. Any other outcome (no .env, DB unreachable, empty, error)
 * leaves the sample content exactly as prerendered; nothing breaks and no
 * error surfaces in the UI.
 *
 * Safety: this module only ever SELECTs public.products (anon-readable).
 * pricing_settings is NEVER touched here — margins stay out of the public
 * bundle; display prices come from product.price_gbp (retail inc. VAT).
 *
 * The module-level cache + single in-flight promise mean a list page and its
 * detail page share ONE Supabase read per page view.
 */
import { useEffect, useState } from "react";
import { loadProducts, productsSource } from "~/lib/store";
import type { Product } from "~/lib/store";

type CatalogueSource = "supabase" | "demo";

export interface LiveCatalogueState {
  /** Live rows when a Supabase read succeeded, otherwise null. */
  products: Product[] | null;
  /** Where the last loadProducts() result came from. */
  source: CatalogueSource;
}

/* Module-level cache + in-flight guard (client bundle only — this module is
 * never executed during SSR because the hooks below only run in effects). */
let cache: Product[] | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function startLoad(): void {
  if (cache || inflight) return;
  inflight = loadProducts()
    .then((list) => {
      cache = list;
    })
    .catch(() => {
      // loadProducts never throws; this is a belt-and-braces no-op.
    })
    .finally(() => {
      inflight = null;
    });
}

/**
 * Subscribe to the shared live catalogue. Initial value is null/demo — exactly
 * what SSR rendered — so the first client paint always matches the prerender;
 * the effect swaps in live rows once (and only if) they become available.
 */
export function useLiveCatalogue(): LiveCatalogueState {
  const [state, setState] = useState<LiveCatalogueState>(() => ({
    products: cache,
    source: productsSource,
  }));

  useEffect(() => {
    let alive = true;
    const update = () => {
      if (alive) setState({ products: cache, source: productsSource });
    };
    listeners.add(update);
    startLoad();
    const pending = inflight;
    if (pending) void pending.then(update);
    return () => {
      alive = false;
      listeners.delete(update);
    };
  }, []);

  return state;
}

/**
 * Find one live product on a detail page. Returns undefined while the sample
 * (prerendered / loader) row should be shown — i.e. until a Supabase read has
 * actually succeeded. When live data exists, the returned product REPLACES the
 * sample row for rendering (price, stock, name come from the database).
 */
export function useLiveProduct<T extends Product>(
  id: string,
  category: Product["category"],
): T | undefined {
  const { products, source } = useLiveCatalogue();
  if (source !== "supabase" || !products) return undefined;
  return products.find((p) => p.id === id && p.category === category) as
    | T
    | undefined;
}