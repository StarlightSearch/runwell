declare const __RUNWELL_VERSION__: string | undefined;

/** Read from package.json at build time (esbuild `define`); "0.0.0-dev" under Vitest. */
export const VERSION: string =
  typeof __RUNWELL_VERSION__ === "string" ? __RUNWELL_VERSION__ : "0.0.0-dev";
