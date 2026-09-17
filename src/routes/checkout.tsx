import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useBasket } from "~/components/BasketProvider";
import { OrderSummaryLines, OrderTotals } from "~/components/OrderSummary";
import {
  canTakeOnlinePayment,
  CHECKOUT_EMAIL,
  customerText,
  EMPTY_CUSTOMER,
  getCheckoutProvider,
  orderFromBasket,
  orderSummaryText,
  startCheckout,
} from "~/lib/checkout";
import type {
  CheckoutCustomer,
  CheckoutOutcome,
  CheckoutValidationErrors,
} from "~/lib/checkout";
import { registerStripeCheckoutProvider } from "~/lib/checkout-stripe";
import type { BasketLine } from "~/lib/basket";
import { formatGBP } from "~/lib/pricing";

/**
 * Register the live hosted-checkout provider (Stripe Payment Link) when the
 * build environment configures one (`VITE_CHECKOUT_URL` — see
 * src/lib/checkout-stripe.ts). With no such value this is a no-op and checkout
 * stays on the seam's honest email handoff. Registration is build-config driven:
 * the provider's label and its honest demo-payment note come from that config,
 * never from this page.
 */
registerStripeCheckoutProvider();

/**
 * /checkout — order summary + UK delivery details, behind the payment seam
 * (src/lib/checkout.ts).
 *
 * NO CARD FIELDS EXIST ON THIS PAGE, and it can never end on a "thank you" style
 * screen or a payment reference: the only outcomes the seam can return are
 * "redirect" (to the payment provider's own hosted page, when a checkout URL is
 * configured), "invalid" (basket or details need fixing) and "handoff" (the
 * honest default — the order is prepared as an email to our team because the
 * site has no payment configuration).
 *
 * When the site CAN take a payment, the notice below states plainly what is
 * really happening: the catalogue is sample data, the connected link charges a
 * fixed test amount rather than the basket total, and any confirmation comes
 * from the payment provider's own page.
 */
export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout | N2 Wheels" },
      {
        name: "description",
        content: canTakeOnlinePayment()
          ? "Review your N2 Wheels order and enter UK delivery details, then pay on our payment provider's own secure page. All catalogue data is sample data."
          : "Review your N2 Wheels order and enter UK delivery details. Online card payment is not yet switched on — orders are confirmed with our team by email.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { lines, hydrated } = useBasket();
  const [customer, setCustomer] = useState<CheckoutCustomer>(EMPTY_CUSTOMER);
  const [errors, setErrors] = useState<CheckoutValidationErrors>({});
  const [outcome, setOutcome] = useState<CheckoutOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Resolved from the build env: with a checkout URL configured this is the
  // registered hosted-checkout provider; with nothing configured it is the
  // honest email-handoff provider (see src/lib/checkout.ts).
  const provider = getCheckoutProvider();
  const order = useMemo(() => orderFromBasket(lines), [lines]);

  const setField = (field: keyof CheckoutCustomer) => (value: string) => {
    setCustomer((c) => ({ ...c, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await startCheckout({ order, customer });
      setOutcome(result);
      if (result.status === "invalid") {
        setErrors(result.errors);
        return;
      }
      setErrors({});
      if (typeof window === "undefined") return;
      if (result.status === "redirect") {
        // The redirect outcome is shown to the customer (see PaymentNotice):
        // this page deliberately does NOT yank the browser to the payment
        // provider on submit, so the honest note from the provider config — the
        // catalogue is sample data and the connected page charges a fixed demo
        // amount, not the basket total — is read here, and the customer makes
        // the final click themselves.
        return;
      }
      // Handoff: open the customer's mail client with the prepared enquiry.
      window.location.href = result.mailtoHref;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-10 sm:py-14">
        <span className="sample-chip">Sample data</span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Checkout
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-steel">
          {provider.canTakePayment
            ? "Enter your UK delivery details, then complete the payment on our payment provider's own secure page. We confirm availability, the exact fitment for your vehicle and delivery with you directly. All catalogue items are sample data — no live stock is claimed."
            : "Enter your UK delivery details and we will confirm availability, the exact fitment for your vehicle, delivery and payment with you. All catalogue items are sample data — no live stock is claimed."}
        </p>

        <PaymentNotice
          canTakePayment={provider.canTakePayment}
          label={provider.label}
          amountNote={provider.amountNote}
          outcome={outcome}
        />

        {!hydrated ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-carbon p-6 text-sm text-steel">
            Checking your basket…
          </div>
        ) : lines.length === 0 ? (
          <EmptyBasketGuard />
        ) : (
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_360px]">
            <form
              onSubmit={submit}
              noValidate
              className="rounded-xl border border-white/10 bg-carbon"
            >
              <h2 className="border-b border-line bg-coal/60 px-5 py-3.5 text-sm font-bold uppercase tracking-wider text-white">
                UK delivery &amp; contact details
              </h2>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field
                  id="checkout-name"
                  label="Full name"
                  value={customer.name}
                  onChange={setField("name")}
                  error={errors.name}
                  autoComplete="name"
                  className="sm:col-span-2"
                />
                <Field
                  id="checkout-email"
                  label="Email"
                  type="email"
                  value={customer.email}
                  onChange={setField("email")}
                  error={errors.email}
                  autoComplete="email"
                  hint="We reply to this address to confirm your order."
                />
                <Field
                  id="checkout-phone"
                  label="Phone"
                  type="tel"
                  value={customer.phone}
                  onChange={setField("phone")}
                  error={errors.phone}
                  autoComplete="tel"
                  hint="UK number, e.g. 07700 900123."
                />
                <Field
                  id="checkout-address1"
                  label="Address line 1"
                  value={customer.addressLine1}
                  onChange={setField("addressLine1")}
                  error={errors.addressLine1}
                  autoComplete="address-line1"
                  className="sm:col-span-2"
                />
                <Field
                  id="checkout-address2"
                  label="Address line 2 (optional)"
                  value={customer.addressLine2}
                  onChange={setField("addressLine2")}
                  autoComplete="address-line2"
                  className="sm:col-span-2"
                />
                <Field
                  id="checkout-city"
                  label="Town / city"
                  value={customer.city}
                  onChange={setField("city")}
                  error={errors.city}
                  autoComplete="address-level2"
                />
                <Field
                  id="checkout-postcode"
                  label="Postcode"
                  value={customer.postcode}
                  onChange={setField("postcode")}
                  error={errors.postcode}
                  autoComplete="postal-code"
                  uppercase
                />
                <div className="sm:col-span-2">
                  <p className="text-xs leading-relaxed text-steel-dim">
                    We use these details only to confirm and deliver your order.
                    No payment details are collected on this website.
                  </p>
                  <button
                    type="submit"
                    className="btn btn-red mt-4 w-full sm:w-auto"
                    disabled={submitting}
                  >
                    {submitting
                      ? "Please wait…"
                      : provider.canTakePayment
                        ? "Continue to secure payment"
                        : "Prepare order email"}
                  </button>
                  {!provider.canTakePayment && (
                    <p className="mt-2 text-xs leading-relaxed text-steel">
                      Nothing is sent automatically: this opens your email app
                      with your order and delivery details ready to send to{" "}
                      {CHECKOUT_EMAIL}.
                    </p>
                  )}
                  {errors.basket && (
                    <p
                      role="alert"
                      className="mt-2 text-xs font-semibold text-race-bright"
                    >
                      {errors.basket}
                    </p>
                  )}
                </div>
              </div>
            </form>

            <div className="lg:sticky lg:top-[128px]">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-carbon">
                <h2 className="border-b border-line bg-coal/60 px-5 py-3.5 text-sm font-bold uppercase tracking-wider text-white">
                  Your order
                </h2>
                <div className="px-5 py-2">
                  <OrderSummaryLines lines={lines} />
                </div>
              </div>
              <OrderTotals lines={lines} className="mt-4" />
              {!provider.canTakePayment && (
                <EmailPreview lines={lines} customer={customer} />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Always-visible, honest statement of what can and cannot happen here. */
function PaymentNotice({
  canTakePayment,
  label,
  amountNote,
  outcome,
}: {
  canTakePayment: boolean;
  label: string;
  /** Honest note from the active provider's config (see checkout.ts). */
  amountNote?: string;
  outcome: CheckoutOutcome | null;
}) {
  return (
    <div className="mt-8 rounded-xl border border-race/30 bg-race/5 p-5">
      <p className="text-sm font-bold text-white">Payment provider: {label}</p>
      {canTakePayment ? (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-steel">
            Continuing will take you to our payment provider&apos;s own secure
            checkout page to pay. No card details are entered on this website.
          </p>
          {amountNote ? (
            <p
              data-demo-payment-note="true"
              className="mt-3 rounded-lg border border-white/10 bg-night/70 p-3.5 text-sm leading-relaxed text-white"
            >
              {amountNote}
            </p>
          ) : null}
          <p className="mt-3 text-sm leading-relaxed text-steel">
            Questions about fitment, delivery or an order? Email our team at{" "}
            <a
              className="font-semibold text-white underline underline-offset-2"
              href={`mailto:${CHECKOUT_EMAIL}`}
            >
              {CHECKOUT_EMAIL}
            </a>{" "}
            — we confirm availability and fitment before anything is despatched.
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-sm leading-relaxed text-steel">
          This site is not able to take online card payments yet, so no payment
          can be made here and no order is placed by this page. Placing your
          order prepares an email to our team at{" "}
          <a
            className="font-semibold text-white underline underline-offset-2"
            href={`mailto:${CHECKOUT_EMAIL}`}
          >
            {CHECKOUT_EMAIL}
          </a>{" "}
          with your basket and delivery details — we then confirm availability,
          fitment, final delivery and payment with you directly.
        </p>
      )}
      {outcome?.status === "handoff" && (
        <p role="status" className="mt-3 text-sm leading-relaxed text-white">
          Your order email is ready in your email app and has not been sent yet.
          If your email app did not open, send the summary below to{" "}
          <a
            className="font-semibold underline underline-offset-2"
            href={outcome.mailtoHref}
          >
            {CHECKOUT_EMAIL}
          </a>
          . Nothing has been paid and no order has been placed automatically.
        </p>
      )}
      {outcome?.status === "redirect" && (
        <p role="status" className="mt-3 text-sm leading-relaxed text-white">
          Your details are ready. Nothing has been paid or ordered yet — this
          page has not placed an order, and any confirmation comes from the
          payment provider. Continue on our payment provider&apos;s own secure
          page:{" "}
          <a
            className="font-semibold underline underline-offset-2"
            href={outcome.url}
          >
            continue to payment
          </a>
          .
        </p>
      )}
    </div>
  );
}

/** Shows exactly what the order email will contain — nothing hidden. */
function EmailPreview({
  lines,
  customer,
}: {
  lines: BasketLine[];
  customer: CheckoutCustomer;
}) {
  const order = orderFromBasket(lines);
  const text = `${orderSummaryText(order)}\n\nDelivery details:\n${customerText(customer)}`;
  return (
    <details className="mt-4 rounded-xl border border-white/10 bg-carbon">
      <summary className="cursor-pointer px-5 py-3.5 text-sm font-bold uppercase tracking-wider text-white">
        Order summary we send
      </summary>
      <div className="border-t border-line px-5 py-4">
        <p className="text-xs leading-relaxed text-steel">
          This is the order summary and delivery detail our team receives (
          {formatGBP(order.totalIncVat)} including delivery). Nothing is sent
          until you send the email.
        </p>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-steel">
          {text}
        </pre>
      </div>
    </details>
  );
}

function EmptyBasketGuard() {
  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-carbon p-8 text-center sm:p-12">
      <h2 className="text-xl font-bold text-white sm:text-2xl">
        Your basket is empty
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-steel">
        There is nothing to check out yet — add a wheel, tyre, package or
        accessory and come back.
      </p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Link to="/wheels" className="btn btn-red">
          Browse Alloy Wheels
        </Link>
        <Link to="/basket" className="btn btn-outline">
          View basket
        </Link>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
  hint,
  className = "",
  uppercase = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  className?: string;
  uppercase?: boolean;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) =>
          onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)
        }
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`field-input ${error ? "border-race" : ""}`}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-xs font-semibold text-race-bright"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-steel-dim">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
