import { countdownText } from "./time";

interface Layer {
  name?: string;
  code?: number;
  message?: string;
  cause?: unknown;
  data?: { errorName?: string; args?: readonly unknown[] };
}

function* layers(error: unknown): Generator<Layer> {
  for (let depth = 0; error && typeof error === "object" && depth < 10; depth++) {
    yield error as Layer;
    error = (error as Layer).cause;
  }
}

/** Plain words for a failed wallet action. Never shows raw messages: they contain request data. */
export function explainWalletError(error: unknown, nowSeconds: number): string {
  for (const layer of layers(error)) {
    if (layer.code === 4001 || layer.name === "UserRejectedRequestError") return "You rejected the request in your wallet.";
    switch (layer.data?.errorName) {
      case "FaucetCooldown":
        return `The faucet gives test USD once per hour. Try again in ${countdownText(Number(layer.data.args?.[0] ?? 0) - nowSeconds)}.`;
      case "ERC20InsufficientBalance":
        return "Not enough tUSD in your wallet. Get test USD first.";
      case "ExceedsBalance":
        return "That is more than this mandate holds.";
      case "NotOwner":
        return "Only the owner of this mandate can do that.";
      case "IdentityMismatch":
        return "This identity does not belong to the agent address.";
      case "InvalidParams":
        return "The contract refused these values. Check the limits and the jurisdiction.";
    }
    if (/insufficient funds/i.test(layer.message ?? "")) return "Not enough tBNB for gas in your wallet.";
  }
  return "The transaction did not go through. Nothing changed.";
}
