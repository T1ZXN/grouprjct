#!/usr/bin/env bun
/**
 * static-serve.ts — minimal static file server, used ONLY to verify the Netlify
 * export (dist-netlify) behaves as a plain static host would.
 *
 *   bun ./static-serve.ts [rootDir] [port]
 *   (defaults: ./dist-netlify, 8080)
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] ?? path.join(import.meta.dir, "dist-netlify"));
const PORT = Number(process.argv[3] ?? 8080);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "text/xml",
  ".toml": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    let p = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!p.startsWith(ROOT)) return new Response("Forbidden", { status: 403 });
    try {
      let st = await stat(p);
      if (st.isDirectory()) {
        p = path.join(p, "index.html");
        st = await stat(p);
      }
      const body = await readFile(p);
      return new Response(body, {
        headers: { "content-type": MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream" },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
});

console.log(`static: serving ${ROOT} on http://127.0.0.1:${PORT}`);