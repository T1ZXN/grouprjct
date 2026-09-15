/**
 * scripts/test-supabase.ts — Phase 1 verification against the REAL Supabase
 * project (anon key only). NO service role, NO table creation.
 *
 * Covers:
 *   1. REST root responds 401 to the anon key (normal — root only accepts
 *      service_role; the anon key's real surface is per-table endpoints).
 *   2. signInWithPassword with wrong credentials → clean auth error.
 *   3. signInWithPassword for a user that doesn't exist → clean auth error.
 *   4. signOut without a session → clean no-op/error (no crash).
 *   5. signUp with a THROWAWAY address (reported so the owner can delete it).
 *   6. Store layer fallback: with the tables NOT created yet (the owner runs
 *      supabase-setup.sql before they exist), loadProducts() must return the
 *      sample catalogue without throwing, and loadSettings() must return null.
 *
 * Run:  bun run test:supabase
 */
import { loadProducts, loadSettings } from "../src/lib/store";
import { isSupabaseConfigured, supabase } from "../src/lib/supabase";

const log = (label: string, ok: boolean, detail: string) =>
  console.log(`${ok ? "PASS" : "FAIL"} ${label} → ${detail}`);

async function main(): Promise<void> {
  console.log("supabase configured:", isSupabaseConfigured);
  if (!supabase) {
    console.log(
      "SKIP network tests — Supabase env vars missing; fallback-only behaviour is expected here."
    );
    return;
  }

  // 1. REST root must 401 for anon (only service_role may list tables).
  //    Read the endpoint straight from env — supabase-js hides supabaseUrl/
  //    supabaseKey behind protected members, and the URL is public anyway.
  const projectUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!projectUrl) {
    log("rest /rest/v1/ root", false, "no SUPABASE_URL in env");
  } else {
    try {
      const res = await fetch(`${projectUrl}/rest/v1/`, {
        headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "" },
      });
      log("rest /rest/v1/ root 401 for anon", res.status === 401, `status=${res.status}`);
    } catch (e) {
      log("rest /rest/v1/ root", false, String(e));
    }
  }

  // 2. Obviously wrong credentials — must be a clean { error }, never a throw.
  const bad = await supabase.auth.signInWithPassword({
    email: "definitely-not-a-real-address@example.com",
    password: "wrong-password-123",
  });
  log(
    "signIn wrong creds errors cleanly",
    Boolean(bad.error) && !bad.data.session,
    bad.error?.message ?? "unexpectedly returned a session"
  );

  // 3. Correct format, non-existent account.
  const none = await supabase.auth.signInWithPassword({
    email: "noone-here@n2wheels.co.uk",
    password: "wrong-password-123",
  });
  log(
    "signIn unknown user errors",
    Boolean(none.error) && !none.data.session,
    none.error?.message ?? "no error returned"
  );

  // 4. signOut with no active session — must not throw.
  const so = await supabase.auth.signOut();
  log("signOut without session is safe", !so.error, so.error?.message ?? "ok");

  // 5. First-run sign-up path with a THROWAWAY address. NOTE: this project
  //    restricts allowed sign-up email domains, so throwaway test addresses
  //    are rejected with a clean handled error and NO user is created — that
  //    is the desired outcome here: the gate must surface the error without
  //    crashing. Wait for an allowed domain (e.g. the owner's own address)
  //    to exercise a successful sign-up end-to-end.
  const stamp = Math.floor(Date.now() / 1000);
  const email = `supabasetest+${stamp}@example.com`;
  const up = await supabase.auth.signUp({ email, password: "test-pass-123456" });
  if (!up.error && up.data.user) {
    log(
      "signUp throwaway user created",
      true,
      `${email} — session=${up.data.session ? "yes (email confirmation OFF) " : "no (confirmation email sent)"}owner should delete it in Auth → Users`
    );
  } else {
    const msg = up.error?.message ?? "no error, no user";
    log(
      "signUp throwaway blocked cleanly (project email policy)",
      /invalid|rate limit/i.test(msg),
      `${msg} — no user created, nothing to delete`
    );
  }

  // 6. Store-layer fallback while the tables do not exist yet.
  const products = await loadProducts();
  const ids = new Set(products.map((p) => p.id));
  log(
    "loadProducts falls back to samples (tables absent)",
    products.length >= 18 && ids.size === products.length,
    `${products.length} sample products, ids unique=${ids.size === products.length}`
  );
  const settings = await loadSettings();
  log(
    "loadSettings returns null (tables absent)",
    settings === null,
    settings === null ? "null — app keeps built-in defaults" : "unexpected settings object"
  );
}

main().catch((e) => {
  console.error("TEST CRASH:", e);
  process.exit(1);
});