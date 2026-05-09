"use client";
import { WagmiProvider, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "@/lib/network";

const config = getDefaultConfig({
  appName: "Arc Capital",
  projectId: "YOUR_PROJECT_ID",
  ssr: true,
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(ARC_TESTNET_RPC_URL),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
