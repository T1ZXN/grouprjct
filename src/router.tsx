import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { cleanStringifySearch } from "~/lib/catalogue";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultNotFoundComponent: () => <p>Not found</p>,
    // Keep filter URLs clean (?diameter=18, not ?diameter="18").
    stringifySearch: cleanStringifySearch,
  });
}
