export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ATTESTER_LOOP !== "on") return;
  const { startLoop } = await import("./lib/attester");
  startLoop();
}
