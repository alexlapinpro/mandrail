/** What to tell the user, and whether the typed text may come back for another try. */
export function chatFailure(error: unknown): { text: string; restore: boolean } {
  const { status, message, retryAfter } = error as { status?: number; message?: string; retryAfter?: number };
  if (status !== undefined && status >= 400 && status < 500) {
    return { text: `${message}${retryAfter ? ` Try again in ${retryAfter} s.` : ""}`, restore: true };
  }
  const what = status === undefined ? "The server did not answer." : message;
  return { text: `${what} Check the decisions on-chain before you repeat a trade.`, restore: false };
}
