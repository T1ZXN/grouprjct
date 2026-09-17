#!/usr/bin/env bun
/**
 * scripts/test-reglookup.ts — verification for the LIVE vehicle-lookup adapters.
 *
 * Covers, with NO network calls and NO API keys:
 *   1. shape mapping   — documented reg payload -> Vehicle; documented fits payload -> FitmentOption[]
 *   2. live-mode gating — no key = demo mode; VITE_REG_LOOKUP_KEY or VITE_FITS_API_KEY = live mode
 *                        (gating is checked in real child processes, so it exercises the real seam)
 *   3. error honesty   — 5xx / unreachable / unreadable payloads throw honest errors and NEVER
 *                        return a fabricated vehicle or fitment; 404 -> honest "no-match" with no vehicle
 *   4. demo honesty    — with no key, a plate is never turned into a vehicle and plate input is still validated
 *   5. live endpoint   — real VehicleMatic base URL, the X-VEHICLEMATIC-KEY default (bearer / x-api-key
 *                        still selectable), and 402/403/422 mapped to distinct honest messages
 *
 * No network calls and no real API keys: every provider test injects its transport, and the
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
import { createUkVrmProvider, DEFAULT_UK_VRM_BASE_URL, mapVehicleFromPayload } from "../src/lib/reglookup-ukvrm";
import { createFitsProvider, mapFitmentOptions } from "../src/lib/reglookup-fits";
import { createLiveProvider, LIVE_PROVIDER_ID } from "../src/lib/reglookup-live";

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
function gate(env: Record<string, string>) {
  const snippet = `import {getActiveProvider,isLiveMode,getProviderLabel,lookupVehicleByReg} from "${SITE}/src/lib/reglookup.ts";
const p=getActiveProvider();let o;try{o=await lookupVehicleByReg("AB12CDE");}catch(e){console.log(JSON.stringify({id:p.id,live:isLiveMode(),label:getProviderLabel(),status:"threw",hasVehicle:false,error:String(e&&e.message||e).slice(0,60)}));process.exit(0);}
console.log(JSON.stringify({id:p.id,live:isLiveMode(),label:getProviderLabel(),status:o.status,hasVehicle:Boolean(o.vehicle)}));`;
  const proc = Bun.spawnSync({ cmd: ["bun", "-e", snippet], env: { ...process.env, ...env }, cwd: SITE });
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
 * (with live mode active the in-process call would hit the real provider, and "demo mode"
 * would no longer describe what actually happened). No key is ever printed — the child
 * reports only the provider id, status, notices and the normalised registration.
 */
function seamOutcome(env: Record<string, string>) {
  const snippet = `import {getActiveProvider,isLiveMode,lookupVehicleByReg} from "${SITE}/src/lib/reglookup.ts";
let o;try{o=await lookupVehicleByReg("AB12 CDE");}catch(e){console.log(JSON.stringify({threw:true,id:getActiveProvider().id,live:isLiveMode(),status:"threw",hasVehicle:false,notice:"",registration:""}));process.exit(0);}
console.log(JSON.stringify({threw:false,id:getActiveProvider().id,live:isLiveMode(),status:o.status,hasVehicle:Boolean(o.vehicle),notice:o.notice,registration:o.registration}));`;
  const proc = Bun.spawnSync({ cmd: ["bun", "-e", snippet], env: { ...process.env, ...env }, cwd: SITE });
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
const noKey = gate({ VITE_REG_LOOKUP_KEY: "", VITE_FITS_API_KEY: "" });
check("no key -> demo provider", noKey.id === "demo" && noKey.live === false, JSON.stringify(noKey));
check("no key -> plate lookup unavailable, NO fabricated vehicle", noKey.status === "unavailable" && noKey.hasVehicle === false, JSON.stringify(noKey));

const regKey = gate({ VITE_REG_LOOKUP_KEY: "test-key-not-real", VITE_FITS_API_KEY: "" });
check("VITE_REG_LOOKUP_KEY -> live provider", regKey.id === LIVE_PROVIDER_ID && regKey.live === true, JSON.stringify(regKey));
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
  createUkVrmProvider({ apiKey: "k", fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }) as never }).lookupVehicleByReg("AB12CDE"), /couldn't read/i);
const capped = createUkVrmProvider({ apiKey: "k", sessionLimit: 1, fetchImpl: async () => jsonResponse(200, REG_PAYLOAD) });
await capped.lookupVehicleByReg("AB12CDE");
await expectThrow("per-session cost cap -> honest pause message", () => capped.lookupVehicleByReg("AB12CDE"), /paused for this session/i);
check("auth mode x-api-key is honoured", await (async () => {
  let seen = "";
  const p = createUkVrmProvider({ apiKey: "k2", authMode: "x-api-key", fetchImpl: async (_u, init) => { seen = JSON.stringify(init?.headers); return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return /x-api-key/.test(seen) && !/Bearer/.test(seen) && !/X-VEHICLEMATIC-KEY/.test(seen);
})());
check("auth mode bearer is still selectable via options", await (async () => {
  let seen = "";
  const p = createUkVrmProvider({ apiKey: "k2", authMode: "bearer", fetchImpl: async (_u, init) => { seen = JSON.stringify(init?.headers); return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return /Bearer k2/.test(seen) && !/X-VEHICLEMATIC-KEY/.test(seen);
})());
check("default auth for this (VehicleMatic) adapter sends X-VEHICLEMATIC-KEY", await (async () => {
  let seen = "";
  const p = createUkVrmProvider({ apiKey: "k2", fetchImpl: async (_u, init) => { seen = JSON.stringify(init?.headers); return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return /"X-VEHICLEMATIC-KEY":"k2"/.test(seen) && !/Bearer/.test(seen) && !seen.toLowerCase().includes("x-api-key");
})());
check("VITE_REG_LOOKUP_AUTH can still switch the scheme (bearer via env)", await (async () => {
  let seen = "";
  const p = createUkVrmProvider({ env: { VITE_REG_LOOKUP_KEY: "k3", VITE_REG_LOOKUP_AUTH: "bearer" }, fetchImpl: async (_u, init) => { seen = JSON.stringify(init?.headers); return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return /Bearer k3/.test(seen) && !/X-VEHICLEMATIC-KEY/.test(seen);
})());
check("VITE_REG_LOOKUP_AUTH=x-vehiclematic-key also lands on the VehicleMatic header", await (async () => {
  let seen = "";
  const p = createUkVrmProvider({ env: { VITE_REG_LOOKUP_KEY: "k3", VITE_REG_LOOKUP_AUTH: "x-vehiclematic-key" }, fetchImpl: async (_u, init) => { seen = JSON.stringify(init?.headers); return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return /"X-VEHICLEMATIC-KEY":"k3"/.test(seen);
})());
check("default base url is the live VehicleMatic Vehicle Details endpoint", DEFAULT_UK_VRM_BASE_URL === "https://vehiclematic.com/products/vehicle-details/api/live", DEFAULT_UK_VRM_BASE_URL);
check("default request url = {live base}/{VRM} (no api. subdomain)", await (async () => {
  let url = "";
  const p = createUkVrmProvider({ apiKey: "k2", fetchImpl: async (u) => { url = u; return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return url === `${DEFAULT_UK_VRM_BASE_URL}/AB12CDE` && !/api\.vehiclematic\.com/.test(url);
})());
check("env override supplies base url without code change", await (async () => {
  let url = "";
  const p = createUkVrmProvider({ env: { VITE_REG_LOOKUP_KEY: "k3", VITE_REG_LOOKUP_URL: "https://example.test/vrm" }, fetchImpl: async (u) => { url = u; return jsonResponse(200, REG_PAYLOAD); } });
  await p.lookupVehicleByReg("AB12CDE");
  return url === "https://example.test/vrm/AB12CDE";
})());

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

// Demo mode is asserted in a child process with the key explicitly blanked, so a key
// present in the ambient environment can never make this section hit the live provider.
const demoOutcome = seamOutcome({ VITE_REG_LOOKUP_KEY: "", VITE_FITS_API_KEY: "" });
check("demo mode: plate is never turned into a vehicle", demoOutcome.id === "demo" && demoOutcome.status === "unavailable" && !demoOutcome.hasVehicle, JSON.stringify(demoOutcome));
check("demo mode: honest notice tells the customer to use make/model", /choose your car manually/i.test(demoOutcome.notice), demoOutcome.notice);
check("demo mode: registration is still normalised/returned", demoOutcome.registration === "AB12CDE", demoOutcome.registration);
await expectThrow("demo mode: invalid plate input is still rejected", () => lookupVehicleByReg("!!!bad"), /valid UK registration/i);

console.log("---");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fails.length) console.log(fails.map((f) => ` - ${f}`).join("\n"));
process.exit(fail === 0 ? 0 : 1);
