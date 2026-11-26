"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { useSignMessage } from "wagmi";
import { postJson, type ChatReply } from "@/hooks/useApi";
import { useNow } from "@/hooks/useNow";
import { MAX_ACCESS_SECONDS, buildAccessMessage } from "@/lib/accessMessage";
import { deployment } from "@/lib/deployment";
import { explainWalletError } from "@/lib/walletErrors";
import { ChatBox } from "./ChatBox";
import { Icon } from "./icons";
import { Button, Card, CardHead, Notice } from "./ui";

const CHIPS = [
  "Buy $50 of gold.",
  "Buy $150 of gold.",
  "Buy $50 of tEQUITY.",
  "Buy $20 of tEQUITY.",
  "Buy $20 of gold.",
  "Buy $20 of gold on the rogue venue.",
];

export function ChatPanel({ owner, mandateId }: { owner: Address | undefined; mandateId: bigint | null }) {
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const now = useNow();
  const [pass, setPass] = useState<{ owner: Address; expires: number; signature: string } | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = pass !== null && pass.owner === owner && pass.expires > now;

  const sign = async () => {
    if (mandateId === null || !owner) return;
    setSigning(true);
    setError(null);
    try {
      // A little under the server's maximum, so a clock difference does not matter.
      const expires = Math.floor(Date.now() / 1000) + MAX_ACCESS_SECONDS - 120;
      const message = buildAccessMessage({ mandateId: mandateId.toString(), expires, guard: deployment.policyGuard });
      setPass({ owner, expires, signature: await signMessageAsync({ message }) });
    } catch (e) {
      setError(explainWalletError(e, now).replace("The transaction did not go through. Nothing changed.", "The wallet did not sign. Try again."));
    } finally {
      setSigning(false);
    }
  };

  const gate =
    mandateId === null ? (
      <p className="text-muted">Create a mandate first. The chat opens for its owner.</p>
    ) : open ? undefined : (
      <div className="space-y-2">
        <Button tone="primary" className="w-full" disabled={signing} onClick={sign}>{signing ? "Waiting for wallet" : "Sign to chat"}</Button>
        <p className="text-center text-[13px] text-muted">One free signature proves you own mandate {mandateId.toString()}. It lasts an hour and moves no money.</p>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    );

  return (
    <Card className="flex min-h-[560px] flex-col">
      <CardHead
        title={
          <>
            <Icon name="bot" size={18} />
            Agent
          </>
        }
        aside={<span className="cap mono">signs its own trades · cannot withdraw</span>}
      />
      <ChatBox
        chips={CHIPS}
        empty={
          <div className="max-w-[46ch]">
            <Icon name="bot" size={36} className="mx-auto mb-3 text-faint" />
            <p className="text-lg font-bold tracking-[-0.02em] text-text">Ask it to buy something</p>
            <p className="mt-1">Also something your rules forbid. Every attempt goes through the guard and is recorded on-chain.</p>
          </div>
        }
        disabled={gate}
        send={(messages) =>
          postJson<ChatReply>("/api/chat", { mandateId: mandateId!.toString(), expires: pass!.expires, signature: pass!.signature, messages })
        }
        onReply={() => void queryClient.invalidateQueries()}
      />
    </Card>
  );
}
