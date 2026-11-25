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
import { Button, Notice, Panel, SignedBy } from "./ui";

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
        <Button tone="signal" disabled={signing} onClick={sign}>{signing ? "Waiting for wallet" : "Sign to chat"}</Button>
        <p className="text-sm text-muted">One free signature proves you own mandate {mandateId.toString()}. It lasts an hour and moves no money.</p>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    );

  return (
    <Panel title="Your agent" aside={<SignedBy who="agent" />}>
      <ChatBox
        chips={CHIPS}
        empty="The agent trades with its own key and can only go through the guard. Ask it to buy something, also something your rules forbid: every attempt is checked and recorded on-chain."
        disabled={gate}
        send={(messages) =>
          postJson<ChatReply>("/api/chat", { mandateId: mandateId!.toString(), expires: pass!.expires, signature: pass!.signature, messages })
        }
        onReply={() => void queryClient.invalidateQueries()}
      />
    </Panel>
  );
}
