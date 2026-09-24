import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { chipFor } from "~/components/ProductCard";
import { demoAllProducts, STOCK_STATUSES } from "~/data/products";
import type { Accessory, StockStatus, Tyre, Wheel, WheelPackage } from "~/data/products";
import {
  formatGBP,
  getPricingSettings,
  resetPricingSettings,
  round2,
  setPricingSettings,
  shippingForCategory,
  shippingForQuantity,
} from "~/lib/pricing";
import type { PricingSettings, RecalcReport, ShippingTier } from "~/lib/pricing";
import { supabase } from "~/lib/supabase";
import {
  mapFeedRowToProduct,
  parseSupplierExcel,
  parseSupplierFeed,
  renderRowsToCsv,
  SAMPLE_CSV,
  SAMPLE_XML,
} from "~/lib/import";
import type { ParseResult } from "~/lib/import";
import { syncStockFromFeed } from "~/lib/stock";
import type { StockSyncReport } from "~/lib/stock";
import {
  loadProducts,
  loadSettings,
  productsSource,
  recalcAndPersistPrices,
  savePricingSettings,
  saveProductRow,
} from "~/lib/store";
import { importToCatalogue, importWroteAnything } from "~/lib/importPersistence";
import type { ImportCatalogueResult } from "~/lib/importPersistence";
import { adminAccessVerdict, readAdminAllowList } from "~/lib/adminAccess";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "N2 Wheels Admin — demo tooling" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "N2 Wheels internal admin tooling — sample/demo only, no live feed connected." },
    ],
  }),
  component: AdminPage,
});

type Tab = "pricing" | "products" | "import";
type MappedProduct = Wheel | Tyre | WheelPackage | Accessory;

/** Catalogue lines expose supplierId except WheelPackage (packages use id). */
const skuOf = (p: { id: string; supplierId?: string }): string => p.supplierId ?? p.id;

interface Draft {
  supplierDiscountPct: string;
  eurToGbp: string;
  retailMarginPct: string;
  retailMarginPerSetGBP: string;
  vatRatePct: string;
  tiers: { minQty: number; priceGBP: string }[];
  shippingTyres: string;
  shippingAccessories: string;
}

const num = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

function draftFromSettings(s: PricingSettings): Draft {
  return {
    supplierDiscountPct: String(s.supplierDiscountPct),
    eurToGbp: String(s.eurToGbp),
    retailMarginPct: String(s.retailMarginPct),
    retailMarginPerSetGBP: String(s.retailMarginPerSetGBP),
    vatRatePct: String(round2(s.vatRate * 100)),
    tiers: s.shippingTiers.map((t) => ({ minQty: t.minQty, priceGBP: String(t.priceGBP) })),
    shippingTyres: String(s.shippingByCategory.tyres),
    shippingAccessories: String(s.shippingByCategory.accessories),
  };
}

/** Parse the form draft into a full PricingSettings object (or report a validation error). */
function draftToSettings(d: Draft): { settings: PricingSettings | null; error?: string } {
  const discount = num(d.supplierDiscountPct);
  const rate = num(d.eurToGbp);
  const marginPct = num(d.retailMarginPct);
  const marginSet = num(d.retailMarginPerSetGBP);
  const vatPct = num(d.vatRatePct);
  const tyres = num(d.shippingTyres);
  const accessories = num(d.shippingAccessories);
  if (discount === null || discount < 0) return { settings: null, error: "Supplier discount must be a number ≥ 0." };
  if (rate === null || rate <= 0) return { settings: null, error: "EUR→GBP rate must be a positive number." };
  if (marginPct === null || marginPct < 0) return { settings: null, error: "Retail margin % must be a number ≥ 0." };
  if (marginSet === null || marginSet < 0) return { settings: null, error: "Margin per wheel set must be a number ≥ 0." };
  if (vatPct === null || vatPct < 0) return { settings: null, error: "VAT % must be a number ≥ 0." };
  if (tyres === null || tyres < 0) return { settings: null, error: "Tyre shipping must be a number ≥ 0." };
  if (accessories === null || accessories < 0) return { settings: null, error: "Accessory shipping must be a number ≥ 0." };
  const tierPrices = d.tiers.map((t) => num(t.priceGBP));
  if (tierPrices.some((n) => n === null || n! < 0)) {
    return { settings: null, error: "Every shipping tier must be a number ≥ 0." };
  }
  const shippingTiers: ShippingTier[] = d.tiers.map((t, i) => ({
    minQty: t.minQty,
    priceGBP: tierPrices[i] ?? 0,
    label: `≥ ${t.minQty} wheel${t.minQty > 1 ? "s" : ""}`,
  }));
  const base = getPricingSettings();
  return {
    settings: {
      ...base,
      supplierDiscountPct: discount,
      eurToGbp: rate,
      retailMarginPct: marginPct,
      retailMarginPerSetGBP: marginSet,
      vatRate: vatPct / 100,
      shippingGBP: shippingTiers[0]?.priceGBP ?? 0,
      shippingTiers,
      shippingByCategory: { tyres, accessories },
    },
  };
}

const inputCls =
  "w-full rounded-md border border-line bg-coal px-3 py-2 text-sm text-white placeholder:text-steel-dim focus:border-race focus:outline-none";

/* ─── Phase 1: Supabase auth gate ────────────────────────────────────────────
 * /admin is owner/team-only. Sign-in uses the real Supabase project (anon key,
 * RLS-protected, see /home/team/shared/supabase-setup.sql). Session persists in
 * localStorage via supabase-js. When Supabase is not configured the gate shows
 * a styled "offline" card instead of crashing. First-run sign-up creates the
 * owner's admin account from the UI (email confirmation may apply — the gate
 * says so if it does). NO account is ever auto-created.
 */
type AuthMode = "signin" | "signup";

const OWNER_EMAIL_HINT = "enquiry@n2wheels.co.uk";

/** Styled black/red sign-in card (also used for the unconfigured state). */
function AdminAuthGate() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!supabase) {
    return (
      <div className="bg-night">
        <div className="container-x grid min-h-[70vh] place-items-center py-16">
          <div className="w-full max-w-md rounded-lg border border-line bg-carbon p-8 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-race text-xl font-black text-white">N2</span>
            <h1 className="mt-4 text-xl font-black tracking-tight text-white">Admin — Pricing settings &amp; tooling</h1>
            <p className="mt-3 text-sm leading-relaxed text-steel">
              Admin sign-in is offline: the Supabase environment variables
              (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) are not set on this build.
              The rest of the site keeps running on sample data — nothing here is broken.
            </p>
          </div>
        </div>
      </div>
    );
  }
  // Narrowed for the async handlers below (TS can't keep the null-check
  // across closure boundaries).
  const client = supabase;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signin") {
        const { error: err } = await client.auth.signInWithPassword({ email, password });
        if (err) setError(err.message);
        // On success the onAuthStateChange subscription flips the page to the dashboard.
      } else {
        const { data, error: err } = await client.auth.signUp({ email, password });
        if (err) {
          setError(err.message);
        } else if (!data.session) {
          setInfo("Account created — check your inbox for the confirmation email, then sign in.");
        }
        // If a session came back immediately, the subscription flips the page.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-night">
      <div className="container-x grid min-h-[70vh] place-items-center py-16">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-line bg-carbon p-8">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-md bg-race text-lg font-black text-white">N2</span>
              <div>
                <h1 className="text-lg font-black tracking-tight text-white">Admin sign-in</h1>
                <p className="text-xs text-steel">Pricing settings · catalogue · import tooling</p>
              </div>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block">
                <span className="field-label">Email</span>
                <input
                  className="field-input"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={OWNER_EMAIL_HINT}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">Password</span>
                <input
                  className="field-input"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              {error && (
                <p className="rounded-md border border-race/40 bg-race/10 px-3 py-2 text-xs text-race-bright">{error}</p>
              )}
              {info && (
                <p className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">{info}</p>
              )}

              <button type="submit" disabled={busy} className="btn btn-red w-full">
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create admin account"}
              </button>
            </form>

            <div className="mt-5 border-t border-line pt-4 text-center text-xs text-steel">
              {mode === "signin" ? (
                <>
                  First time here?{" "}
                  <button
                    type="button"
                    className="font-semibold text-race-bright hover:underline"
                    onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
                  >
                    Create your admin account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="font-semibold text-race-bright hover:underline"
                    onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
          <p className="mt-4 text-center text-[11px] leading-relaxed text-steel-dim">
            Owner-only area. Sign-in is handled by the project&apos;s Supabase auth — sessions persist
            in your browser. No account is created automatically. Admin pages are excluded from search engines.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Route component: resolves the persisted Supabase session, then renders either
 * the sign-in gate or the (existing) admin dashboard. All auth calls happen
 * client-side in effects/handlers — nothing runs against Supabase at prerender.
 */
function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        setSession(data.session);
        setAuthReady(true);
      })
      .catch(() => {
        if (!alive) return;
        setAuthReady(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (alive) setSession(s);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = () => {
    void supabase?.auth.signOut(); // onAuthStateChange clears the session state
  };

/**
 * Shown when a signed-in account is NOT on the admin allow-list
 * (VITE_ADMIN_EMAILS). Customer accounts are authenticated users of the same
 * Supabase project, so without this check a shop account would see the admin
 * tooling. With no allow-list configured the behaviour is unchanged.
 */
function AdminNoAccess({ onSignOut, message }: { onSignOut: () => void; message: string }) {
  return (
    <div className="bg-night">
      <div className="container-x grid min-h-[70vh] place-items-center py-16">
        <div className="w-full max-w-md rounded-lg border border-line bg-carbon p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-race text-xl font-black text-white">N2</span>
          <h1 className="mt-4 text-xl font-black tracking-tight text-white">Admin — no access for this account</h1>
          <p className="mt-3 text-sm leading-relaxed text-steel">{message}</p>
          <button type="button" onClick={onSignOut} className="btn btn-outline mt-6">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

  if (!authReady) {
    return (
      <div className="bg-night">
        <div className="container-x grid min-h-[70vh] place-items-center py-16">
          <div className="text-center">
            <p className="text-sm font-semibold text-steel">Admin — Pricing settings …</p>
            <p className="mt-2 text-xs text-steel-dim">Checking sign-in…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return <AdminAuthGate />;
  // Owner-only allow-list (see src/lib/adminAccess.ts): a shop account signed in
  // on /account is a valid Supabase user, and must NOT reach this tooling.
  const access = adminAccessVerdict(session.user?.email ?? null, readAdminAllowList());
  if (!access.allowed) {
    return (
      <AdminNoAccess
        onSignOut={signOut}
        message={access.message ?? "This account doesn't have admin access."}
      />
    );
  }
  return <AdminDashboard onSignOut={signOut} />;
}

function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("pricing");
  const [draft, setDraft] = useState<Draft>(() => draftFromSettings(getPricingSettings()));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [recalc, setRecalc] = useState<RecalcReport | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  // Phase 2 — live Supabase state for the Pricing + Products tabs (signed-in only).
  const [settingsLoaded, setSettingsLoaded] = useState<"loading" | "db" | "defaults">("loading");
  const [products, setProducts] = useState<MappedProduct[] | null>(null);
  const [productDrafts, setProductDrafts] = useState<
    Record<string, { name: string; price: string; stock: StockStatus }>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Signed-in only: load the current pricing row (id=1) and the live product
  // rows once. Covers Supabase unconfigured/unreachable: loadSettings() returns
  // null -> keep in-memory defaults, loadProducts() returns the sample list.
  useEffect(() => {
    let alive = true;
    (async () => {
      const loaded = await loadSettings();
      if (!alive) return;
      if (loaded) {
        setPricingSettings(loaded);
        setDraft(draftFromSettings(loaded));
        setSettingsLoaded("db");
      } else {
        setSettingsLoaded("defaults");
      }
      const list = await loadProducts();
      if (!alive) return;
      setProducts(list);
      setProductDrafts(
        Object.fromEntries(
          list.map((p) => [
            p.id,
            { name: p.name, price: String(p.retailPriceIncVat), stock: p.stockStatus },
          ]),
        ),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Import tab state.
  const [importText, setImportText] = useState<string>(SAMPLE_CSV);
  const [importFileName, setImportFileName] = useState("sample-feed.csv");
  /** Rows decoded from an uploaded .xls/.xlsx first worksheet (SheetJS, lazy). */
  const [importExcelRows, setImportExcelRows] = useState<readonly (readonly unknown[])[] | null>(null);
  const [importResult, setImportResult] = useState<{
    summary: ParseResult;
    mapped: MappedProduct[];
    sync: StockSyncReport;
  } | null>(null);
  // Phase 4 — import-to-catalogue persistence (signed-in only).
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportCatalogueResult | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setTier = (i: number, patch: Partial<{ minQty: number; priceGBP: string }>) =>
    setDraft((d) => ({
      ...d,
      tiers: d.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    }));

  /** Keep per-row drafts' price in sync after a bulk recalculation. */
  const applyRecalcToDrafts = (catalogue: MappedProduct[]) => {
    setProductDrafts((prev) => {
      const next = { ...prev };
      for (const p of catalogue) {
        const current = next[p.id];
        if (current) next[p.id] = { ...current, price: String(p.retailPriceIncVat) };
      }
      return next;
    });
  };

  /**
   * Save the pricing form. With Supabase configured this persists the six
   * DB-backed knobs to public.pricing_settings through the signed-in session,
   * then recomputes every product's retail price with the pricing engine and
   * writes the changed price_gbp values to public.products. Without Supabase
   * it is the old in-memory demo behaviour (applies to this running build).
   */
  const saveAndRecalculate = async () => {
    const { settings, error } = draftToSettings(draft);
    if (!settings) {
      setMessage({ ok: false, text: error ?? "Settings are invalid." });
      return;
    }
    if (supabase) {
      setSavingSettings(true);
      const sRes = await savePricingSettings(settings);
      if (!sRes.ok) {
        setSavingSettings(false);
        setMessage({
          ok: false,
          text: `Could not save settings to Supabase: ${sRes.error} Check you are signed in (session may have expired) and try again. Nothing was changed.`,
        });
        return;
      }
    }
    setPricingSettings(settings);
    const catalogue = await loadProducts();
    const { ok, error: pErr, report, written } = await recalcAndPersistPrices(catalogue);
    setRecalc(report);
    setProducts(catalogue);
    applyRecalcToDrafts(catalogue);
    setSavingSettings(false);
    if (!supabase) {
      setMessage({
        ok: true,
        text: `Settings applied & prices recalculated — ${report.changed} of ${report.count} product prices changed. (No Supabase on this build: in-memory demo, applies to this running build and resets on rebuild.)`,
      });
      return;
    }
    if (ok) {
      setMessage({
        ok: true,
        text: `Settings saved to your Supabase project & retail prices recalculated — ${report.changed} of ${report.count} prices changed, ${written} product row${
          written === 1 ? "" : "s"
        } updated in the database.`,
      });
    } else {
      setMessage({ ok: false, text: `Settings saved, but updating product prices failed: ${pErr}` });
    }
  };

  const resetDefaults = async () => {
    const defaults = resetPricingSettings();
    setDraft(draftFromSettings(defaults));
    setRecalc(null);
    if (!supabase) {
      setMessage({
        ok: true,
        text: "Settings reset to the business-brief defaults (~25% discount, £75/set margin, £80 4-wheel shipping, 20% VAT). (No Supabase on this build: in-memory demo only.)",
      });
      return;
    }
    setSavingSettings(true);
    const sRes = await savePricingSettings(defaults);
    if (!sRes.ok) {
      setSavingSettings(false);
      setMessage({ ok: false, text: `Defaults applied in this browser, but could not be saved: ${sRes.error}` });
      return;
    }
    const catalogue = await loadProducts();
    const { ok, report, written } = await recalcAndPersistPrices(catalogue);
    setRecalc(report);
    setProducts(catalogue);
    applyRecalcToDrafts(catalogue);
    setSavingSettings(false);
    setMessage({
      ok: ok,
      text: ok
        ? `Defaults saved to your Supabase project — ${report.changed} of ${report.count} prices changed, ${written} product row${
            written === 1 ? "" : "s"
          } updated.`
        : "Defaults saved, but the subsequent price update failed — check the database and retry.",
    });
  };

  /** Products-tab draft helpers (signed-in live rows). */
  const setDraftField = (id: string, field: "name" | "price" | "stock", value: string) =>
    setProductDrafts((prev) => {
      const cur = prev[id] ?? { name: "", price: "", stock: "In Stock" as StockStatus };
      return { ...prev, [id]: { ...cur, [field]: field === "stock" ? (value as StockStatus) : value } };
    });

  /** Inline save of one product row (name / retail price / stock status). */
  const saveRow = async (p: MappedProduct) => {
    const e = productDrafts[p.id] ?? {
      name: p.name,
      price: String(p.retailPriceIncVat),
      stock: p.stockStatus,
    };
    const priceNum = Number(e.price);
    if (e.name.trim() === "" || !Number.isFinite(priceNum) || priceNum < 0) {
      setMessage({ ok: false, text: "Name must be non-empty and the price must be a number ≥ 0." });
      return;
    }
    if (!STOCK_STATUSES.includes(e.stock)) {
      setMessage({ ok: false, text: "Please pick one of the four stock statuses." });
      return;
    }
    setSavingId(p.id);
    const res = await saveProductRow(p.id, {
      name: e.name.trim(),
      price_gbp: round2(priceNum),
      stock_status: e.stock,
    });
    setSavingId(null);
    if (res.ok) {
      setMessage({ ok: true, text: `Saved ${p.id} — retail ${formatGBP(round2(priceNum))}, stock “${e.stock}”.` });
    } else {
      setMessage({ ok: false, text: `Could not save ${p.id}: ${res.error}` });
    }
  };

  const processImport = () => {
    // Excel files are parsed straight from the decoded worksheet rows (same
    // normalised columns as CSV/XML); CSV/XML/text go through the dispatcher.
    const summary = importExcelRows
      ? parseSupplierExcel(importExcelRows)
      : parseSupplierFeed(importText, importFileName);
    const mapped = summary.rows
      .map((r) => mapFeedRowToProduct(r))
      .filter((p): p is MappedProduct => p !== null);
    const sync = syncStockFromFeed(
      summary.rows.map((r) => ({ supplierId: r.supplierId, stock: r.stock })),
      demoAllProducts.map((p) => ({ supplierId: skuOf(p), stockStatus: p.stockStatus })),
    );
    setImportResult({ summary, mapped, sync });
    setImportReport(null);
  };

  /**
   * Phase 4 — write the CURRENT preview's mapped rows into public.products
   * through the signed-in session. Preview and import share the exact same
   * mapped rows (mapFeedRowToProduct / parseSupplierExcel), so what you see
   * in the preview table is precisely what gets upserted. Batched writes,
   * honest per-row report, and nothing is written when the session is missing
   * or the schema hasn't been created (see importPersistence.ts).
   */
  const persistImport = async () => {
    if (!importResult || importResult.mapped.length === 0) {
      setMessage({
        ok: false,
        text: "Run “Process demo import” first so there is a parsed preview to write.",
      });
      return;
    }
    setImporting(true);
    setImportReport(null);
    const res = await importToCatalogue(importResult.mapped);
    setImporting(false);
    setImportReport(res);
    if (!importWroteAnything(res) && res.failed === 0) {
      // Nothing was written — blocked honestly (not configured / not signed in /
      // schema missing) or every row was skipped. Never a success message.
      setMessage({ ok: false, text: res.error ?? "Import finished but nothing was written." });
    } else {
      setMessage({
        ok: res.ok,
        text: res.error
          ? `Import finished: ${res.created} created, ${res.updated} updated, ${res.failed} failed, ${res.skipped} skipped. ${res.error}`
          : `Import finished: ${res.created} created, ${res.updated} updated, ${res.skipped} skipped.`,
      });
    }
  };

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
        tab === id ? "bg-race text-white" : "text-steel hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-night">
      <div className="border-b border-line bg-carbon">
        <div className="container-x py-10">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-race text-lg font-black text-white">N2</span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Admin</h1>
              <p className="text-sm text-steel">Pricing engine · catalogue · supplier import — internal tooling</p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="btn btn-outline ml-auto px-3 py-2 text-xs"
              title="End this browser session"
            >
              Sign out
            </button>
          </div>
          <div className="mt-4 flex max-w-2xl gap-2 rounded-md border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
            Admin tooling — demo import, no live feed connected. Product rows, stock and supplier
            numbers remain SAMPLE data. When you are signed in, pricing settings and per-row product
            edits Save to your Supabase project (public.pricing_settings / public.products); the
            Import tab can preview a supplier feed, then write the mapped rows into public.products
            in one batched upsert (“Import to catalogue”).
          </div>
        </div>
      </div>

      <div className="container-x py-8">
        <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-line bg-carbon p-1">
          {tabBtn("pricing", "Pricing settings")}
          {tabBtn("products", "Products")}
          {tabBtn("import", "Import")}
        </div>

        {message && (
          <div
            className={`mb-6 rounded-md border px-4 py-3 text-sm ${
              message.ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-race/40 bg-race/10 text-race-bright"
            }`}
          >
            {message.text}
          </div>
        )}

        {tab === "pricing" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <section className="rounded-lg border border-line bg-carbon p-6 lg:col-span-2">
              <h2 className="text-lg font-bold text-white">Pricing settings</h2>
              <p className="mt-1 text-xs text-steel">
                Every retail price on the site derives from these values — nothing is hard-coded per
                product. The wheel-set margin (+£75 per set of 4) applies to wheels &amp; packages;
                tyres &amp; accessories use the per-item margin %.
              </p>
              {settingsLoaded === "db" ? (
                <p className="mt-2 text-xs font-semibold text-emerald-300">
                  Loaded your current pricing row (id=1) from Supabase — Save persists it and the
                  recalculated retail prices.
                </p>
              ) : settingsLoaded === "defaults" ? (
                <p className="mt-2 text-xs font-semibold text-amber-200">
                  Pricing row not readable (no Supabase on this build, or the table is unreachable) —
                  showing the built-in defaults. Save applies in-memory only and will not persist.
                </p>
              ) : (
                <p className="mt-2 text-xs text-steel-dim">Loading your current pricing…</p>
              )}

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-steel">Supplier discount %</span>
                  <input
                    className={`${inputCls} mt-1`}
                    value={draft.supplierDiscountPct}
                    onChange={(e) => set({ supplierDiscountPct: e.target.value })}
                    inputMode="decimal"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-steel">EUR → GBP rate</span>
                  <input
                    className={`${inputCls} mt-1`}
                    value={draft.eurToGbp}
                    onChange={(e) => set({ eurToGbp: e.target.value })}
                    inputMode="decimal"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-steel">Retail margin % (per item)</span>
                  <input
                    className={`${inputCls} mt-1`}
                    value={draft.retailMarginPct}
                    onChange={(e) => set({ retailMarginPct: e.target.value })}
                    inputMode="decimal"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-steel">Retail margin per wheel set (£)</span>
                  <input
                    className={`${inputCls} mt-1`}
                    value={draft.retailMarginPerSetGBP}
                    onChange={(e) => set({ retailMarginPerSetGBP: e.target.value })}
                    inputMode="decimal"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-steel">VAT %</span>
                  <input
                    className={`${inputCls} mt-1`}
                    value={draft.vatRatePct}
                    onChange={(e) => set({ vatRatePct: e.target.value })}
                    inputMode="decimal"
                  />
                </label>
              </div>

              <h3 className="mt-7 text-sm font-bold uppercase tracking-wider text-white">Shipping tiers (wheels, per order)</h3>
              <div className="mt-3 space-y-2">
                {draft.tiers.map((t, i) => (
                  <div key={t.minQty} className="flex items-center gap-3">
                    <span className="w-40 text-xs text-steel">
                      {t.minQty >= 4 ? "4+ wheels (full set)" : `${t.minQty} wheel${t.minQty > 1 ? "s" : ""}`}
                    </span>
                    <span className="text-steel-dim">£</span>
                    <input
                      className={`${inputCls} max-w-32`}
                      value={t.priceGBP}
                      onChange={(e) => setTier(i, { priceGBP: e.target.value })}
                      inputMode="decimal"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-steel">Shipping — tyres (per order)</span>
                  <input
                    className={`${inputCls} mt-1`}
                    value={draft.shippingTyres}
                    onChange={(e) => set({ shippingTyres: e.target.value })}
                    inputMode="decimal"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-steel">Shipping — accessories (per order)</span>
                  <input
                    className={`${inputCls} mt-1`}
                    value={draft.shippingAccessories}
                    onChange={(e) => set({ shippingAccessories: e.target.value })}
                    inputMode="decimal"
                  />
                </label>
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-red"
                  onClick={() => void saveAndRecalculate()}
                  disabled={savingSettings}
                >
                  {savingSettings ? "Saving…" : "Save &amp; recalculate prices"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => void resetDefaults()}
                  disabled={savingSettings}
                >
                  {savingSettings ? "Saving…" : "Reset to brief defaults"}
                </button>
              </div>
              {recalc && (
                <p className="mt-4 text-xs text-steel">
                  Last recalculation: {recalc.count} products scanned — {recalc.changed} price changes
                  ({recalc.changedIds.length ? recalc.changedIds.slice(0, 8).join(", ") : "none"}…).
                </p>
              )}
            </section>

            <aside className="space-y-6">
              <div className="rounded-lg border border-line bg-carbon p-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Current settings</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-steel">Discount</dt><dd className="font-semibold text-white">{draft.supplierDiscountPct}%</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-steel">EUR → GBP</dt><dd className="font-semibold text-white">{draft.eurToGbp}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-steel">Margin / wheel set</dt><dd className="font-semibold text-white">{formatGBP(Number(draft.retailMarginPerSetGBP) || 0)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-steel">VAT</dt><dd className="font-semibold text-white">{draft.vatRatePct}%</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-steel">Shipping 4 wheels</dt><dd className="font-semibold text-white">{formatGBP(shippingForQuantity(4))}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-steel">Shipping 2 / 1 wheel</dt><dd className="font-semibold text-white">{formatGBP(shippingForQuantity(2))} / {formatGBP(shippingForQuantity(1))}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-steel">Shipping tyres / accessories</dt><dd className="font-semibold text-white">{formatGBP(shippingForCategory("tyres"))} / {formatGBP(shippingForCategory("accessories"))}</dd></div>
                </dl>
              </div>
              <div className="rounded-lg border border-line bg-carbon p-6 text-xs leading-relaxed text-steel">
                <p className="font-bold text-white">How the brief maps</p>
                <p className="mt-2">
                  Supplier price (EUR) → −discount → ×EUR/GBP → +£75 margin per 4-wheel set → +20% VAT.
                  Tyres/accessories use the per-item margin % instead. Delivery is separate: £80 for a
                  4-wheel order, lower tiers for 1–2 wheels and accessories. The six DB-backed knobs
                  (margin %, discount %, EUR→GBP, VAT, 4/2-wheel shipping) are what "Save" writes to
                  public.pricing_settings; the per-set margin and per-category shipping stay on the
                  built-in defaults for the session that runs the recalculation.
                </p>
              </div>
            </aside>
          </div>
        )}

        {tab === "products" && (
          <section className="rounded-lg border border-line bg-carbon">
            <div className="border-b border-line px-6 py-5">
              <h2 className="text-lg font-bold text-white">Products</h2>
              <p className="mt-1 text-xs leading-relaxed text-steel">
                {productsSource === "supabase"
                  ? "Live rows from your Supabase project (public.products). Edit name, retail price (inc. VAT) or stock status and save per row — writes go through your signed-in session."
                  : "Showing the built-in sample list right now — the products table is unreachable or empty, so per-row saves will try a database write but may fail until the table connects."}
              </p>
            </div>
            {!products ? (
              <p className="px-6 py-10 text-sm text-steel-dim">Loading products…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-steel-dim">
                    <tr className="border-b border-line">
                      <th className="px-6 py-3 font-semibold">ID</th>
                      <th className="px-3 py-3 font-semibold">Name</th>
                      <th className="px-3 py-3 font-semibold">Category</th>
                      <th className="px-3 py-3 text-right font-semibold">Retail inc VAT (£)</th>
                      <th className="px-3 py-3 font-semibold">Stock status</th>
                      <th className="px-6 py-3 text-right font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const e = productDrafts[p.id] ?? {
                        name: p.name,
                        price: String(p.retailPriceIncVat),
                        stock: p.stockStatus,
                      };
                      const saving = savingId === p.id;
                      return (
                        <tr key={p.id} className="border-b border-line/60 last:border-0 hover:bg-white/5">
                          <td className="px-6 py-3 font-mono text-xs text-steel">{p.id}</td>
                          <td className="px-3 py-3">
                            <input
                              className={`${inputCls} min-w-48`}
                              value={e.name}
                              onChange={(ev) => setDraftField(p.id, "name", ev.target.value)}
                            />
                          </td>
                          <td className="px-3 py-3 text-xs capitalize text-steel">{p.category}</td>
                          <td className="px-3 py-3 text-right">
                            <input
                              className={`${inputCls} max-w-28 text-right`}
                              value={e.price}
                              inputMode="decimal"
                              onChange={(ev) => setDraftField(p.id, "price", ev.target.value)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <select
                              className={`${inputCls} max-w-44`}
                              value={e.stock}
                              onChange={(ev) => setDraftField(p.id, "stock", ev.target.value)}
                            >
                              {STOCK_STATUSES.map((st) => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void saveRow(p)}
                              className="btn btn-red px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {saving ? "Saving…" : "Save"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-line px-6 py-4 text-xs leading-relaxed text-steel-dim">
              All rows are SAMPLE/demo catalogue data — no live stock or availability is claimed; we
              verify compatibility with your exact vehicle before confirming any order.
            </div>
          </section>
        )}

        {tab === "import" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-line bg-carbon p-6">
              <h2 className="text-lg font-bold text-white">Import</h2>
              <p className="mt-1 text-xs leading-relaxed text-steel">
                Parse a Forzza-shaped supplier feed (CSV, XML, or Excel .xls / .xlsx — the
                first worksheet is read) and map it onto the product model via the pricing
                engine — the exact pipeline a real feed will use. The sample below is embedded
                in the codebase; upload a file or paste a snippet. Parsing is fully offline
                (no feed URLs, no network calls); the only write is the explicit
                “Import to catalogue” button, upserting the mapped rows through your signed-in
                Supabase session.
              </p>
              <input
                type="file"
                accept=".csv,.xml,.xls,.xlsx,.txt"
                className="mt-4 block w-full text-xs text-steel file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-coal file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-white/10"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  e.target.value = ""; // allow re-picking the same file
                  if (/\.xlsx?$/i.test(f.name)) {
                    try {
                      // SheetJS is a ~370KB lib — lazy-import ONLY here, so it
                      // stays out of the main bundle (separate chunk, fetched
                      // only when a spreadsheet is actually picked).
                      const XLSX = await import("xlsx");
                      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()));
                      const ws = wb.Sheets[wb.SheetNames[0]];
                      if (!ws) {
                        setMessage({ ok: false, text: `"${f.name}" has no worksheets — nothing to import.` });
                        return;
                      }
                      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
                      if (rows.length === 0) {
                        setMessage({ ok: false, text: `"${f.name}" first worksheet is empty — nothing to import.` });
                        return;
                      }
                      setImportText(renderRowsToCsv(rows));
                      setImportFileName(f.name);
                      setImportExcelRows(rows);
                      setImportResult(null);
                      setMessage({
                        ok: true,
                        text: `Loaded "${f.name}" — its first worksheet is shown as CSV below. Press “Process demo import” to preview the mapped rows. Preview only — nothing is written to the catalogue.`,
                      });
                    } catch (err) {
                      setMessage({
                        ok: false,
                        text: `Could not read "${f.name}" as a spreadsheet: ${err instanceof Error ? err.message : String(err)}. Try exporting the sheet as CSV and pasting it instead.`,
                      });
                    }
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setImportText(String(reader.result ?? ""));
                    setImportFileName(f.name);
                    setImportExcelRows(null);
                    setImportResult(null);
                  };
                  reader.readAsText(f);
                }}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-ghost btn px-3 py-2 text-xs" onClick={() => { setImportText(SAMPLE_CSV); setImportFileName("sample-feed.csv"); setImportExcelRows(null); }}>
                  Load CSV sample
                </button>
                <button type="button" className="btn-ghost btn px-3 py-2 text-xs" onClick={() => { setImportText(SAMPLE_XML); setImportFileName("sample-feed.xml"); setImportExcelRows(null); }}>
                  Load XML sample
                </button>
              </div>
              <textarea
                className={`${inputCls} mt-3 h-64 font-mono text-xs leading-relaxed`}
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  // Hand-editing the text invalidates any decoded Excel rows.
                  setImportExcelRows(null);
                }}
                spellCheck={false}
              />
              <p className="mt-2 text-xs text-steel-dim">
                Parsing as: <span className="font-mono text-steel">{importFileName || "feed.csv"}</span>
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-red" onClick={processImport}>
                  Process demo import
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => void persistImport()}
                  disabled={importing || !importResult || importResult.mapped.length === 0}
                  title={
                    importResult && importResult.mapped.length > 0
                      ? "Upsert the mapped preview rows into public.products (signed-in session, batched)."
                      : "Run the preview first so there are mapped rows to write."
                  }
                >
                  {importing
                    ? "Importing…"
                    : `Import ${importResult?.mapped.length ?? 0} rows to catalogue`}
                </button>
              </div>
              {importing && (
                <p className="mt-3 rounded-md border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs text-sky-300">
                  Writing the mapped rows into public.products in batches of up to 40 — this can
                  take a moment for large feeds.
                </p>
              )}
            </section>

            <section className="rounded-lg border border-line bg-carbon p-6">
              <h2 className="text-lg font-bold text-white">Import result</h2>
              <p className="mt-1 text-xs text-steel">Admin tooling — demo import, no live feed connected.</p>
              {!importResult && (
                <p className="mt-6 text-sm text-steel-dim">
                  Run a demo import to see parsed rows, validation failures and the stock-sync stub here.
                </p>
              )}
              {importResult && (
                <div className="mt-5 space-y-5">
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 font-semibold text-emerald-300">
                      {importResult.summary.imported} imported
                    </span>
                    <span className={`rounded-md border px-3 py-1.5 font-semibold ${importResult.summary.failed ? "border-race/40 bg-race/10 text-race-bright" : "border-line bg-white/5 text-steel"}`}>
                      {importResult.summary.failed} rejected
                    </span>
                    <span className="rounded-md border border-line bg-white/5 px-3 py-1.5 text-steel">
                      stock sync stub: {importResult.sync.updated} matched · {importResult.sync.changed} statuses would change
                    </span>
                  </div>

                  {importResult.summary.errors.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-race-bright">Validation failures</h3>
                      <ul className="mt-2 space-y-1">
                        {importResult.summary.errors.map((err, i) => (
                          <li key={i} className="rounded-md border border-race/30 bg-race/5 px-3 py-2 text-xs text-steel">
                            <span className="font-mono text-race-bright">row {err.row}</span> — {err.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="text-[11px] uppercase tracking-wider text-steel-dim">
                        <tr className="border-b border-line">
                          <th className="py-2 pr-3 font-semibold">Supplier ID</th>
                          <th className="py-2 pr-3 font-semibold">Product</th>
                          <th className="py-2 pr-3 font-semibold">Category</th>
                          <th className="py-2 pr-3 font-semibold">Size</th>
                          <th className="py-2 pr-3 font-semibold">Mapped stock</th>
                          <th className="py-2 text-right font-semibold">Retail inc VAT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.mapped.map((p) => (
                          <tr key={p.id} className="border-b border-line/60 last:border-0">
                            <td className="py-2.5 pr-3 font-mono text-xs text-steel">{skuOf(p)}</td>
                            <td className="py-2.5 pr-3 text-white">{p.name}</td>
                            <td className="py-2.5 pr-3 text-xs capitalize text-steel">{p.category}</td>
                            <td className="py-2.5 pr-3 text-xs text-steel">{p.category === "wheels" ? `${p.size.diameter}" × ${p.size.width}` : p.category === "tyres" ? `${p.width}/${p.aspect}R${p.rimDiameter}` : "—"}</td>
                            <td className="py-2.5 pr-3">
                              <span className={`inline-flex items-center rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-semibold ${chipFor(p.stockStatus)}`}>
                                {p.stockStatus}
                              </span>
                            </td>
                            <td className="py-2.5 text-right font-semibold text-white">{formatGBP(p.retailPriceIncVat)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs leading-relaxed text-steel-dim">
                    Rows above are mapped to the site’s product model (Wheel / Tyre / Package /
                    Accessory) with retail prices computed by the pricing engine — a preview of
                    exactly what “Import to catalogue” would write. Nothing is written until you
                    press that button. The stock column shows the
                    <span className="text-steel"> syncStockFromFeed </span>
                    mapping (in_stock → In Stock, out_of_stock → Out of stock, unknown → Contact us).
                  </p>

                  {importReport && (
                    <div className="mt-6 rounded-md border border-line bg-coal/60 p-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                        Import to catalogue — result
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-2 text-sm">
                        <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 font-semibold text-emerald-300">
                          {importReport.created} created
                        </span>
                        <span className="rounded-md border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 font-semibold text-sky-300">
                          {importReport.updated} updated
                        </span>
                        <span className={`rounded-md border px-3 py-1.5 font-semibold ${importReport.failed ? "border-race/40 bg-race/10 text-race-bright" : "border-line bg-white/5 text-steel"}`}>
                          {importReport.failed} failed
                        </span>
                        <span className={`rounded-md border px-3 py-1.5 font-semibold ${importReport.skipped ? "border-amber-300/40 bg-amber-300/10 text-amber-200" : "border-line bg-white/5 text-steel"}`}>
                          {importReport.skipped} skipped
                        </span>
                      </div>
                      {importReport.error && (
                        <p className="mt-3 rounded-md border border-race/40 bg-race/10 px-3 py-2 text-xs leading-relaxed text-race-bright">
                          {importReport.error}
                        </p>
                      )}
                      {importWroteAnything(importReport) && (
                        <p className="mt-3 text-xs text-emerald-300">
                          Catalogue updated — {importReport.created} new row
                          {importReport.created === 1 ? "" : "s"} inserted, {importReport.updated} existing
                          row{importReport.updated === 1 ? "" : "s"} updated (upserted on id / slug).
                        </p>
                      )}
                      {importReport.failures.length > 0 && (
                        <div className="mt-3">
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-race-bright">Failed rows</h4>
                          <ul className="mt-2 space-y-1">
                            {importReport.failures.map((f, i) => (
                              <li key={i} className="rounded-md border border-race/30 bg-race/5 px-3 py-2 text-xs text-steel">
                                <span className="font-mono text-race-bright">{f.id}</span> — {f.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {importReport.skips.length > 0 && (
                        <div className="mt-3">
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Skipped rows</h4>
                          <ul className="mt-2 space-y-1">
                            {importReport.skips.map((s, i) => (
                              <li key={i} className="rounded-md border border-amber-300/30 bg-amber-300/5 px-3 py-2 text-xs text-steel">
                                <span className="font-mono text-amber-200">{s.id}</span> — {s.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}