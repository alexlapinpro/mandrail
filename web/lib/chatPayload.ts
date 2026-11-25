interface Message {
  role: "user" | "assistant";
  content: string;
}

const KEEP = 20;

/**
 * What goes to the agent: answered questions and the newest message. An order without an answer (a lost connection)
 * must not travel along, or the agent could execute it later.
 */
export function chatPayload(turns: readonly Message[]): Message[] {
  const payload: Message[] = [];
  turns.forEach((turn, i) => {
    const next = turns[i + 1];
    const last = i === turns.length - 1;
    const pick = ({ role, content }: Message) => ({ role, content });
    if (turn.role === "user" && last) payload.push(pick(turn));
    else if (turn.role === "user" && next?.role === "assistant" && next.content) payload.push(pick(turn), pick(next));
  });
  const recent = payload.slice(-KEEP);
  return recent[0]?.role === "assistant" ? recent.slice(1) : recent;
}
