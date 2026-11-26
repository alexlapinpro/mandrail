interface Row {
  time: number;
  kind: "executed" | "blocked";
  unauthorised: boolean;
}

/** Numbers for the landing page. The latest decision is the newest one made for an agent, not a stranger's call. */
export function overview<T extends Row>(rows: readonly T[], now: number) {
  return {
    total: rows.length,
    blocked: rows.filter((row) => row.kind === "blocked").length,
    lastHour: rows.filter((row) => now - row.time <= 3600).length,
    latest: rows.find((row) => !row.unauthorised) ?? null,
  };
}
