#!/usr/bin/env bun
/**
 * scripts/test-checkout.ts — checkout + payment-seam tests (src/lib/checkout.ts).
 *
 * The point of these tests is the HONESTY CONTRACT: with nothing configured the
 * site must not claim a payment or an order, must hand the customer to a real
 * email enquiry instead, and must refuse an empty basket. A configured provider
 * must produce a redirect (never a fake success), and the invalid path must win
 * over the redirect whenever the order or details are wrong.
 *
 * Run:  bun run test:checkout     (or: bun ./scripts/test-checkout.ts)
 */
import { readFileSync } from "node:fs";
import {
  buildOrderEnquiryMailto,
  canTakeOnlinePayment,
  CHECKOUT_URL_ENV_KEY,
  createRedirectProvider,
  DEMO_CHECKOUT_AMOUNT_NOTE,
  enquiryProvider,
  ENQUIRY_NOTICE,
  ENQUIRY_PROVIDER_ID,
  getCheckoutProvider,
  orderFromBasket,
  orderSummaryText,
  orderUnitCount,
  registerCheckoutProvider,
  registeredCheckoutProviderIds,
  startCheckout,
  UK_POSTCODE_RE,
  validateCheckout,
} from "../src/lib/checkout";
import type { CheckoutCustomer, CheckoutOutcome } from "../src/lib/checkout";
import { addToBasket } from "../src/lib/basket";
import type { BasketLine } from "../src/lib/basket";
import {
  registerStripeCheckoutProvider,
  STRIPE_PROVIDER_ENV_KEY,
  STRIPE_PROVIDER_ID,
  STRIPE_PROVIDER_LABEL,
  stripeCheckoutProvider,
} from "../src/lib/checkout-stripe";
import { demoAccessories, demoTypes, demoWheels } from "../src/data/products";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const wheel = demoWheels[0];
const tyre = demoTypes[0];
const accessory = demoAccessories[0];
const lines: BasketLine[] = addToBasket(
  addToBasket(addToBasket([], wheel, 4), tyre, 1),
  accessory,
  1,
);
const order = orderFromBasket(lines);
const customer: CheckoutCustomer = {
  name: "Alex Driver",
  email: "alex@example.co.uk",
  phone: "07700 900123",
  addressLine1: "12 Kerbside Road",
  addressLine2: "",
  city: "Leeds",
  postcode: "LS1 4AB",
};
const blankCustomer: CheckoutCustomer = {
  name: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
};

console.log("checkout — default (nothing configured)");
const unconfigured = getCheckoutProvider({});
check(
  "with no configuration the seam uses the honest email-handoff provider",
  unconfigured.id === ENQUIRY_PROVIDER_ID,
);
check(
  "the default provider cannot take a payment",
  unconfigured.canTakePayment === false && canTakeOnlinePayment({}) === false,
);
check(
  "the default provider has no keyName (nothing to activate)",
  unconfigured.keyName === undefined,
);
check(
  "the default label says plainly that online payments are not available",
  /no online payments/i.test(unconfigured.label),
  unconfigured.label,
);

console.log("checkout — the handoff outcome");
const handoff = await enquiryProvider.startCheckout({ order, customer });
check(
  "a valid order with no provider configured hands off (never a success)",
  handoff.status === "handoff",
  handoff.status,
);
if (handoff.status === "handoff") {
  check(
    "the notice states no payment is taken on this website",
    handoff.notice === ENQUIRY_NOTICE &&
      /no payment is taken/i.test(handoff.notice),
  );
  check(
    "the notice explains payments are not switched on yet",
    /not switched on yet/i.test(handoff.notice),
  );
  check(
    "the handoff points at the business enquiry address",
    handoff.mailtoHref.startsWith("mailto:enquiry@n2wheels.co.uk?"),
    handoff.mailtoHref.slice(0, 40),
  );
  const body = decodeURIComponent(handoff.mailtoHref.split("&body=")[1] ?? "");
  check(
    "the prepared email lists every basket line",
    [wheel.name, tyre.name, accessory.name].every((n) => body.includes(n)),
  );
  check(
    "the prepared email carries the order total",
    body.includes(`£${order.totalIncVat.toFixed(2)}`),
  );
  check(
    "the prepared email carries the customer's delivery details",
    body.includes("12 Kerbside Road") && body.includes("LS1 4AB"),
  );
  check(
    "the mailto link is fully encoded (no raw newlines or spaces)",
    !/[\s]/.test(handoff.mailtoHref),
  );
} else {
  check("handoff outcome available", false, "no handoff outcome");
}

console.log("checkout — nothing can claim a payment or an order");
const outcomes: CheckoutOutcome[] = [
  handoff,
  await enquiryProvider.startCheckout({ order, customer: blankCustomer }),
  await createRedirectProvider({
    id: "x",
    label: "x",
    checkoutUrl: "https://pay.example.test/s/1",
  }).startCheckout({
    order,
    customer,
  }),
];
check(
  "the seam only ever returns redirect / handoff / invalid",
  outcomes.every((o) => ["redirect", "handoff", "invalid"].includes(o.status)),
  outcomes.map((o) => o.status).join(","),
);
check(
  "no outcome carries an order number, payment reference or 'success' field",
  !/order\s*(number|ref)#|ORD-|paymentReference|"success"|paid/i.test(
    JSON.stringify(outcomes),
  ),
);
check(
  "the default provider declares canTakePayment = false",
  enquiryProvider.canTakePayment === false,
);
check(
  "a redirect outcome exists only when a hosted checkout URL is configured",
  outcomes.filter((o) => o.status === "redirect").length === 1,
);

console.log("checkout — empty basket guard");
const emptyOrder = orderFromBasket([]);
const emptyOutcome = await enquiryProvider.startCheckout({
  order: emptyOrder,
  customer,
});
check(
  "an empty basket cannot check out",
  emptyOutcome.status === "invalid",
  emptyOutcome.status,
);
if (emptyOutcome.status === "invalid") {
  check(
    "the empty basket gets a clear message",
    /basket is empty/i.test(emptyOutcome.errors.basket ?? ""),
    emptyOutcome.errors.basket,
  );
}
check(
  "an empty basket blocks even a fully valid customer",
  Object.keys(validateCheckout(emptyOrder, customer)).length === 1 &&
    Boolean(validateCheckout(emptyOrder, customer).basket),
);
const redirectWithEmptyBasket = await createRedirectProvider({
  id: "hosted",
  label: "Hosted",
  checkoutUrl: "https://pay.example.test/s/1",
}).startCheckout({ order: emptyOrder, customer });
check(
  "a configured provider refuses an empty basket too (no redirect, no payment page)",
  redirectWithEmptyBasket.status === "invalid" &&
    !("url" in redirectWithEmptyBasket),
);
check(
  "an empty order has no units and no total",
  orderUnitCount(emptyOrder) === 0 && emptyOrder.totalIncVat === 0,
);

console.log("checkout — delivery & contact validation");
check(
  "a complete UK order and customer validates cleanly",
  Object.keys(validateCheckout(order, customer)).length === 0,
);
const badEmail = validateCheckout(order, {
  ...customer,
  email: "alex@example",
});
check(
  "an invalid email is rejected",
  Boolean(badEmail.email),
  JSON.stringify(badEmail),
);
check(
  "a blank email is rejected",
  Boolean(validateCheckout(order, { ...customer, email: "" }).email),
);
const badPostcode = validateCheckout(order, { ...customer, postcode: "1234" });
check(
  "a non-UK postcode is rejected",
  Boolean(badPostcode.postcode),
  JSON.stringify(badPostcode),
);
check(
  "a valid UK postcode is accepted",
  UK_POSTCODE_RE.test("LS1 4AB") && UK_POSTCODE_RE.test("sw1a1aa"),
);
const badPhone = validateCheckout(order, { ...customer, phone: "12345" });
check(
  "an invalid phone number is rejected",
  Boolean(badPhone.phone),
  JSON.stringify(badPhone),
);
check(
  "the phone field tolerates spaces, dashes and +44",
  Object.keys(validateCheckout(order, { ...customer, phone: "07700 900 123" }))
    .length === 0,
);
check(
  "a missing name/address/city is reported field by field",
  ["name", "addressLine1", "city"].every((f) =>
    Boolean(validateCheckout(order, { ...customer, [f]: "" })[f as "name"]),
  ),
);
check(
  "all six required customer fields are checked at once for a blank form",
  Object.keys(validateCheckout(order, blankCustomer)).sort().join(",") ===
    "addressLine1,city,email,name,phone,postcode",
  Object.keys(validateCheckout(order, blankCustomer)).join(","),
);
const nothingExpectedOfOptionalLine2 = validateCheckout(order, {
  ...customer,
  addressLine2: "",
});
check(
  "address line 2 is optional",
  Object.keys(nothingExpectedOfOptionalLine2).length === 0,
);

console.log("checkout — configured provider (the future real-payment path)");
const redirectUrl = "https://pay.example.test/session/abc123";
const redirectProvider = createRedirectProvider({
  id: "test-checkout",
  label: "Secure card payment",
  checkoutUrl: redirectUrl,
});
check(
  "a configured provider can take a payment",
  redirectProvider.canTakePayment === true,
);
const redirectOutcome = await redirectProvider.startCheckout({
  order,
  customer,
});
check(
  "a configured provider redirects instead of inventing a success",
  redirectOutcome.status === "redirect",
  redirectOutcome.status,
);
if (redirectOutcome.status === "redirect") {
  check(
    "the redirect target is exactly the configured URL",
    redirectOutcome.url === redirectUrl,
    redirectOutcome.url,
  );
  check(
    "the redirect notice explains the customer leaves the site to pay",
    /secure checkout page/i.test(redirectOutcome.notice),
  );
}
const invalidRedirect = await redirectProvider.startCheckout({
  order,
  customer: { ...customer, postcode: "nope" },
});
check(
  "a configured provider still refuses invalid details (validation runs first)",
  invalidRedirect.status === "invalid" && !("url" in invalidRedirect),
  invalidRedirect.status,
);
check(
  "a provider with a blank URL degrades to the honest handoff",
  createRedirectProvider({ id: "blank", label: "Blank", checkoutUrl: "   " })
    .id === ENQUIRY_PROVIDER_ID,
);

console.log("checkout — activation by configuration");
const configuredEnv = getCheckoutProvider({
  [CHECKOUT_URL_ENV_KEY]: redirectUrl,
});
check(
  "a configured checkout URL activates a payment provider",
  configuredEnv.canTakePayment === true,
  configuredEnv.id,
);
check(
  "the activated provider redirects to the configured URL",
  (await configuredEnv.startCheckout({ order, customer })).status ===
    "redirect",
);
check(
  "a blank configured value is ignored (stays honest)",
  getCheckoutProvider({ [CHECKOUT_URL_ENV_KEY]: "   " }).id ===
    ENQUIRY_PROVIDER_ID,
);
check(
  "the seam reads one documented config key and invents no credentials",
  CHECKOUT_URL_ENV_KEY === "VITE_CHECKOUT_URL",
  CHECKOUT_URL_ENV_KEY,
);
registerCheckoutProvider(
  createRedirectProvider({
    id: "acme-pay",
    label: "Acme Pay",
    checkoutUrl: "https://acme.test/pay",
  }),
);
check(
  "a registered provider joins the seam",
  registeredCheckoutProviderIds().includes("acme-pay"),
);
const registered = getCheckoutProvider({
  [CHECKOUT_URL_ENV_KEY]: "https://acme.test/pay",
});
check(
  "a registered provider is preferred once its key is configured",
  registered.id === "acme-pay",
  registered.id,
);
check(
  "the registered provider redirects too",
  (await registered.startCheckout({ order, customer })).status === "redirect",
);
check(
  "registering a provider does not change the unconfigured default",
  getCheckoutProvider({}).id === ENQUIRY_PROVIDER_ID,
);
const ambientUrl = String(
  (import.meta as { env?: Record<string, string> }).env?.[
    CHECKOUT_URL_ENV_KEY
  ] ?? "",
).trim();
const viaModule = await startCheckout({ order, customer });
check(
  ambientUrl === ""
    ? "startCheckout() with no ambient config hands off (no payment taken)"
    : "startCheckout() with an ambient config redirects to the provider",
  ambientUrl === ""
    ? viaModule.status === "handoff"
    : viaModule.status === "redirect",
  viaModule.status,
);

console.log("checkout — the LIVE hosted-checkout provider (Stripe Payment Link)");
/**
 * The activation path that ships today: `VITE_CHECKOUT_URL` (build config, read
 * from .env when the suite runs through bun) points at the connected Stripe
 * Payment Link, and the checkout route registers that provider on load. The
 * tests below prove the CONFIGURATION activates it and that the basket/amount
 * honesty travels with it — without asserting on any committed URL (the link is
 * config, never source).
 */
const ambientCheckoutUrl =
  String(
    (import.meta as { env?: Record<string, string> }).env?.[
      CHECKOUT_URL_ENV_KEY
    ] ?? "",
  ).trim() || "https://pay.example.test/stripe-link-not-configured";
const liveLink = ambientCheckoutUrl;
check(
  "a registered hosted-checkout provider joins the seam when the env var is set",
  registerStripeCheckoutProvider({ [STRIPE_PROVIDER_ENV_KEY]: liveLink }) ===
    true &&
    registeredCheckoutProviderIds().includes(STRIPE_PROVIDER_ID),
);
check(
  "with VITE_CHECKOUT_URL set, getCheckoutProvider() returns a payment-capable provider",
  getCheckoutProvider({ [CHECKOUT_URL_ENV_KEY]: liveLink }).canTakePayment ===
    true &&
    canTakeOnlinePayment({ [CHECKOUT_URL_ENV_KEY]: liveLink }) === true,
);
const liveProvider = getCheckoutProvider({ [CHECKOUT_URL_ENV_KEY]: liveLink });
check(
  "the active provider is the registered Stripe hosted-checkout provider",
  liveProvider.id === STRIPE_PROVIDER_ID,
  liveProvider.id,
);
check(
  "its label comes from the provider config and names the provider",
  liveProvider.label === STRIPE_PROVIDER_LABEL &&
    /stripe/i.test(liveProvider.label),
  liveProvider.label,
);
check(
  "the active provider carries the honest demo amount note from its config",
  liveProvider.amountNote === DEMO_CHECKOUT_AMOUNT_NOTE &&
    Boolean(liveProvider.amountNote),
);
const note = liveProvider.amountNote ?? "";
check(
  "the note states the basket is sample (demo) data",
  /sample \(demo\) data/i.test(note),
  note.slice(0, 60),
);
check(
  "the note states the connected checkout is a FIXED £1.00 test payment",
  /fixed £1\.00 test payment/i.test(note),
);
check(
  "the note says the £1.00 is NOT the basket total shown",
  /not the basket total/i.test(note),
);
check(
  "the note points at the payment provider's own page for confirmation",
  /payment provider's own secure page/i.test(note),
);
check(
  "the note promises no order number, no receipt and no order from this site",
  /no order number and no receipt/i.test(note) &&
    /does not place or confirm an order/i.test(note),
);
check(
  "the note claims nothing about delivery, guarantees or fitment",
  !/guarantee|free delivery|confirmed order|will be shipped|despatched/i.test(
    note,
  ),
);
const liveOutcome = await liveProvider.startCheckout({ order, customer });
check(
  "startCheckout returns a redirect (never a success screen)",
  liveOutcome.status === "redirect",
  liveOutcome.status,
);
if (liveOutcome.status === "redirect") {
  check(
    "the redirect target is exactly the configured checkout URL",
    liveOutcome.url === liveLink,
    liveOutcome.url,
  );
  check(
    "the redirect notice says the customer leaves this site to pay",
    /provider's secure checkout page/i.test(liveOutcome.notice),
  );
  check(
    "the redirect outcome carries no order/payment reference",
    !/order\s*(number|ref)#|ORD-|paymentReference|"success"/i.test(
      JSON.stringify(liveOutcome),
    ),
  );
  check(
    "the redirect outcome carries the honest demo amount note itself (not only the provider)",
    liveOutcome.amountNote === DEMO_CHECKOUT_AMOUNT_NOTE,
    String(liveOutcome.amountNote ?? "").slice(0, 48),
  );
}
const silentRedirect = await createRedirectProvider({
  id: "no-note",
  label: "No note configured",
  checkoutUrl: "https://pay.example.test/s/9",
}).startCheckout({ order, customer });
check(
  "a provider configured without an amount note invents none",
  silentRedirect.status === "redirect" && !("amountNote" in silentRedirect),
  JSON.stringify(Object.keys(silentRedirect)),
);
const liveInvalid = await liveProvider.startCheckout({
  order,
  customer: { ...customer, postcode: "nope" },
});
check(
  "the live provider still refuses invalid details (no redirect to pay)",
  liveInvalid.status === "invalid" && !("url" in liveInvalid),
  liveInvalid.status,
);
check(
  "an empty basket cannot reach the live payment page either",
  (
    await liveProvider.startCheckout({ order: emptyOrder, customer })
  ).status === "invalid",
);
// The ambient path — exactly what /checkout does on this machine: the module
// registers from the build env and startCheckout() follows it.
const ambientRegistered = registerStripeCheckoutProvider();
const ambientOutcome = await startCheckout({ order, customer });
check(
  ambientCheckoutUrl.startsWith("https://pay.example.test")
    ? "with no ambient config, startCheckout() still hands off (honest email path)"
    : "with the ambient config, startCheckout() redirects to the payment provider",
  ambientCheckoutUrl.startsWith("https://pay.example.test")
    ? ambientOutcome.status === "handoff"
    : ambientOutcome.status === "redirect" &&
        ambientRegistered === true &&
        "url" in ambientOutcome &&
        ambientOutcome.url === ambientCheckoutUrl,
  ambientOutcome.status,
);
check(
  "with no configuration at all the seam stays on the honest email handoff",
  getCheckoutProvider({}).id === ENQUIRY_PROVIDER_ID &&
    stripeCheckoutProvider({}) === null &&
    registerStripeCheckoutProvider({}) === false,
);
check(
  "the payment link is build configuration, never committed source",
  !/buy\.stripe\.com|https?:\/\//i.test(
    readFileSync(
      new URL("../src/lib/checkout-stripe.ts", import.meta.url),
      "utf8",
    ),
  ),
);
const checkoutPageWithNote = readFileSync(
  new URL("../src/routes/checkout.tsx", import.meta.url),
  "utf8",
);
check(
  "the page renders the note from provider config (the amount is not hardcoded)",
  /provider\.amountNote/.test(checkoutPageWithNote) &&
    !/£1\.00/.test(checkoutPageWithNote),
);
check(
  "the page shows the redirect outcome to the customer (no silent navigation away)",
  !/location\.assign|location\.replace|location\.href\s*=\s*result\.url/.test(
    checkoutPageWithNote,
  ),
);
check(
  "the redirect outcome offers the provider's own URL as a deliberate link",
  /href=\{outcome\.url\}/.test(checkoutPageWithNote) &&
    /continue to payment/.test(checkoutPageWithNote),
);
const basketPageWithPay = readFileSync(
  new URL("../src/routes/basket.tsx", import.meta.url),
  "utf8",
);
check(
  "the basket page's payment message follows the configured provider",
  /registerStripeCheckoutProvider\(\)/.test(basketPageWithPay) &&
    /canTakeOnlinePayment\(\)/.test(basketPageWithPay),
);
check(
  "the basket page keeps the honest no-payment copy for an unconfigured build",
  /"No online payment yet"/.test(basketPageWithPay) &&
    /not able to take card payments online/.test(basketPageWithPay),
);

console.log("checkout — order summary");
check(
  "the order snapshot matches the basket totals",
  order.itemCount === 6 &&
    order.subtotalIncVat > 0 &&
    order.totalIncVat === order.subtotalIncVat + order.shipping,
  `${order.itemCount} items / £${order.totalIncVat.toFixed(2)}`,
);
check(
  "the order snapshot counts units the same way the basket does",
  orderUnitCount(order) === 6,
  String(orderUnitCount(order)),
);
const summaryText = orderSummaryText(order);
check(
  "the summary lists the goods, delivery and total",
  /Goods \(inc\. VAT\)/.test(summaryText) &&
    /Delivery: £/.test(summaryText) &&
    /Total: £/.test(summaryText),
);
check(
  "the summary names the products",
  summaryText.includes(wheel.name) && summaryText.includes(tyre.name),
);
const mailto = buildOrderEnquiryMailto(order, customer);
check(
  "the enquiry email is addressed to the business, not the customer",
  mailto.startsWith("mailto:enquiry@n2wheels.co.uk?"),
);
check(
  "the enquiry email subject names the enquiry",
  /order enquiry/i.test(
    decodeURIComponent(mailto.split("subject=")[1].split("&")[0]),
  ),
);

console.log("checkout — honesty in the source");
const seamSource = readFileSync(
  new URL("../src/lib/checkout.ts", import.meta.url),
  "utf8",
);
check(
  "the seam carries no card/secret material",
  !/sk_live|sk_test|pk_live|client_secret|card_number|cvc/i.test(seamSource),
);
check(
  "the seam documents how a real provider is wired later",
  /registerCheckoutProvider/.test(seamSource) && /hosted/i.test(seamSource),
);
const checkoutPage = readFileSync(
  new URL("../src/routes/checkout.tsx", import.meta.url),
  "utf8",
);
check(
  "the checkout page renders no card fields",
  !/card number|cardnumber|cvc|cvv|expiry|type="password"/i.test(checkoutPage),
);
check(
  "the checkout page never renders a success/confirmation screen",
  !/order confirmed|payment successful|thank you for your order|order number/i.test(
    checkoutPage,
  ),
);

console.log("---");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fails.length) console.log(fails.map((f) => ` - ${f}`).join("\n"));
process.exit(fail === 0 ? 0 : 1);
