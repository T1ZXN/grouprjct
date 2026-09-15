#!/usr/bin/env bun
/**
 * scripts/gen-supabase-setup.ts — regenerates /home/team/shared/supabase-setup.sql
 * from the CURRENT sample catalogue (src/data/products.ts) and pricing defaults
 * (src/lib/pricing.ts), so the owner's Supabase seed always mirrors the demo
 * data the site ships with. Re-run after demo-data or default-settings changes:
 *
 *     cd /home/team/shared/site && bun ./scripts/gen-supabase-setup.ts
 *
 * Output: /home/team/shared/supabase-setup.sql (path is fixed by the team brief).
 *
 * NOTE on the SQL dollar-quoting: the helpers below deliberately build their
 * delimiters with string concatenation, NOT template literals like
 * `$json$${...}` — in a JS template literal the `$` directly before `${`
 * is consumed as the interpolation marker, silently corrupting the opening
 * delimiter. Concatenation avoids that entire class of bug.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { demoAllProducts } from "../src/data/products";
import type { Accessory, Tyre, Wheel, WheelPackage } from "../src/data/products";
import { DEFAULT_PRICING_SETTINGS } from "../src/lib/pricing";

type AnyProduct = Wheel | Tyre | WheelPackage | Accessory;

/** SQL dollar-quoted literal — safe for any text the demo data contains. */
const lit = (s: string): string => "$$" + s + "$$";
/** SQL dollar-quoted JSON literal cast to jsonb. */
const json = (v: unknown): string => "$json$" + JSON.stringify(v) + "$json$::jsonb";

function specsFor(p: AnyProduct): Record<string, unknown> {
  if (p.category === "wheels") {
    return {
      supplierId: p.supplierId,
      diameter: p.size.diameter,
      width: p.size.width,
      pcd: p.size.pcd,
      offset: p.size.offset,
      colour: p.colour,
      finish: p.finish,
      includedBolts: p.includedBolts,
    };
  }
  if (p.category === "tyres") {
    return {
      supplierId: p.supplierId,
      width: p.width,
      aspect: p.aspect,
      rimDiameter: p.rimDiameter,
      loadIndex: p.loadIndex,
      speedRating: p.speedRating,
      season: p.season,
    };
  }
  if (p.category === "packages") {
    return {
      supplierId: p.id,
      diameter: p.diameter,
      wheelSpec: p.wheelSpec ?? null,
      tyreSpec: p.tyreSpec ?? null,
    };
  }
  return { supplierId: p.supplierId };
}

function rowSql(p: AnyProduct): string {
  const category = p.category;
  const name = p.name;
  const brand = "brand" in p && p.brand ? (p.brand as string) : null;
  const priceGbp = p.retailPriceIncVat.toFixed(2);
  const stock = p.stockStatus;
  const images = [p.image];
  const specs = specsFor(p);
  const fitment = {
    compatibility: category === "wheels" ? p.vehicleCompatibility : [],
    fitments:
      "vehicleFitments" in p && p.vehicleFitments ? (p.vehicleFitments as object[]) : [],
  };
  const description = p.description;
  const bullets =
    category === "wheels" && (p as Wheel).includedBolts
      ? [(p as Wheel).includedBolts]
      : [];
  const packageContents =
    category === "packages" ? (p as WheelPackage).includes : null;

  const cols = [
    lit(p.id),
    lit(category),
    lit(name),
    brand === null ? "null" : lit(brand),
    priceGbp,
    "null", // rrp_gbp — no RRP source in the sample data
    lit(stock),
    json(images),
    json(specs),
    json(fitment),
    lit(description),
    json(bullets),
    packageContents === null ? "null" : json(packageContents),
    "now()",
    "now()",
  ];
  return "  (" + cols.join(", ") + ")";
}

const s = DEFAULT_PRICING_SETTINGS;
const shipping4 =
  s.shippingTiers.find((t) => t.minQty === 4)?.priceGBP ?? s.shippingGBP;
const shipping2 =
  s.shippingTiers.find((t) => t.minQty === 2)?.priceGBP ?? shipping4;
const rows = demoAllProducts.map(rowSql);

const sql = `-- ============================================================================
-- N2 Wheels — Supabase foundation (Phase 1)
-- ----------------------------------------------------------------------------
-- WHERE TO RUN THIS:  Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--   (project: qpwihwkdzsadlaabazsx — "SQL Editor" is the left-hand Database
--    section; there is no need to select a schema, the script hard-codes public)
--
-- IS IT SAFE?  Yes. It only CREATE TABLEs the two tables below in the public
-- schema and grants them to the anon/authenticated roles. Nothing is dropped,
-- deleted or modified outside those two tables. The script is idempotent: it
-- uses IF NOT EXISTS + ON CONFLICT DO UPDATE, so re-running it after the demo
-- data changes simply refreshes the seeded rows to match the site build.
--
-- WHAT IT SETS UP
--   1. public.products — the catalogue. Stores the RETAIL price inc. VAT only:
--      supplier cost / margins are business data and deliberately NOT stored
--      (retail is derived from pricing_settings + the engine in src/lib/pricing.ts).
--      Category-specific geometry lives in jsonb: specs (size/PCD/offset or
--      tyre size), fitment ({compatibility, fitments}), bullets,
--      package_contents (packages) — matching the shapes the site's Product
--      types expect.
--   2. public.pricing_settings — ONE row (id=1) mirroring the current defaults
--      in src/lib/pricing.ts (25% discount, 0.86 EUR->GBP, 55% per-item
--      margin, 20% VAT, £80/£55 shipping; the £75 per wheel-set margin and the
--      1-wheel placeholder tier stay on the site's built-in defaults).
--   3. RLS (Row Level Security) — ON for both tables:
--        products:          anon SELECT only (public catalogue) +
--                           authenticated full CRUD (admin, after sign-in)
--        pricing_settings:  authenticated SELECT/UPDATE ONLY — margins are
--                           business secrets, NEVER readable by anon/visitors.
--      The anon key the website uses CANNOT read pricing_settings — that is
--      the point. Admin edits go through the authenticated role.
--   4. Seeds the current sample catalogue (18 demo products) so the site works
--      immediately after this runs, replicating the built-in demo data exactly.
-- ============================================================================

begin;

-- ------------------------------------------------------------------ products
create table if not exists public.products (
  id               text primary key,          -- slug, e.g. 'w-forza-r1-18'
  category         text not null,             -- wheels | tyres | packages | accessories
  name             text not null,
  brand            text,
  price_gbp        numeric not null check (price_gbp >= 0),  -- retail inc. VAT
  rrp_gbp          numeric,                   -- optional reference price, NULL for now
  stock_status     text not null,             -- In Stock | Available to order | Out of stock | Contact us
  images           jsonb not null default '[]'::jsonb,      -- array of image paths
  specs            jsonb not null default '{}'::jsonb,      -- per-category geometry (see comment above)
  fitment          jsonb not null default '{}'::jsonb,      -- { compatibility: [], fitments: [] }
  description      text,
  bullets          jsonb not null default '[]'::jsonb,      -- merchandising bullet lines
  package_contents jsonb,                                    -- string[] for packages, else NULL
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category);
create index if not exists products_stock_idx    on public.products (stock_status);

-- ------------------------------------------------------------ pricing settings
-- Single-row table (id is locked to 1). Fields persist the brief's key pricing
-- knobs; vat_pct is a whole percent (20 = 20%).
create table if not exists public.pricing_settings (
  id                   int primary key default 1 check (id = 1),
  margin_pct           numeric not null,   -- per-item retail margin % (tyres/accessories)
  supplier_discount_pct numeric not null,  -- % off supplier list price
  eur_gbp              numeric not null,   -- EUR -> GBP exchange rate
  vat_pct              numeric not null,   -- UK VAT as a whole percent (20 = 20%)
  shipping_4           numeric not null,   -- delivery: 4+ wheels
  shipping_2           numeric not null,   -- delivery: 2 wheels
  updated_at           timestamptz not null default now()
);

-- ------------------------------------------------------------------------- RLS
alter table public.products        enable row level security;
alter table public.pricing_settings enable row level security;

-- products: anon may read (public catalogue); authenticated gets full CRUD.
drop policy if exists "anon reads products"            on public.products;
drop policy if exists "authenticated reads products"   on public.products;
drop policy if exists "authenticated inserts products" on public.products;
drop policy if exists "authenticated updates products" on public.products;
drop policy if exists "authenticated deletes products" on public.products;

create policy "anon reads products"
  on public.products for select to anon using (true);

create policy "authenticated reads products"
  on public.products for select to authenticated using (true);
create policy "authenticated inserts products"
  on public.products for insert to authenticated with check (true);
create policy "authenticated updates products"
  on public.products for update to authenticated using (true) with check (true);
create policy "authenticated deletes products"
  on public.products for delete to authenticated using (true);

-- pricing_settings: authenticated SELECT/UPDATE ONLY — never anon. Margins are
-- business secrets; the website's anon key cannot read them.
drop policy if exists "authenticated reads settings"  on public.pricing_settings;
drop policy if exists "authenticated updates settings" on public.pricing_settings;

create policy "authenticated reads settings"
  on public.pricing_settings for select to authenticated using (true);
create policy "authenticated updates settings"
  on public.pricing_settings for update to authenticated using (true) with check (true);

-- ----------------------------------------------------------------------- grants
grant usage on schema public to anon, authenticated;
grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant select, update on public.pricing_settings to authenticated;

-- ------------------------------------------------------------- seed settings
insert into public.pricing_settings
  (id, margin_pct, supplier_discount_pct, eur_gbp, vat_pct, shipping_4, shipping_2, updated_at)
values
  (1, ${s.retailMarginPct}, ${s.supplierDiscountPct}, ${s.eurToGbp}, ${Math.round(s.vatRate * 100)}, ${shipping4}, ${shipping2}, now())
on conflict (id) do update set
  margin_pct = excluded.margin_pct,
  supplier_discount_pct = excluded.supplier_discount_pct,
  eur_gbp = excluded.eur_gbp,
  vat_pct = excluded.vat_pct,
  shipping_4 = excluded.shipping_4,
  shipping_2 = excluded.shipping_2,
  updated_at = excluded.updated_at;

-- ------------------------------------------------------------- seed catalogue
-- The current 18 sample products (6 wheels, 3 tyres, 3 packages, 6 accessories),
-- mapped onto the schema. price_gbp = the retail price the site displays today.
-- Re-running refreshes these rows (ON CONFLICT DO UPDATE); other rows are untouched.
insert into public.products
  (id, category, name, brand, price_gbp, rrp_gbp, stock_status, images, specs, fitment, description, bullets, package_contents, created_at, updated_at)
values
${rows.join(",\n")}
on conflict (id) do update set
  category = excluded.category,
  name = excluded.name,
  brand = excluded.brand,
  price_gbp = excluded.price_gbp,
  rrp_gbp = excluded.rrp_gbp,
  stock_status = excluded.stock_status,
  images = excluded.images,
  specs = excluded.specs,
  fitment = excluded.fitment,
  description = excluded.description,
  bullets = excluded.bullets,
  package_contents = excluded.package_contents,
  updated_at = excluded.updated_at;

commit;

-- Done. Sanity check (should show 18 rows):   select count(*) from public.products;
`;

const OUT = "/home/team/shared/supabase-setup.sql";
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, sql, "utf8");
console.log(
  "wrote " + OUT + " (" + sql.length.toLocaleString() + " bytes, " +
    demoAllProducts.length + " products seeded)"
);