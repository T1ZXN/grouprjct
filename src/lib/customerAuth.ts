/**
 * customerAuth.ts — the CUSTOMER account seam (shop accounts, /account).
 *
 * WHY THIS FILE EXISTS
 * Customers sign up and sign in with email + password against the SAME Supabase
 * project the owner's /admin area already uses (one project, one client — see
 * src/lib/supabase.ts; this module never creates a second client). All the
 * wording and the rules that make the flow HONEST live here so the UI, the
 * tests and (later) any server-side code share one implementation.
 *
 * HONESTY CONTRACT (hard requirements — never relax):
 *   1. Supabase not configured -> honest "accounts aren't available on this
 *      build" error. Nothing is sent anywhere and nothing is created.
 *   2. A form error is always a real error from the real service, mapped to
 *      plain English. We never invent a success, a user or a session: the only
 *      thing that makes the UI show "signed in" is a real Supabase session
 *      (sessionEmail() reads it off the session object, nothing else).
 *   3. Password reset uses Supabase's BUILT-IN flow
 *      (auth.resetPasswordForEmail -> Supabase sends the email -> the customer
 *      picks a new password here with auth.updateUser). No custom token/email
 *      plumbing exists.
 *   4. Client-side validation is a courtesy (typos, empty fields, mismatched
 *      password); the service remains the authority on whether credentials are
 *      right.
 *
 * Everything exported above the "Supabase calls" divider is PURE (no client
 * import) and unit-tested in scripts/test-account.ts.
 */
import type { Session } from "@supabase/supabase-js";
import { supabase } from "~/lib/supabase";

/* ── Honest messages (single source of truth for UI + tests) ─────────────── */

/** Shown when the build has no Supabase URL/anon key — accounts cannot work. */
export const ACCOUNTS_NOT_CONFIGURED_MSG =
  "Accounts aren't available on this build — the site can't reach the sign-in service (its environment variables aren't set). Nothing you type here is sent anywhere.";
/** Fallback when the service fails without a useful message. */
export const GENERIC_AUTH_ERROR_MSG =
  "Something went wrong talking to the sign-in service — please try again in a moment.";
/** Shown after a password-reset request. Deliberately does not confirm the account exists. */
export const RESET_SENT_MSG =
  "If an account exists for that email, Supabase sends a password-reset link to it now. Check your inbox (and your spam folder) — the link brings you back here to choose a new password.";
/** Shown when "Forgot password?" is pressed with an empty/invalid email. */
export const RESET_EMAIL_REQUIRED_MSG =
  "Enter the email address you signed up with, then choose \u201cForgot password?\u201d.";
/** Shown after sign-up when Supabase still needs the email confirmed (no session). */
export const SIGNUP_CONFIRM_MSG =
  "Account created — check your inbox for Supabase's confirmation email, then sign in. The account can't sign in until that link is opened.";
/** Shown after sign-up when Supabase returned a session straight away. */
export const SIGNUP_SIGNED_IN_MSG =
  "Account created — you're signed in. Your account email is confirmed for this session.";
/** Shown on the password-recovery panel the reset email returns the customer to. */
export const RECOVERY_PANEL_MSG =
  "You followed a password-reset link. Choose a new password below — this is Supabase's own reset flow, so we never see your password.";
/** Shown after a successful password update. */
export const PASSWORD_UPDATED_MSG = "Password updated — you're signed in with the new password.";
/** Shown when a reset link is opened but no recovery session is present. */
export const RECOVERY_LINK_INVALID_MSG =
  "That reset link is incomplete or has expired — request a new one with \u201cForgot password?\u201d.";

/* ── Validation (pure, client-side courtesy checks) ─────────────────────── */

/** Deliberately permissive: the service is the authority on deliverability. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Minimum for NEW passwords (Supabase's own floor is lower; we ask for 8). */
export const MIN_PASSWORD_LENGTH = 8;

export const EMAIL_REQUIRED_MSG = "Enter your email address.";
export const EMAIL_INVALID_MSG = "That doesn't look like an email address — check for a typo.";
export const PASSWORD_REQUIRED_MSG = "Enter your password.";
export const PASSWORD_TOO_SHORT_MSG = `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
export const CONFIRM_REQUIRED_MSG = "Repeat your password so we know it's what you meant.";
export const CONFIRM_MISMATCH_MSG = "Those two passwords don't match.";

/** Field-level errors for the account forms (undefined = that field is fine). */
export interface AuthFormErrors {
  email?: string;
  password?: string;
  confirm?: string;
}

/** Validate an email address — returns an honest message or null when fine. */
export function validateEmail(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (value === "") return EMAIL_REQUIRED_MSG;
  if (!EMAIL_RE.test(value)) return EMAIL_INVALID_MSG;
  return null;
}

/**
 * Password rule for a NEW password (sign-up / reset). Sign-in does NOT use
 * this: an existing account may have a shorter password than we now ask for,
 * and refusing to even try it would lock real customers out.
 */
export function validateNewPassword(raw: string): string | null {
  const value = raw ?? "";
  if (value === "") return PASSWORD_REQUIRED_MSG;
  if (value.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT_MSG;
  return null;
}

/** Sign-in: both fields required, no length rule (see validateNewPassword). */
export function validateSignIn(input: { email: string; password: string }): AuthFormErrors {
  const errors: AuthFormErrors = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  if ((input.password ?? "") === "") errors.password = PASSWORD_REQUIRED_MSG;
  return errors;
}

/** Sign-up: email + a new password (twice, matching). */
export function validateSignUp(input: {
  email: string;
  password: string;
  confirm: string;
}): AuthFormErrors {
  const errors = validateSignIn({ email: input.email, password: input.password });
  const password = validateNewPassword(input.password);
  if (password) errors.password = password;
  const confirm = input.confirm ?? "";
  if (confirm === "") errors.confirm = CONFIRM_REQUIRED_MSG;
  else if (confirm !== input.password) errors.confirm = CONFIRM_MISMATCH_MSG;
  return errors;
}

/** True when a validation result carries at least one field error. */
export function hasFieldErrors(errors: AuthFormErrors): boolean {
  return Object.values(errors).some((m) => typeof m === "string" && m !== "");
}

/* ── Honest mapping of the service's own errors ─────────────────────────── */

export type AuthContext = "signin" | "signup" | "reset" | "update";

/** Messages the browser shows when it cannot reach the service at all. */
const OFFLINE_HINTS = ["failed to fetch", "networkerror", "load failed", "network request failed"];

/**
 * Turn a Supabase/auth error message into plain, honest English. Anything we
 * don't recognise is passed through unchanged (the service's own wording is
 * truthful — paraphrasing it would not be), and an empty message becomes the
 * generic "something went wrong" line rather than a fake success.
 */
export function friendlyAuthError(raw: string | null | undefined, context: AuthContext): string {
  const message = String(raw ?? "").trim();
  if (message === "") return GENERIC_AUTH_ERROR_MSG;
  const hay = message.toLowerCase();

  if (OFFLINE_HINTS.some((h) => hay.includes(h))) {
    return "We couldn't reach the sign-in service — check your connection and try again.";
  }
  if (hay.includes("invalid login credentials") || hay.includes("invalid credentials")) {
    return "That email and password don't match an account. Check both and try again — or create an account if you haven't shopped with us before.";
  }
  if (hay.includes("email not confirmed") || hay.includes("not confirmed")) {
    return "This account hasn't confirmed its email address yet — open the confirmation link we emailed you, then sign in.";
  }
  if (hay.includes("already registered") || hay.includes("already been registered") || hay.includes("user already exists")) {
    return "There's already an account with that email address — sign in instead, or use \u201cForgot password?\u201d if you can't remember the password.";
  }
  if (hay.includes("rate limit") || hay.includes("too many requests") || hay.includes("only request this after") || hay.includes("security purposes")) {
    return "Too many attempts from this connection — wait a minute, then try again.";
  }
  if (hay.includes("password should be") || hay.includes("password is too short") || hay.includes("weak password")) {
    return `That password was rejected as too weak — use at least ${MIN_PASSWORD_LENGTH} characters and try again.`;
  }
  if (hay.includes("expired") && context !== "signin") {
    return "That link has expired — request a new one and try again.";
  }
  if (hay.includes("signups not allowed") || hay.includes("signup is disabled")) {
    return "New account sign-ups are currently turned off for this store — email us at enquiry@n2wheels.co.uk and we'll help.";
  }
  return message;
}

/* ── Session helpers (a session, or nothing — never a guess) ────────────── */

/** The account email of a real session, or null when there is no session. */
export function sessionEmail(session: Session | null | undefined): string | null {
  const email = session?.user?.email;
  return typeof email === "string" && email.trim() !== "" ? email : null;
}

/**
 * True only for a real Supabase session that carries a user id AND an email.
 * The UI's "signed in" state is derived from this and nothing else.
 */
export function isSignedIn(session: Session | null | undefined): boolean {
  const id = session?.user?.id;
  return typeof id === "string" && id !== "" && sessionEmail(session) !== null;
}

/** True only when the session says the address was verified by the provider. */
export function isEmailConfirmed(session: Session | null | undefined): boolean {
  if (!isSignedIn(session)) return false;
  // Supabase marks the user as confirmed with either field; absence = unconfirmed.
  const user = session?.user as { email_confirmed_at?: string | null; confirmed_at?: string | null };
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}

/** How the header should render for a given session (pure + testable). */
export interface AccountMenuModel {
  signedIn: boolean;
  email: string | null;
  /** Label on the account control. */
  triggerLabel: string;
  profileLabel: string;
  signOutLabel: string;
}

export const SIGN_IN_LABEL = "Sign in";
export const MY_ACCOUNT_LABEL = "My account";
export const SIGN_OUT_LABEL = "Sign out";

/**
 * The header's account control: "Sign in" when signed out, the customer's own
 * label plus the My account / Sign out menu when signed in. There is no third
 * state — an unresolved session reads as signed OUT, because claiming someone
 * is signed in before we know would be a lie.
 */
export function accountMenuModel(session: Session | null | undefined): AccountMenuModel {
  const email = sessionEmail(session);
  const signedIn = isSignedIn(session);
  return {
    signedIn,
    email: signedIn ? email : null,
    triggerLabel: signedIn ? (email ?? MY_ACCOUNT_LABEL) : SIGN_IN_LABEL,
    profileLabel: MY_ACCOUNT_LABEL,
    signOutLabel: SIGN_OUT_LABEL,
  };
}

/* ── Password-recovery helpers (Supabase's built-in flow) ──────────────── */

/** The URL Supabase's reset/confirmation emails come back to. */
export function recoveryRedirectUrl(origin: string): string {
  // Trailing slash on purpose: the site's router uses trailingSlash "always",
  // so /account/ is the canonical form the static host serves directly.
  return `${origin.replace(/\/+$/, "")}/account/`;
}

/**
 * True when the current address looks like a Supabase recovery redirect
 * (`#access_token=…&type=recovery` or `?type=recovery`). Used only to show the
 * "choose a new password" panel — the session itself still has to exist.
 */
export function isRecoveryRedirect(href: string): boolean {
  const value = String(href ?? "");
  if (!/type=recovery/i.test(value)) return false;
  return /[#?]/.test(value);
}

/** True when the address carries an error from the provider (expired link etc.). */
export function recoveryErrorFromUrl(href: string): string | null {
  const value = String(href ?? "");
  const match = /[#&?]error_description=([^&]+)/i.exec(value);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1].replace(/\+/g, " "));
  } catch {
    return RECOVERY_LINK_INVALID_MSG;
  }
}

/* ── Supabase calls (thin, honest wrappers) ───────────────────────────── */

/** Result of an account action: an honest outcome, never a fabricated success. */
export interface AuthCallResult {
  ok: boolean;
  /** Honest failure text (only when ok is false). */
  error?: string;
  /** Honest extra information (e.g. "check your inbox"). */
  info?: string;
}

function blocked(error: string): AuthCallResult {
  return { ok: false, error };
}

/**
 * Create a customer account. Email confirmation may or may not be required —
 * we report WHICH happened rather than assuming: no session back means the
 * customer still has to open Supabase's confirmation email.
 */
export async function customerSignUp(email: string, password: string): Promise<AuthCallResult> {
  const errors = validateSignUp({ email, password, confirm: password });
  if (errors.email || errors.password) {
    return blocked(errors.email ?? errors.password ?? GENERIC_AUTH_ERROR_MSG);
  }
  if (!supabase) return blocked(ACCOUNTS_NOT_CONFIGURED_MSG);
  try {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return blocked(friendlyAuthError(error.message, "signup"));
    return { ok: true, info: data.session ? SIGNUP_SIGNED_IN_MSG : SIGNUP_CONFIRM_MSG };
  } catch (e) {
    return blocked(friendlyAuthError(e instanceof Error ? e.message : String(e), "signup"));
  }
}

/** Sign in with email + password. */
export async function customerSignIn(email: string, password: string): Promise<AuthCallResult> {
  const errors = validateSignIn({ email, password });
  if (errors.email || errors.password) {
    return blocked(errors.email ?? errors.password ?? GENERIC_AUTH_ERROR_MSG);
  }
  if (!supabase) return blocked(ACCOUNTS_NOT_CONFIGURED_MSG);
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return blocked(friendlyAuthError(error.message, "signin"));
    return { ok: true };
  } catch (e) {
    return blocked(friendlyAuthError(e instanceof Error ? e.message : String(e), "signin"));
  }
}

/** Sign out. The site never claims a sign-out that the service refused. */
export async function customerSignOut(): Promise<AuthCallResult> {
  if (!supabase) return { ok: true }; // nothing to sign out of
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return blocked(friendlyAuthError(error.message, "signin"));
    return { ok: true };
  } catch (e) {
    return blocked(friendlyAuthError(e instanceof Error ? e.message : String(e), "signin"));
  }
}

/**
 * Ask Supabase to send its OWN password-reset email. We do not build a reset
 * flow: no token is generated or read here.
 */
export async function sendPasswordReset(email: string, origin: string): Promise<AuthCallResult> {
  const emailError = validateEmail(email);
  if (emailError) return blocked(RESET_EMAIL_REQUIRED_MSG);
  if (!supabase) return blocked(ACCOUNTS_NOT_CONFIGURED_MSG);
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: recoveryRedirectUrl(origin),
    });
    if (error) return blocked(friendlyAuthError(error.message, "reset"));
    // Supabase answers the same way whether or not the account exists, so the
    // copy says "if an account exists" — we never confirm an account here.
    return { ok: true, info: RESET_SENT_MSG };
  } catch (e) {
    return blocked(friendlyAuthError(e instanceof Error ? e.message : String(e), "reset"));
  }
}

/** Set the new password for the recovered session (Supabase's own flow). */
export async function setNewPassword(password: string, confirm: string): Promise<AuthCallResult> {
  const errors = validateSignUp({ email: "x@y.zz", password, confirm });
  if (errors.password || errors.confirm) {
    return blocked(errors.password ?? errors.confirm ?? GENERIC_AUTH_ERROR_MSG);
  }
  if (!supabase) return blocked(ACCOUNTS_NOT_CONFIGURED_MSG);
  try {
    const { data } = await supabase.auth.getSession();
    if (!isSignedIn(data.session)) return blocked(RECOVERY_LINK_INVALID_MSG);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return blocked(friendlyAuthError(error.message, "update"));
    return { ok: true, info: PASSWORD_UPDATED_MSG };
  } catch (e) {
    return blocked(friendlyAuthError(e instanceof Error ? e.message : String(e), "update"));
  }
}
