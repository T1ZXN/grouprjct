#!/usr/bin/env bun
/**
 * scripts/test-reglookup.ts — verification for the LIVE vehicle-lookup adapters.
 *
 * Covers, with NO network calls and NO API keys:
 *   1. shape mapping   — documented reg payload -> Vehicle; documented fits payload -> FitmentOption[]
 *   2. live-mode gating — nothing configured = demo mode; a proxy build flag or a keyed
 *                        direct override = live mode (gating is checked in real child
 *                        processes, so it exercises the real seam)
 *   3. error honesty   — 5xx / unreachable / unreadable payloads throw honest errors and NEVER
 *                        return a fabricated vehicle or fitment; 404 -> honest "no-match" with no vehicle
 *   4. demo honesty    — with nothing configured, a plate is never turned into a vehicle and plate
 *                        input is still validated
 *   5. live endpoint   — the same-origin proxy path is the default, the direct VehicleMatic
 *                        endpoint + X-VEHICLEMATIC-KEY are still reachable via the explicit
 *                        VITE_REG_LOOKUP_URL override, and 402/403/422 map to distinct honest messages
 *   6. proxy function  — the server-side same-origin proxy (scripts/reglookup-function.js):
 *                        upstream status mirroring, honest failures, key never logged and never
 *                        returned, no key committed in the template
 *
 * No network calls and no real API keys: every provider/handler test injects its transport, and the
 * demo-mode checks run in a child process with the key blanked (the ambient shell may hold a
 * live key, which must never leak into a test or be printed).
 *
 * Run:  bun run test:reglookup     (or: bun ./scripts/test-reglookup.ts)
 */
import {
  getActiveProvider,
  getProviderLabel,
  isLiveMode,
  lookupVehicleByReg,
} from "../src/lib/reglookup";
import {
  createUkVrmProvider,
  DEFAULT_UK_VRM_BASE_URL,
  DEFAULT_UK_VRM_PROXY_PATH,
  endpointCandidates,
  mapVehicleFromPayload,
  REG_LOOKUP_FUNCTION_FALLBACK_PATH,
  VEHICLEMATIC_DIRECT_BASE_URL,
} from "../src/lib/reglookup-ukvrm";
import { createFitsProvider, mapFitmentOptions } from "../src/lib/reglookup-fits";
import { createLiveProvider, LIVE_PROVIDER_ID } from "../src/lib/reglookup-live";
// Demo fleet ↔ product fitment records (the dropdown → verdict flow).
import { DEMO_FLEET, demoProvider, modelsForMake } from "../src/lib/reglookup-demo";
import { demoPackages, demoTypes, demoWheels } from "../src/data/products";
import { checkVehicleFitment } from "../src/components/FitmentChecker";
// The dual search (tyres + wheels for one vehicle) used by the site.
import { fitmentResultsFor } from "../src/lib/fitment-results";

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
async function expectThrow(name: string, fn: () => Promise<unknown>, mustMention: RegExp) {
  try {
    await fn();
    check(name, false, "no error thrown");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(name, mustMention.test(msg), `message was "${msg}"`);
  }
}

const SITE = "/home/team/shared/site";
/** Documented VehicleMatic-style payload. */
const REG_PAYLOAD = {
  data: {
    vrm: "AB12CDE",
    registration_number: "AB12CDE",
    make: "FORD",
    model: "FIESTA",
    colour: "BLUE",
    fuel_type: "PETROL",
    engine_capacity: 1499,
    year_of_manufacture: 2019,
    month_of_first_registration: "2019-03",
  },
  credit_balance: 499,
};
/** Documented licensed-fits payload (front+rear wheel geometry). */
const FITS_PAYLOAD = {
  data: [
    {
      make: "Audi",
      model: "A3",
      generation: "8V",
      wheel: {
        front: { rim: "7.5Jx17 ET54", rim_diameter: 17, rim_width: 7.5, rim_offset: 54, pcd: "5x112" },
        rear: { rim: "7.5Jx17 ET49", rim_diameter: 17, rim_width: 7.5, rim_offset: 49, pcd: "5x112" },
      },
    },
  ],
};

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as never;

console.log("== 1. shape mapping ==");
const mapped = mapVehicleFromPayload(REG_PAYLOAD);
check("reg payload maps make/model/year", mapped?.make === "FORD" && mapped?.model === "FIESTA" && mapped?.year === 2019,
  JSON.stringify(mapped));
check("reg payload maps fuel and engine", mapped?.fuel === "PETROL" && mapped?.engine === "1499cc", JSON.stringify(mapped));
check("flat payload maps too", mapVehicleFromPayload({ make: "Kia", model: "Sportage", yearOfManufacture: 2020 })?.model === "Sportage");
check("payload without a model is NOT guessed", mapVehicleFromPayload({ make: "FORD", year_of_manufacture: 2019 }) === undefined);
check("payload without any year is NOT guessed", mapVehicleFromPayload({ make: "FORD", model: "FIESTA" }) === undefined);
check("garbage payload is NOT guessed", mapVehicleFromPayload("<html>not json</html>") === undefined);

const opts = mapFitmentOptions(FITS_PAYLOAD);
check("fits payload maps to options", opts.length === 2, JSON.stringify(opts));
check("fits option geometry mapped (both axles)", opts.length === 2 && opts.some((o) => o.offset === "ET54") && opts.some((o) => o.offset === "ET49") && opts[0]?.width === "7.5J" && opts[0]?.pcd === "5x112",
  JSON.stringify(opts));
check("fits option with incomplete geometry is skipped (never invented)", mapFitmentOptions({ data: [{ wheel: { front: { rim: "7.5Jx17 ET54" } } }] }).length === 0,
  JSON.stringify(mapFitmentOptions({ data: [{ wheel: { front: { rim: "7.5Jx17 ET54" } } }] })));
check("fits option parsed from the rim string when fields are absent", mapFitmentOptions({ data: [{ wheel: { front: { rim: "7.5Jx17 ET54", pcd: "5x112" } } }] }).length === 1);
check("empty fits payload -> no options", mapFitmentOptions({ data: [] }).length === 0);

console.log("== 2. live-mode gating (real child processes) ==");
/**
 * Every child starts from a NEUTRAL env (no ambient key, no ambient proxy flag,
 * no ambient URL override) and then applies the case's own vars — so a live key
 * sitting in the shell can never decide what "nothing configured" means.
 */
function childEnv(env: Record<string, string>): Record<string, string> {
  return {
    ...process.env,
    VITE_REG_LOOKUP_KEY: "",
    // The proxy build is the default; "0" is the explicit labelled-demo switch.
    VITE_REG_LOOKUP_PROXY: "0",
    VITE_REG_LOOKUP_URL: "",
    VITE_FITS_API_KEY: "",
    ...env,
  };
}
function gate(env: Record<string, string>) {
  const snippet = `import {getActiveProvider,isLiveMode,getProviderLabel,lookupVehicleByReg} from "${SITE}/src/lib/reglookup.ts";
const p=getActiveProvider();let o;try{o=await lookupVehicleByReg("AB12CDE");}catch(e){console.log(JSON.stringify({id:p.id,live:isLiveMode(),label:getProviderLabel(),status:"threw",hasVehicle:false,error:String(e&&e.message||e).slice(0,60)}));process.exit(0);}
console.log(JSON.stringify({id:p.id,live:isLiveMode(),label:getProviderLabel(),status:o.status,hasVehicle:Boolean(o.vehicle)}));`;
  const proc = Bun.spawnSync({ cmd: ["bun", "-e", snippet], env: childEnv(env), cwd: SITE });
  const line = proc.stdout.toString().trim().split("\n").pop() ?? "";
  try {
    return JSON.parse(line) as { id: string; live: boolean; label: string; status: string; hasVehicle: boolean };
  } catch {
    return { id: "ERROR", live: false, label: proc.stderr.toString().slice(0, 200), status: "error", hasVehicle: false };
  }
}
/**
 * Run a plate lookup through the REAL seam in a child process with a controlled
 * env, and return the outcome. The demo-mode assertions need this: VITE_REG_LOOKUP_KEY
 * is a platform secret, so the shell running these tests may already carry a live key
 * (with live mode active the in-process call would go to the proxy, and "demo mode"
 * would no longer describe what actually happened). No key is ever printed — the child
 * reports only the provider id, status, notices and the normalised registration.
 */
function seamOutcome(env: Record<string, string>) {
  const snippet = `import {getActiveProvider,isLiveMode,lookupVehicleByReg} from "${SITE}/src/lib/reglookup.ts";
let o;try{o=await lookupVehicleByReg("AB12 CDE");}catch(e){console.log(JSON.stringify({threw:true,id:getActiveProvider().id,live:isLiveMode(),status:"threw",hasVehicle:false,notice:"",registration:""}));process.exit(0);}
console.log(JSON.stringify({threw:false,id:getActiveProvider().id,live:isLiveMode(),status:o.status,hasVehicle:Boolean(o.vehicle),notice:o.notice,registration:o.registration}));`;
  const proc = Bun.spawnSync({ cmd: ["bun", "-e", snippet], env: childEnv(env), cwd: SITE });
  const line = proc.stdout.toString().trim().split("\n").pop() ?? "";
  try {
    return JSON.parse(line) as {
      threw: boolean; id: string; live: boolean; status: string;
      hasVehicle: boolean; notice: string; registration: string;
    };
  } catch {
    return { threw: true, id: "ERROR", live: false, status: "error", hasVehicle: false, notice: proc.stderr.toString().slice(0, 200), registration: "" };
  }
}
const noKey = gate({ VITE_REG_LOOKUP_PROXY: "0" });
check("VITE_REG_LOOKUP_PROXY=0 -> demo provider (labelled demo build)", noKey.id === "demo" && noKey.live === false, JSON.stringify(noKey));
check("demo build -> plate lookup unavailable, NO fabricated vehicle", noKey.status === "unavailable" && noKey.hasVehicle === false, JSON.stringify(noKey));

// THE PRODUCTION CASE: the build ships the same-origin proxy, so the plate
// lookup is live with NO key in the client bundle at all.
const proxyBuild = gate({ VITE_REG_LOOKUP_PROXY: "" });
check("proxy build (default, no client key at all) -> live provider", proxyBuild.id === LIVE_PROVIDER_ID && proxyBuild.live === true, JSON.stringify(proxyBuild));
check("proxy build -> live label still shown, naming the sample fitment gap", /Live UK registration lookup/i.test(proxyBuild.label) && /sample/i.test(proxyBuild.label), proxyBuild.label);
check("proxy build -> no fabricated vehicle when the lookup can't complete (no server here)", proxyBuild.hasVehicle === false, JSON.stringify(proxyBuild));

const regKey = gate({ VITE_REG_LOOKUP_PROXY: "0", VITE_REG_LOOKUP_KEY: "test-key-not-real" });
check("VITE_REG_LOOKUP_KEY (direct override) -> live provider", regKey.id === LIVE_PROVIDER_ID && regKey.live === true, JSON.stringify(regKey));
check("reg-only label names the sample fitment gap", /sample/i.test(regKey.label), regKey.label);
check("reg-only: no fabricated vehicle when the live call fails", regKey.hasVehicle === false, JSON.stringify(regKey));

const fitsKey = gate({ VITE_REG_LOOKUP_KEY: "", VITE_FITS_API_KEY: "test-key-not-real" });
check("VITE_FITS_API_KEY -> live provider", fitsKey.id === LIVE_PROVIDER_ID && fitsKey.live === true, JSON.stringify(fitsKey));
check("fits-only label says plates are not decoded", /no plate decoding/i.test(fitsKey.label), fitsKey.label);
check("fits-only: plate lookup unavailable, NO fabricated vehicle", fitsKey.status === "unavailable" && fitsKey.hasVehicle === false, JSON.stringify(fitsKey));

console.log("== 3. error honesty (injected transport) ==");
const okProvider = createUkVrmProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(200, REG_PAYLOAD) });
const ok = await okProvider.lookupVehicleByReg("AB12CDE");
check("200 -> matched, source live, providerId uk-vrm", ok.status === "matched" && ok.source === "live" && ok.providerId === "uk-vrm", JSON.stringify(ok));
check("200 -> notice keeps the verify-compatibility promise", /verify exact compatibility/i.test(ok.notice), ok.notice);
check("200 -> vehicle from the live payload", ok.vehicle?.make === "FORD" && ok.vehicle?.model === "FIESTA", JSON.stringify(ok.vehicle));

const notFound = await createUkVrmProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(404, {}) }).lookupVehicleByReg("AB12CDE");
check("404 -> no-match with NO vehicle", notFound.status === "no-match" && !notFound.vehicle, JSON.stringify(notFound));
check("404 -> honest notice (never guesses)", /never guess a vehicle/i.test(notFound.notice), notFound.notice);
const badPlate = await createUkVrmProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(422, { error: true, message: "invalid registration" }) }).lookupVehicleByReg("AB12CDE");
check("422 -> treated as no-match with NO vehicle (check the plate)", badPlate.status === "no-match" && !badPlate.vehicle && /check the plate/i.test(badPlate.notice), JSON.stringify(badPlate));
const noCredit = createUkVrmProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(402, { error: true, message: "Insufficient credits for this product.", credit_balance: 0 }) });
await expectThrow("402 insufficient credits -> distinct honest error, no vehicle, no jargon", () => noCredit.lookupVehicleByReg("AB12CDE"), /paused right now/i);
await expectThrow("402 -> message keeps the no-invention honesty", () => createUkVrmProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(402, {}) }).lookupVehicleByReg("AB12CDE"), /no vehicle details were invented/i);
await expectThrow("403 key not authorised for the product -> distinct honest error (not a raw HTTP code)", () => createUkVrmProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(403, { error: true, message: "This API key is not authorised for this product." }) }).lookupVehicleByReg("AB12CDE"), /temporarily unavailable/i);
const err403 = await createUkVrmProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(403, {}) }).lookupVehicleByReg("AB12CDE").then(() => "", (e: unknown) => String((e as Error).message));
check("403 -> no internal jargon and no 'HTTP 403' leak", !/HTTP 40|API key|product scope|credit/i.test(err403) && !/found/i.test(err403), err403);

await expectThrow("500 -> throws an honest error, no fallback data", () =>
  createUkVrmProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(503, {}) }).lookupVehicleByReg("AB12CDE"), /HTTP 503/);
await expectThrow("network failure -> honest error", () =>
  createUkVrmProvider({ apiKey: "k", fetchImpl: async () => { throw new Error("boom"); } }).lookupVehicleByReg("AB12CDE"), /couldn't be reached/i);
await expectThrow("unmappable payload -> honest error, no fabricated vehicle", () =>
  createUkVrmProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(200, { data: { make: "FORD" } }) }).lookupVehicleByReg("AB12CDE"), /don't guess/i);
await expectThrow("unreadable body -> honest error", () =>
  createUkVrmProvider({ apiKey: "k", baseUrl: VEHICLEMATIC_DIRECT_BASE_URL, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }) as never }).lookupVehicleByReg("AB12CDE"), /couldn't read/i);
const capped = createUkVrmProvider({ apiKey: "k", sessionLimit: 1, fetchImpl: async () => jsonResponse(200, REG_PAYLOAD) });
await capped.lookupVehicleByReg("AB12CDE");
await expectThrow("per-session cost cap -> honest pause message", () => capped.lookupVehicleByReg("AB12CDE"), /paused for this session/i);
check("auth mode x-api-key is honoured", await (async () => {
  let seen = "";
  const p = createUkVrmProvider({ apiKey: "k2", authMode: "x-api-key", baseUrl: VEHICLEMATIC_DIRECT_BASE_URL, fetchImpl: async (_u, init) => { seen = JSON.stringify(init?.headers); return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return /x-api-key/.test(seen) && !/Bearer/.test(seen) && !/X-VEHICLEMATIC-KEY/.test(seen);
})());
check("auth mode bearer is still selectable via options", await (async () => {
  let seen = "";
  const p = createUkVrmProvider({ apiKey: "k2", authMode: "bearer", baseUrl: VEHICLEMATIC_DIRECT_BASE_URL, fetchImpl: async (_u, init) => { seen = JSON.stringify(init?.headers); return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return /Bearer k2/.test(seen) && !/X-VEHICLEMATIC-KEY/.test(seen);
})());
check("default auth for this (VehicleMatic) adapter sends X-VEHICLEMATIC-KEY — on a DIRECT url", await (async () => {
  let seen = "";
  const p = createUkVrmProvider({ apiKey: "k2", baseUrl: VEHICLEMATIC_DIRECT_BASE_URL, fetchImpl: async (_u, init) => { seen = JSON.stringify(init?.headers); return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return /"X-VEHICLEMATIC-KEY":"k2"/.test(seen) && !/Bearer/.test(seen) && !seen.toLowerCase().includes("x-api-key");
})());
check("VITE_REG_LOOKUP_AUTH can still switch the scheme (bearer via env)", await (async () => {
  let seen = "";
  const p = createUkVrmProvider({ env: { VITE_REG_LOOKUP_KEY: "k3", VITE_REG_LOOKUP_AUTH: "bearer", VITE_REG_LOOKUP_URL: VEHICLEMATIC_DIRECT_BASE_URL }, fetchImpl: async (_u, init) => { seen = JSON.stringify(init?.headers); return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return /Bearer k3/.test(seen) && !/X-VEHICLEMATIC-KEY/.test(seen);
})());
check("VITE_REG_LOOKUP_AUTH=x-vehiclematic-key also lands on the VehicleMatic header", await (async () => {
  let seen = "";
  const p = createUkVrmProvider({ env: { VITE_REG_LOOKUP_KEY: "k3", VITE_REG_LOOKUP_AUTH: "x-vehiclematic-key", VITE_REG_LOOKUP_URL: VEHICLEMATIC_DIRECT_BASE_URL }, fetchImpl: async (_u, init) => { seen = JSON.stringify(init?.headers); return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return /"X-VEHICLEMATIC-KEY":"k3"/.test(seen);
})());
check("default base url is the SAME-ORIGIN proxy path (key stays server-side)", DEFAULT_UK_VRM_BASE_URL === "/api/reglookup" && DEFAULT_UK_VRM_BASE_URL === DEFAULT_UK_VRM_PROXY_PATH, DEFAULT_UK_VRM_BASE_URL);
check("the direct VehicleMatic endpoint is still available as an explicit override (no api. subdomain)", VEHICLEMATIC_DIRECT_BASE_URL === "https://vehiclematic.com/products/vehicle-details/api/live" && !/api\.vehiclematic\.com/.test(VEHICLEMATIC_DIRECT_BASE_URL), VEHICLEMATIC_DIRECT_BASE_URL);
check("direct override request url = {direct base}/{VRM}", await (async () => {
  let url = "";
  const p = createUkVrmProvider({ apiKey: "k2", baseUrl: VEHICLEMATIC_DIRECT_BASE_URL, fetchImpl: async (u) => { url = u; return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return url === `${VEHICLEMATIC_DIRECT_BASE_URL}/AB12CDE`;
})());
check("env override supplies base url without code change", await (async () => {
  let url = "";
  const p = createUkVrmProvider({ env: { VITE_REG_LOOKUP_KEY: "k3", VITE_REG_LOOKUP_URL: "https://example.test/vrm" }, fetchImpl: async (u) => { url = u; return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return url === "https://example.test/vrm/AB12CDE";
})());

console.log("== 3b. same-origin proxy transport (injected, no network) ==");
/** Envelope exactly as the proxy function returns it. */
const PROXY_OK = { n2proxy: 1, vrm: "AB12CDE", upstreamStatus: 200, ...REG_PAYLOAD };
check("candidates: proxy path first, then the Netlify function path", (() => {
  const c = endpointCandidates(DEFAULT_UK_VRM_PROXY_PATH, "AB12CDE");
  return c.length === 2 && c[0] === "/api/reglookup/AB12CDE" && c[1] === `${REG_LOOKUP_FUNCTION_FALLBACK_PATH}?vrm=AB12CDE`;
})());
check("candidates: a direct (absolute) url is tried once only", (() => {
  const c = endpointCandidates(VEHICLEMATIC_DIRECT_BASE_URL, "AB12CDE");
  return c.length === 1 && c[0] === `${VEHICLEMATIC_DIRECT_BASE_URL}/AB12CDE`;
})());
check("proxy mode needs NO client key: one same-origin call, matched", await (async () => {
  const calls: string[] = [];
  const p = createUkVrmProvider({ fetchImpl: async (u) => { calls.push(u); return jsonResponse(200, PROXY_OK); } });
  const o = await p.lookupVehicleByReg("AB12CDE");
  return o.status === "matched" && o.vehicle?.make === "FORD" && o.source === "live" && calls.length === 1 && calls[0] === "/api/reglookup/AB12CDE";
})());
check("proxy call sends NO provider key header — even when a key sits in the env", await (async () => {
  let seen = "";
  const p = createUkVrmProvider({ env: { VITE_REG_LOOKUP_KEY: "must-not-leave-the-browser" }, fetchImpl: async (_u, init) => { seen = JSON.stringify(init?.headers ?? {}); return jsonResponse(200, PROXY_OK); } });
  await p.lookupVehicleByReg("AB12CDE");
  return !seen.includes("must-not-leave-the-browser") && !/X-VEHICLEMATIC-KEY|Bearer|x-api-key/i.test(seen);
})());
const proxyNoMatch = await createUkVrmProvider({ fetchImpl: async () => jsonResponse(404, { n2proxy: 1, vrm: "AB12CDE", upstreamStatus: 404, error: true, message: "No data found for registration AB12CDE." }) }).lookupVehicleByReg("AB12CDE");
check("proxy 404 envelope -> honest no-match with NO vehicle", proxyNoMatch.status === "no-match" && !proxyNoMatch.vehicle && /never guess a vehicle/i.test(proxyNoMatch.notice), JSON.stringify(proxyNoMatch));
await expectThrow("proxy 402 envelope -> distinct honest pause (no raw HTTP code)", () =>
  createUkVrmProvider({ fetchImpl: async () => jsonResponse(402, { n2proxy: 1, upstreamStatus: 402, error: true, message: "Insufficient credits." }) }).lookupVehicleByReg("AB12CDE"), /paused right now/i);
await expectThrow("proxy 403 envelope -> distinct honest unavailable (no raw HTTP code)", () =>
  createUkVrmProvider({ fetchImpl: async () => jsonResponse(403, { n2proxy: 1, upstreamStatus: 403 }) }).lookupVehicleByReg("AB12CDE"), /temporarily unavailable/i);
await expectThrow("proxy 502 (upstream unreachable) -> honest 'couldn't be reached'", () =>
  createUkVrmProvider({ fetchImpl: async () => jsonResponse(502, { n2proxy: 1, proxyError: "unreachable" }) }).lookupVehicleByReg("AB12CDE"), /couldn't be reached/i);
await expectThrow("proxy 503 (no key inlined server-side) -> honest not-configured message", () =>
  createUkVrmProvider({ fetchImpl: async () => jsonResponse(503, { n2proxy: 1, proxyError: "not_configured" }) }).lookupVehicleByReg("AB12CDE"), /aren't configured on this site yet/i);
await expectThrow("proxy 429 (rate limited) -> honest pause, no invention", () =>
  createUkVrmProvider({ fetchImpl: async () => jsonResponse(429, { n2proxy: 1, proxyError: "rate_limited" }) }).lookupVehicleByReg("AB12CDE"), /too many registration lookups/i);
check("proxy route missing (HTML from the host) -> falls back to the function path and matches", await (async () => {
  const calls: string[] = [];
  const p = createUkVrmProvider({
    fetchImpl: async (u) => {
      calls.push(u);
      if (u === "/api/reglookup/AB12CDE") return { ok: true, status: 200, json: async () => { throw new Error("<!doctype html>"); } } as never;
      return jsonResponse(200, PROXY_OK);
    },
  });
  const o = await p.lookupVehicleByReg("AB12CDE");
  return o.status === "matched" && o.vehicle?.model === "FIESTA" && calls.length === 2 && calls[1] === `${REG_LOOKUP_FUNCTION_FALLBACK_PATH}?vrm=AB12CDE`;
})());
await expectThrow("proxy route missing everywhere -> honest 'service isn't available', never a vehicle", () =>
  createUkVrmProvider({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error("<!doctype html>"); } }) as never }).lookupVehicleByReg("AB12CDE"), /isn't available on this site/i);
await expectThrow("proxy fetch throwing -> honest 'couldn't be reached'", () =>
  createUkVrmProvider({ fetchImpl: async () => { throw new Error("offline"); } }).lookupVehicleByReg("AB12CDE"), /couldn't be reached/i);
await expectThrow("proxy returns JSON we can't map -> honest error, no invented vehicle", () =>
  createUkVrmProvider({ fetchImpl: async () => jsonResponse(200, { n2proxy: 1, upstreamStatus: 200, data: { make: "FORD" } }) }).lookupVehicleByReg("AB12CDE"), /don't guess/i);
const proxyCapped = createUkVrmProvider({ sessionLimit: 1, fetchImpl: async () => jsonResponse(200, PROXY_OK) });
await proxyCapped.lookupVehicleByReg("AB12CDE");
await expectThrow("proxy mode keeps the per-session cost cap", () => proxyCapped.lookupVehicleByReg("AB12CDE"), /paused for this session/i);

const fitsOk = await createFitsProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(200, FITS_PAYLOAD) }).getFitments("Audi", "A3", 2018);
check("fits 200 -> live options with live notice", fitsOk.source === "live" && fitsOk.options.length === 2 && /licensed fitment database/i.test(fitsOk.notice), JSON.stringify(fitsOk).slice(0, 220));
const fitsEmpty = await createFitsProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(200, { data: [] }) }).getFitments("Audi", "ZZZ", 2018);
check("fits empty -> NO invented options, honest notice", fitsEmpty.options.length === 0 && /don't invent fitment data/i.test(fitsEmpty.notice), fitsEmpty.notice);
await expectThrow("fits 500 -> honest error", () =>
  createFitsProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(500, {}) }).getFitments("Audi", "A3"), /HTTP 500/);
check("fits URL carries user_key/make/model/region", await (async () => {
  let url = "";
  const p = createFitsProvider({ apiKey: "secret-key", env: { VITE_FITS_API_URL: "https://fits.test/search" }, fetchImpl: async (u) => { url = u; return jsonResponse(200, FITS_PAYLOAD); } });
  await p.getFitments("Audi", "A3", 2018);
  return url.startsWith("https://fits.test/search?") && /user_key=secret-key/.test(url) && /make=Audi/.test(url) && /model=A3/.test(url) && /year=2018/.test(url) && /region=uk/.test(url);
})());

console.log("== 4. composite + demo honesty ==");
const compositeFits = await createLiveProvider({ fits: createFitsProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(200, FITS_PAYLOAD) }) }).getFitments("Audi", "A3", 2018);
check("composite uses the live fits provider when keyed", compositeFits.source === "live" && compositeFits.options.length === 2);
const compositeRegOnly = await createLiveProvider({ reg: createUkVrmProvider({ apiKey: "k", fetchImpl: async () => jsonResponse(200, REG_PAYLOAD) }) });
const mixedFits = await compositeRegOnly.getFitments("Ford", "Fiesta", 2019);
check("reg-only composite labels its fitment options as SAMPLE", mixedFits.source === "demo" && /SAMPLE data/.test(mixedFits.notice), mixedFits.notice);
const reglessComposite = await createLiveProvider({ fits: createFitsProvider({ apiKey: "k" }) }).lookupVehicleByReg("AB12CDE");
check("composite without a reg provider never fabricates a vehicle", reglessComposite.status === "unavailable" && !reglessComposite.vehicle, JSON.stringify(reglessComposite));

// Demo mode is asserted in a child process with the demo switch on and everything else
// blanked, so nothing in the ambient environment can make this section hit a live provider.
const demoOutcome = seamOutcome({ VITE_REG_LOOKUP_PROXY: "0" });
check("demo mode: plate is never turned into a vehicle", demoOutcome.id === "demo" && demoOutcome.status === "unavailable" && !demoOutcome.hasVehicle, JSON.stringify(demoOutcome));
check("demo mode: honest notice tells the customer to use make/model", /choose your car manually/i.test(demoOutcome.notice), demoOutcome.notice);
check("demo mode: registration is still normalised/returned", demoOutcome.registration === "AB12CDE", demoOutcome.registration);
await expectThrow("demo mode: invalid plate input is still rejected", () => lookupVehicleByReg("!!!bad"), /valid UK registration/i);

console.log("== 6. same-origin proxy function (server-side handler, injected transport) ==");
/** The committed template, loaded exactly as the export step reads it. */
const proxyMod = (await import("../scripts/reglookup-function.js")) as unknown as {
  createRegLookupProxyHandler: (o: Record<string, unknown>) => {
    handle: (event: Record<string, unknown>) => Promise<{ statusCode: number; headers: Record<string, string>; body: string }>;
  };
  handler: (event: Record<string, unknown>) => Promise<{ statusCode: number; body: string }>;
  INLINE_API_KEY: string;
  UPSTREAM_BASE_URL: string;
  UPSTREAM_AUTH_HEADER: string;
  realKey: (v: unknown) => string;
};
const createProxy = proxyMod.createRegLookupProxyHandler;
const KEY = "unit-test-key-not-real";
/** Upstream stub: records the call, answers with the given status/body. */
function upstream(status: number, body: unknown, seen?: { url?: string; headers?: Record<string, string> }) {
  return async (url: string, init?: { headers?: Record<string, string> }) => {
    if (seen) {
      seen.url = url;
      seen.headers = init?.headers ?? {};
    }
    return { status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
  };
}
const okEvent = { httpMethod: "GET", path: "/api/reglookup/AB12CDE", headers: { referer: "https://n2wheels.co.uk/fitment" } };

check("committed template carries NO key (placeholder only)", proxyMod.realKey(proxyMod.INLINE_API_KEY) === "", proxyMod.INLINE_API_KEY.replace(/[A-Za-z0-9]/g, "*").slice(0, 8));
check("upstream base url is the live VehicleMatic Vehicle Details endpoint", proxyMod.UPSTREAM_BASE_URL === "https://vehiclematic.com/products/vehicle-details/api/live", proxyMod.UPSTREAM_BASE_URL);
const proxyIsUnconfigured = await createProxy({ logger: () => {} }).handle(okEvent);
check("no key inlined -> honest 503 and NO upstream call (template is safe to deploy)", proxyIsUnconfigured.statusCode === 503 && JSON.parse(proxyIsUnconfigured.body).proxyError === "not_configured" && JSON.parse(proxyIsUnconfigured.body).upstreamStatus === null, proxyIsUnconfigured.body);
let unconfiguredCalls = 0;
await createProxy({ apiKey: "", fetchImpl: async () => { unconfiguredCalls += 1; return { status: 200, text: async () => "{}" }; }, logger: () => {} }).handle(okEvent);
check("an empty key makes NO upstream call at all", unconfiguredCalls === 0, String(unconfiguredCalls));

const seenCall: { url?: string; headers?: Record<string, string> } = {};
const okRes = await createProxy({ apiKey: KEY, fetchImpl: upstream(200, REG_PAYLOAD, seenCall), logger: () => {} }).handle(okEvent);
const okBody = JSON.parse(okRes.body) as Record<string, unknown>;
check("200 -> status mirrored, upstream data + credit balance passed through", okRes.statusCode === 200 && okBody.n2proxy === 1 && okBody.upstreamStatus === 200 && (okBody.data as { make?: string })?.make === "FORD", okRes.body.slice(0, 160));
check("200 -> content-type JSON and no-store cache header", /application\/json/.test(okRes.headers["content-type"]) && okRes.headers["cache-control"] === "no-store", JSON.stringify(okRes.headers));
check("200 -> upstream called with the VehicleMatic header and the right URL", seenCall.url === `${proxyMod.UPSTREAM_BASE_URL}/AB12CDE` && seenCall.headers?.[proxyMod.UPSTREAM_AUTH_HEADER] === KEY && !/bearer/i.test(JSON.stringify(seenCall.headers)), JSON.stringify(seenCall));
check("200 -> the key is NEVER in the response body", !okRes.body.includes(KEY), "body checked");
check("no vehicle is ever invented by the proxy (payload mapped by the client, unchanged)", !("vehicle" in okBody) && (okBody.data as { model?: string })?.model === "FIESTA");

const noMatchRes = await createProxy({ apiKey: KEY, fetchImpl: upstream(404, { error: true, code: "no_data", message: "No data found for registration AB12CDE." }), logger: () => {} }).handle(okEvent);
const noMatchBody = JSON.parse(noMatchRes.body) as Record<string, unknown>;
check("404 upstream -> 404 mirrored, honest message, NO vehicle fields", noMatchRes.statusCode === 404 && noMatchBody.upstreamStatus === 404 && /No data found/.test(String(noMatchBody.message)) && !("data" in noMatchBody), noMatchRes.body);
const creditRes = await createProxy({ apiKey: KEY, fetchImpl: upstream(402, { error: true, message: "Insufficient credits for this product.", credit_balance: 0 }), logger: () => {} }).handle(okEvent);
check("402 upstream -> 402 mirrored with the credit balance passed through", creditRes.statusCode === 402 && JSON.parse(creditRes.body).credit_balance === 0, creditRes.body);
const forbiddenRes = await createProxy({ apiKey: KEY, fetchImpl: upstream(403, { error: true, message: "not authorised" }), logger: () => {} }).handle(okEvent);
check("403 upstream -> 403 mirrored (distinct honest error client-side)", forbiddenRes.statusCode === 403, forbiddenRes.body);
const serverErrRes = await createProxy({ apiKey: KEY, fetchImpl: upstream(500, "<html>gateway</html>"), logger: () => {} }).handle(okEvent);
check("500 upstream (non-JSON) -> status mirrored, marked upstream_error, NO vehicle", serverErrRes.statusCode === 500 && JSON.parse(serverErrRes.body).proxyError === "upstream_error" && !("data" in JSON.parse(serverErrRes.body)), serverErrRes.body);
const unreadableRes = await createProxy({ apiKey: KEY, fetchImpl: upstream(200, "<html>not json</html>"), logger: () => {} }).handle(okEvent);
check("200 upstream with an unreadable body -> honest 502, never a vehicle", unreadableRes.statusCode === 502 && JSON.parse(unreadableRes.body).proxyError === "unreadable", unreadableRes.body);
const unreachableRes = await createProxy({ apiKey: KEY, fetchImpl: async () => { throw new Error("ECONNREFUSED"); }, logger: () => {} }).handle(okEvent);
check("upstream network error -> honest 502 'unreachable', never a vehicle", unreachableRes.statusCode === 502 && JSON.parse(unreachableRes.body).proxyError === "unreachable" && !("data" in JSON.parse(unreachableRes.body)), unreachableRes.body);
const timeoutRes = await createProxy({
  apiKey: KEY,
  timeoutMs: 5,
  logger: () => {},
  fetchImpl: async (_url: string, init?: { signal?: AbortSignal }) => {
    await new Promise((_r, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
    throw new Error("unreachable");
  },
}).handle(okEvent);
check("upstream timeout -> honest 502 'timeout' (never a hang, never a vehicle)", timeoutRes.statusCode === 502 && JSON.parse(timeoutRes.body).proxyError === "timeout", timeoutRes.body);

const badPlateRes = await createProxy({ apiKey: KEY, fetchImpl: async () => { throw new Error("must not be called"); }, logger: () => {} }).handle({ httpMethod: "GET", path: "/api/reglookup/!!" });
check("invalid plate -> 400 and NO upstream call (a bad plate is not billed)", badPlateRes.statusCode === 400 && JSON.parse(badPlateRes.body).proxyError === "bad_request", badPlateRes.body);
const queryForm = await createProxy({ apiKey: KEY, fetchImpl: upstream(200, REG_PAYLOAD), logger: () => {} }).handle({ httpMethod: "GET", path: "/.netlify/functions/reglookup", queryStringParameters: { vrm: "ab12 cde" } });
check("query form (?vrm=) works and the plate is normalised", queryForm.statusCode === 200 && JSON.parse(queryForm.body).vrm === "AB12CDE", queryForm.body);
const otherSite = await createProxy({ apiKey: KEY, fetchImpl: async () => { throw new Error("must not be called"); }, logger: () => {} }).handle({ httpMethod: "GET", path: "/api/reglookup/AB12CDE", headers: { origin: "https://not-our-site.example" } });
check("a browser caller from another site -> 403, no billed lookup", otherSite.statusCode === 403 && JSON.parse(otherSite.body).proxyError === "forbidden", otherSite.body);
const curlLike = await createProxy({ apiKey: KEY, fetchImpl: upstream(200, REG_PAYLOAD), logger: () => {} }).handle({ httpMethod: "GET", path: "/api/reglookup/AB12CDE" });
check("no referer/origin (server-side caller) is allowed", curlLike.statusCode === 200, curlLike.body.slice(0, 80));
const limited = createProxy({ apiKey: KEY, maxPerMinute: 2, fetchImpl: upstream(200, REG_PAYLOAD), logger: () => {} });
await limited.handle(okEvent);
await limited.handle(okEvent);
const limitedRes = await limited.handle(okEvent);
check("per-caller rate limit -> honest 429, no billed lookup", limitedRes.statusCode === 429 && JSON.parse(limitedRes.body).proxyError === "rate_limited", limitedRes.body);

// ── the key must never be logged, by the default logger or by ours ──────────
const spyLines: string[] = [];
const spyLogger = (code: string, status: number) => spyLines.push(`${code} ${status}`);
for (const holder of [
  createProxy({ apiKey: KEY, fetchImpl: async () => { throw new Error("boom"); }, logger: spyLogger }),
  createProxy({ apiKey: KEY, fetchImpl: upstream(404, { error: true }), logger: spyLogger }),
  createProxy({ apiKey: KEY, fetchImpl: upstream(200, REG_PAYLOAD), logger: spyLogger }),
  createProxy({ apiKey: KEY, fetchImpl: async () => { throw new Error("boom"); } }),
]) {
  await holder.handle(okEvent);
}
const originalLog = console.log;
const defaultLogged: string[] = [];
console.log = (...args: unknown[]) => defaultLogged.push(args.join(" "));
try {
  await createProxy({ apiKey: KEY, fetchImpl: async () => { throw new Error("boom"); } }).handle(okEvent);
  await createProxy({ apiKey: KEY, fetchImpl: upstream(200, REG_PAYLOAD) }).handle(okEvent);
} finally {
  console.log = originalLog;
}
check("the key is NEVER logged (explicit logger, default logger, every path)", ![...spyLines, ...defaultLogged].join("\n").includes(KEY), JSON.stringify([...spyLines, ...defaultLogged]));
check("logs name the outcome only — never the plate", ![...spyLines, ...defaultLogged].join("\n").includes("AB12CDE"), JSON.stringify([...spyLines, ...defaultLogged]));
check("default logger did log the outcome (it isn't silently swallowing everything)", defaultLogged.length >= 2, JSON.stringify(defaultLogged));
const netlifyEntry = await proxyMod.handler(okEvent);
const netlifyBody = JSON.parse(netlifyEntry.body) as Record<string, unknown>;
check("Netlify entry point (committed template, no key) honestly reports 503 not-configured JSON", netlifyEntry.statusCode === 503 && netlifyBody.n2proxy === 1 && netlifyBody.proxyError === "not_configured", netlifyEntry.body.slice(0, 120));

// ── DEMO FLEET ↔ PRODUCT FITMENT RECORDS (dropdown → verdict, end to end) ───
// The dropdown options (DEMO_FLEET, src/data/demo-fleet.ts) and the per-product
// sample fitment records (src/data/products.ts) must agree
// character-for-character — the verdict looks the chosen make+model up by string
// equality, so any drift silently loses a verdict. These checks round-trip real
// selections through the SAME `checkVehicleFitment` the UI uses, and prove that
// a model which is not listed still gets the honest non-match.
console.log("--- demo fleet / fitment records ---");
const fleetMakes = Object.keys(DEMO_FLEET);
/**
 * Exact make → model counts for the demo fleet.
 *
 * The first 13 makes (Audi … Vauxhall) are the ORIGINAL fleet — every one of
 * their model strings must stay exactly as it was, because existing product
 * fitment records, live database rows and bookmarked model selections all match
 * by string equality. BYD's two additions and the 27 makes below it are the
 * owner's 2026-09-17 expansion (Tesla / Xpeng / Polestar / NIO / Zeekr / Smart +
 * broad UK coverage). A count here is a cheap tripwire: adding or dropping a
 * model without updating it fails the suite.
 */
const EXPECTED_FLEET_COUNTS: Record<string, number> = {
  // ── original 13 (unchanged, apart from BYD's two new models) ──
  Audi: 23,
  BMW: 20,
  BYD: 7,
  Changan: 4,
  Chery: 3,
  Ford: 8,
  Kia: 6,
  "Mercedes-Benz": 16,
  MG: 5,
  Nissan: 8,
  Toyota: 8,
  Volkswagen: 10,
  Vauxhall: 6,
  // ── added 2026-09-17: electric-first + broad UK coverage ──
  Tesla: 4,
  Xpeng: 3,
  Polestar: 3,
  NIO: 4,
  Zeekr: 3,
  Smart: 2,
  Honda: 6,
  Hyundai: 9,
  SEAT: 5,
  "Škoda": 8,
  Renault: 8,
  Peugeot: 8,
  "Citroën": 7,
  Volvo: 9,
  Jaguar: 7,
  "Land Rover": 8,
  Mini: 6,
  Porsche: 7,
  Lexus: 8,
  Dacia: 4,
  Suzuki: 7,
  Mazda: 9,
  Jeep: 5,
  "Alfa Romeo": 5,
  Fiat: 6,
  Subaru: 7,
  Mitsubishi: 5,
};
const actualCounts = Object.fromEntries(fleetMakes.map((m) => [m, modelsForMake(m).length]));
const fleetTotal = fleetMakes.reduce((n, m) => n + modelsForMake(m).length, 0);
check(
  "fleet covers every briefed make (and only those)",
  fleetMakes.length === Object.keys(EXPECTED_FLEET_COUNTS).length &&
    Object.keys(EXPECTED_FLEET_COUNTS).every((m) => fleetMakes.includes(m)),
  fleetMakes.join(", "),
);
check(
  "every make offers exactly the briefed number of models",
  Object.entries(EXPECTED_FLEET_COUNTS).every(([m, n]) => modelsForMake(m).length === n),
  JSON.stringify(actualCounts),
);
check("287 models across the fleet (was 122)", fleetTotal === 287, String(fleetTotal));
check(
  "no duplicate or blank model strings in any make",
  fleetMakes.every((m) => {
    const list = modelsForMake(m);
    return list.every((s) => s.trim() !== "") && new Set(list).size === list.length;
  }),
);
/** A sample of the owner-listed models, checked string-for-string. */
const MUST_HAVE: Record<string, string[]> = {
  Audi: ["A3", "A4", "A5", "S3", "RS6", "Q5", "Q8"],
  BMW: ["1 Series", "3 Series", "M4", "X5", "X7"],
  "Mercedes-Benz": ["A180", "A200", "A45", "C63", "GLC", "EQB"],
  Volkswagen: ["Golf", "Golf R", "ID.3", "T-Roc"],
  Nissan: ["Qashqai", "Ariya", "Skyline"],
  Toyota: ["RAV4", "C-HR", "Land Cruiser"],
  Ford: ["Puma", "Ranger", "Transit"],
  Kia: ["EV6", "Sorento"],
  MG: ["MG3", "MG5"],
  Vauxhall: ["Insignia", "Grandland"],
  BYD: ["Atto 3", "Dolphin", "Seal", "Han", "Tang", "Seal U", "Sealion 7"],
  Changan: ["UNI-V", "UNI-K"],
  Chery: ["Tiggo 7", "Tiggo 8"],
  // The makes/models the owner named for the expansion (2026-09-17).
  Tesla: ["Model 3", "Model Y", "Model S", "Model X"],
  Xpeng: ["G6", "G9", "P7"],
  Polestar: ["2", "3", "4"],
  NIO: ["ET5", "ET7", "ES6", "ES8"],
  Zeekr: ["001", "009", "X"],
  Smart: ["#1", "#3"],
  Honda: ["Civic", "Jazz", "CR-V"],
  Hyundai: ["i20", "Tucson", "Ioniq 5"],
  "Škoda": ["Octavia", "Superb", "Kodiaq"],
  Peugeot: ["208", "3008"],
  Volvo: ["XC40", "XC90"],
  "Land Rover": ["Defender", "Range Rover Evoque"],
  Porsche: ["911", "Macan"],
  Lexus: ["IS", "RX"],
  Mazda: ["Mazda3", "CX-5", "MX-5"],
  Dacia: ["Sandero", "Duster"],
  Suzuki: ["Swift", "Vitara"],
  "Alfa Romeo": ["Giulia", "Stelvio"],
  Fiat: ["500", "Panda"],
  Subaru: ["Impreza", "Forester"],
  Mitsubishi: ["Lancer", "Outlander"],
  Renault: ["Clio", "Captur"],
  "Citroën": ["C3", "Berlingo"],
  SEAT: ["Ibiza", "Leon"],
  Jaguar: ["XE", "F-Pace"],
  Mini: ["Cooper", "Countryman"],
  Jeep: ["Renegade", "Wrangler"],
};
const missingBriefed = Object.entries(MUST_HAVE).flatMap(([m, list]) =>
  list.filter((x) => !modelsForMake(m).includes(x)).map((x) => `${m} ${x}`),
);
check("every briefed model is offered, string-for-string", missingBriefed.length === 0, missingBriefed.join(", "));
check(
  "the pre-existing model strings are unchanged (existing records keep their verdict)",
  ["A3", "A4", "Q5"].every((m) => modelsForMake("Audi").includes(m)) &&
    modelsForMake("BMW").includes("3 Series") &&
    modelsForMake("Mercedes-Benz").includes("A-Class") &&
    modelsForMake("Volkswagen").includes("Golf") &&
    modelsForMake("Nissan").includes("Qashqai"),
);
// Records ↔ fleet: every record must be selectable in the dropdown. Covers
// wheels, TYRES (they carry sample records since the tyres-first change) and
// packages — a record that isn't a dropdown option is an orphan the UI can never
// reach, and it would silently break the "no record yet" honest path.
const allFitmentProducts = [...demoWheels, ...demoTypes, ...demoPackages];
const withRecords = allFitmentProducts.filter((p) => (p.vehicleFitments ?? []).length > 0);
const orphanRecords = allFitmentProducts.flatMap((p) =>
  (p.vehicleFitments ?? [])
    .filter((f) => !modelsForMake(f.make).includes(f.model))
    .map((f) => `${p.id}:${f.make} ${f.model}`),
);
check("no fitment record drifts from the dropdown (make+model always selectable)", orphanRecords.length === 0, orphanRecords.join(", "));
// The verdict round-trips — this is exactly what the customer sees.
const wheelById = (id: string) => demoWheels.find((w) => w.id === id);
const pkgById = (id: string) => demoPackages.find((p) => p.id === id);
const verdictFor = (
  product:
    | { vehicleFitments?: { make: string; model: string; yearsStart?: number; yearsEnd?: number }[] }
    | undefined,
  make: string,
  model: string,
  year?: number,
) => checkVehicleFitment(product?.vehicleFitments, make, model, year).kind;
const VX9 = wheelById("w-vortex-vx9-19");
check("Audi A4 → verdict on the Vortex VX-9", verdictFor(VX9, "Audi", "A4") === "compatible");
check("BMW M4 → verdict on the Vortex VX-9", verdictFor(VX9, "BMW", "M4") === "compatible");
check("Mercedes-Benz A180 → verdict on the Vortex VX-9", verdictFor(VX9, "Mercedes-Benz", "A180") === "compatible");
check("Volkswagen Tiguan → verdict on the Vortex VX-9", verdictFor(VX9, "Volkswagen", "Tiguan") === "compatible");
check("Nissan X-Trail → verdict on the Vortex VX-9", verdictFor(VX9, "Nissan", "X-Trail") === "compatible");
check("Toyota Supra → verdict on the Vortex VX-9", verdictFor(VX9, "Toyota", "Supra") === "compatible");
check("Audi Q5 → verdict on the Forza R1", verdictFor(wheelById("w-forza-r1-18"), "Audi", "Q5") === "compatible");
check("Mercedes-Benz GLC → verdict on the Forza R1", verdictFor(wheelById("w-forza-r1-18"), "Mercedes-Benz", "GLC") === "compatible");
check("Audi A4 → verdict on the Turbo T-6", verdictFor(wheelById("w-turbo-t6-19"), "Audi", "A4") === "compatible");
check("Audi A4 → verdict on the Track Day pack", verdictFor(pkgById("pkg-track-day"), "Audi", "A4") === "compatible");
check("the verdict is case-insensitive, as the UI sends it", verdictFor(VX9, "audi", "a4") === "compatible");
// Honest non-matches — a verdict is never fabricated.
check("a model in no record → 'not-listed', never 'compatible'", verdictFor(VX9, "Chery", "Omoda 5") === "not-listed");
check("an unlisted model on the Forza R1 → 'not-listed'", verdictFor(wheelById("w-forza-r1-18"), "Chery", "Tiggo 8") === "not-listed");
check(
  "a make the product does not list → 'not-listed' (no blanket German fitment)",
  verdictFor(wheelById("w-turbo-t6-19"), "BMW", "3 Series") === "not-listed",
);
check("a record-free product → 'no-data' (the honest 'we'll verify' path)", verdictFor(pkgById("pkg-gt-sport"), "Audi", "A4") === "no-data");
check(
  "the Street Pro pack keeps only its original records",
  verdictFor(pkgById("pkg-street-pro"), "Audi", "A4") === "not-listed" &&
    verdictFor(pkgById("pkg-street-pro"), "Ford", "Fiesta") === "compatible",
);
check(
  "a year outside a record's range → 'not-listed'",
  verdictFor(wheelById("w-forza-r1-18"), "BMW", "3 Series", 2018) === "compatible" &&
    verdictFor(wheelById("w-forza-r1-18"), "BMW", "3 Series", 1996) === "not-listed",
);
check(
  "Apex A-7: the 5x100 record matches old Golfs only",
  verdictFor(wheelById("w-apex-a7-18"), "Volkswagen", "Golf", 2000) === "compatible" &&
    verdictFor(wheelById("w-apex-a7-18"), "Volkswagen", "Golf", 2022) === "not-listed",
);

// ── TYRES AS THE MAIN LINE: the same vehicle must answer for BOTH lines ─────
// Owner direction 2026-09-17 — tyres are the main product, wheels the bonus
// line, and one make/model selection has to produce matches for both. These
// round-trips run through the SAME `checkVehicleFitment` verdict the product
// pages use, so a tyre and a wheel answer for the same vehicle the same way.
const tyreById = (id: string) => demoTypes.find((t) => t.id === id);
check("every tyre carries sample fitment records", demoTypes.every((t) => (t.vehicleFitments ?? []).length > 0));
check("Tesla Model 3 → a TYRE verdict (SP-02 XL)", verdictFor(tyreById("t-strada-sp02"), "Tesla", "Model 3") === "compatible");
check("Tesla Model 3 → a WHEEL verdict (Vortex VX-9)", verdictFor(VX9, "Tesla", "Model 3") === "compatible");
check("Xpeng G6 → a TYRE verdict (SP-01)", verdictFor(tyreById("t-strada-sp01"), "Xpeng", "G6") === "compatible");
check("Xpeng G6 → a WHEEL verdict (Forza R1)", verdictFor(wheelById("w-forza-r1-18"), "Xpeng", "G6") === "compatible");
check("Polestar 2 → a WHEEL verdict (Turbo T-6)", verdictFor(wheelById("w-turbo-t6-19"), "Polestar", "2") === "compatible");
check("Polestar 2 → a TYRE verdict (SP-02 XL)", verdictFor(tyreById("t-strada-sp02"), "Polestar", "2") === "compatible");
check("BYD Seal → a TYRE verdict (SP-01)", verdictFor(tyreById("t-strada-sp01"), "BYD", "Seal") === "compatible");
check("Zeekr 001 → a WHEEL verdict (Track Day pack)", verdictFor(pkgById("pkg-track-day"), "Zeekr", "001") === "compatible");
check(
  "the EV makes were NOT bolted onto the small-car wheel patterns",
  ["w-grip-g9-16", "w-apex-a7-18", "w-drifter-d5-17"].every((id) =>
    ["Tesla Model 3", "Xpeng G6", "Polestar 2", "NIO ET5"].every(
      (v) => verdictFor(wheelById(id), v.split(" ")[0], v.split(" ").slice(1).join(" ")) === "not-listed",
    ),
  ),
);
check(
  "a 16\" tyre is not claimed for a large EV → honest 'not-listed'",
  verdictFor(tyreById("t-allgrip-ag4"), "Tesla", "Model 3") === "not-listed",
);
// The dual-results helper the homepage search and /fitment both render.
const dualTesla = fitmentResultsFor({ make: "Tesla", model: "Model 3", year: 2022 });
const dualXpeng = fitmentResultsFor({ make: "Xpeng", model: "G6" });
check(
  "dual search: Tesla Model 3 returns tyres AND wheels",
  dualTesla.tyres.items.length > 0 && dualTesla.wheels.items.length > 0,
  `${dualTesla.tyres.items.length} tyres / ${dualTesla.wheels.items.length} wheels`,
);
check(
  "dual search: Xpeng G6 returns tyres AND wheels",
  dualXpeng.tyres.items.length > 0 && dualXpeng.wheels.items.length > 0,
  `${dualXpeng.tyres.items.length} tyres / ${dualXpeng.wheels.items.length} wheels`,
);
check(
  "dual search: every tyre/wheel listed is genuinely compatible",
  dualTesla.tyres.items.every(
    (t) => checkVehicleFitment(t.vehicleFitments, "Tesla", "Model 3", 2022).kind === "compatible",
  ) &&
    dualTesla.wheels.items.every(
      (w) => checkVehicleFitment(w.vehicleFitments, "Tesla", "Model 3", 2022).kind === "compatible",
    ),
);
check(
  "dual search: an unknown vehicle yields EMPTY groups (never an invented match)",
  (() => {
    const r = fitmentResultsFor({ make: "Tesla", model: "Cybertruck" });
    return r.tyres.items.length === 0 && r.wheels.items.length === 0 && r.packages.items.length === 0;
  })(),
);
check(
  "dual search: a make we hold no records for still reports the honest counts",
  (() => {
    const r = fitmentResultsFor({ make: "NotAMake", model: "NotAModel" });
    return r.tyres.withRecords > 0 && r.tyres.items.length === 0 && r.wheels.items.length === 0;
  })(),
);
// The plate path is untouched: no vehicle is ever invented from a registration.
const demoPlate = await demoProvider.lookupVehicleByReg("AB12CDE");
check(
  "a plate is still never turned into a vehicle ('unavailable', no vehicle)",
  demoPlate.status === "unavailable" && !demoPlate.vehicle,
  JSON.stringify(demoPlate),
);
const coveredVariants = new Set(
  withRecords.flatMap((p) => (p.vehicleFitments ?? []).map((f) => `${f.make} ${f.model}`)),
);
console.log(
  `  … ${withRecords.length} products carry sample fitment records covering ${coveredVariants.size} make/model variants`,
);
console.log("---");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fails.length) console.log(fails.map((f) => ` - ${f}`).join("\n"));
process.exit(fail === 0 ? 0 : 1);
