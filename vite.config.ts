import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// ── Reg-lookup provider key: NEVER let the client build see it ───────────────
// Vite inlines every VITE_* variable it can see — the whole `import.meta.env`
// object is baked into the client chunks — so a key left in the process env
// ends up readable in the public JS bundle (credit-misuse risk). The plate
// lookup therefore runs through the SAME-ORIGIN PROXY (netlify/functions/
// reglookup.js): the key is inlined into that server-side function at export
// time by export-netlify.ts, and the build strips it from the Vite env here.
//
// Note: live-vs-demo is NOT decided here. It is decided in src/lib/reglookup.ts
// from VITE_REG_LOOKUP_PROXY (absent = the proxy build, "0" = labelled demo
// build) so the SSR/prerender and the client bundle always agree — a
// build-time-only flag that reached one bundle but not the other would cause a
// hydration mismatch in the fitment labels.
const REG_LOOKUP_KEY_ENV = "VITE_REG_LOOKUP_KEY";
delete process.env[REG_LOOKUP_KEY_ENV];

export default defineConfig({

  server: {
    port: 3000,
    host: true,
    // The site is reverse-proxied behind <label>.<PUBLIC_SITE_DOMAIN>; the proxy
    // masks the Host to localhost:3000, but accept any host so a dev server never
    // rejects a proxied request with "Blocked request".
    allowedHosts: true,
    // The dev server is reachable through the TLS proxy, so the HMR websocket
    // must dial back on 443, not the dev port. If the socket can't connect,
    // pages still serve — hot reload degrades, never breaks.
    hmr: { clientPort: 443 },
    // The dev server can serve source files; never let it serve local secrets,
    // and never let it serve anything outside the site dir. Gotchas this list
    // encodes: a custom `deny` REPLACES Vite's defaults (so .git must be
    // restated), patterns containing "/" match the ABSOLUTE path (so dir
    // patterns need a leading **/), and `allow` left to its default widens to
    // the nearest workspace root — a stray .git or workspaces package.json in
    // /home/team/shared would expose the whole shared dir.
    fs: {
      strict: true,
      allow: [import.meta.dirname],
      deny: [".env", ".env.*", "*.{crt,pem,key}", "**/.run/**", "**/.git/**"],
    },
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart(),
    viteReact(),
  ],
});
