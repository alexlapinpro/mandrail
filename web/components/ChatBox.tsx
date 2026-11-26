"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Action } from "@/lib/agent/run";
import type { ChatReply } from "@/hooks/useApi";
import { usePendingChanges } from "@/lib/pendingChanges";
import { chatPayload } from "@/lib/chatPayload";
import { chatFailure } from "@/lib/chatFailure";
import { ActionCard } from "./ActionCard";
import { Button, Notice } from "./ui";

interface Turn {
  role: "user" | "assistant";
  content: string;
  actions?: Action[];
}

interface Props {
  send: (messages: { role: "user" | "assistant"; content: string }[]) => Promise<ChatReply>;
  chips: string[];
  empty: string;
  disabled?: ReactNode;
  onReply?: () => void;
}

const MAX = 2000;

export function ChatBox({ send, chips, empty, disabled, onReply }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const waiting = usePendingChanges() > 0;
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (turns.length) end.current?.scrollIntoView({ block: "nearest" });
  }, [turns, busy]);

  const submit = async () => {
    const content = text.trim();
    if (!content || busy || waiting || disabled) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setText("");
    setError(null);
    setBusy(true);
    try {
      const reply = await send(chatPayload(next));
      setTurns([...next, { role: "assistant", content: reply.message, actions: reply.actions }]);
    } catch (e) {
      const { text: advice, restore } = chatFailure(e);
      setError(advice);
      if (restore) {
        setTurns(turns);
        setText(content);
      }
    } finally {
      setBusy(false);
      onReply?.();
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-h-[62vh] min-h-[240px] space-y-4 overflow-y-auto bg-sunken p-4" aria-live="polite">
        {turns.length === 0 && <p className="max-w-[52ch] text-muted">{empty}</p>}
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <p key={i} className="ml-auto w-fit max-w-[85%] bg-signal px-3 py-2 text-sunken">{turn.content}</p>
          ) : (
            <div key={i} className="max-w-[92%] space-y-2">
              {turn.actions?.map((action, j) => <ActionCard key={j} action={action} />)}
              {turn.content && <p className="whitespace-pre-wrap px-1">{turn.content}</p>}
            </div>
          ),
        )}
        {busy && <p className="text-muted">The agent is working. A trade takes a few seconds to reach the chain…</p>}
        <div ref={end} />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {waiting && !disabled && <Notice tone="info">Waiting for your wallet change to be confirmed, so the agent trades under the new rules.</Notice>}
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={busy}
            onClick={() => setText(chip)}
            className="rounded-sm border border-seam px-2.5 py-1 text-left text-sm text-muted hover:border-signal hover:text-paint disabled:opacity-45"
          >
            {chip}
          </button>
        ))}
      </div>
      {disabled ?? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input aria-label="Message to the agent" className="field" maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell the agent what to buy" />
          <Button tone="signal" type="submit" disabled={busy || waiting || !text.trim()}>{busy ? "Working" : waiting ? "Waiting" : "Send"}</Button>
        </form>
      )}
    </div>
  );
}
