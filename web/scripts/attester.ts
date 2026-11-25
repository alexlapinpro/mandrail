/** Standalone price loop for local use: `pnpm attester`, or `pnpm attester --once`. */
import "./loadEnv";
import { attester, startLoop } from "../lib/attester";

async function main(): Promise<void> {
  if (!process.argv.includes("--once")) return startLoop();
  const result = await attester().pushNow("manual");
  console.log(result.status);
  process.exit(result.status === "pushed" ? 0 : 1);
}

void main();
