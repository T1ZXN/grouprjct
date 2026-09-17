import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { cleanStringifySearch } from "~/lib/catalogue";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultNotFoundComponent: () => <p>Not found</p>,
    // Every route is served from the static export as a DIRECTORY index.html
    // (/wheels/w-forza-r1-18/index.html), so the canonical URL on the host is
    // the trailing-slash form. Generating Link hrefs and client-side paths
    // WITHOUT the slash made a click land on a URL the host 301s, which broke
    // hydration (React error #300 → "Something went wrong"). "always" keeps
    // generated links and client paths on the slash form that is actually
    // served. It only affects router paths (Links / route matching) — asset,
    // API, fetch and Netlify-function paths are plain strings and are untouched.
    trailingSlash: "always",
    // Keep filter URLs clean (?diameter=18, not ?diameter="18").
    stringifySearch: cleanStringifySearch,
  });
}
