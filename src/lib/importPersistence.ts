/**
 * importPersistence.ts — Phase 4: persist parsed supplier-feed rows into the
 * Supabase catalogue (public.products) through the SIGNED-IN session.
 *
 * This is the write half of the admin Import tab. The preview half
 * (parseSupplierFeed / parseSupplierExcel → mapFeedRowToProduct) is untouched
 * and stays the single source of truth for what "import" means: the rows this
 * module writes are EXACTLY the mapped products the preview shows, with prices
 * already derived by the pricing engine (priceForProduct) and stock mapped via
 * mapFeedStockToStatus — nothing is re-derived or invented here.
 *
 * HONESTY CONTRACT (hard requirements — never relax):
 *   1. Supabase not configured  -> honest error, NOTHING written.
 *   2. No signed-in session     -> honest error, NOTHING written (RLS would
 *      block anonymous writes anyway, but we never even try).
 *   3. products table missing   -> "Catalogue not ready — run
 *      supabase-setup.sql" (REST 42P01 / 404 "relation does not exist"),
 *      NOTHING written. A success is NEVER fabricated.
 *   4. Per-row outcomes are reported honestly: created / updated / failed /
 *      skipped, failures carry the row id + reason.
 *   5. A result that wrote nothing ALWAYS carries an honest error — including
 *      the "every row was skipped" case, which is not a success. The UI checks
 *      importWroteAnything() before showing any success wording.
 *
 * WRITE BATCHING: upserts run in batches of IMPORT_BATCH_SIZE rows per single
 * PostgREST request (one request per batch — never one request per row on the
 * happy path). If a whole batch is rejected we retry each row individually so
 * the failure can be attributed to the exact row; that fallback is error-path
 * only and is documented below.
 */
import type { Accessory, Tyre, Wheel, WheelPackage } from "~/data/products";
import { round2 } from "~/lib/pricing";
import { supabase } from "~/lib/supabase";
import type { Product, ProductRow } from "~/lib/store";

/** Rows per single upsert request. */
export const IMPORT_BATCH_SIZE = 40;

/** One per-row outcome (failure or skip) — id + honest reason. */
export interface ImportOutcomeItem {
  id: string;
  reason: string;
}

/** Result of an import-to-catalogue run. */
export interface ImportCatalogueResult {
  ok: boolean;
  /** When ok is false this says exactly what was blocked and that nothing (or what) was written. */
  error?: string;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  failures: ImportOutcomeItem[];
  skips: ImportOutcomeItem[];
}

/* ── Honest gate messages (single source of truth for the UI + tests) ─────── */

export const NOT_CONFIGURED_MSG =
  "Supabase is not configured on this build — the Import to catalogue action is unavailable. Nothing was written.";

export const NOT_SIGNED_IN_MSG =
  "You must be signed in to import into the catalogue — sign in at Admin and try again. Nothing was written.";

export const CATALOGUE_NOT_READY_MSG =
  "Catalogue not ready — the database tables haven't been created yet (run supabase-setup.sql in the Supabase SQL Editor). Nothing was written.";

export const NOTHING_MAPPED_MSG =
  "Nothing was written — none of the rows could be mapped to a catalogue row (see the skipped list).";

function blocked(msg: string): ImportCatalogueResult {
  return { ok: false, error: msg, created: 0, updated: 0, failed: 0, skipped: 0, failures: [], skips: [] };
}

/**
 * True ONLY when rows were actually written. A run that was blocked (not
 * configured / not signed in / schema missing) or that skipped every row writes
 * nothing, so `ok` must never be read as "written" on its own: the admin UI
 * uses this predicate before showing any success wording, and a result that
 * wrote nothing always carries an honest `error`.
 */
export function importWroteAnything(res: ImportCatalogueResult): boolean {
  return res.created + res.updated > 0;
}

/**
 * True when a PostgREST/supabase-js error means the products table does not
 * exist yet (schema not run): Postgres error code 42P01 or PostgREST 404
 * "could not find the table … in the schema cache" / "relation … does not
 * exist". Exported so the regression script can pin the contract.
 */
export function isMissingTableError(e: unknown): boolean {
  const err = (e ?? {}) as { code?: string; message?: string };
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "");
  const hay = `${code} ${msg}`.toLowerCase();
  return (
    code === "42p01" ||
    hay.includes("pgrst205") ||
    hay.includes("does not exist") ||
    hay.includes("could not find the table") ||
    hay.includes("relation") && hay.includes("exist")
  );
}

/**
 * READ-ONLY probe that the public.products table exists and is reachable (a
 * signed-in session is NOT required — anon SELECT is allowed by RLS, and this
 * never writes). Used as a cheap pre-flight before any import so a missing
 * schema is reported honestly without attempting a single write.
 */
export async function assertCatalogueReady(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED_MSG };
  const client = supabase;
  try {
    const { error } = await client.from("products").select("id").limit(1);
    if (error) {
      if (isMissingTableError(error)) return { ok: false, error: CATALOGUE_NOT_READY_MSG };
      return { ok: false, error: `Could not reach the catalogue: ${error.message}. Nothing was written.` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: `Could not reach the catalogue: ${e instanceof Error ? e.message : String(e)}. Nothing was written.`,
    };
  }
}

/**
 * The exact shape of a public.products row as produced by productToRow —
 * everything import writes, minus the timestamps the import adds itself.
 * Kept as a separate type so tests can pin the schema contract.
 */
export type ProductRowDraft = Omit<ProductRow, "created_at" | "updated_at">;

/**
 * Map a mapped catalogue product (Wheel | Tyre | WheelPackage | Accessory —
 * the shape produced by mapFeedRowToProduct) onto a public.products row.
 * Category-specific geometry goes into `specs` jsonb exactly as the seed SQL
 * and rowToProduct expect (see /home/team/shared/supabase-setup.sql). Rows
 * missing required fields are SKIPPED (reported, never written).
 */
export function productToRow(
  p: Product,
): { ok: true; row: ProductRowDraft } | { ok: false; reason: string } {
  const id = typeof p.id === "string" ? p.id.trim() : "";
  if (!id) return { ok: false, reason: "Missing id (slug) — row skipped." };
  if (!["wheels", "tyres", "packages", "accessories"].includes(p.category)) {
    return { ok: false, reason: `Unknown category "${String((p as { category?: unknown }).category)}" — row skipped.` };
  }
  if (typeof p.name !== "string" || p.name.trim() === "") {
    return { ok: false, reason: "Missing name — row skipped." };
  }
  if (!Number.isFinite(p.retailPriceIncVat) || p.retailPriceIncVat < 0) {
    return { ok: false, reason: `Retail price "${String(p.retailPriceIncVat)}" is not a number ≥ 0 — row skipped.` };
  }
  if (typeof p.stockStatus !== "string" || p.stockStatus.trim() === "") {
    return { ok: false, reason: "Missing stock status — row skipped." };
  }

  const price_gbp = round2(p.retailPriceIncVat);
  const images = [p.image].filter((x): x is string => typeof x === "string" && x.trim() !== "");
  const description = typeof p.description === "string" && p.description.trim() !== "" ? p.description.trim() : null;
  // brand only exists on wheels/tyres/accessories — packages carry it as null
  // (mirrors the seed rows, whose package brand is NULL).
  const brand = (p as { brand?: unknown }).brand;
  const brandOut = typeof brand === "string" && brand.trim() !== "" ? brand.trim() : null;
  const emptyFitment = { compatibility: [], fitments: [] };

  let specs: Record<string, unknown>;
  let fitment: Record<string, unknown>;
  let package_contents: string[] | null = null;

  if (p.category === "wheels") {
    const w = p as Wheel;
    specs = {
      supplierId: w.supplierId,
      diameter: w.size.diameter,
      width: w.size.width,
      pcd: w.size.pcd,
      offset: w.size.offset,
      colour: w.colour,
      finish: w.finish,
      includedBolts: w.includedBolts || undefined,
    };
    fitment = { compatibility: w.vehicleCompatibility ?? [], fitments: w.vehicleFitments ?? [] };
  } else if (p.category === "tyres") {
    const t = p as Tyre;
    specs = {
      supplierId: t.supplierId,
      width: t.width,
      aspect: t.aspect,
      rimDiameter: t.rimDiameter,
      loadIndex: t.loadIndex,
      speedRating: t.speedRating,
      season: t.season,
    };
    fitment = emptyFitment;
  } else if (p.category === "packages") {
    const pk = p as WheelPackage;
    specs = {
      // Packages have no supplierId on the model — store the slug id like the seed does.
      supplierId: pk.id,
      diameter: pk.diameter,
      wheelSpec: pk.wheelSpec ?? null,
      tyreSpec: pk.tyreSpec ?? null,
    };
    fitment = { compatibility: [], fitments: pk.vehicleFitments ?? [] };
    package_contents = pk.includes ?? [];
  } else {
    const a = p as Accessory;
    specs = { supplierId: a.supplierId };
    fitment = emptyFitment;
  }

  return {
    ok: true,
    row: {
      id,
      category: p.category,
      name: p.name.trim(),
      brand: brandOut,
      price_gbp,
      rrp_gbp: null, // no RRP source in the feed — mirrors the seed
      stock_status: p.stockStatus.trim(),
      images,
      specs,
      fitment,
      description,
      bullets: [],
      package_contents,
    },
  };
}

/**
 * Pure mapping step used by importToCatalogue: split mapped products into
 * writable DB rows and skipped rows (with an honest reason). Exported so the
 * regression script can pin the skip semantics — and the "nothing mappable
 * therefore nothing written" contract — without needing a session.
 */
export function mapProductsToRows(products: Product[]): {
  entries: ProductRowDraft[];
  skips: ImportOutcomeItem[];
} {
  const entries: ProductRowDraft[] = [];
  const skips: ImportOutcomeItem[] = [];
  for (const p of products) {
    const mapped = productToRow(p);
    if (mapped.ok) entries.push(mapped.row);
    else skips.push({ id: p.id || "(no id)", reason: mapped.reason });
  }
  return { entries, skips };
}

/**
 * Import the given mapped products into public.products via the signed-in
 * Supabase session, upserting on id (slug) with the same ON CONFLICT DO UPDATE
 * spirit as the seed SQL: existing ids are updated, new ids inserted. Writes
 * are batched (IMPORT_BATCH_SIZE rows per request). Never throws — every
 * outcome is reported in the result, and the honesty gates above guarantee
 * nothing is written when the environment/session/schema is not ready.
 */
export async function importToCatalogue(products: Product[]): Promise<ImportCatalogueResult> {
  if (!supabase) return blocked(NOT_CONFIGURED_MSG);
  const client = supabase;

  // Gate 1 — signed-in session. RLS would reject anonymous writes anyway, but
  // we fail honestly BEFORE any request so the UI never shows a fake write.
  try {
    const { data } = await client.auth.getSession();
    if (!data.session) return blocked(NOT_SIGNED_IN_MSG);
  } catch (e) {
    return blocked(
      `Could not verify your admin session: ${e instanceof Error ? e.message : String(e)}. Nothing was written.`,
    );
  }

  // Gate 2 — catalogue table exists (read-only probe; never writes).
  const ready = await assertCatalogueReady();
  if (!ready.ok) return blocked(ready.error ?? CATALOGUE_NOT_READY_MSG);

  // Map every product to a DB row. Invalid rows are SKIPPED (reported, never
  // written) — e.g. missing required fields.
  const { entries, skips } = mapProductsToRows(products);
  if (entries.length === 0) {
    // Nothing mappable — report honestly instead of a hollow "ok".
    return {
      ok: false,
      error: NOTHING_MAPPED_MSG,
      created: 0,
      updated: 0,
      failed: 0,
      skipped: skips.length,
      failures: [],
      skips,
    };
  }

  const created: string[] = [];
  const updated: string[] = [];
  const failures: ImportOutcomeItem[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < entries.length; i += IMPORT_BATCH_SIZE) {
    const batch = entries.slice(i, i + IMPORT_BATCH_SIZE);
    const ids = batch.map((r) => r.id);

    // Which ids already exist? Drives the honest created vs updated counts.
    let existing: Set<string>;
    try {
      const { data, error } = await client.from("products").select("id").in("id", ids);
      if (error) {
        if (isMissingTableError(error)) return blocked(CATALOGUE_NOT_READY_MSG);
        return blocked(`Could not read the catalogue before importing: ${error.message}. Nothing was written.`);
      }
      existing = new Set((data ?? []).map((r) => String((r as { id: unknown }).id)));
    } catch (e) {
      return blocked(
        `Could not read the catalogue before importing: ${e instanceof Error ? e.message : String(e)}. Nothing was written.`,
      );
    }

    const rows = batch.map((r) => ({ ...r, updated_at: now }));
    const { error: batchErr } = await client.from("products").upsert(rows, { onConflict: "id" });

    if (!batchErr) {
      for (const r of batch) {
        if (existing.has(r.id)) updated.push(r.id);
        else created.push(r.id);
      }
      continue;
    }

    // Whole batch rejected — attribute failures to the exact row (error path
    // only; the happy path stays one request per batch). A missing table is
    // still the honest not-ready case: abort, nothing further written.
    if (isMissingTableError(batchErr)) return blocked(CATALOGUE_NOT_READY_MSG);
    const retried = await Promise.all(
      batch.map(async (r) => {
        try {
          const { error: rowErr } = await client
            .from("products")
            .upsert({ ...r, updated_at: now }, { onConflict: "id" });
          if (rowErr) return { id: r.id, error: rowErr.message };
          return { id: r.id, error: null };
        } catch (e) {
          return { id: r.id, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
    for (const outcome of retried) {
      if (outcome.error) failures.push({ id: outcome.id, reason: outcome.error });
      else if (existing.has(outcome.id)) updated.push(outcome.id);
      else created.push(outcome.id);
    }
  }

  return {
    ok: failures.length === 0,
    error:
      failures.length > 0
        ? `${failures.length} product row${failures.length === 1 ? "" : "s"} failed to write — see the failure list.`
        : undefined,
    created: created.length,
    updated: updated.length,
    failed: failures.length,
    skipped: skips.length,
    failures,
    skips,
  };
}
