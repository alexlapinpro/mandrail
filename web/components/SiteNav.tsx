"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { explainWalletError } from "@/lib/walletErrors";
import { Icon, Logo } from "./icons";
import { Button, Notice, Pill } from "./ui";

const REPO = "https://github.com/alexlapinpro/mandrail";

export function SiteNav({ wallet = false }: { wallet?: boolean }) {
  const path = usePathname();
  const link = (href: string, label: string) => (
    <Link href={href} className={`transition hover:text-text ${path === href ? "text-text" : ""}`}>
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-30">
      <p className="border-b border-signal/20 bg-[#151405] px-4 py-1 text-center text-[12.5px] font-medium text-signal">
        Testnet demo. All tokens are test assets, not real securities or products.
      </p>
      <nav className="flex flex-wrap items-center gap-x-7 gap-y-2 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-md sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-xl font-extrabold tracking-[-0.035em]">
          <Logo />
          Mandrail
        </Link>
        <div className="hidden items-center gap-6 text-[14.5px] font-medium text-muted md:flex">
          {link("/app", "App")}
          {link("/break", "Break my agent")}
          <a href={`${REPO}#readme`} target="_blank" rel="noreferrer" className="transition hover:text-text">
            Docs
          </a>
          <a href={REPO} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition hover:text-text">
            <Icon name="github" size={15} />
            GitHub
          </a>
        </div>
        <span className="flex-1" />
        {wallet ? (
          <Wallet />
        ) : (
          <div className="flex items-center gap-3">
            <Pill tone="ok" live className="hidden sm:inline-flex">
              BSC testnet live
            </Pill>
            <Link href="/app">
              <Button tone="primary">Launch app</Button>
            </Link>
          </div>
        )}
      </nav>
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
      <div className="flex items-center gap-2">
        {!isConnected ? (
          <Button tone="primary" disabled={isPending} onClick={() => attempt(() => connectAsync({ connector: connectors[0]! }))}>
            {isPending ? "Waiting for wallet" : "Connect wallet"}
          </Button>
        ) : (
          <>
            {chainId === bscTestnet.id ? (
              <Pill className="hidden sm:inline-flex">BSC testnet</Pill>
            ) : (
              <Button tone="primary" size="sm" disabled={switching} onClick={() => attempt(() => switchChainAsync({ chainId: bscTestnet.id }))}>
                Switch to BSC testnet
              </Button>
            )}
            <Button size="sm" className="mono" onClick={() => disconnect()} title="Disconnect">
              {address!.slice(0, 6)}…{address!.slice(-4)}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
