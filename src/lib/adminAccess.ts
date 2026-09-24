/**
 * adminAccess.ts — who may use the OWNER'S /admin area.
 *
 * WHY THIS EXISTS
 * /admin and /account share ONE Supabase project and therefore one session: a
 * customer who signs up for the shop is an authenticated user, and Supabase's
 * row-level policies for the admin tables are written per *authenticated user*,
 * not per "the owner". Without a rule tying /admin to the business's own
 * accounts, every customer account would be able to open the admin dashboard.
 *
 * So the admin gate gets an explicit ALLOW-LIST:
 *   - ADMIN_ALLOW_LIST_ENV (VITE_ADMIN_EMAILS / ADMIN_EMAILS), comma-separated,
 *     matched case-insensitively.
 *   - NOT configured  -> unchanged behaviour (any authenticated account), which
 *     is how the owner's admin works today. Restricting is the owner's call and
 *     a *build-time* env change, so we never lock the owner out of their own
 *     area by shipping a default list.
 *   - configured      -> only the listed addresses see the dashboard; every
 *     other account sees an honest "this account doesn't have admin access"
 *     card. Customer accounts therefore cannot reach the admin tooling.
 *
 * READ THE ENV AT CALL TIME (not module load) so a test can pass its own value
 * and so the decision is easy to reason about.
 */

/** Env var the owner sets to restrict admin (build-time, comma-separated). */
export const ADMIN_ALLOW_LIST_ENV = "VITE_ADMIN_EMAILS";
/** Server-side mirror of the same setting (bun scripts / SSR). */
export const ADMIN_ALLOW_LIST_ENV_SERVER = "ADMIN_EMAILS";

/** Honest card text for an authenticated account that is not on the list. */
export const ADMIN_NO_ACCESS_MSG =
  "This account doesn't have admin access. Admin is limited to the business's own accounts, so a shop account can't open the admin tooling. If you're the account holder, sign in with the admin email address instead.";

/** Split a comma/space-separated env value into lower-cased unique emails. */
export function parseEmailList(raw: string | null | undefined): string[] {
  const value = String(raw ?? "");
  const parts = value
    .split(/[,\s;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@") && s.length > 3);
  return Array.from(new Set(parts));
}

/** Read the configured allow-list (empty array = not configured). */
export function readAdminAllowList(
  env: Record<string, unknown> | undefined = (import.meta.env as unknown as Record<string, unknown>),
): string[] {
  const fromEnv = (record: Record<string, unknown> | undefined, key: string): string | undefined => {
    const value = record?.[key];
    if (typeof value === "string" && value.trim() !== "") return value;
    if (typeof process !== "undefined" && process.env) {
      const nodeVal = process.env[key];
      if (typeof nodeVal === "string" && nodeVal.trim() !== "") return nodeVal;
    }
    return undefined;
  };
  const raw = fromEnv(env, ADMIN_ALLOW_LIST_ENV) ?? fromEnv(env, ADMIN_ALLOW_LIST_ENV_SERVER);
  return parseEmailList(raw);
}

/** The verdict for one signed-in account. */
export interface AdminAccessVerdict {
  /** True when an allow-list is configured on this build. */
  configured: boolean;
  /** True when the dashboard may be shown. */
  allowed: boolean;
  /** The account email considered (lower-cased), or null when signed out. */
  email: string | null;
  /** Honest reason to display when allowed is false. */
  message?: string;
}

/**
 * Decide whether a session's email may use /admin.
 * - allow-list empty -> configured:false, allowed:true (today's behaviour).
 * - signed out -> allowed:false with a generic sign-in message (the gate shows
 *   the sign-in card anyway; this never invents an account).
 * - listed -> allowed. Anything else on a configured build -> blocked.
 */
export function adminAccessVerdict(
  email: string | null | undefined,
  allowList: string[],
): AdminAccessVerdict {
  const list = allowList.map((e) => e.trim().toLowerCase()).filter((e) => e !== "");
  const normalised = typeof email === "string" && email.trim() !== "" ? email.trim().toLowerCase() : null;
  if (list.length === 0) {
    return { configured: false, allowed: true, email: normalised };
  }
  if (!normalised) {
    return {
      configured: true,
      allowed: false,
      email: null,
      message: "Sign in with the business's admin account to use the admin tooling.",
    };
  }
  const allowed = list.includes(normalised);
  return {
    configured: true,
    allowed,
    email: normalised,
    message: allowed ? undefined : ADMIN_NO_ACCESS_MSG,
  };
}
