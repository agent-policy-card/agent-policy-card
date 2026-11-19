import { createConfig, fallback, http } from "wagmi";
import { bsc } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { RPC_URLS } from "./chain";

// Injected connector only: the guardian's ordinary browser wallet. No WalletConnect.
export const wagmiConfig = createConfig({
  chains: [bsc],
  connectors: [injected()],
  transports: { [bsc.id]: fallback(RPC_URLS.map((u) => http(u))) },
});
