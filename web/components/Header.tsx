"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { explainWalletError } from "@/lib/walletErrors";
import { Button, Notice } from "./ui";

export function Header() {
  return (
    <header>
      <p className="bg-signal px-4 py-1 text-center text-sm font-medium text-sunken">
        Testnet demo. All tokens are test assets, not real securities or products.
      </p>
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-sign text-3xl font-semibold leading-none">
          Mandrail
        </Link>
        <p className="hidden text-muted lg:block">Rules for AI agents, enforced on-chain before they trade</p>
        <nav className="ml-auto flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
          <Link href="/break" className="underline decoration-signal decoration-2 underline-offset-4">
            Break my agent
          </Link>
          <Wallet />
        </nav>
      </div>
    </header>
  );
}

function Wallet() {
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const attempt = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      const missing = /provider not found/i.test((e as Error).message);
      setError(missing ? "No wallet found. Install MetaMask, Trust Wallet or Binance Wallet." : explainWalletError(e, 0));
    }
  };

  if (!mounted) return <Button disabled>Connect wallet</Button>;
  return (
    <div className="contents">
      {error && (
        <div className="order-last basis-full">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {!isConnected ? (
        <Button tone="signal" disabled={isPending} onClick={() => attempt(() => connectAsync({ connector: connectors[0]! }))}>
          {isPending ? "Waiting for wallet" : "Connect wallet"}
        </Button>
      ) : (
        <>
          {chainId !== bscTestnet.id && (
            <Button tone="signal" disabled={switching} onClick={() => attempt(() => switchChainAsync({ chainId: bscTestnet.id }))}>
              Switch to BSC testnet
            </Button>
          )}
          <Button onClick={() => disconnect()} title="Disconnect">
            {address!.slice(0, 6)}…{address!.slice(-4)}
          </Button>
        </>
      )}
    </div>
  );
}
