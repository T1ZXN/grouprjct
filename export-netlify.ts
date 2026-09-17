#!/usr/bin/env bun
/**
 * export-netlify.ts — static prerender of the N2 Wheels site for Netlify.
 *
 * WHAT IT DOES
 *  - Runs the built TanStack Start SSR handler (dist/server/server.js) against
 *    every known route and saves the rendered HTML as <route>/index.html, so
 *    Netlify can host the whole site as pure static files (no Node server).
 *  - Copies the hashed client JS/CSS (dist/client/assets) and the public images
 *    (dist/client/images) next to the pages; the app references assets with
 *    root-absolute paths (/assets/...), which resolve unchanged on a static host.
 *  - Rewrites the sandbox preview host (anything like https://<label>.ctonew.app)
 *    to the real public domain https://n2wheels.co.uk in the exported HTML and in
 *    any exported JS chunk that carries it (canonical link + JSON-LD were the only
 *    places the app hard-codes it; the app source is left untouched).
 *  - Writes Netlify plumbing: netlify.toml (publish = "."), _redirects (SPA
 *    fallback for unknown routes), robots.txt (blocks /admin) and
 *    README-NETLIFY.md.
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

async function prerender(route: string): Promise<void> {
  const url = PUBLIC_HOST + route;
  const res = await fetchHandler.fetch(
    new Request(url, { headers: { accept: "text/html", "accept-encoding": "identity" } })
  );
  const raw = await res.text();
  // Neutralise any sandbox preview host leaked into rendered output.
  const html = raw.replace(HOST_RE, PUBLIC_HOST);
  const filePath =
    route === "/"
      ? path.join(OUT, "index.html")
      : path.join(OUT, route.replace(/^\//, ""), "index.html");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, html, "utf8");
  const status = res.status;
  if (status !== 200) failures.push(`${status} ${route}`);
  log(status === 200, `${status} ${route} -> ${path.relative(OUT, filePath)} (${(html.length / 1024).toFixed(1)} KB)`);
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

# SPA fallback lives in _redirects (kept separate from netlify.toml on purpose —
# Netlify errors if the same rule is defined in both places).
[build.environment]
  NODE_VERSION = "20"
`,
    "utf8"
  );
  await writeFile(
    path.join(OUT, "_redirects"),
    `# SPA fallback for unknown routes ONLY: every known route has a real
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
- \`netlify.toml\` — publish directory = \`.\`
- \`_redirects\` — SPA fallback (\`/* /index.html 200\`) so unknown paths hydrate
  the app instead of 404ing (known routes serve their own HTML — files win over
  redirects on Netlify)
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
  part of the verification script).
- No checkout/payment functionality is included — payment stays off until real
  credentials exist. (The basket and /checkout pages ARE exported, but they take
  no payment: with no payment provider configured, checkout hands the customer
  to an email enquiry and says so plainly. No success screen or order number
  exists anywhere in the export.)
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