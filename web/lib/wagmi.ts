import { createConfig, http, injected } from "wagmi";
import { bscTestnet } from "wagmi/chains";

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://bsc-testnet-rpc.publicnode.com";

export const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [injected()],
  transports: { [bscTestnet.id]: http(RPC, { batch: true }) },
  ssr: true,
  pollingInterval: 1_000,
});
