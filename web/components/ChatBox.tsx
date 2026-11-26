"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Action } from "@/lib/agent/run";
import type { ChatReply } from "@/hooks/useApi";
import { usePendingChanges } from "@/lib/pendingChanges";
import { chatPayload } from "@/lib/chatPayload";
import { chatFailure } from "@/lib/chatFailure";
import { AgentReply } from "./ActionCard";
import { Icon } from "./icons";
import { Button, Notice } from "./ui";

interface Turn {
  role: "user" | "assistant";
  content: string;
  actions?: Action[];
}

interface Props {
  send: (messages: { role: "user" | "assistant"; content: string }[]) => Promise<ChatReply>;
  chips: string[];
  empty: ReactNode;
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-[280px] flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
        {turns.length === 0 && <div className="grid h-full min-h-[220px] place-items-center text-center text-muted">{empty}</div>}
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <p key={i} className="ml-auto w-fit max-w-[85%] rounded-[13px_13px_3px_13px] bg-signal px-3.5 py-2 font-semibold text-[#171204]">
              {turn.content}
            </p>
          ) : (
            <AgentReply key={i} actions={turn.actions ?? []} message={turn.content} />
          ),
        )}
        {busy && (
          <div className="flex items-center gap-2.5 text-muted">
            <span className="grid h-[30px] w-[30px] place-items-center rounded-[9px] border border-line2 bg-raised">
              <Icon name="bot" size={16} />
            </span>
            Checking prices and asking the guard. A trade takes a few seconds to reach the chain…
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="space-y-2 px-5">
        {error && <Notice tone="error">{error}</Notice>}
        {waiting && !disabled && <Notice tone="info">Waiting for your wallet change to be confirmed, so the agent trades under the new rules.</Notice>}
      </div>
      <div className="flex flex-wrap gap-[7px] border-t border-line px-5 pt-3">
        {chips.map((chip, i) => (
          <button
            key={chip}
            type="button"
            disabled={busy}
            onClick={() => setText(chip)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line2 px-3 py-1.5 text-[12.5px] font-medium text-muted transition hover:border-signal hover:text-text disabled:opacity-45"
          >
            <i className="mono text-[10px] not-italic text-faint">{String(i + 1).padStart(2, "0")}</i>
            {chip}
          </button>
        ))}
      </div>
      <div className="px-5 pb-5 pt-3">
        {disabled ?? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              aria-label="Message to the agent"
              className="field !h-[46px] !rounded-[11px]"
              maxLength={MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tell the agent what to buy"
            />
            <Button tone="primary" type="submit" className="!h-[46px] min-w-[52px]" disabled={busy || waiting || !text.trim()} aria-label="Send">
              {busy ? "…" : waiting ? "Waiting" : <Icon name="send" size={18} />}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
