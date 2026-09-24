#!/usr/bin/env bun
/**
 * scripts/test-account.ts — CUSTOMER ACCOUNT tests (src/lib/customerAuth.ts,
 * src/lib/customerProfile.ts, src/lib/adminAccess.ts).
 *
 * The point of these tests is the HONESTY CONTRACT of the account system:
 *   · the form tells the truth about what is wrong (or says nothing),
 *   · the service's own errors are mapped to plain English, and an unknown
 *     error is passed through rather than replaced with a fake success,
 *   · "signed in" can only come from a real session object,
 *   · a saved vehicle can only come from a real database row (and a save the
 *     database refused is a failure),
 *   · the admin allow-list keeps customer accounts out of /admin,
 *   · the page itself ships the honest empty-orders wording and never links the
 *     customer to the admin area.
 *
 * NO WRITES: the Supabase-backed checks run with NO session, so every gate
 * fires before a single request. Nothing here touches the owner's database.
 *
 * Run:  bun run test:account     (or: bun ./scripts/test-account.ts)
 */
import { readFileSync } from "node:fs";
import type { Session } from "@supabase/supabase-js";
import {
  ACCOUNTS_NOT_CONFIGURED_MSG,
  CONFIRM_MISMATCH_MSG,
  CONFIRM_REQUIRED_MSG,
  EMAIL_INVALID_MSG,
  EMAIL_REQUIRED_MSG,
  GENERIC_AUTH_ERROR_MSG,
  MY_ACCOUNT_LABEL,
  MIN_PASSWORD_LENGTH,
  PASSWORD_REQUIRED_MSG,
  PASSWORD_TOO_SHORT_MSG,
  PASSWORD_UPDATED_MSG,
  RESET_EMAIL_REQUIRED_MSG,
  RESET_SENT_MSG,
  SIGNUP_CONFIRM_MSG,
  SIGN_IN_LABEL,
  SIGN_OUT_LABEL,
  accountMenuModel,
  customerSignIn,
  customerSignUp,
  friendlyAuthError,
  hasFieldErrors,
  isEmailConfirmed,
  isRecoveryRedirect,
  isSignedIn,
  recoveryErrorFromUrl,
  recoveryRedirectUrl,
  sendPasswordReset,
  sessionEmail,
  setNewPassword,
  validateEmail,
  validateNewPassword,
  validateSignIn,
  validateSignUp,
} from "../src/lib/customerAuth";
import {
  MIN_VEHICLE_YEAR,
  PROFILE_NOT_CONFIGURED_MSG,
  PROFILE_NOT_SIGNED_IN_MSG,
  PROFILE_NOT_READY_MSG,
  VEHICLE_MAKE_REQUIRED_MSG,
  VEHICLE_MODEL_REQUIRED_MSG,
  VEHICLE_NOT_IN_LIST_MSG,
  VEHICLE_YEAR_INVALID_MSG,
  clearCustomerVehicle,
  draftFromVehicle,
  loadCustomerVehicle,
  maxVehicleYear,
  normaliseRegistration,
  parseVehicleInput,
  parseVehicleYear,
  rowToSavedVehicle,
  saveCustomerVehicle,
  vehicleFromJson,
  vehicleJsonPayload,
  vehicleLabel,
} from "../src/lib/customerProfile";
import {
  ADMIN_ALLOW_LIST_ENV,
  ADMIN_NO_ACCESS_MSG,
  adminAccessVerdict,
  parseEmailList,
  readAdminAllowList,
} from "../src/lib/adminAccess";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    fails.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ── 1. Form validation (pure) ─────────────────────────────────────────── */

check("empty email is refused", validateEmail("") === EMAIL_REQUIRED_MSG);
check("whitespace-only email is refused", validateEmail("   ") === EMAIL_REQUIRED_MSG);
check("'not-an-email' is refused", validateEmail("not-an-email") === EMAIL_INVALID_MSG);
check("'a@b' (no TLD) is refused", validateEmail("a@b") === EMAIL_INVALID_MSG);
check("'a b@c.com' (space) is refused", validateEmail("a b@c.com") === EMAIL_INVALID_MSG);
check("a real address passes, padded or not", validateEmail(" you@example.com ") === null);

check(
  "new password: empty -> required, 7 chars -> too short, 8 chars -> ok",
  validateNewPassword("") === PASSWORD_REQUIRED_MSG &&
    validateNewPassword("1234567") === PASSWORD_TOO_SHORT_MSG &&
    validateNewPassword("12345678") === null,
  `min is ${MIN_PASSWORD_LENGTH}`,
);
check(
  "sign-in does NOT impose the new-password length (existing accounts stay usable)",
  validateSignIn({ email: "you@example.com", password: "1234" }).password === undefined,
);
check(
  "sign-in requires both fields",
  validateSignIn({ email: "", password: "" }).email === EMAIL_REQUIRED_MSG &&
    validateSignIn({ email: "", password: "" }).password === PASSWORD_REQUIRED_MSG,
);
const goodSignUp = validateSignUp({ email: "you@example.com", password: "longenough", confirm: "longenough" });
check("sign-up with matching passwords has no errors", !hasFieldErrors(goodSignUp));
check(
  "sign-up catches a mismatched confirmation",
  validateSignUp({ email: "you@example.com", password: "longenough", confirm: "different1" }).confirm ===
    CONFIRM_MISMATCH_MSG,
);
check(
  "sign-up catches an empty confirmation",
  validateSignUp({ email: "you@example.com", password: "longenough", confirm: "" }).confirm ===
    CONFIRM_REQUIRED_MSG,
);
check("hasFieldErrors(false) for an all-clear result", !hasFieldErrors({ email: undefined }));

/* ── 2. Honest error mapping ──────────────────────────────────────────── */

check(
  "wrong password maps to a plain-English, non-accusing message",
  friendlyAuthError("Invalid login credentials", "signin").includes("don't match an account"),
);
check(
  "unconfirmed email is explained (open the link, then sign in)",
  friendlyAuthError("Email not confirmed", "signin").includes("hasn't confirmed its email address"),
);
check(
  "an existing account is reported as such, with the way forward",
  friendlyAuthError("User already registered", "signup").includes("already an account"),
);
check(
  "network failure is never disguised as bad credentials",
  friendlyAuthError("Failed to fetch", "signin").includes("couldn't reach the sign-in service"),
);
check(
  "rate limiting is explained",
  friendlyAuthError("For security purposes, you can only request this after 41 seconds", "reset").includes(
    "Too many attempts",
  ),
);
check("an empty provider message becomes the generic honest line", friendlyAuthError("", "signin") === GENERIC_AUTH_ERROR_MSG);
check(
  "an unrecognised provider message is passed through unchanged (never rewritten)",
  friendlyAuthError("Some brand new provider error", "signin") === "Some brand new provider error",
);
check(
  "the reset-request copy never confirms that an account exists",
  RESET_SENT_MSG.startsWith("If an account exists for that email") && RESET_SENT_MSG.includes("Supabase sends"),
);
check(
  "honest gate + help copy exists",
  ACCOUNTS_NOT_CONFIGURED_MSG.includes("Nothing you type here is sent anywhere") &&
    RESET_EMAIL_REQUIRED_MSG.includes("Forgot password?") &&
    SIGNUP_CONFIRM_MSG.includes("confirmation email") &&
    PASSWORD_UPDATED_MSG.includes("Password updated"),
);

/* ── 3. Session helpers: a session, or nothing ─────────────────────────── */

const realSession = {
  access_token: "t",
  refresh_token: "r",
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "user-1", email: "customer@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
} as unknown as Session;
const idWithoutEmail = { user: { id: "user-2", email: "" } } as unknown as Session;
const emailWithoutId = { user: { email: "ghost@example.com" } } as unknown as Session;

check("no session -> no email, not signed in", sessionEmail(null) === null && !isSignedIn(null));
check("a real session reports its email and counts as signed in", sessionEmail(realSession) === "customer@example.com" && isSignedIn(realSession));
check("an id without an email is NOT a usable session", !isSignedIn(idWithoutEmail));
check("an email without a user id is NOT a usable session", !isSignedIn(emailWithoutId));
check("email confirmation is read from the session, not assumed", isEmailConfirmed(realSession) && !isEmailConfirmed(idWithoutEmail));

const signedOutModel = accountMenuModel(null);
check(
  "signed-out header states read 'Sign in' and hold no email",
  signedOutModel.signedIn === false &&
    signedOutModel.triggerLabel === SIGN_IN_LABEL &&
    signedOutModel.email === null &&
    signedOutModel.profileLabel === MY_ACCOUNT_LABEL &&
    signedOutModel.signOutLabel === SIGN_OUT_LABEL,
);
const signedInModel = accountMenuModel(realSession);
check(
  "signed-in header offers My account / Sign out and shows the real email",
  signedInModel.signedIn === true && signedInModel.email === "customer@example.com",
);
check(
  "an unusable session renders as signed OUT (never a guessed signed-in state)",
  accountMenuModel(idWithoutEmail).signedIn === false && accountMenuModel(emailWithoutId).signedIn === false,
);

/* ── 4. Recovery link helpers (Supabase's built-in flow) ───────────────── */

check(
  "the reset email comes back to /account/ (trailing slash = the canonical, served path)",
  recoveryRedirectUrl("https://n2wheels.co.uk") === "https://n2wheels.co.uk/account/" &&
    recoveryRedirectUrl("https://n2wheels.co.uk/") === "https://n2wheels.co.uk/account/",
);
check(
  "a Supabase recovery redirect is recognised, a normal page load is not",
  isRecoveryRedirect("https://n2wheels.co.uk/account/#access_token=x&type=recovery") &&
    !isRecoveryRedirect("https://n2wheels.co.uk/account/"),
);
check(
  "a provider error in the link is decoded for the customer",
  recoveryErrorFromUrl("https://x/account/#error_description=Email%20link%20is%20invalid") ===
    "Email link is invalid" && recoveryErrorFromUrl("https://x/account/") === null,
);

/* ── 5. Admin allow-list (customer accounts must not reach /admin) ─────── */

check(
  "the allow-list is parsed from a comma/space list, de-duped and lower-cased",
  JSON.stringify(parseEmailList("Owner@N2Wheels.co.uk, shop@example.com owner@n2wheels.co.uk")) ===
    JSON.stringify(["owner@n2wheels.co.uk", "shop@example.com"]),
);
check("an empty setting means 'not configured'", parseEmailList("") .length === 0 && parseEmailList(null).length === 0);
const unconfigured = adminAccessVerdict("shop@example.com", []);
check(
  "with NO allow-list the gate behaves exactly as before (owner not locked out)",
  unconfigured.configured === false && unconfigured.allowed === true,
);
const restricted = adminAccessVerdict("shop@example.com", ["owner@n2wheels.co.uk"]);
check(
  "with an allow-list a customer account is refused, honestly",
  restricted.configured === true && restricted.allowed === false && restricted.message === ADMIN_NO_ACCESS_MSG,
);
check(
  "with an allow-list the business account is allowed (case-insensitive)",
  adminAccessVerdict("OWNER@N2WHEELS.CO.UK", ["owner@n2wheels.co.uk"]).allowed === true,
);
check(
  "a signed-in account with no email is refused when the allow-list is set",
  adminAccessVerdict(null, ["owner@n2wheels.co.uk"]).allowed === false,
);
check(
  "the allow-list env var name is the documented one",
  ADMIN_ALLOW_LIST_ENV === "VITE_ADMIN_EMAILS" && readAdminAllowList({}).length === 0,
  `env: ${ADMIN_ALLOW_LIST_ENV}`,
);

/* ── 6. Saved vehicle: parsing, payload, round-trip ───────────────────── */

check(
  "a plate is stored upper-case with no spaces (or null when empty)",
  normaliseRegistration(" sa15 vpr ") === "SA15VPR" &&
    normaliseRegistration("") === null &&
    normaliseRegistration(null) === null,
);
check(
  "year parsing: number, string, empty and junk",
  parseVehicleYear(2015) === 2015 &&
    parseVehicleYear("2015") === 2015 &&
    parseVehicleYear("") === null &&
    parseVehicleYear("soon") === null,
);
const goodVehicle = parseVehicleInput({
  make: "BMW",
  model: "3 Series",
  year: "2015",
  registration: "sa15vpr",
});
check(
  "a complete fleet vehicle is accepted and normalised",
  goodVehicle.error === undefined &&
    goodVehicle.vehicle?.make === "BMW" &&
    goodVehicle.vehicle?.model === "3 Series" &&
    goodVehicle.vehicle?.year === 2015 &&
    goodVehicle.vehicle?.registration === "SA15VPR",
  JSON.stringify(goodVehicle),
);
check(
  "make and model are required (no half-filled saved car)",
  parseVehicleInput({ make: "", model: "3 Series" }).error === VEHICLE_MAKE_REQUIRED_MSG &&
    parseVehicleInput({ make: "BMW", model: "" }).error === VEHICLE_MODEL_REQUIRED_MSG,
);
check(
  "a make/model outside the fleet list is refused (we never store an invented car)",
  parseVehicleInput({ make: "Lada", model: "Niva" }).error === VEHICLE_NOT_IN_LIST_MSG,
);
check(
  "an out-of-range year is refused, an empty year stays optional",
  parseVehicleInput({ make: "BMW", model: "3 Series", year: "1980" }).error === VEHICLE_YEAR_INVALID_MSG &&
    parseVehicleInput({ make: "BMW", model: "3 Series", year: "" }).vehicle?.year === null,
);
check(
  "the year bound is current-year + 1 and never below 1990",
  MIN_VEHICLE_YEAR === 1990 && maxVehicleYear(new Date("2026-06-01T00:00:00Z")) === 2027,
);
const payload = vehicleJsonPayload(goodVehicle.vehicle!);
check(
  "the jsonb payload is exactly {make, model, year, registration}",
  JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(["make", "model", "registration", "year"]) &&
    payload.registration === "SA15VPR",
);
check(
  "a stored row round-trips back to the same vehicle",
  JSON.stringify(rowToSavedVehicle({ vehicle: payload })) === JSON.stringify(goodVehicle.vehicle),
);
check(
  "a row with no vehicle, a broken value, or a missing model is null (nothing is invented)",
  rowToSavedVehicle({ vehicle: null }) === null &&
    rowToSavedVehicle(null) === null &&
    rowToSavedVehicle({}) === null &&
    vehicleFromJson({ make: "BMW" }) === null &&
    vehicleFromJson("BMW 3 Series") === null,
);
check(
  "a string year inside jsonb is still read as a year",
  vehicleFromJson({ make: "Audi", model: "A3", year: "2019", registration: null })?.year === 2019,
);
check(
  "the saved-vehicle label reads naturally, with and without a plate/year",
  vehicleLabel({ make: "BMW", model: "3 Series", year: 2015, registration: "SA15VPR" }) ===
    "2015 BMW 3 Series (SA15VPR)" &&
    vehicleLabel({ make: "Audi", model: "A3", year: null, registration: null }) === "Audi A3",
);
check(
  "the form draft round-trips from a saved vehicle",
  JSON.stringify(draftFromVehicle(goodVehicle.vehicle)) ===
    JSON.stringify({ make: "BMW", model: "3 Series", year: "2015", registration: "SA15VPR" }) &&
    draftFromVehicle(null).make === "",
);

/* ── 7. Live gates: no session = nothing read, nothing written ─────────── */

const loaded = await loadCustomerVehicle();
check(
  "loadCustomerVehicle() with no session reports signedIn:false and NO vehicle",
  loaded.signedIn === false &&
    loaded.vehicle === null &&
    (loaded.error === PROFILE_NOT_SIGNED_IN_MSG || loaded.error === PROFILE_NOT_CONFIGURED_MSG),
  String(loaded.error),
);
const saveUnsigned = await saveCustomerVehicle({ make: "BMW", model: "3 Series", year: "2015" });
check(
  "an unsigned save is refused with an honest error (never a fake success)",
  saveUnsigned.ok === false &&
    saveUnsigned.error !== undefined &&
    (saveUnsigned.error === PROFILE_NOT_SIGNED_IN_MSG || saveUnsigned.error === PROFILE_NOT_CONFIGURED_MSG),
  String(saveUnsigned.error),
);
const saveInvalid = await saveCustomerVehicle({ make: "", model: "", year: "" });
check(
  "validation runs BEFORE any request: an empty car never reaches the database",
  saveInvalid.ok === false && saveInvalid.error === VEHICLE_MAKE_REQUIRED_MSG,
  String(saveInvalid.error),
);
const cleared = await clearCustomerVehicle();
check("clearing with no session is refused too", cleared.ok === false);
check(
  "the saved-vehicle card has its own honest 'not set up yet' wording",
  PROFILE_NOT_READY_MSG.startsWith("Saved vehicles aren't set up yet") &&
    PROFILE_NOT_READY_MSG.includes("customer-profiles.sql"),
);
const signInBlocked = await customerSignIn("", "");
check(
  "sign-in refuses empty credentials before calling the service",
  signInBlocked.ok === false && signInBlocked.error === EMAIL_REQUIRED_MSG,
);
const signUpBlocked = await customerSignUp("you@example.com", "short");
check(
  "sign-up refuses a short password before calling the service",
  signUpBlocked.ok === false && signUpBlocked.error === PASSWORD_TOO_SHORT_MSG,
);
const resetBlocked = await sendPasswordReset("", "https://n2wheels.co.uk");
check(
  "a reset request with no email is refused (and sends nothing)",
  resetBlocked.ok === false && resetBlocked.error === RESET_EMAIL_REQUIRED_MSG,
);
const updateUnsigned = await setNewPassword("longenough", "longenough");
check(
  "a password update without a recovery session is refused",
  updateUnsigned.ok === false && updateUnsigned.error !== undefined,
);

/* ── 8. The shipped page + SQL (source-level honesty checks) ───────────── */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const squash = (s: string) => s.replace(/\s+/g, " ");
const account = read("src/routes/account.tsx");
const sql = read("scripts/customer-profiles.sql");
const exportScript = read("export-netlify.ts");
const verify = read("verify-netlify.sh");

check(
  "the account page ships the honest empty-orders sentence verbatim",
  squash(account).includes(
    "No orders yet — your order history will appear here once we start taking real orders.",
  ),
);
check(
  "the account page never links a customer into the admin area",
  !account.includes('to="/admin"') && !squash(account).includes("service_role"),
);
check(
  "the account page uses the ONE shared Supabase client (no second client)",
  account.includes('from "~/lib/supabase"') && !account.includes("createClient"),
);
check(
  "the SQL file carries the exact table definition the owner is asked to run",
  squash(sql).includes(
    "create table if not exists customer_profiles ( id uuid primary key references auth.users on delete cascade, vehicle jsonb, updated_at timestamptz default now() )",
  ),
);
check(
  "the SQL turns RLS on and allows only the customer's own row",
  sql.includes("alter table customer_profiles enable row level security") &&
    (sql.match(/auth\.uid\(\) = id/g) ?? []).length >= 3,
);
check(
  "the admin gate reads the allow-list (customer accounts cannot reach /admin)",
  read("src/routes/admin.tsx").includes("adminAccessVerdict(") &&
    read("src/routes/admin.tsx").includes("readAdminAllowList()"),
);
check(
  "/account is in the static export route list AND in verify-netlify.sh",
  exportScript.includes('"/account",') && verify.includes('check "/account"'),
);
check(
  "the header is wired to the account flow (Sign in / account menu / sign out)",
  read("src/components/Header.tsx").includes('to="/account"') &&
    read("src/components/Header.tsx").includes("accountMenuModel(session)") &&
    read("src/components/Header.tsx").includes("customerSignOut()"),
);

console.log("---");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fails.length) console.log(fails.map((f) => ` - ${f}`).join("\n"));
process.exit(fail === 0 ? 0 : 1);
