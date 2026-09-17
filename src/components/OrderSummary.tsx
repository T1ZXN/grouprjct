import { basketTotals, lineTotal, lineKey } from "~/lib/basket";
import type { BasketLine } from "~/lib/basket";
import { formatGBP } from "~/lib/pricing";

/**
 * Shared order pieces for /basket and /checkout: the money panel (subtotal,
 * settings-driven delivery rows, VAT already inside the prices, total) and a
 * read-only line list. The totals come from src/lib/basket.ts, which reads the
 * pricing settings — no figure on these pages is hard-coded.
 */
export function OrderTotals({
  lines,
  className = "",
}: {
  lines: BasketLine[];
  className?: string;
}) {
  const totals = basketTotals(lines);
  return (
    <div
      className={`overflow-hidden rounded-xl border border-white/10 bg-carbon ${className}`}
    >
      <h2 className="border-b border-line bg-coal/60 px-5 py-3.5 text-sm font-bold uppercase tracking-wider text-white">
        Order summary
      </h2>
      <dl className="divide-y divide-line px-5 py-4 text-sm">
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="text-steel">
            Goods ({totals.itemCount} item{totals.itemCount === 1 ? "" : "s"},
            inc. VAT)
          </dt>
          <dd className="font-semibold text-white">
            {formatGBP(totals.subtotalIncVat)}
          </dd>
        </div>
        {totals.shippingLines.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 py-2"
          >
            <dt className="text-steel">Delivery — {row.label}</dt>
            <dd className="font-semibold text-white">
              {formatGBP(row.amount)}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="text-steel-dim">VAT included in goods (20%)</dt>
          <dd className="text-steel">{formatGBP(totals.vatIncluded)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="font-bold text-white">Total</dt>
          <dd className="text-lg font-bold text-white">
            {formatGBP(totals.totalIncVat)}
          </dd>
        </div>
      </dl>
      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-steel-dim">
        Delivery is charged from our published delivery settings. Every order is
        checked against your exact vehicle before we confirm it.
      </p>
    </div>
  );
}

/** Compact, read-only line list (used on /checkout, where lines are fixed). */
export function OrderSummaryLines({ lines }: { lines: BasketLine[] }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {lines.map((line) => (
        <li key={lineKey(line)} className="flex items-start gap-3 py-3">
          {line.image ? (
            <img
              src={line.image}
              alt=""
              className="h-14 w-14 shrink-0 rounded-md border border-white/10 object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">
              {line.brand ? `${line.brand} ` : ""}
              {line.name}
            </p>
            <p className="text-xs leading-relaxed text-steel">{line.spec}</p>
            <p className="mt-1 text-xs text-steel-dim">
              {line.quantity} × {formatGBP(line.unitPriceIncVat)} each
            </p>
          </div>
          <p className="shrink-0 font-semibold text-white">
            {formatGBP(lineTotal(line))}
          </p>
        </li>
      ))}
    </ul>
  );
}
