"use client";

import "@rainbow-me/rainbowkit/styles.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TransactionToastHost } from "@/components/transaction-toast";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/network";

const navItems = [
  { href: "/vaults", label: "Vaults" },
  { href: "/deals", label: "Deals" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/#principles", label: "Docs" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { address, chain, isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  const userNavItems = mounted && isConnected
    ? [...navItems, { href: "/portfolio", label: "Portfolio" }]
    : navItems;
  const expectedChainId = ARC_TESTNET_CHAIN_ID;
  const networkLabel = !mounted || !address
    ? "Wallet disconnected"
    : chain?.id === expectedChainId
      ? chain.name
      : "Wrong network";
  const networkOk = mounted && Boolean(address) && chain?.id === expectedChainId;

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.dispatchEvent(new CustomEvent("arc:data-refresh"));
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [mounted, pathname]);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-transparent backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-3 py-5 sm:gap-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-max items-center gap-2 pr-3 text-lg font-normal tracking-normal sm:gap-3 sm:pr-5 sm:text-xl md:border-r md:border-white/[0.08]">
            <span className="relative grid h-8 w-8 overflow-hidden rounded-sm border border-white/[0.12] bg-transparent">
              <img
                src="/arc-capital-logo.png"
                alt=""
                className="h-full w-full scale-[2.6] object-cover"
                aria-hidden="true"
              />
            </span>
            <span className="font-display">Arc Capital</span>
          </Link>
          <nav className="hidden flex-1 items-center justify-center gap-7 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden">
            {userNavItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    "mono-label relative whitespace-nowrap py-2 text-[11px] text-[var(--muted)] transition hover:text-[var(--foreground)]",
                    active && "text-[var(--foreground)] after:absolute after:inset-x-0 after:-bottom-5 after:h-px after:bg-[var(--accent)]"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div
              className={cn(
                "mono-label hidden items-center rounded-md border border-white/[0.12] px-3 py-2 text-[10px] md:flex",
                networkOk
                  ? "text-[var(--foreground)]"
                  : "text-[var(--muted)]",
              )}
            >
              <span className={cn("mr-2 inline-block h-1.5 w-1.5 rounded-full", networkOk ? "bg-[var(--accent)]" : "bg-[var(--muted)]")} />
              {networkLabel}
            </div>
            <ConnectButton.Custom>
              {({ account, mounted: walletMounted, openAccountModal, openConnectModal }) => {
                const ready = mounted && walletMounted;
                const connected = ready && account;

                if (!connected) {
                  return (
                    <button
                      type="button"
                      onClick={openConnectModal}
                      className="arc-button-outline mono-label flex-shrink-0 rounded-md px-2.5 py-2 text-[10px] transition sm:px-4 sm:text-[11px]"
                    >
                      <span className="sm:hidden">Connect</span>
                      <span className="hidden sm:inline">Connect Wallet</span>
                    </button>
                  );
                }

                return (
                  <button
                    type="button"
                    onClick={openAccountModal}
                    className="arc-button-outline flex min-w-0 flex-shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-xs transition sm:px-3"
                  >
                    <span>{account.displayBalance}</span>
                    <span className="h-1 w-1 rounded-full bg-[var(--muted)]" />
                    <span>{account.displayName}</span>
                  </button>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </header>
      <main key={pathname} className="mx-auto w-full max-w-7xl overflow-x-hidden px-4 py-12 sm:px-6 lg:px-8">{children}</main>
      <TransactionToastHost />
    </div>
  );
}
