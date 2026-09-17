import { createFileRoute, Link } from "@tanstack/react-router";
import { useBasket } from "~/components/BasketProvider";
import { OrderTotals } from "~/components/OrderSummary";
import {
  basketCategoryLabel,
  lineKey,
  lineTotal,
  MAX_LINE_QUANTITY,
} from "~/lib/basket";
import type { BasketLine } from "~/lib/basket";
import { formatGBP } from "~/lib/pricing";

/**
 * /basket — the customer's own list.
 *
 * Line items show exactly what the product page showed (name, spec, unit price
 * inc. VAT); totals come from the settings-driven basket maths
 * (src/lib/basket.ts). Nothing here claims stock, availability or a completed
 * order — the panel below the totals says plainly that this site cannot take an
 * online card payment yet.
 */
export const Route = createFileRoute("/basket")({
  head: () => ({
    meta: [
      { title: "Your Basket | N2 Wheels" },
      {
        name: "description",
        content:
          "Review the alloy wheels, tyres, wheel & tyre packages and accessories in your N2 Wheels basket, with delivery and VAT calculated from our pricing settings.",
      },
      // A personal, client-side list — nothing to index.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BasketPage,
});

function BasketPage() {
  const { lines, count, hydrated, setQuantity, remove, clear } = useBasket();

  return (
    <section className="border-t border-line bg-night">
      <div className="container-x py-10 sm:py-14">
        <span className="sample-chip">Sample data</span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Your basket
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-steel">
          Items you add are kept in this browser only. Everything in the
          catalogue is sample data — no live stock or availability is claimed,
          and every order is checked against your exact vehicle before we
          confirm it.
        </p>

        {!hydrated ? (
          <div className="mt-10 rounded-xl border border-white/10 bg-carbon p-6 text-sm text-steel">
            Opening your basket…
          </div>
        ) : lines.length === 0 ? (
          <EmptyBasket />
        ) : (
          <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1fr_360px]">
            <div>
              <div className="mb-4 flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-white">
                  {count} item{count === 1 ? "" : "s"}
                </p>
                <button
                  type="button"
                  onClick={clear}
                  className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-steel transition-colors hover:text-white"
                >
                  Empty basket
                </button>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-white/10 bg-carbon">
                {lines.map((line) => (
                  <BasketRow
                    key={lineKey(line)}
                    line={line}
                    onQuantity={(qty) => setQuantity(lineKey(line), qty)}
                    onRemove={() => remove(lineKey(line))}
                  />
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/wheels" className="btn btn-outline">
                  Continue shopping
                </Link>
                <Link to="/fitment" className="btn btn-outline">
                  Find Wheels For My Car
                </Link>
              </div>
            </div>
            <div className="lg:sticky lg:top-[128px]">
              <OrderTotals lines={lines} />
              <div className="mt-4 rounded-xl border border-race/30 bg-race/5 p-4">
                <p className="text-sm font-semibold text-white">
                  No online payment yet
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-steel">
                  This site is not able to take card payments online, so
                  checkout prepares your order as an email to our team instead —
                  we confirm availability, delivery and payment with you
                  directly.
                </p>
                <Link to="/checkout" className="btn btn-red mt-4 w-full">
                  Continue to checkout
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function BasketRow({
  line,
  onQuantity,
  onRemove,
}: {
  line: BasketLine;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
      <img
        src={line.image}
        alt=""
        className="h-20 w-20 shrink-0 rounded-lg border border-white/10 object-cover"
      />
      <div className="min-w-[180px] flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-steel-dim">
          {basketCategoryLabel(line.category)}
        </p>
        <p className="mt-0.5 font-semibold text-white">
          {line.brand ? `${line.brand} ` : ""}
          {line.name}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-steel">{line.spec}</p>
        <p className="mt-1 text-xs text-steel-dim">
          Unit price {formatGBP(line.unitPriceIncVat)} inc. VAT
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="mt-2 cursor-pointer text-xs font-semibold uppercase tracking-wider text-steel transition-colors hover:text-race-bright"
        >
          Remove
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onQuantity(line.quantity - 1)}
          disabled={line.quantity <= 1}
          aria-label={`Decrease quantity of ${line.name}`}
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-md border border-white/15 text-white transition-colors hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <label className="sr-only" htmlFor={`qty-${lineKey(line)}`}>
          Quantity of {line.name}
        </label>
        <input
          id={`qty-${lineKey(line)}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_LINE_QUANTITY}
          value={line.quantity}
          onChange={(e) => onQuantity(Number.parseInt(e.target.value, 10))}
          className="field-input w-16 text-center"
        />
        <button
          type="button"
          onClick={() => onQuantity(line.quantity + 1)}
          disabled={line.quantity >= MAX_LINE_QUANTITY}
          aria-label={`Increase quantity of ${line.name}`}
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-md border border-white/15 text-white transition-colors hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
      <p className="w-24 shrink-0 text-right font-bold text-white sm:w-28">
        {formatGBP(lineTotal(line))}
      </p>
    </li>
  );
}

function EmptyBasket() {
  return (
    <div className="mt-10 rounded-xl border border-white/10 bg-carbon p-8 text-center sm:p-12">
      <h2 className="text-xl font-bold text-white sm:text-2xl">
        Your basket is empty
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-steel">
        Add wheels, tyres, a wheel &amp; tyre package or accessories and they
        will show up here with their price, delivery and VAT. Your basket stays
        in this browser until you clear it.
      </p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Link to="/wheels" className="btn btn-red">
          Browse Alloy Wheels
        </Link>
        <Link to="/fitment" className="btn btn-outline">
          Find Wheels For My Car
        </Link>
      </div>
    </div>
  );
}
