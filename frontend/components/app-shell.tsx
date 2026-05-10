"use client";

import "@rainbow-me/rainbowkit/styles.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ReactNode, useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
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
  const { theme, setTheme } = useAppStore();
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
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [mounted, theme]);

  useEffect(() => {
    if (!mounted) return;
    window.dispatchEvent(new CustomEvent("arc:data-refresh"));
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [mounted, pathname]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="mr-2 text-lg font-semibold tracking-normal">
            Arc Capital
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[...navItems, ...(mounted && isAdmin ? [{ href: "/admin/overview", label: "Admin" }] : [])].map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-slate-100 hover:text-[var(--foreground)] dark:hover:bg-slate-900",
                    active && "bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900"
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
                "hidden rounded-md px-3 py-2 text-sm ring-1 md:block",
                networkOk
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800"
                  : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800",
              )}
            >
              {networkLabel}
            </div>
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-md border border-[var(--line)] px-3 py-2 text-sm font-medium"
            >
              {mounted && theme === "dark" ? "Light" : "Dark"}
            </button>
            <ConnectButton />
          </div>
        </div>
      </header>
      <main key={pathname} className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      <TransactionToastHost />
    </div>
  );
}
