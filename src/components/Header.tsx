import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useBasket } from "~/components/BasketProvider";
import { NAV_LINKS } from "~/lib/nav";
import {
  BasketIcon,
  CloseIcon,
  MenuIcon,
  SearchIcon,
  UserIcon,
} from "~/components/icons";

/**
 * Site header: sticky, dark solid background (brand rule — nav never sits on
 * a busy photo). Row 1 = logo + search/account/basket + red fitment CTA +
 * hamburger (mobile). Row 2 (desktop) = category nav.
 */
export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { count } = useBasket();
  const navigate = useNavigate();

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    navigate({ to: "/wheels", search: { q: q || undefined } });
    setSearchOpen(false);
    setSearchTerm("");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-night">
      {/* Row 1 — logo, actions, CTA */}
      <div className="container-x flex h-[112px] items-center justify-between gap-2 sm:gap-4">
        <Link
          to="/"
          aria-label="N2 Wheels — home"
          className="flex shrink-0 items-center"
        >
          {/* Owner's official logo (transparent web version — image only, no wordmark) */}
          <img
            src="/images/logo-n2.png"
            alt="N2 Wheels"
            width={480}
            height={410}
            className="h-[76px] w-auto"
          />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Search toggle */}
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-expanded={searchOpen}
            aria-label={searchOpen ? "Close search" : "Open search"}
            className="grid h-10 w-10 cursor-pointer place-items-center rounded-md text-steel transition-colors hover:text-white"
          >
            <SearchIcon className="h-5 w-5" />
          </button>

          {/* Account — non-functional for now */}
          <button
            type="button"
            aria-label="Account (coming soon)"
            title="Account — coming soon"
            className="hidden h-10 w-10 cursor-pointer place-items-center rounded-md text-steel transition-colors hover:text-white sm:grid"
          >
            <UserIcon className="h-5 w-5" />
          </button>

          {/* Basket — real, localStorage-backed count (link to /basket) */}
          <Link
            to="/basket"
            aria-label={
              count === 0
                ? "Basket — empty"
                : `Basket — ${count} item${count === 1 ? "" : "s"}`
            }
            title="View your basket"
            className="relative grid h-10 w-10 cursor-pointer place-items-center rounded-md text-steel transition-colors hover:text-white"
          >
            <BasketIcon className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-race px-0.5 text-[10px] font-bold leading-none text-white">
                {count}
              </span>
            )}
          </Link>

          {/* Red CTA — always visible, compact label on very small screens */}
          <Link to="/fitment" className="btn btn-red !px-3 !py-2.5 sm:!px-5">
            <span className="hidden lg:inline">Find Wheels For My Car</span>
            <span className="lg:hidden">Fitment</span>
          </Link>

          {/* Hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="grid h-10 w-10 cursor-pointer place-items-center rounded-md text-steel transition-colors hover:text-white lg:hidden"
          >
            {mobileOpen ? (
              <CloseIcon className="h-5 w-5" />
            ) : (
              <MenuIcon className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Search panel */}
      {searchOpen && (
        <div className="border-t border-line bg-carbon">
          <form
            onSubmit={submitSearch}
            className="container-x flex gap-2 py-3"
            role="search"
          >
            <label htmlFor="site-search" className="sr-only">
              Search products
            </label>
            <input
              id="site-search"
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search wheels, tyres, packages…"
              className="field-input"
              autoComplete="off"
            />
            <button type="submit" className="btn btn-red shrink-0 !py-2.5">
              Search
            </button>
          </form>
        </div>
      )}

      {/* Row 2 — desktop category nav (dark solid bar) */}
      <nav
        aria-label="Main navigation"
        className="hidden border-t border-line bg-carbon lg:block"
      >
        <div className="container-x flex items-center">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeProps={{ className: "nav-link nav-link-active" }}
              inactiveProps={{ className: "nav-link" }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <nav
          aria-label="Mobile navigation"
          className="border-t border-line bg-carbon lg:hidden"
        >
          <ul className="container-x flex flex-col py-2">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  activeProps={{
                    className:
                      "block rounded-md px-3 py-3 text-sm font-medium bg-white/5 text-white",
                  }}
                  inactiveProps={{
                    className:
                      "block rounded-md px-3 py-3 text-sm font-medium text-steel hover:text-white",
                  }}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
