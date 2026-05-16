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
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { address, chain, isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  const userNavItems = mounted && isConnected
    ? [{ href: "/", label: "Dashboard" }, ...navItems, { href: "/portfolio", label: "Portfolio" }]
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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#060b16]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href={mounted && isConnected ? "/" : "/vaults"} className="flex min-w-max items-center gap-3 pr-5 text-base font-semibold tracking-normal md:border-r md:border-white/10">
            <span className="relative grid h-8 w-8 overflow-hidden rounded-xl border border-indigo-400/25 bg-[#050a17] shadow-[0_0_24px_rgba(37,99,235,0.28)]">
              <img
                src="/arc-capital-logo.png"
                alt=""
                className="h-full w-full scale-[2.55] object-cover"
                aria-hidden="true"
              />
            </span>
            <span>Arc Capital</span>
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {userNavItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    "relative rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white",
                    active && "bg-blue-500/10 text-blue-100 ring-1 ring-blue-400/20 after:absolute after:inset-x-3 after:-bottom-2 after:h-px after:bg-blue-400"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div
              className={cn(
                "hidden items-center rounded-xl px-3 py-2 text-xs font-semibold ring-1 md:flex",
                networkOk
                  ? "bg-white/5 text-slate-100 ring-white/10"
                  : "bg-white/5 text-slate-300 ring-white/10",
              )}
            >
              <span className={cn("mr-2 inline-block h-1.5 w-1.5 rounded-full", networkOk ? "bg-emerald-400" : "bg-slate-500")} />
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
                      className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/10"
                    >
                      Connect Wallet
                    </button>
                  );
                }

                return (
                  <button
                    type="button"
                    onClick={openAccountModal}
                    className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/10"
                  >
                    <span>{account.displayBalance}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-500" />
                    <span>{account.displayName}</span>
                  </button>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </header>
      <main key={pathname} className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">{children}</main>
      <TransactionToastHost />
    </div>
  );
}
