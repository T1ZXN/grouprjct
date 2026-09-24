/**
 * useCustomerSession.ts — the ONE place the site asks "is a customer signed in?"
 *
 * Wraps the shared Supabase client (src/lib/supabase.ts — never a second one)
 * in a hook so the header and /account agree on the answer. It resolves the
 * persisted session on mount and follows onAuthStateChange afterwards.
 *
 * HONESTY: the initial state is SIGNED OUT on both the server render and the
 * first client render (so there is never a hydration mismatch), and it only
 * flips to "signed in" when a real session object arrives. With Supabase
 * unconfigured the hook settles immediately as signed out and never throws.
 */
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSignedIn, sessionEmail } from "~/lib/customerAuth";
import { supabase } from "~/lib/supabase";

export interface CustomerSessionState {
  /** False until the persisted session has actually been resolved. */
  ready: boolean;
  /** The real Supabase session, or null. */
  session: Session | null;
  /** The account email, or null. */
  email: string | null;
  /** True only for a real session (never a guess, never a cached label). */
  signedIn: boolean;
  /** True when the recovery link in the address brought a session back. */
  recovery: boolean;
  /** Honest provider error carried in the address (expired reset link). */
  recoveryError: string | null;
}

export function useCustomerSession(): CustomerSessionState {
  const [state, setState] = useState<CustomerSessionState>({
    ready: false,
    session: null,
    email: null,
    signedIn: false,
    recovery: false,
    recoveryError: null,
  });

  useEffect(() => {
    const href = typeof window === "undefined" ? "" : window.location.href;
    const recoveryFromUrl = /type=recovery/i.test(href);
    if (!supabase) {
      setState((s) => ({ ...s, ready: true }));
      return;
    }
    let alive = true;
    const apply = (session: Session | null, extra?: { recovery?: boolean; recoveryError?: string | null }) => {
      if (!alive) return;
      setState({
        ready: true,
        session,
        email: sessionEmail(session),
        signedIn: isSignedIn(session),
        recovery: extra?.recovery ?? false,
        recoveryError: extra?.recoveryError ?? null,
      });
    };
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session, { recovery: recoveryFromUrl }))
      .catch(() => apply(null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY is Supabase's built-in reset flow handing us a session.
      apply(session, { recovery: event === "PASSWORD_RECOVERY" || recoveryFromUrl });
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
