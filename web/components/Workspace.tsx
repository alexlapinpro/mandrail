"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { useMandates } from "@/hooks/useMandate";
import { AuditFeed } from "./AuditFeed";
import { ChatPanel } from "./ChatPanel";
import { MandatePanel } from "./MandatePanel";
import { RiskPanel } from "./RiskPanel";

export function Workspace() {
  const { address, chainId } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const owner = mounted && chainId === bscTestnet.id ? address : undefined;

  const mandates = useMandates(owner);
  const [picked, setPicked] = useState<bigint | null>(null);
  const ids = mandates.data ?? [];
  const selected = picked !== null && ids.includes(picked) ? picked : (ids.at(-1) ?? null);

  return (
    <main className="mx-auto grid max-w-[1560px] gap-x-8 gap-y-10 px-4 pb-12 pt-2 lg:grid-cols-2 xl:grid-cols-[380px_minmax(0,1fr)_400px]">
      <MandatePanel key={owner ?? "none"} owner={owner} connectedElsewhere={mounted && !!address && !owner} ids={ids} selected={selected} onSelect={setPicked} onCreated={() => setPicked(null)} loading={mandates.isLoading} failed={mandates.isError} />
      <ChatPanel key={selected?.toString() ?? "none"} owner={owner} mandateId={selected} />
      <div className="space-y-10 lg:col-span-2 xl:col-span-1">
        <RiskPanel mandateId={selected} />
        <AuditFeed mandateId={selected} />
      </div>
    </main>
  );
}
