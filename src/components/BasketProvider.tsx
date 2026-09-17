import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  addToBasket,
  BASKET_STORAGE_KEY,
  basketCount,
  clearBasket,
  lineKey,
  parseBasket,
  removeFromBasket,
  serializeBasket,
  setLineQuantity,
} from "~/lib/basket";
import type { BasketLine, BasketProduct } from "~/lib/basket";

/**
 * Client-side basket state, persisted to localStorage.
 *
 * SSR/prerender always paints an EMPTY basket (`lines: []`), which matches the
 * static export; the stored basket is read in an effect on the client, so the
 * hydration paint is stable and only browsers with a saved basket change.
 * Nothing here talks to a server: the basket is the customer's own list, and
 * checkout (src/lib/checkout.ts) is where the honest handoff happens.
 */
export interface BasketContextValue {
  lines: BasketLine[];
  /** Units in the basket — what the header badge shows. */
  count: number;
  /** True once the stored basket has been read on the client. */
  hydrated: boolean;
  add: (product: BasketProduct, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const BasketContext = createContext<BasketContextValue | null>(null);

export function BasketProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Read the stored basket once, in the browser only.
  useEffect(() => {
    try {
      setLines(parseBasket(window.localStorage.getItem(BASKET_STORAGE_KEY)));
    } catch {
      // localStorage can be unavailable (private mode / blocked cookies) — the
      // basket then simply lives for this page view.
      setLines([]);
    }
    setHydrated(true);
  }, []);

  // Persist after every change, but never before hydration (that would wipe a
  // stored basket with the empty prerender state).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(BASKET_STORAGE_KEY, serializeBasket(lines));
    } catch {
      // Storage full/blocked: the basket still works for this session.
    }
  }, [lines, hydrated]);

  const add = useCallback((product: BasketProduct, quantity = 1) => {
    setLines((current) => addToBasket(current, product, quantity));
  }, []);
  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines((current) => setLineQuantity(current, key, quantity));
  }, []);
  const remove = useCallback((key: string) => {
    setLines((current) => removeFromBasket(current, key));
  }, []);
  const clear = useCallback(() => setLines(clearBasket()), []);

  const value = useMemo<BasketContextValue>(
    () => ({
      lines,
      count: basketCount(lines),
      hydrated,
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, hydrated, add, setQuantity, remove, clear],
  );

  return (
    <BasketContext.Provider value={value}>{children}</BasketContext.Provider>
  );
}

/** Basket state for components (Header badge, product pages, /basket, /checkout). */
export function useBasket(): BasketContextValue {
  const ctx = useContext(BasketContext);
  if (!ctx) {
    throw new Error(
      "useBasket must be used inside <BasketProvider> (see src/routes/__root.tsx).",
    );
  }
  return ctx;
}

export { lineKey };
