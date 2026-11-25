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
  webpack(config, { webpack }) {
    // Local chains: use another deployment file than the committed testnet one.
    if (process.env.DEPLOYMENT_FILE) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/deployments[\\/]bsc-testnet\.json$/, process.env.DEPLOYMENT_FILE),
      );
    }
    // Optional React Native and logging modules that wallet libraries mention but the web build never uses.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
