/**
 * N2 Wheels — SAME-ORIGIN REG-LOOKUP PROXY (the Netlify Function body).
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * The VehicleMatic "Vehicle Details" API sends NO CORS headers, so a browser on
 * n2wheels.co.uk cannot call it directly (verified live 2026-09-17: the direct
 * call works over curl but is blocked from the page). The site therefore calls
 * its OWN path — `/api/reglookup/{VRM}` — and this function makes the upstream
 * call SERVER-SIDE, where the provider key lives.
 *
 * The key is NEVER in the client bundle. HOW IT GETS IN, EXACTLY:
 * `bun ./export-netlify.ts` reads this file as a TEMPLATE and substitutes the
 * one placeholder token in the `INLINE_API_KEY` assignment below (the all-caps
 * N2 placeholder wrapped in double underscores) with the value of the build-env
 * variable `VITE_REG_LOOKUP_KEY` (export-netlify.ts: REG_LOOKUP_KEY_ENV +
 * emitRegLookupProxyFunction; JSON-string escaped). The export refuses to run
 * unless the token appears exactly once and is gone from the emitted file, so
 * the key can only ever land in that one assignment. It therefore exists ONLY
 * in the emitted copy the export writes to
 * `dist-netlify/netlify/functions/reglookup.js` — a server-side function Netlify
 * never serves as a static file — and never in this repo file, in any client
 * asset, or in any deployed artifact kept under version control. This committed
 * template keeps the placeholder below, so the copy in the repo carries no key
 * at all — it honestly reports "not configured" (503) instead of leaking or
 * inventing anything. That is also why this file lives in `scripts/` rather than
 * in a `netlify/functions/` directory in the repo: it must never be deployed
 * as-is.
 *
 * HONESTY CONTRACT (never relax)
 *   • a plate is NEVER turned into a guessed vehicle — every failure path
 *     returns an explicit JSON error and no vehicle fields;
 *   • the upstream status is mirrored, so the client adapter maps 404 -> honest
 *     "no match", 402 -> "paused", 403 -> "unavailable" exactly as before;
 *   • the key is never logged, and never returned in a response body;
 *   • a completed request is always valid JSON (that is how the client tells
 *     "our proxy answered" from "this route doesn't exist on this host").
 *
 * Responses are JSON objects carrying `n2proxy: 1` plus, whenever the upstream
 * answered with a JSON object, the upstream body's own fields (so `data`,
 * `credit_balance`, `code`, `message` pass through unchanged).
 *
 * TRANSPORT IS INJECTED (`fetchImpl`), so the whole handler is unit-tested with
 * no network and no key — see scripts/test-reglookup.ts.
 */
"use strict";

/**
 * The provider key, inlined at export time (JSON-string escaped). The committed
 * placeholder NEVER counts as a key: a placeholder/empty value means
 * "not configured" and the handler answers 503 without calling anything.
 */
var INLINE_API_KEY = "__N2_REG_LOOKUP_KEY__";

/** Upstream provider endpoint (VehicleMatic Vehicle Details, live-validated 2026-09-17). */
var UPSTREAM_BASE_URL = "https://vehiclematic.com/products/vehicle-details/api/live";

/** Auth header the upstream expects (VehicleMatic's own scheme). */
var UPSTREAM_AUTH_HEADER = "X-VEHICLEMATIC-KEY";

/** Upstream call timeout — the caller gets an honest error, never a hang. */
var UPSTREAM_TIMEOUT_MS = 9000;

/** Marks a body as coming from this proxy (client uses it to detect the route). */
var PROXY_MARKER = "n2proxy";

/**
 * Hosts a browser page may be served from when it calls this proxy.
 * Deliberately NO sandbox/preview host: this Netlify Function only ever runs on
 * Netlify (custom domain + *.netlify.app), and naming an ephemeral preview host
 * here would also put that hostname into the exported bundle — which the
 * export's own "no preview hosts in the export" guard rejects (verify-netlify.sh).
 */
var ALLOWED_REFERRER_HOSTS = [
  /(^|\.)n2wheels\.co\.uk$/i,
  /(^|\.)n2-wheels\.netlify\.app$/i,
  /(^|\.)netlify\.app$/i,
  /^localhost(:\d+)?$/i,
  /^127\.0\.0\.1(:\d+)?$/i,
];

/** A placeholder in the template is NOT a key. */
function realKey(value) {
  var k = typeof value === "string" ? value.trim() : "";
  return k && k.indexOf("__N2_") !== 0 ? k : "";
}

/** Uppercase, strip everything but A-Z0-9 (same rule as the client seam). */
function normaliseVrm(raw) {
  return String(raw == null ? "" : raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function jsonResponse(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

/** True when the caller's declared page host is allowed (no header -> allowed). */
function referrerAllowed(headers) {
  var source = headers.referer || headers.referrer || headers.origin || "";
  if (!source) return true; // server-side clients (curl, scripts, health checks)
  var host = "";
  try {
    host = new URL(source).host;
  } catch {
    return false;
  }
  for (var i = 0; i < ALLOWED_REFERRER_HOSTS.length; i += 1) {
    if (ALLOWED_REFERRER_HOSTS[i].test(host)) return true;
  }
  return false;
}

/** A per-instance cost guard: at most N billed lookups per minute per caller. */
function createRateLimiter(maxPerMinute) {
  var hits = Object.create(null);
  return function allowed(caller) {
    if (!maxPerMinute || maxPerMinute <= 0) return true;
    var now = Date.now();
    var windowStart = now - 60000;
    var list = (hits[caller] || []).filter(function (t) {
      return t > windowStart;
    });
    if (list.length >= maxPerMinute) {
      hits[caller] = list;
      return false;
    }
    list.push(now);
    hits[caller] = list;
    return true;
  };
}

/** Pull the VRM out of the event (query wins; the path form is also accepted). */
function readVrm(event) {
  var q = (event && event.queryStringParameters) || {};
  if (q.vrm) return q.vrm;
  var raw = (event && (event.rawUrl || event.rawPath || event.path)) || "";
  var path = String(raw).split("?")[0].replace(/\/+$/, "");
  var segments = path.split("/").filter(Boolean);
  var last = segments.length ? segments[segments.length - 1] : "";
  // /api/reglookup/{VRM} and /.netlify/functions/reglookup (no VRM) both land here.
  if (last.toLowerCase() === "reglookup") return "";
  return last;
}

/** Header lookup that tolerates the casing Netlify happens to forward. */
function readHeaders(event) {
  var raw = (event && event.headers) || {};
  var out = {};
  Object.keys(raw).forEach(function (k) {
    out[String(k).toLowerCase()] = raw[k];
  });
  return out;
}

/**
 * Build the proxy handler.
 *
 * @param {{apiKey?: string, upstreamBaseUrl?: string, fetchImpl?: Function,
 *          timeoutMs?: number, logger?: Function, maxPerMinute?: number,
 *          callerKey?: Function}} options
 * @returns {{handle: (event: object) => Promise<{statusCode: number, headers: object, body: string}>, normaliseVrm: Function}}
 */
function createRegLookupProxyHandler(options) {
  var opts = options || {};
  var apiKey = realKey(opts.apiKey !== undefined ? opts.apiKey : INLINE_API_KEY);
  var upstreamBaseUrl = String(opts.upstreamBaseUrl || UPSTREAM_BASE_URL).replace(/\/+$/, "");
  var timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : UPSTREAM_TIMEOUT_MS;
  // Default logger names the OUTCOME only — never the key, never the plate.
  var log = opts.logger || function (code, status) {
    console.log("[n2-reglookup-proxy] " + code + " upstream=" + status);
  };
  var rateOk = createRateLimiter(
    typeof opts.maxPerMinute === "number" ? opts.maxPerMinute : 20,
  );
  var fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);

  async function callUpstream(vrm) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, timeoutMs)
      : null;
    try {
      var headers = { Accept: "application/json" };
      headers[UPSTREAM_AUTH_HEADER] = apiKey;
      var init = { method: "GET", headers: headers };
      if (controller) init.signal = controller.signal;
      var res = await fetchImpl(upstreamBaseUrl + "/" + encodeURIComponent(vrm), init);
      var text = await res.text();
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      return { status: res.status, parsed: parsed, timedOut: false };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Merge the upstream body into our envelope (our own fields win). */
  function envelope(vrm, fields) {
    var body = {};
    var upstream = fields.upstream;
    if (upstream && typeof upstream === "object" && !Array.isArray(upstream)) {
      body = Object.assign({}, upstream);
    }
    body[PROXY_MARKER] = 1;
    body.vrm = vrm;
    body.upstreamStatus = typeof fields.upstreamStatus === "number" ? fields.upstreamStatus : null;
    body.proxyError = fields.proxyError || null;
    if (fields.message) body.message = fields.message;
    return body;
  }

  async function handle(event) {
    var method = String((event && event.httpMethod) || "GET").toUpperCase();
    if (method === "OPTIONS") return { statusCode: 204, headers: { allow: "GET, OPTIONS" }, body: "" };
    if (method !== "GET" && method !== "HEAD") {
      log("method_not_allowed", 405);
      return jsonResponse(405, envelope("", { proxyError: "method_not_allowed", message: "Only GET is supported." }));
    }

    var headers = readHeaders(event);
    if (!referrerAllowed(headers)) {
      log("forbidden_referrer", 403);
      return jsonResponse(403, envelope("", { proxyError: "forbidden", message: "This proxy only serves the N2 Wheels site." }));
    }

    var vrm = normaliseVrm(readVrm(event));
    if (vrm.length < 2 || vrm.length > 7) {
      log("bad_request", 400);
      return jsonResponse(400, envelope("", { proxyError: "bad_request", message: "Enter a valid UK registration, e.g. AB12 CDE." }));
    }

    var caller = String(headers["x-nf-client-connection-ip"] || headers["client-ip"] || "unknown");
    if (!rateOk(caller)) {
      log("rate_limited", 429);
      return jsonResponse(429, envelope(vrm, { proxyError: "rate_limited", message: "Too many registration lookups just now — please search by make and model, or try again in a minute." }));
    }

    if (!apiKey || !fetchImpl) {
      // No key inlined (or no transport): honest, and NO upstream call is made.
      log("not_configured", 0);
      return jsonResponse(503, envelope(vrm, { proxyError: "not_configured", message: "Live registration lookups aren't configured on this server." }));
    }

    var upstream;
    try {
      upstream = await callUpstream(vrm);
    } catch (err) {
      var timedOut = Boolean(err && (err.name === "AbortError" || err.name === "TimeoutError"));
      log(timedOut ? "timeout" : "unreachable", 0);
      return jsonResponse(502, envelope(vrm, {
        proxyError: timedOut ? "timeout" : "unreachable",
        message: "The live registration service couldn't be reached.",
      }));
    }

    if (upstream.parsed === undefined) {
      if (upstream.status >= 200 && upstream.status < 300) {
        log("unreadable", upstream.status);
        return jsonResponse(502, envelope(vrm, { proxyError: "unreadable", message: "The live registration service returned a response we couldn't read." }));
      }
      // A non-JSON error page upstream is still an honest no-record/error answer.
      log("upstream_error", upstream.status);
      return jsonResponse(upstream.status, envelope(vrm, { proxyError: "upstream_error", upstreamStatus: upstream.status }));
    }

    if (upstream.status >= 200 && upstream.status < 300) log("ok", upstream.status);
    else log("upstream_status", upstream.status);
    return jsonResponse(upstream.status, envelope(vrm, { upstream: upstream.parsed, upstreamStatus: upstream.status }));
  }

  return { handle: handle, normaliseVrm: normaliseVrm };
}

/** Netlify entry point (legacy CommonJS handler: event/context -> response). */
async function handler(event, context) {
  return createRegLookupProxyHandler({}).handle(event);
}

module.exports = {
  createRegLookupProxyHandler: createRegLookupProxyHandler,
  handler: handler,
  INLINE_API_KEY: INLINE_API_KEY,
  UPSTREAM_BASE_URL: UPSTREAM_BASE_URL,
  UPSTREAM_AUTH_HEADER: UPSTREAM_AUTH_HEADER,
  PROXY_MARKER: PROXY_MARKER,
  normaliseVrm: normaliseVrm,
  realKey: realKey,
};
