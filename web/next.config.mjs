import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// One .env at the repository root serves contracts, scripts and the app. Railway sets variables directly.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: { instrumentationHook: true, outputFileTracingRoot: root },
  poweredByHeader: false,
};

export default nextConfig;
