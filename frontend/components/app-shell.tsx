"use client";

import "@rainbow-me/rainbowkit/styles.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TransactionToastHost } from "@/components/transaction-toast";
import { useIsAdmin } from "@/hooks/useAdmin";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/network";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/vaults", label: "Vaults" },
  { href: "/deals", label: "Deals" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/portfolio", label: "Portfolio" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { address, chain } = useAccount();
  const { isAdmin } = useIsAdmin();
  const [mounted, setMounted] = useState(false);
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
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-5 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="mr-2 flex items-center gap-3 text-lg font-semibold tracking-normal">
            <span className="relative grid h-9 w-9 place-items-center rounded-xl border border-indigo-400/25 bg-indigo-500/10 text-indigo-300 shadow-[0_0_28px_rgba(124,92,255,0.28)]">
              <span className="absolute h-5 w-5 rotate-45 border-l-2 border-t-2 border-indigo-300" />
              <span className="absolute h-3 w-3 rotate-45 border-l-2 border-t-2 border-blue-400 translate-x-1.5 translate-y-1.5" />
            </span>
            <span>Arc Capital</span>
          </Link>
          <div className="hidden h-10 w-px bg-white/10 md:block" />
          <nav className="flex flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[...navItems, ...(mounted && isAdmin ? [{ href: "/admin/overview", label: "Admin" }] : [])].map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    "relative rounded-md px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white",
                    active && "bg-blue-500/10 text-blue-200 ring-1 ring-blue-400/20 after:absolute after:inset-x-3 after:-bottom-3 after:h-px after:bg-blue-400"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "hidden rounded-xl px-4 py-3 text-sm ring-1 md:block",
                networkOk
                  ? "bg-white/5 text-slate-100 ring-white/10"
                  : "bg-amber-500/10 text-amber-200 ring-amber-400/25",
              )}
            >
              <span className={cn("mr-2 inline-block h-2 w-2 rounded-full", networkOk ? "bg-emerald-400" : "bg-amber-300")} />
              {networkLabel}
            </div>
            <ConnectButton />
          </div>
        </div>
      </header>
      <main key={pathname} className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">{children}</main>
      <TransactionToastHost />
    </div>
  );
}
