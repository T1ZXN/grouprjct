import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useBasket } from "~/components/BasketProvider";
import { basketCategoryLabel, unitNoteForCategory } from "~/lib/basket";
import type { BasketProduct } from "~/lib/basket";

/**
 * "Add to basket" affordance for product detail pages.
 *
 * Adds the EXACT product the page is rendering (live database row when the
 * catalogue hydrated from Supabase, otherwise the sample row) with its
 * displayed price — no price is recalculated or invented here. The customer
 * gets a short, honest confirmation; quantities are edited on /basket.
 */
export function AddToBasket({
  product,
  className = "",
}: {
  product: BasketProduct;
  className?: string;
}) {
  const { add } = useBasket();
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 4000);
    return () => clearTimeout(timer);
  }, [added]);

  const label = basketCategoryLabel(product.category);

  return (
    <div className={className}>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            add(product, 1);
            setAdded(true);
          }}
          className="btn btn-red"
        >
          Add to basket
        </button>
        <Link to="/basket" className="btn btn-outline">
          View basket
        </Link>
      </div>
      <p
        className="mt-2 text-xs leading-relaxed text-steel-dim"
        role="status"
        aria-live="polite"
      >
        {added ? `${label} added to your basket. ` : ""}
        {unitNoteForCategory(product.category)}
      </p>
    </div>
  );
}
