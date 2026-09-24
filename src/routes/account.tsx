import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ACCOUNTS_NOT_CONFIGURED_MSG,
  CONFIRM_MISMATCH_MSG,
  RECOVERY_LINK_INVALID_MSG,
  RESET_EMAIL_REQUIRED_MSG,
  RESET_SENT_MSG,
  customerSignIn,
  customerSignOut,
  customerSignUp,
  hasFieldErrors,
  sendPasswordReset,
  setNewPassword,
  validateEmail,
  validateNewPassword,
  validateSignIn,
  validateSignUp,
  PASSWORD_UPDATED_MSG,
  RECOVERY_PANEL_MSG,
} from "~/lib/customerAuth";
import type { AuthFormErrors } from "~/lib/customerAuth";
import type { SavedVehicle } from "~/lib/customerProfile";
import {
  PROFILE_NOT_READY_MSG,
  clearCustomerVehicle,
  draftFromVehicle,
  loadCustomerVehicle,
  saveCustomerVehicle,
  vehicleLabel,
} from "~/lib/customerProfile";
import { DEMO_MAKES, DEMO_YEARS, modelsForMake } from "~/lib/reglookup";
import { isSupabaseConfigured } from "~/lib/supabase";
import { useCustomerSession } from "~/lib/useCustomerSession";
import { CheckIcon, LockIcon, ShieldIcon, UserIcon } from "~/components/icons";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Your Account | N2 Wheels" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Sign in or create your N2 Wheels account — save your car once and check tyres and alloy wheels for it any time. Accounts are real (email and password); order history stays empty until we start taking real orders.",
      },
    ],
  }),
  component: AccountPage,
});

/**
 * /account — the CUSTOMER account page.
 *
 * WHAT IT IS
 *  · Sign up / sign in with email + password against the site's Supabase
 *    project (the same one the owner's /admin uses — one project, one client).
 *  · A signed-in "My account" view with the account email, the customer's
 *    SAVED VEHICLE (make / model / year, optional plate) and the honest state
 *    of their order history.
 *  · "Forgot password?" hands off to Supabase's own reset email; the link
 *    comes back here and the customer picks a new password.
 *
 * HONESTY RULES BAKED INTO THIS PAGE
 *  · "Signed in" is only ever a real Supabase session (useCustomerSession).
 *  · The saved vehicle is read from and written to the database — a save that
 *    the database refused (or a missing customer_profiles table) is reported
 *    as a failure, never shown as a success, and nothing is kept locally as a
 *    stand-in.
 *  · The orders card says there are no orders because there ARE no orders: the
 *    store is still on sample catalogue data and no real order exists yet.
 *  · The catalogue is sample data; ACCOUNTS ARE REAL. The page says so.
 *
 * The admin area is deliberately NOT linked from here and has its own gate
 * (owner accounts only) — see src/lib/adminAccess.ts.
 */
function AccountPage() {
  const { ready, session, email, signedIn, recovery, recoveryError } = useCustomerSession();
  const [recoveryDone, setRecoveryDone] = useState(false);

  const showRecovery = signedIn && recovery && !recoveryDone;

  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-14 sm:py-20">
        <div className="max-w-3xl">
          <span className="sample-chip">Customer account</span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Your N2 Wheels account
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-steel sm:text-base">
            Accounts are real — sign-in is handled by our own sign-in service with your email and a
            password. Save your car once and you can check tyres and alloy wheels for it whenever you
            come back. Our catalogue is sample data for now, so your order history stays empty until
            we start taking real orders; we never show a made-up order or a made-up car.
          </p>
        </div>

        <div className="mt-10 max-w-3xl">
          {!isSupabaseConfigured ? (
            <AccountsUnavailable />
          ) : showRecovery ? (
            <RecoveryPanel
              recoveryError={recoveryError}
              onDone={() => {
                // Drop the recovery fragment from the address bar so a reload
                // lands on the normal account view.
                if (typeof window !== "undefined" && window.location.hash) {
                  window.history.replaceState(null, "", window.location.pathname);
                }
                setRecoveryDone(true);
              }}
            />
          ) : signedIn ? (
            <MyAccount
              email={email ?? session?.user?.email ?? ""}
              justUpdatedPassword={recoveryDone}
            />
          ) : (
            <AuthPanel checking={!ready} />
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Not configured: accounts cannot work on this build ─────────────────── */

function AccountsUnavailable() {
  return (
    <div className="rounded-lg border border-line bg-carbon p-6 sm:p-8">
      <h2 className="text-lg font-bold text-white">Accounts aren&apos;t available on this build</h2>
      <p className="mt-3 text-sm leading-relaxed text-steel">{ACCOUNTS_NOT_CONFIGURED_MSG}</p>
      <p className="mt-3 text-sm leading-relaxed text-steel">
        Everything else keeps working — you can still browse tyres, wheels and packages, and you can
        always email us at{" "}
        <a className="font-semibold text-race-bright hover:underline" href="mailto:enquiry@n2wheels.co.uk">
          enquiry@n2wheels.co.uk
        </a>
        .
      </p>
    </div>
  );
}

/* ── Signed out: sign in / create account ──────────────────────────────── */

type AuthTab = "signin" | "signup";

function AuthPanel({ checking }: { checking: boolean }) {
  const [tab, setTab] = useState<AuthTab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<AuthFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchTab = (next: AuthTab) => {
    setTab(next);
    setErrors({});
    setError(null);
    setInfo(null);
    setPassword("");
    setConfirm("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const validation =
      tab === "signin" ? validateSignIn({ email, password }) : validateSignUp({ email, password, confirm });
    setErrors(validation);
    if (hasFieldErrors(validation)) return;
    setBusy(true);
    try {
      const res =
        tab === "signin"
          ? await customerSignIn(email, password)
          : await customerSignUp(email, password);
      if (!res.ok) setError(res.error ?? "Something went wrong — please try again.");
      else if (res.info) setInfo(res.info);
      // A real session makes the page render the account view on its own.
    } finally {
      setBusy(false);
      setPassword("");
      setConfirm("");
    }
  };

  const forgot = async () => {
    setError(null);
    setInfo(null);
    const emailError = validateEmail(email);
    if (emailError) {
      setErrors({ email: emailError });
      setError(RESET_EMAIL_REQUIRED_MSG);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await sendPasswordReset(email, typeof window === "undefined" ? "" : window.location.origin);
      if (!res.ok) setError(res.error ?? "We couldn't request a reset just now — please try again.");
      else setInfo(res.info ?? RESET_SENT_MSG);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-carbon p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-race text-white">
          <UserIcon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-white">
            {tab === "signin" ? "Sign in to your account" : "Create your account"}
          </h2>
          <p className="text-xs text-steel">
            {tab === "signin"
              ? "Use the email and password you signed up with."
              : "Email and password only — no social logins yet."}
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-2" role="tablist" aria-label="Account options">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "signin"}
          onClick={() => switchTab("signin")}
          className={
            tab === "signin"
              ? "rounded-md bg-race px-4 py-2 text-sm font-semibold text-white"
              : "rounded-md border border-line px-4 py-2 text-sm font-semibold text-steel hover:text-white"
          }
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "signup"}
          onClick={() => switchTab("signup")}
          className={
            tab === "signup"
              ? "rounded-md bg-race px-4 py-2 text-sm font-semibold text-white"
              : "rounded-md border border-line px-4 py-2 text-sm font-semibold text-steel hover:text-white"
          }
        >
          Create account
        </button>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <label className="block">
          <span className="field-label">Email</span>
          <input
            className="field-input"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email && <span className="mt-1 block text-xs text-race-bright">{errors.email}</span>}
        </label>

        <label className="block">
          <span className="field-label">Password</span>
          <input
            className="field-input"
            type="password"
            name="password"
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.password && (
            <span className="mt-1 block text-xs text-race-bright">{errors.password}</span>
          )}
          {tab === "signup" && !errors.password && (
            <span className="mt-1 block text-xs text-steel-dim">At least 8 characters.</span>
          )}
        </label>

        {tab === "signup" && (
          <label className="block">
            <span className="field-label">Confirm password</span>
            <input
              className="field-input"
              type="password"
              name="confirm"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {errors.confirm && (
              <span className="mt-1 block text-xs text-race-bright">{errors.confirm}</span>
            )}
          </label>
        )}

        {error && (
          <p className="rounded-md border border-race/40 bg-race/10 px-3 py-2 text-xs text-race-bright">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
            {info}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="submit" disabled={busy} className="btn btn-red sm:w-auto">
            {busy ? "Please wait…" : tab === "signin" ? "Sign in" : "Create account"}
          </button>
          {tab === "signin" && (
            <button
              type="button"
              onClick={forgot}
              disabled={busy}
              className="text-left text-xs font-semibold text-race-bright hover:underline sm:text-center"
            >
              Forgot password?
            </button>
          )}
        </div>

        {checking && !error && !info && (
          <p className="text-xs text-steel-dim">Checking whether you&apos;re already signed in…</p>
        )}
      </form>

      <p className="mt-6 flex items-start gap-2 border-t border-line pt-4 text-[11px] leading-relaxed text-steel-dim">
        <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Your password is handled by our sign-in service — we never see or store it. &ldquo;Forgot
          password?&rdquo; emails you a reset link from that service; the link brings you back here to
          choose a new password.
        </span>
      </p>
    </div>
  );
}

/* ── Reset link came back: choose a new password (Supabase's flow) ─────── */

function RecoveryPanel({ recoveryError, onDone }: { recoveryError: string | null; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<AuthFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const passwordError = validateNewPassword(password);
    const confirmError =
      confirm === "" ? "Repeat your new password." : confirm !== password ? CONFIRM_MISMATCH_MSG : null;
    setErrors({ password: passwordError ?? undefined, confirm: confirmError ?? undefined });
    if (passwordError || confirmError) return;
    setBusy(true);
    try {
      const res = await setNewPassword(password, confirm);
      if (!res.ok) setError(res.error ?? RECOVERY_LINK_INVALID_MSG);
      else {
        setInfo(res.info ?? PASSWORD_UPDATED_MSG);
        setPassword("");
        setConfirm("");
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-carbon p-6 sm:p-8">
      <h2 className="text-lg font-bold text-white">Choose a new password</h2>
      <p className="mt-3 text-sm leading-relaxed text-steel">{RECOVERY_PANEL_MSG}</p>
      {recoveryError && (
        <p className="mt-3 rounded-md border border-race/40 bg-race/10 px-3 py-2 text-xs text-race-bright">
          {RECOVERY_LINK_INVALID_MSG} ({recoveryError})
        </p>
      )}
      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <label className="block">
          <span className="field-label">New password</span>
          <input
            className="field-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.password && <span className="mt-1 block text-xs text-race-bright">{errors.password}</span>}
        </label>
        <label className="block">
          <span className="field-label">Confirm new password</span>
          <input
            className="field-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {errors.confirm && <span className="mt-1 block text-xs text-race-bright">{errors.confirm}</span>}
        </label>
        {error && (
          <p className="rounded-md border border-race/40 bg-race/10 px-3 py-2 text-xs text-race-bright">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
            {info}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn btn-red">
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}

/* ── Signed in: the account view ───────────────────────────────────────── */

function MyAccount({ email, justUpdatedPassword }: { email: string; justUpdatedPassword: boolean }) {
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Saved vehicle state. `loading` keeps the card honest until the database
  // has actually answered — we never show a vehicle we haven't read.
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<SavedVehicle | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ make: "", model: "", year: "", registration: "" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveInfo, setSaveInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadCustomerVehicle().then((res) => {
      if (!alive) return;
      setTableMissing(Boolean(res.tableMissing));
      setLoadError(res.error ?? null);
      if (res.vehicle) {
        setSaved(res.vehicle);
        setDraft(draftFromVehicle(res.vehicle));
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    const res = await customerSignOut();
    setSigningOut(false);
    if (!res.ok) {
      setSignOutError(res.error ?? "We couldn't sign you out just now — please try again.");
      return;
    }
    // Requirement: signing out returns the customer to the shop.
    await navigate({ to: "/" });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveInfo(null);
    setSaving(true);
    try {
      const res = await saveCustomerVehicle(draft);
      if (!res.ok) {
        setTableMissing(Boolean(res.tableMissing));
        setSaveError(res.error ?? "We couldn't save that vehicle — please try again.");
        return;
      }
      setSaved(res.vehicle ?? null);
      setDraft(draftFromVehicle(res.vehicle ?? null));
      setSaveInfo(`Saved to your account: ${res.vehicle ? vehicleLabel(res.vehicle) : ""}`.trim());
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaveError(null);
    setSaveInfo(null);
    setSaving(true);
    try {
      const res = await clearCustomerVehicle();
      if (!res.ok) {
        setTableMissing(Boolean(res.tableMissing));
        setSaveError(res.error ?? "We couldn't remove that just now — please try again.");
        return;
      }
      setSaved(null);
      setDraft({ make: "", model: "", year: "", registration: "" });
      setSaveInfo("Saved vehicle removed from your account.");
    } finally {
      setSaving(false);
    }
  };

  const models = modelsForMake(draft.make);

  return (
    <div className="space-y-6">
      {justUpdatedPassword && (
        <p className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
          {PASSWORD_UPDATED_MSG}
        </p>
      )}

      {/* Your details */}
      <div className="rounded-lg border border-line bg-carbon p-6 sm:p-8">
        <h2 className="text-lg font-bold text-white">Your details</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-steel">Account email:</dt>
            <dd className="font-semibold text-white">{email || "—"}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-steel">Sign-in method:</dt>
            <dd className="text-steel">Email and password</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="button" onClick={signOut} disabled={signingOut} className="btn btn-outline">
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <Link to="/fitment" className="text-xs font-semibold text-race-bright hover:underline">
            Check tyres &amp; wheels for your car
          </Link>
        </div>
        {signOutError && (
          <p className="mt-3 rounded-md border border-race/40 bg-race/10 px-3 py-2 text-xs text-race-bright">
            {signOutError}
          </p>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-steel-dim">
          Signing out returns you to the shop. Your account and saved car stay with us — sign back in
          any time with the same email and password.
        </p>
      </div>

      {/* Saved vehicle */}
      <div className="rounded-lg border border-line bg-carbon p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-white">Saved vehicle</h2>
          {saved && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
              <CheckIcon className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-steel">Loading your saved vehicle…</p>
        ) : tableMissing ? (
          <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-4">
            <p className="text-sm font-semibold text-amber-200">Saved vehicles aren&apos;t set up yet</p>
            <p className="mt-2 text-xs leading-relaxed text-amber-100/90">{PROFILE_NOT_READY_MSG}</p>
          </div>
        ) : (
          <>
            {saved ? (
              <p className="mt-4 text-sm text-steel">
                We have <span className="font-semibold text-white">{vehicleLabel(saved)}</span>{" "}
                on your account. We still verify compatibility with your exact vehicle before
                confirming any order.
              </p>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-steel">
                Save your car once — then tyres, wheels and packages can be checked against it in a
                single step. Nothing is saved until you press save below.
              </p>
            )}

            {loadError && !saved && (
              <p className="mt-3 rounded-md border border-race/40 bg-race/10 px-3 py-2 text-xs text-race-bright">
                {loadError}
              </p>
            )}

            <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">Make</span>
                <select
                  className="field-input"
                  value={draft.make}
                  onChange={(e) => {
                    const make = e.target.value;
                    setDraft((d) => ({ ...d, make, model: "" }));
                  }}
                >
                  <option value="">Select make</option>
                  {DEMO_MAKES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="field-label">Model</span>
                <select
                  className="field-input"
                  value={draft.model}
                  onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                >
                  <option value="">{draft.make ? "Select model" : "Choose a make first"}</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="field-label">Year (optional)</span>
                <select
                  className="field-input"
                  value={draft.year}
                  onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))}
                >
                  <option value="">Any year</option>
                  {DEMO_YEARS.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="field-label">Registration (optional)</span>
                <input
                  className="field-input uppercase"
                  type="text"
                  autoComplete="off"
                  placeholder="SA15 VPR"
                  value={draft.registration}
                  onChange={(e) => setDraft((d) => ({ ...d, registration: e.target.value }))}
                />
              </label>

              {saveError && (
                <p className="sm:col-span-2 rounded-md border border-race/40 bg-race/10 px-3 py-2 text-xs text-race-bright">
                  {saveError}
                </p>
              )}
              {saveInfo && (
                <p className="sm:col-span-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
                  {saveInfo}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                <button type="submit" disabled={saving} className="btn btn-red">
                  {saving ? "Saving…" : saved ? "Update saved vehicle" : "Save this vehicle"}
                </button>
                {saved && (
                  <button
                    type="button"
                    onClick={remove}
                    disabled={saving}
                    className="text-xs font-semibold text-steel hover:text-white"
                  >
                    Remove saved vehicle
                  </button>
                )}
              </div>
            </form>
            <p className="mt-4 text-[11px] leading-relaxed text-steel-dim">
              Your saved car is stored against your account in our database. Make, model and year are
              required; the registration is optional and is only ever used to help find your car.
            </p>
          </>
        )}
      </div>

      {/* Orders — honest empty state */}
      <div className="rounded-lg border border-line bg-carbon p-6 sm:p-8">
        <h2 className="text-lg font-bold text-white">Orders</h2>
        <div className="mt-4 rounded-md border border-line bg-coal p-4">
          <p className="text-sm font-semibold text-white">
            No orders yet — your order history will appear here once we start taking real orders.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-steel">
            Nothing is listed unless it really happened: we are still showing a sample catalogue and
            no real order has been placed through this site. When real orders exist, they will show
            here against your account.
          </p>
        </div>
      </div>

      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-steel-dim">
        <ShieldIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          The store area (product data, pricing and imports) is separate from your account and is
          limited to the business&apos;s own sign-in — a shop account can&apos;t open it. Need
          something?{" "}
          <a className="font-semibold text-race-bright hover:underline" href="mailto:enquiry@n2wheels.co.uk">
            enquiry@n2wheels.co.uk
          </a>
        </span>
      </p>
    </div>
  );
}
