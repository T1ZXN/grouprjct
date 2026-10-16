/**
 * Catalogue facet helpers — the normalisation rules behind the filter
 * dropdowns on the wheels/tyres list pages.
 *
 * WHY THIS EXISTS: the imported supplier rows keep the feed's own values
 * verbatim (sub-brand strings, "ET"-prefixed offsets, load markings that merge
 * the speed letter), which is right for display/honesty — but a filter facet
 * needs clean, comparable groups. These helpers turn the stored values into
 * facet values WITHOUT touching the stored data (pure functions, no DB writes,
 * no import changes — re-imports are unaffected).
 *
 * All rules were derived from the real live rows (public.products, 2026-09-29):
 *   • wheel brand values: "Forzza", "Wolfrace 71", "Wolfrace Eurosport",
 *     "Wolfrace Explorer", "Wolfrace Vanspeed", "Wolfrace Eurosport TUV",
 *     "Wolfhart Flowformed" — the Wolfrace-family sub-brands all share the
 *     wolfrace.co.uk CDN and arrive in ONE feed (the Wolfrace trade export).
 *   • wheel offsets: "ET38"… "ET25" and a bare "0" (zero offset).
 *   • tyre load markings in specs.loadIndex: "91Y", "96Y XL", "91H" — the load
 *     index is the LEADING number; the speed letter / "XL" marker are NOT part
 *     of it.
 */

/* ── Wheel brand normalisation ─────────────────────────────────────────────── */

/**
 * Brand-prefix table → the facet brand a feed's brand column collapses to.
 * Longest prefix wins. Values are lower-cased prefixes; the mapped label is the
 * real brand as the owner calls it.
 *
 * Rule: a brand-column value that STARTS with one of these prefixes is that
 * brand — the rest of the string is a sub-brand/range name ("Wolfrace 71",
 * "Wolfrace Eurosport", "Wolfhart Flowformed"), which stays visible on product
 * cards and detail pages but must not fragment the brand facet. "Wolfhart"
 * (Wolfrace's flow-formed range — same feed, same wolfrace.co.uk catalogue)
 * folds into Wolfrace too. A value matching NO prefix passes through verbatim,
 * so a future supplier (e.g. "Automotive Wheels UK") facets correctly without
 * a code change — the "automotive wheels uk" entry just keeps it tidy.
 */
const WHEEL_BRAND_RULES: [prefix: string, brand: string][] = [
  ["automotive wheels uk", "Automotive Wheels UK"],
  ["wolfrace", "Wolfrace"],
  ["wolfhart", "Wolfrace"],
  ["forzza", "Forzza"],
];

/**
 * "Wolfrace Eurosport" → "Wolfrace", "Wolfrace 71" → "Wolfrace",
 * "Wolfhart Flowformed" → "Wolfrace", "Forzza" → "Forzza",
 * "Borbet" → "Borbet" (unknown brands pass through untouched), "" → "".
 */
export function normaliseWheelBrand(raw: string | undefined | null): string {
  const t = (raw ?? "").trim();
  if (t === "") return "";
  const lower = t.toLowerCase();
  for (const [prefix, brand] of WHEEL_BRAND_RULES) {
    if (lower.startsWith(prefix)) return brand;
  }
  return t;
}

/* ── Wheel model (design) from the product name ───────────────────────────── */

/**
 * The wheel's design/model (e.g. "Venom", "Wolfsburg GTR", "Genesis 2",
 * "Grip G-9").
 *
 * The importer (src/lib/import.ts, mapFeedRowToProduct) composes the product
 * name as `design + " " + colour` (colour omitted when the feed has none) and
 * does NOT persist the design column separately. This helper is the exact
 * inverse: when the name ends with the colour (case-insensitive), the colour
 * suffix is stripped and what remains is the feed's own design value; when the
 * name does NOT end with the colour (e.g. the sample Forzza rows, whose names
 * are the model alone: "Grip G-9"), the full name IS the model. Nothing is
 * invented — the fallback is always the supplier's own text.
 */
export function wheelModelFromName(name: string, colour?: string | null): string {
  const n = (name ?? "").trim();
  const c = (colour ?? "").trim();
  if (c !== "" && n.length > c.length) {
    const head = n.slice(0, n.length - c.length).trim();
    const tail = n.slice(n.length - c.length).trim();
    if (tail.toLowerCase() === c.toLowerCase()) return head;
  }
  return n;
}

/* ── Wheel offset (ET) ────────────────────────────────────────────────────── */

const ET_LEADING = /^(?:ET\s*)?(-?\d+(?:\.\d+)?)/i;

/**
 * The numeric ET facet value from the stored offset: "ET38" → "38", "38" →
 * "38", "0" → "0", "et40" → "40", negative "ET-5" → "-5". A blank wheel's
 * range marker ("ET35–ET42 (blank)" as the importer writes it) yields its
 * leading ET ("35") so it can still be filtered by an exact offset. Anything
 * with NO leading number passes through verbatim (never invented) — facet
 * callers typically exclude non-numeric leftovers from the dropdown.
 */
export function wheelOffsetEt(raw: string | undefined | null): string {
  const t = (raw ?? "").trim();
  if (t === "") return "";
  const m = t.match(ET_LEADING);
  return m ? m[1] : t;
}

/**
 * The offset as DISPLAYED in labelled spec rows ("Offset (ET): 38"). A value
 * that is purely an offset ("ET38" / "38" / "0") is shown as the bare number —
 * the label already says ET. Anything with extra content (the importer's
 * "(blank)" range markers such as "ET35–ET42 (blank)") is shown verbatim so no
 * supplier-published detail is lost.
 */
export function wheelOffsetDisplay(raw: string | undefined | null): string {
  const t = (raw ?? "").trim();
  if (t === "") return "";
  if (/^(?:ET\s*)?-?\d+(?:\.\d+)?$/i.test(t)) return wheelOffsetEt(t);
  return t;
}

/* ── Tyre load index ──────────────────────────────────────────────────────── */

/**
 * The numeric LOAD INDEX from a tyre's stored load marking (specs.loadIndex):
 * the leading number only. "91Y" → "91", "96Y XL" → "96", "91H" → "91",
 * "Load 91 Y" → "91". The speed letter (Y/H/…) and the "XL" marker are NOT
 * load index and are excluded. "" (or a marking with no number at all) → "" —
 * the row is simply absent from the load facet until the owner re-imports
 * feeds that carry the marking; nothing is invented for it.
 */
export function tyreLoadIndexValue(raw: string | undefined | null): string {
  const m = (raw ?? "").trim().match(/(\d+(?:\.\d+)?)/);
  return m ? m[1] : "";
}

/* ── Facet option lists ───────────────────────────────────────────────────── */

/**
 * Build dropdown options from raw facet values: de-duplicated, empty strings
 * dropped, sorted numerically when every value is numeric (offsets, load
 * indexes) and alphabetically otherwise. value === label, so the URL search
 * param, the filter comparison and the option text can never drift apart.
 */
export function facetOptions(
  values: string[],
  sort: "numeric" | "alpha" = "alpha",
): { value: string; label: string }[] {
  const unique = [...new Set(values.filter((v) => v.trim() !== ""))];
  if (sort === "numeric") {
    unique.sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isNaN(na) && Number.isNaN(nb)) return a.localeCompare(b);
      if (Number.isNaN(na)) return 1; // non-numeric leftovers last
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    });
  } else {
    unique.sort((a, b) => a.localeCompare(b));
  }
  return unique.map((v) => ({ value: v, label: v }));
}
/* ── Wheel centre bore (CB) ───────────────────────────────────────────────── */
/**
 * The CENTRE BORE facet value from the feed's own centreBore column, carried
 * verbatim in specs.feed.extra.centreBore (mapped to
 * feedAttributes.extra.centreBore by the store). "110" → "110", "84.1" →
 * "84.1" — decimals are NOT reformatted, because the feed's own value IS the
 * facet value, so the URL param, the filter comparison and the option text can
 * never drift. A numerically-typed column (a future feed shape) passes through
 * String() unchanged. Missing or blank → "" — the row contributes NOTHING to
 * the CB facet (never invented, the same honesty rule as the load facet:
 * today the Wolfrace/ATS/Alutec feeds carry the column; Forzza rows do not).
 */
export function wheelCentreBore(raw: string | number | undefined | null): string {
  return raw === undefined || raw === null ? "" : String(raw).trim();
}
/* ── Wheel model dropdown grouped by brand ────────────────────────────────── */
/**
 * The unfiltered Model dropdown's options, GROUPED BY BRAND: every normalised
 * brand (normaliseWheelBrand) becomes a group whose options are that brand's
 * models (wheelModelFromName), de-duplicated and alphabetically sorted.
 * Rendered as native <optgroup>s, so mobile pickers show the group labels as
 * section headers — clearer than one flat multi-brand model list.
 *
 * Option VALUES stay the bare model name (no brand prefix), so a grouped pick
 * sets exactly the same ?model= param the brand-scoped dropdown sets and the
 * filter comparison can never drift. (If two brands ever shipped the same
 * model name, a grouped pick would match both — today's catalogue has no such
 * collision, and picking a brand first always scopes exactly.)
 *
 * Groups are sorted by brand label; a group is emitted only when it has
 * models. A row with a model but NO brand (none in today's data) groups under
 * the heading "Other brands" so nothing silently disappears — that is a
 * grouping label, not a stored or invented brand.
 */
export function wheelModelGroups(
  rows: readonly { brand: string; name: string; colour?: string | null }[],
): { label: string; options: { value: string; label: string }[] }[] {
  const byBrand = new Map<string, string[]>();
  for (const r of rows) {
    const model = wheelModelFromName(r.name, r.colour);
    if (model === "") continue;
    const brand = normaliseWheelBrand(r.brand);
    const label = brand === "" ? "Other brands" : brand;
    const list = byBrand.get(label);
    if (list) list.push(model);
    else byBrand.set(label, [model]);
  }
  return [...byBrand.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, models]) => ({ label, options: facetOptions(models) }));
}
