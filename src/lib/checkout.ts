/**
 * N2 Wheels — CHECKOUT / PAYMENT PROVIDER SEAM.
 *
 * THIS FILE IS THE SINGLE SEAM between the checkout UI and whoever actually
 * takes the money. Everything the /checkout page does goes through
 * `getCheckoutProvider().startCheckout({ order, customer })`.
 *
 * ── THE HONEST DEFAULT (what ships today) ────────────────────────────────────
 * The business has a real payment account on the platform, but the SITE has no
 * payment credentials and production is a static export with no server
 * functions, so this site CANNOT take an online card payment. With no checkout
 * configuration present, `getCheckoutProvider()` returns `enquiryProvider`,
 * whose only outcome is a "handoff": the order is prepared as an email to
 * enquiry@n2wheels.co.uk (basket summary + delivery details + totals) and the
 * page says plainly that no online card payment is being taken. It NEVER
 * returns a success screen, an order number or a payment confirmation —
 * nothing has been paid, so nothing may claim it was.
 *
 * ── WIRING A REAL PAYMENT PROVIDER LATER (no UX rebuild needed) ──────────────
 * The seam outcome vocabulary is fixed (`redirect` | `handoff` | `invalid`), so
 * a real provider slots in behind the same call:
 *
 *   1. Register a provider that implements `CheckoutProvider` — e.g. a hosted
 *      Stripe Checkout / Payment Link redirect:
 *
 *          registerCheckoutProvider(
 *            createRedirectProvider({
 *              id: "stripe-checkout",
 *              label: "Secure card payment (Stripe Checkout)",
 *              checkoutUrl: "https://checkout.stripe.com/c/pay/…",  // from config
 *            }),
 *          );
 *
 *      (a hosted-redirect URL is the shape that fits this site best: the static
 *      front end only ever hands the browser to the provider's own page, so no
 *      card data and no secret ever touches this codebase.)
 *
 *   2. Give it the configuration it needs. The seam reads it from the build
 *      environment under `CHECKOUT_URL_ENV_KEY` (see below) — the ONE config
 *      slot this module defines. That value does not exist yet and no
 *      credential is invented here: until the platform supplies a real hosted
 *      checkout URL, the seam stays in its honest enquiry handoff.
 *
 *   3. Building with that value set switches /checkout to the provider
 *      automatically — the page simply follows the `redirect` outcome. Without
 *      it, nothing changes and no customer is misled.
 *
 * Server-side order creation, stock checks and payment confirmation stay
 * outside this seam's scope: when they exist they wrap it, and only a provider
 * that has actually confirmed a payment may ever report success.
 */
import type { BasketLine } from "~/lib/basket";
import { basketSummaryLines, basketTotals, lineTotal } from "~/lib/basket";
import { formatGBP } from "~/lib/pricing";
import { CONTACT_EMAIL } from "~/lib/nav";
import { envString, readClientEnv } from "~/lib/reglookup-env";
import type { ClientEnv } from "~/lib/reglookup-env";

/**
 * The seam's configuration slot: a hosted-checkout redirect URL (e.g. a Stripe
 * Checkout URL / Payment Link). Read from the build environment at build time.
 * NOT a secret and NOT set today — see the module docblock. Never put a secret
 * key in a client env var; a hosted redirect URL is the only thing read here.
 */
export const CHECKOUT_URL_ENV_KEY = "VITE_CHECKOUT_URL";

/** Id of the always-available honest default provider. */
export const ENQUIRY_PROVIDER_ID = "enquiry";

/** The order as the basket sees it (money in GBP, inc. VAT). */
export interface CheckoutOrder {
  lines: BasketLine[];
  itemCount: number;
  subtotalIncVat: number;
  shipping: number;
  vatIncluded: number;
  totalIncVat: number;
}

/** Customer-entered UK delivery/contact details (no payment fields, ever). */
export interface CheckoutCustomer {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
}

export const EMPTY_CUSTOMER: CheckoutCustomer = {
  name: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
};

/** Validation messages per field; an empty object means the form is valid. */
export interface CheckoutValidationErrors {
  basket?: string;
  name?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  postcode?: string;
}

export interface CheckoutRequest {
  order: CheckoutOrder;
  customer: CheckoutCustomer;
}

/** What a provider returns. Only these three outcomes exist — nothing "successful". */
export type CheckoutOutcome =
  | {
      /** Hand the browser to a real payment/hosted-checkout page. */
      status: "redirect";
      providerId: string;
      label: string;
      url: string;
      notice: string;
    }
  | {
      /** No online payment exists: the order is handed to the business by email. */
      status: "handoff";
      providerId: string;
      label: string;
      notice: string;
      /** Pre-filled mailto: link carrying the basket summary + delivery details. */
      mailtoHref: string;
    }
  | {
      /** Nothing was attempted: the basket or the customer details are invalid. */
      status: "invalid";
      providerId: string;
      label: string;
      errors: CheckoutValidationErrors;
    };

/** THE ADAPTER CONTRACT a real payment provider implements. */
export interface CheckoutProvider {
  id: string;
  label: string;
  /** True ONLY for a provider that can actually take a payment. */
  canTakePayment: boolean;
  /** Build-env key that activates this provider (undefined for the default). */
  keyName?: string;
  startCheckout(request: CheckoutRequest): Promise<CheckoutOutcome>;
}

/** Order snapshot used by checkout = the basket plus its settings-driven totals. */
export function orderFromBasket(lines: BasketLine[]): CheckoutOrder {
  const totals = basketTotals(lines);
  return {
    lines,
    itemCount: totals.itemCount,
    subtotalIncVat: totals.subtotalIncVat,
    shipping: totals.shipping,
    vatIncluded: totals.vatIncluded,
    totalIncVat: totals.totalIncVat,
  };
}

/** Reasonably strict, deliberately simple patterns (UK-focused). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
export const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i;
export const UK_PHONE_RE = /^(?:\+44|0)[0-9]{9,10}$/;
export const CHECKOUT_EMAIL = CONTACT_EMAIL;

/** Normalise a UK phone number for validation (strip spaces, dashes, brackets). */
export function normalisePhone(phone: string): string {
  return phone.replace(/[\s()\-.]/g, "");
}

/**
 * Validate an order + customer. Pure and side-effect free: returns a map of
 * field -> message (empty object = valid). An empty basket is ALWAYS invalid —
 * checkout must never proceed without lines.
 */
export function validateCheckout(
  order: CheckoutOrder,
  customer: CheckoutCustomer,
): CheckoutValidationErrors {
  const errors: CheckoutValidationErrors = {};
  if (!order.lines || order.lines.length === 0 || order.itemCount <= 0) {
    errors.basket =
      "Your basket is empty — add a wheel, tyre, package or accessory first.";
  }
  if (customer.name.trim().length < 2) {
    errors.name = "Enter your full name.";
  }
  if (!EMAIL_RE.test(customer.email.trim())) {
    errors.email = "Enter a valid email address — we reply to this address.";
  }
  if (!UK_PHONE_RE.test(normalisePhone(customer.phone))) {
    errors.phone = "Enter a UK phone number, e.g. 07700 900123.";
  }
  if (customer.addressLine1.trim().length < 4) {
    errors.addressLine1 = "Enter your delivery address.";
  }
  if (customer.city.trim().length < 2) {
    errors.city = "Enter your town or city.";
  }
  if (!UK_POSTCODE_RE.test(customer.postcode.trim())) {
    errors.postcode = "Enter a valid UK postcode, e.g. AB12 3CD.";
  }
  return errors;
}

/** True when validateCheckout found nothing wrong. */
export function isCheckoutValid(
  order: CheckoutOrder,
  customer: CheckoutCustomer,
): boolean {
  return Object.keys(validateCheckout(order, customer)).length === 0;
}

/* ── The order-enquiry email (the honest default's "handoff") ─────────────── */

/**
 * Plain-text summary of the order: lines, line totals, delivery and total.
 * Used for the email body and shown to the customer before they send it.
 */
export function orderSummaryText(order: CheckoutOrder): string {
  const rows = basketSummaryLines(order.lines);
  const lines = [
    ...rows,
    "",
    `Goods (inc. VAT): ${formatGBP(order.subtotalIncVat)}`,
    `Delivery: ${formatGBP(order.shipping)}`,
    `VAT included in goods: ${formatGBP(order.vatIncluded)}`,
    `Total: ${formatGBP(order.totalIncVat)}`,
  ];
  return lines.join("\n");
}

/** Delivery details block for the email body. */
export function customerText(customer: CheckoutCustomer): string {
  return [
    `Name: ${customer.name.trim()}`,
    `Email: ${customer.email.trim()}`,
    `Phone: ${customer.phone.trim()}`,
    `Address: ${customer.addressLine1.trim()}${customer.addressLine2.trim() ? `, ${customer.addressLine2.trim()}` : ""}`,
    `Town/City: ${customer.city.trim()}`,
    `Postcode: ${customer.postcode.trim().toUpperCase()}`,
  ].join("\n");
}

/**
 * Pre-filled mailto: enquiry email carrying the basket + delivery details.
 * Nothing is sent automatically — the customer's own mail client sends it.
 */
export function buildOrderEnquiryMailto(
  order: CheckoutOrder,
  customer: CheckoutCustomer,
  email: string = CHECKOUT_EMAIL,
): string {
  const subject = `Wheel & tyre order enquiry — ${order.itemCount} item${order.itemCount === 1 ? "" : "s"} (${formatGBP(order.totalIncVat)} inc. delivery)`;
  const body = [
    "I would like to order the following from N2 Wheels:",
    "",
    orderSummaryText(order),
    "",
    "Delivery details:",
    customerText(customer),
    "",
    "Please confirm availability, final delivery cost and how to pay.",
  ].join("\n");
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The notice shown with EVERY handoff — states plainly that nothing is paid. */
export const ENQUIRY_NOTICE =
  "No payment is taken on this website. Online card payment is not switched on yet, so we cannot process an order here — your basket is prepared as an email to our team instead, and we confirm availability, delivery and payment with you directly.";

/* ── Providers ────────────────────────────────────────────────────────────── */

const ENQUIRY_LABEL = "Order by email (no online payments yet)";

/** The honest default: no payment, order handed to the business by email. */
export const enquiryProvider: CheckoutProvider = {
  id: ENQUIRY_PROVIDER_ID,
  label: ENQUIRY_LABEL,
  canTakePayment: false,
  async startCheckout({
    order,
    customer,
  }: CheckoutRequest): Promise<CheckoutOutcome> {
    const errors = validateCheckout(order, customer);
    if (Object.keys(errors).length > 0) {
      return {
        status: "invalid",
        providerId: ENQUIRY_PROVIDER_ID,
        label: ENQUIRY_LABEL,
        errors,
      };
    }
    return {
      status: "handoff",
      providerId: ENQUIRY_PROVIDER_ID,
      label: ENQUIRY_LABEL,
      notice: ENQUIRY_NOTICE,
      mailtoHref: buildOrderEnquiryMailto(order, customer),
    };
  },
};

export interface RedirectProviderConfig {
  id: string;
  label: string;
  /** Hosted checkout URL to hand the browser to. */
  checkoutUrl: string;
  /** Env key that activates this provider (defaults to CHECKOUT_URL_ENV_KEY). */
  keyName?: string;
}

/**
 * A provider that hands the browser to a hosted checkout page (the real-payment
 * path documented at the top of this file). If its URL is missing/blank it
 * degrades to the honest enquiry handoff rather than pretending to take money.
 */
export function createRedirectProvider(
  config: RedirectProviderConfig,
): CheckoutProvider {
  const checkoutUrl = config.checkoutUrl?.trim() ?? "";
  if (checkoutUrl === "") return enquiryProvider;
  return {
    id: config.id,
    label: config.label,
    canTakePayment: true,
    keyName: config.keyName ?? CHECKOUT_URL_ENV_KEY,
    async startCheckout({
      order,
      customer,
    }: CheckoutRequest): Promise<CheckoutOutcome> {
      const errors = validateCheckout(order, customer);
      if (Object.keys(errors).length > 0) {
        return {
          status: "invalid",
          providerId: config.id,
          label: config.label,
          errors,
        };
      }
      return {
        status: "redirect",
        providerId: config.id,
        label: config.label,
        url: checkoutUrl,
        notice:
          "You will be taken to our payment provider's secure checkout page to complete the payment.",
      };
    },
  };
}

/**
 * Registered providers + the default provider id.
 * ═══ SEAM: register real payment providers here ═══
 * e.g. registerCheckoutProvider(createRedirectProvider({ id: "stripe-checkout",
 *      label: "Secure card payment", checkoutUrl: "…" })); then give it
 *      CHECKOUT_URL_ENV_KEY (VITE_CHECKOUT_URL) at build time.
 */
const providers = new Map<string, CheckoutProvider>();
const DEFAULT_PROVIDER_ID = ENQUIRY_PROVIDER_ID;

/** Register a payment provider so config can activate it. */
export function registerCheckoutProvider(provider: CheckoutProvider): void {
  providers.set(provider.id, provider);
}
providers.set(enquiryProvider.id, enquiryProvider);

/** Registered provider ids (tooling/tests). */
export function registeredCheckoutProviderIds(): string[] {
  return [...providers.keys()];
}

/**
 * Pick the active provider:
 *  1. a REGISTERED provider whose key is configured (real payment path), else
 *  2. `enquiryProvider` — the honest email handoff.
 *
 * Reads the build env (Vite `import.meta.env`). No configuration today means
 * the default, and the default takes no money and claims no order.
 */
export function getCheckoutProvider(
  env: ClientEnv = readClientEnv(),
): CheckoutProvider {
  const checkoutUrl = envString(env, CHECKOUT_URL_ENV_KEY);
  if (checkoutUrl) {
    // A configured URL always means the hosted-checkout provider, whether the
    // caller registered one explicitly or we build the standard redirect one.
    for (const provider of providers.values()) {
      if (
        provider.keyName === CHECKOUT_URL_ENV_KEY &&
        provider.id !== DEFAULT_PROVIDER_ID
      ) {
        return provider;
      }
    }
    return createRedirectProvider({
      id: "hosted-checkout",
      label: "Secure card payment (hosted checkout)",
      checkoutUrl,
    });
  }
  for (const provider of providers.values()) {
    if (provider.id === DEFAULT_PROVIDER_ID || !provider.keyName) continue;
    if (envString(env, provider.keyName)) return provider;
  }
  return providers.get(DEFAULT_PROVIDER_ID) ?? enquiryProvider;
}

/** True when a real payment provider is active (vs the honest email handoff). */
export function canTakeOnlinePayment(
  env: ClientEnv = readClientEnv(),
): boolean {
  return getCheckoutProvider(env).canTakePayment;
}

/** Run the active provider for an order + customer (the one call the UI makes). */
export async function startCheckout(
  request: CheckoutRequest,
): Promise<CheckoutOutcome> {
  return getCheckoutProvider().startCheckout(request);
}

/** Total for display purposes: units in the order. */
export function orderUnitCount(order: CheckoutOrder): number {
  return order.lines.reduce((n, l) => n + l.quantity, 0);
}

/** Money total of one line (re-exported so pages import one module). */
export { lineTotal };
