/** The guard's checks in the order it runs them. A trade travels along and stops at the first failure. */
const GATES = [
  "Agent",
  "Active",
  "Not expired",
  "Asset",
  "Jurisdiction",
  "Venue",
  "Per trade",
  "Period",
  "Fresh price",
  "Sources agree",
  "Volatility",
  "Balance",
  "Market hours",
] as const;

export interface Gate {
  label: string;
  state: "passed" | "stopped" | "not-reached";
}

/** `reason` is the contract's code: 0 = allowed, 1..13 = the gate that stopped the trade. */
export function railState(reason: number): Gate[] {
  const known = reason >= 0 && reason <= GATES.length;
  return GATES.map((label, i) => {
    if (!known) return { label, state: "not-reached" };
    if (reason === 0 || i < reason - 1) return { label, state: "passed" };
    return { label, state: i === reason - 1 ? "stopped" : "not-reached" };
  });
}
