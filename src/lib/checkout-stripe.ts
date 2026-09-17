/**
 * N2 Wheels — the LIVE hosted-checkout provider (Stripe Payment Link).
 *
 * WHAT THIS IS
 * The business's real Stripe account is connected and a Stripe Payment Link
 * exists. This module turns the build-time configuration slot defined by the
 * checkout seam (`CHECKOUT_URL_ENV_KEY` = `VITE_CHECKOUT_URL`, see
 * src/lib/checkout.ts) into a REGISTERED payment provider, so /checkout shows a
 * proper provider label plus the honest demo-payment note instead of a generic
 * fallback.
 *
 * HOW IT IS ACTIVATED
 * Purely by configuration — no code change, no rebuild of the UI:
 *   • `VITE_CHECKOUT_URL` set in the build environment (`.env`, gitignored) →
 *     `registerStripeCheckoutProvider()` registers `stripe-hosted-demo` and
 *     /checkout takes the `redirect` path to the provider's own page.
 *   • `VITE_CHECKOUT_URL` absent/blank (e.g. an env-less build) → this module
 *     registers NOTHING, `getCheckoutProvider()` returns the seam's honest
 *     email-handoff provider, and /checkout behaves exactly as before.
 *
 * WHAT NEVER HAPPENS HERE
 * No card details, no secret key, no server call and no order claim: the static
 * front end only ever hands the browser to the provider's own page (so this
 * value is a public Payment Link, never a credential — nothing here is secret),
 * and the seam can still only return `redirect` / `handoff` / `invalid`.
 * The connected link charges a FIXED £1.00 test amount, which the demo note
 * (`DEMO_CHECKOUT_AMOUNT_NOTE`) states on the page — see checkout.tsx.
 */
import {
  CHECKOUT_URL_ENV_KEY,
  createRedirectProvider,
  DEMO_CHECKOUT_AMOUNT_NOTE,
  registerCheckoutProvider,
} from "~/lib/checkout";
import type { CheckoutProvider } from "~/lib/checkout";
import { envString, readClientEnv } from "~/lib/reglookup-env";
import type { ClientEnv } from "~/lib/reglookup-env";

/** Registered provider id for the Stripe hosted-checkout (Payment Link) path. */
export const STRIPE_PROVIDER_ID = "stripe-hosted-demo";
/** Provider label shown to the customer on /checkout. */
export const STRIPE_PROVIDER_LABEL = "Stripe secure card payment";
/** The seam's config slot that activates this provider. */
export const STRIPE_PROVIDER_ENV_KEY = CHECKOUT_URL_ENV_KEY;

/**
 * The Stripe hosted-checkout provider for a configured URL, or `null` when the
 * build carries no checkout URL (in which case checkout must stay on the honest
 * email handoff). Pure — it registers nothing.
 */
export function stripeCheckoutProvider(
  env: ClientEnv = readClientEnv(),
): CheckoutProvider | null {
  const checkoutUrl = envString(env, STRIPE_PROVIDER_ENV_KEY);
  if (!checkoutUrl) return null;
  return createRedirectProvider({
    id: STRIPE_PROVIDER_ID,
    label: STRIPE_PROVIDER_LABEL,
    checkoutUrl,
    amountNote: DEMO_CHECKOUT_AMOUNT_NOTE,
  });
}

/**
 * Register the hosted-checkout provider when the build environment configures
 * one. Returns true when a provider was registered (i.e. the site can take a
 * payment through the connected link), false when nothing is configured and the
 * honest email handoff stays in force.
 */
export function registerStripeCheckoutProvider(
  env: ClientEnv = readClientEnv(),
): boolean {
  const provider = stripeCheckoutProvider(env);
  if (!provider) return false;
  registerCheckoutProvider(provider);
  return true;
}
