/**
 * Supabase client singleton for N2 Wheels — safe for the client bundle.
 *
 * The anon (public) key is designed to live in browser code; it is NOT secret.
 * Data protection comes from Row Level Security on the database, never from
 * keeping this key hidden. The SERVICE_ROLE key must NEVER be used or stored
 * anywhere in this codebase (it bypasses RLS) — if a task ever seems to need
 * it, stop and report instead.
 *
 * CONFIG — client-exposed env vars (Vite convention: VITE_-prefixed, inlined
 * into the bundle at build time):
 *   .env
 *     VITE_SUPABASE_URL=...        (mirrors SUPABASE_URL)
 *     VITE_SUPABASE_ANON_KEY=...   (mirrors SUPABASE_ANON_KEY)
 *
 * NO-DB MODE: if either var is missing/empty (e.g. a build machine without
 * .env, or a static host that never had env vars), the singleton is `null`
 * and every caller must fall back to sample data. This module never crashes
 * and never throws on missing config — that is a hard requirement because the
 * static Netlify export must build and run with or without .env present.
 *
 * Server-side read fallback: when this module runs under a non-Vite runtime
 * (bun scripts, tooling) `import.meta.env` may not carry the vars, so we also
 * read process.env behind a typeof guard that keeps the browser bundle safe
 * (in the browser `process` is undefined and the branch is never evaluated).
 */
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Read a client env var: Vite static replacement first, process.env fallback. */
function readClientVar(name: string): string | null {
  const viteVal = (import.meta.env as Record<string, unknown>)[name];
  if (typeof viteVal === "string" && viteVal.trim() !== "") return viteVal.trim();
  if (typeof process !== "undefined" && process.env) {
    const nodeVal = process.env[name];
    if (typeof nodeVal === "string" && nodeVal.trim() !== "") return nodeVal.trim();
  }
  return null;
}

export const SUPABASE_URL = readClientVar("VITE_SUPABASE_URL");
export const SUPABASE_ANON_KEY = readClientVar("VITE_SUPABASE_ANON_KEY");

/** True when the client has real URL + anon key (NOSCRIPT: DB mode on). */
export const isSupabaseConfigured: boolean = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Auth persistence key in localStorage (fixed so sessions survive renames). */
export const AUTH_STORAGE_KEY = "n2wheels-supabase-auth";

function createSingleton(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  try {
    return createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: AUTH_STORAGE_KEY,
      },
    });
  } catch {
    // Never let a client-construction failure take the site down.
    return null;
  }
}

/**
 * The shared supabase-js client — `null` when Supabase is not configured, so
 * callers can branch to sample data. Construction is lazy-ish: creating the
 * client performs NO network I/O; the first request happens on first query.
 */
export const supabase: SupabaseClient | null = createSingleton();