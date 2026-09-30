import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import("next").NextConfig} */
const nextConfig = {
  // The repo root has its own lockfile for the devnet scripts. Pin the app
  // root so Next does not guess the wrong one.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
