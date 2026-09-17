/**
 * N2 Wheels — tiny client-env reader for the vehicle-lookup provider layer.
 *
 * Kept in its own module so provider adapters can read Vite client env without
 * importing the seam module back (no circular runtime import). Vite replaces
 * `import.meta.env` at build time with the configured VITE_* variables; under
 * Bun (test scripts) `import.meta.env` mirrors process.env, so the same code
 * works in both places.
 */
export type ClientEnv = Record<string, string | boolean | undefined>;

/** The client env object (import.meta.env); {} when absent. */
export function readClientEnv(): ClientEnv {
  const env = (import.meta as unknown as { env?: ClientEnv }).env;
  return env ?? {};
}

/** A trimmed non-empty string from the env, else undefined. */
export function envString(env: ClientEnv, key: string): string | undefined {
  const v = env[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}
