import "server-only";

const MAX_BODY = 100_000;

/** JSON response with bigints as decimal strings. Never cached. */
export function json(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
    { status, headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}

export const fail = (status: number, error: string, extra: object = {}) => json({ error, ...extra }, status);

/** Null when the body is too large or not a JSON object. */
export async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Log the kind of error only: messages of SDK and RPC errors can carry keys and URLs. */
export function logError(where: string, error: unknown): void {
  const status = (error as { status?: unknown }).status;
  console.error(`[${where}] ${(error as Error).name}${typeof status === "number" ? ` ${status}` : ""}`);
}
