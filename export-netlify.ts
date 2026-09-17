#!/usr/bin/env bun
/**
 * export-netlify.ts — static prerender of the N2 Wheels site for Netlify.
 *
 * WHAT IT DOES
 *  - Runs the built TanStack Start SSR handler (dist/server/server.js) against
 *    every known route and saves the rendered HTML as <route>/index.html, so
 *    Netlify can host the whole site as pure static files (no Node server).
 *    Each route is REQUESTED in its trailing-slash form (`/wheels/`,
 *    `/wheels/<id>/`) — that is the canonical URL of a directory index.html on
 *    the host, and since the router sets `trailingSlash: "always"` the handler
 *    answers 307 (not 200) for the slash-less form.
 *  - Copies the hashed client JS/CSS (dist/client/assets) and the public images
 *    (dist/client/images) next to the pages; the app references assets with
 *    root-absolute paths (/assets/...), which resolve unchanged on a static host.
 *  - Rewrites the sandbox preview host (anything like https://<label>.ctonew.app)
 *    to the real public domain https://n2wheels.co.uk in the exported HTML and in
 *    any exported JS chunk that carries it (canonical link + JSON-LD were the only
 *    places the app hard-codes it; the app source is left untouched).
 *  - Writes Netlify plumbing: netlify.toml (publish = ".", functions dir),
 *    _redirects (same-origin reg-lookup proxy + SPA fallback for unknown
 *    routes), robots.txt (blocks /admin) and README-NETLIFY.md.
 *  - GENERATES the same-origin reg-lookup proxy function
 *    (dist-netlify/netlify/functions/reglookup.js) from the keyless template in
 *    scripts/reglookup-function.js, INLINING the provider key from the build
 *    environment. That is the ONLY file in the export that carries the key, and
 *    the key never reaches the client bundle — the build strips it from the
 *    Vite env (vite.config.ts) and this script refuses to export if it ever
 *    shows up in a shipped HTML/JS/CSS file.
 *  - With NO provider key in the environment the proxy is skipped (the site
 *    stays in honest demo mode); the export still succeeds.
 *
 * USAGE (regeneration after site changes):
 *     cd /home/team/shared/site
 *     bun run build && bun ./export-netlify.ts
 *
 * Output lands in ./dist-netlify. Deploy with `netlify deploy --dir=dist-netlify`
 * or drag the folder into Netlify Drop.
 *
 * NOTE: /admin keeps its robots noindex (it is rendered from app.head(), which
 * already sets <meta name="robots" content="noindex, nofollow">); robots.txt
 * additionally disallows it at crawler level.
 */
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import handler from "./dist/server/server.js";

const SITE_DIR = import.meta.dir;
const OUT = path.join(SITE_DIR, "dist-netlify");
const PUBLIC_HOST = "https://n2wheels.co.uk";

// ── Same-origin reg-lookup proxy (Netlify Function) ─────────────────────────
// The provider key is inlined into the GENERATED function at export time from
// the build environment — never committed, never in the client bundle.
const REG_LOOKUP_KEY_ENV = "VITE_REG_LOOKUP_KEY";
const REG_LOOKUP_KEY_PLACEHOLDER = "__N2_REG_LOOKUP_KEY__";
const REG_LOOKUP_FUNCTION_TEMPLATE = path.join(SITE_DIR, "scripts", "reglookup-function.js");
const REG_LOOKUP_FUNCTION_REL = "netlify/functions/reglookup.js";
const REG_LOOKUP_FUNCTION_OUT = path.join(OUT, REG_LOOKUP_FUNCTION_REL);
/** Same-origin route the site calls; rewritten to the function in _redirects. */
const REG_LOOKUP_PROXY_ROUTE = "/api/reglookup";
/** Text files a shipped key could hide in (images/fonts are skipped). */
const TEXT_EXT = [".html", ".js", ".mjs", ".cjs", ".css", ".json", ".txt", ".toml", ".md", ".xml", ".map"];

// Sandbox preview host in rendered output (canonical / JSON-LD / og URLs) is
// rewritten to the real domain. Matches https://<label>.ctonew.app (and bare
// sandbox hostnames), not arbitrary domains.
const HOST_RE = /https:\/\/(?:[a-z0-9-]+\.)*ctonew\.app/gi;

// All top-level (non-detail) routes.
const TOP_LEVEL = [
  "/fitment",
  "/wheels",
  "/tyres",
  "/packages",
  "/accessories",
  "/basket",
  "/checkout",
  "/about",
  "/contact",
  "/delivery",
  "/returns",
  "/faq",
  "/privacy",
  "/terms",
  "/news",
  "/fitment-guide",
  "/tyre-safety",
  "/wheel-safety",
  "/financing",
  "/admin",
];

const fetchHandler = handler as { fetch: (req: Request) => Promise<Response> };
const failures: string[] = [];

function log(ok: boolean, msg: string) {
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
}

/**
 * The request path the deployed site actually serves, for a route as listed in
 * TOP_LEVEL / detailPaths: every page is a DIRECTORY holding an index.html, and
 * the router is configured with `trailingSlash: "always"` (src/router.tsx), so
 * the canonical form — and the only form the SSR handler answers 200 for —
 * carries a trailing slash. `/` stays `/`.
 */
function publicPath(route: string): string {
  return route === "/" ? "/" : `${route.replace(/\/+$/, "")}/`;
}

async function prerender(route: string): Promise<void> {
  const url = PUBLIC_HOST + publicPath(route);
  const res = await fetchHandler.fetch(
    new Request(url, { headers: { accept: "text/html", "accept-encoding": "identity" } })
  );
  const raw = await res.text();
  // Neutralise any sandbox preview host leaked into rendered output.
  const html = raw.replace(HOST_RE, PUBLIC_HOST);
  const filePath =
    route === "/"
      ? path.join(OUT, "index.html")
      : path.join(OUT, publicPath(route).replace(/^\//, ""), "index.html");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, html, "utf8");
  const status = res.status;
  if (status !== 200) failures.push(`${status} ${route}`);
  log(status === 200, `${status} ${route} -> ${path.relative(OUT, filePath)} (${(html.length / 1024).toFixed(1)} KB)`);
}

/**
 * The provider key for this build, or undefined. Read here (build time) and
 * INLINED into the generated function — it is never logged, never returned and
 * never written anywhere else in the export.
 */
function regLookupKey(): string | undefined {
  const raw = process.env[REG_LOOKUP_KEY_ENV];
  const key = typeof raw === "string" ? raw.trim() : "";
  return key === "" ? undefined : key;
}

/** Generate the same-origin reg-lookup proxy function from the keyless template. */
async function emitRegLookupProxyFunction(key: string | undefined): Promise<void> {
  const template = await readFile(REG_LOOKUP_FUNCTION_TEMPLATE, "utf8");
  // The placeholder must appear EXACTLY ONCE (the INLINE_API_KEY assignment). If
  // it appeared in prose too, the substitution could land the key in a comment
  // instead of the assignment — which silently ships a function with no key.
  const placeholderCount = template.split(REG_LOOKUP_KEY_PLACEHOLDER).length - 1;
  if (placeholderCount !== 1) {
    throw new Error(
      `reg-lookup function template must contain ${REG_LOOKUP_KEY_PLACEHOLDER} exactly once (found ${placeholderCount}): ${REG_LOOKUP_FUNCTION_TEMPLATE}`,
    );
  }
  if (!key) {
    // No key in this build: ship no proxy at all. The client build for an
    // env-less build is in honest demo mode (vite.config.ts derives the same
    // flag from the same variable), so nothing calls a missing route.
    console.log("  ! no provider key in the build env — reg-lookup proxy NOT generated (honest demo mode)");
    return;
  }
  const source = template.split(REG_LOOKUP_KEY_PLACEHOLDER).join(JSON.stringify(key).slice(1, -1));
  if (source.includes(REG_LOOKUP_KEY_PLACEHOLDER) || !source.includes(key)) {
    throw new Error(
      "SECURITY: the generated reg-lookup proxy did not receive the provider key cleanly — refusing to export.",
    );
  }
  await mkdir(path.dirname(REG_LOOKUP_FUNCTION_OUT), { recursive: true });
  await writeFile(REG_LOOKUP_FUNCTION_OUT, source, "utf8");
  console.log(`  ✓ ${REG_LOOKUP_FUNCTION_REL} (key inlined from ${REG_LOOKUP_KEY_ENV}, not printed)`);
}

/**
 * HARD GUARD: no shipped text file may contain the provider key. The proxy
 * function is the single, deliberate exception (it is server-side code that
 * Netlify never serves as a static file).
 */
async function assertKeyNotShipped(key: string | undefined): Promise<void> {
  if (!key) return;
  const offenders: string[] = [];
  for (const f of await readdir(OUT, { recursive: true })) {
    const rel = String(f).split(path.sep).join("/");
    if (rel === REG_LOOKUP_FUNCTION_REL) continue;
    if (!TEXT_EXT.some((e) => rel.endsWith(e))) continue;
    const text = (await readFile(path.join(OUT, String(f)))).toString("utf8");
    if (text.includes(key)) offenders.push(rel);
  }
  if (offenders.length) {
    throw new Error(
      `SECURITY: the provider key appears in shipped file(s) — refusing to export:\n  ${offenders.join("\n  ")}`,
    );
  }
  console.log("  ✓ provider key absent from every shipped HTML/JS/CSS file");
}

async function main() {
  const { demoWheels, demoTypes, demoPackages, demoAccessories } = await import("./src/data/products.ts");
  const detailPaths = [
    ...demoWheels.map((w: { id: string }) => `/wheels/${w.id}`),
    ...demoTypes.map((t: { id: string }) => `/tyres/${t.id}`),
    ...demoPackages.map((p: { id: string }) => `/packages/${p.id}`),
    ...demoAccessories.map((a: { id: string }) => `/accessories/${a.id}`),
  ].sort();
  const routes = ["/", ...TOP_LEVEL, ...detailPaths];

  console.log(`Prerendering ${routes.length} routes into ${OUT} …`);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for (const route of routes) await prerender(route);

  // Client assets (hashed JS/CSS) + public images — copied one level up from
  // dist/client so root-absolute /assets/... and /images/... URLs resolve.
  console.log("Copying client assets and images …");
  await cp(path.join(SITE_DIR, "dist/client/assets"), path.join(OUT, "assets"), { recursive: true });
  await cp(path.join(SITE_DIR, "dist/client/images"), path.join(OUT, "images"), { recursive: true });

  // Same-origin reg-lookup proxy (Netlify Function) + the key-leak guard.
  console.log("Generating the same-origin reg-lookup proxy …");
  const key = regLookupKey();
  await emitRegLookupProxyFunction(key);
  await assertKeyNotShipped(key);

  // Host rewrite in exported JS chunks that embed the preview host (defence in
  // depth; only the homepage route chunk is known to contain it today).
  for (const f of await readdir(path.join(OUT, "assets"))) {
    if (!f.endsWith(".js")) continue;
    const p = path.join(OUT, "assets", f);
    const text = (await readFile(p)).toString("utf8");
    if (HOST_RE.test(text)) {
      await writeFile(p, text.replace(HOST_RE, PUBLIC_HOST), "utf8");
      console.log(`  rewrote preview host in assets/${f}`);
    }
  }

  // Netlify plumbing.
  await writeFile(
    path.join(OUT, "netlify.toml"),
    `# N2 Wheels — static export for Netlify.
# This whole folder is the publish directory; no build step runs on Netlify.
[build]
  publish = "."

# Netlify Functions (the same-origin reg-lookup proxy) live at the zip root's
# netlify/functions — that is the directory Netlify auto-detects, declared here
# so the layout is explicit for a manual/API (zip) deploy.
[functions]
  directory = "netlify/functions"

# SPA fallback + the /api/reglookup rewrite live in _redirects (kept separate
# from netlify.toml on purpose — Netlify errors if the same rule is defined in
# both places).
[build.environment]
  NODE_VERSION = "20"
`,
    "utf8"
  );
  await writeFile(
    path.join(OUT, "_redirects"),
    `# Same-origin registration-lookup proxy -> Netlify Function.
# The function holds the provider key SERVER-SIDE and makes the upstream call,
# because the provider sends no CORS headers (a direct browser call is blocked).
# Must stay ABOVE the catch-all below.
${REG_LOOKUP_PROXY_ROUTE}/*    /.netlify/functions/reglookup?vrm=:splat    200

# SPA fallback for unknown routes ONLY: every known route has a real
# prerendered HTML file below, and Netlify serves files before redirects, so
# this catch-all only kicks in for paths that don't exist on disk.
/*    /index.html   200
`,
    "utf8"
  );
  await writeFile(
    path.join(OUT, "robots.txt"),
    `User-agent: *
Allow: /
Disallow: /admin
`,
    "utf8"
  );

  // README for the owner / future sessions.
  await writeFile(
    path.join(OUT, "README-NETLIFY.md"),
    `# N2 Wheels — Netlify static export

This folder is a **fully static, prerendered copy of the N2 Wheels site** — every
route is real HTML, with the hashed JS/CSS and images alongside. Netlify can host
it as-is: no Node server, no build step, works on the free tier.

## What's inside
- \`index.html\` + \`<route>/index.html\` for all ${routes.length} routes (home, catalogue,
  product detail pages, basket & checkout, info pages, /admin)
- \`assets/\` — hashed client JS/CSS (\`/assets/...\`)
- \`images/\` — product & category imagery (\`/images/...\`)
- \`netlify/functions/reglookup.js\` — the same-origin registration-lookup
  **proxy** (server-side; the only file that carries the provider key, which the
  export inlines from the build environment). The site calls
  \`/api/reglookup/{VRM}\`; \`_redirects\` rewrites that to this function.
- \`netlify.toml\` — publish directory = \`.\` and the functions directory
- \`_redirects\` — the \`/api/reglookup/*\` rewrite, then the SPA fallback
  (\`/* /index.html 200\`) so unknown paths hydrate the app instead of 404ing
  (known routes serve their own HTML — files win over redirects on Netlify)
- \`robots.txt\` — blocks \`/admin\` and the \`/admin\` page itself carries a
  \`noindex, nofollow\` meta tag

## Deploy

**Netlify Drop** — drag this whole \`dist-netlify\` folder onto
https://app.netlify.com/drop and Netlify does the rest.

**Netlify CLI** (from the site repo):
\`\`\`bash
cd /home/team/shared/site
netlify deploy --dir=dist-netlify            # preview draft
netlify deploy --dir=dist-netlify --prod     # production
\`\`\`
For the custom domain n2wheels.co.uk: Netlify > Site > Domain management.

## Regenerate after site changes

\`\`\`bash
cd /home/team/shared/site
bun run build && bun ./export-netlify.ts
\`\`\`
The export script (\`export-netlify.ts\`) rerenders every route through the built
SSR handler, recopies assets/images and rewrites the preview host to
\`https://n2wheels.co.uk\` (canonical/JSON-LD). Source app code is never touched.

## Honesty & integrity notes
- All product data is labelled SAMPLE data — that labelling is baked into the
  prerendered pages.
- No supplier feed URLs, secrets or credentials are shipped in this folder
  (a full grep of the export for secrets, env-var names and supplier domains is
  part of the verification script; the export script itself REFUSES to write a
  build where the provider key appears in any shipped HTML/JS/CSS file).
- The registration-lookup proxy function is the single file holding the
  provider key: it is server-side code (never served as a static file) and it
  logs neither the key nor the plate. With no key inlined it answers an honest
  503 and never calls the provider.
- Checkout never takes card details and never claims an order: the only
  outcomes are "redirect" (to a configured hosted-checkout page — the connected
  Stripe Payment Link, set by build config, never committed to the repo),
  "invalid" and "handoff". With no checkout URL configured, /checkout hands the
  customer to an email enquiry and says so plainly. No success screen, order
  number or payment confirmation exists anywhere in the export.
`,
    "utf8"
  );

  if (failures.length) {
    console.error(`\nFAILED routes (${failures.length}):\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  const fileCount = (await readdir(OUT, { recursive: true })).length;
  console.log(`\nExport complete: ${OUT} (${fileCount} files, ${routes.length} routes).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});