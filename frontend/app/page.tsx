"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";

type MonthlyVaultResponse = {
  status: "live" | "pending";
  summary: {
    nav_usdc?: string;
    liquidity_usdc?: string;
  } | null;
};

export default function LandingPage() {
  const [monthlyVault, setMonthlyVault] = useState<MonthlyVaultResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v2/vaults/monthly", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setMonthlyVault(data);
      })
      .catch(() => {
        if (!cancelled) setMonthlyVault(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tvl = monthlyVault?.summary?.nav_usdc;

  return (
    <div className="-mt-12 w-full max-w-full overflow-hidden">
      <section className="border-b border-white/[0.08] py-24 sm:py-32">
        <div className="max-w-4xl">
          <p className="mono-label flex items-center gap-4 text-[11px] text-[var(--accent)] before:h-px before:w-6 before:bg-[var(--accent)]">
            Private banking, onchain
          </p>
          <h1 className="mt-10 max-w-4xl break-words text-4xl leading-[1.04] text-[var(--foreground)] sm:text-6xl lg:text-7xl">
            Real-world yield,{" "}
            <span className="inline-block pb-1 italic leading-[1.12] text-[var(--accent)]">without the gatekeepers.</span>
          </h1>
          <p className="mt-10 max-w-full text-base font-light leading-8 text-[rgba(232,228,220,0.5)] sm:max-w-2xl sm:text-lg">
            Arc Capital brings institutional-grade fixed income to onchain investors. Flexible liquidity windows.
            Long-term fixed returns. Non-custodial throughout.
          </p>
          <div className="mt-12 flex flex-wrap items-center gap-5">
            <Link href="/vaults" className="arc-button-filled mono-label px-6 py-3 text-xs transition hover:opacity-90">
              Enter app
            </Link>
            <Link href="#products" className="mono-label text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]">
              Read docs
            </Link>
          </div>
        </div>

        <div className="mt-24 grid border-y border-white/[0.08] sm:grid-cols-3">
          <LandingStat
            value={tvl ? formatCurrency(Number(tvl)) : undefined}
            label="Total vault liquidity"
          />
          <LandingStat value={undefined} label="Current fixed APY" />
          <LandingStat value="100%" label="Non-custodial" isLast />
        </div>
      </section>

      <section id="products" className="border-b border-white/[0.08] py-24">
        <p className="mono-label text-[11px] text-[var(--accent)]">Products</p>
        <h2 className="mt-12 break-words text-3xl leading-tight sm:text-5xl">Two ways to earn. One infrastructure.</h2>

        <div className="mt-16 grid border border-white/[0.08] lg:grid-cols-2">
          <ProductCard
            tag="Liquid"
            title="Monthly RWA Vault"
            description="Flexible access to real-world yield with monthly liquidity windows. Deposit and withdraw on your schedule."
            metrics={[
              ["Monthly", "Liquidity window"],
              ["RWA", "Collateral type"],
            ]}
            href="/vaults"
            cta="Access vault"
          />
          <ProductCard
            tag="Fixed"
            title="Long-Term Fixed Income"
            description="Lock capital for 1-3 years and earn a fixed APY paid monthly. Principal returned at maturity."
            metrics={[
              ["1-3 yr", "Lock duration"],
              ["Monthly", "Payout cadence"],
            ]}
            href="/vaults"
            cta="View terms"
            withDivider
          />
        </div>
      </section>

      <section id="principles" className="grid gap-12 border-b border-white/[0.08] py-24 lg:grid-cols-[0.95fr_1fr] lg:items-center">
        <div>
          <h2 className="max-w-xl break-words text-3xl leading-tight sm:text-5xl">
            Built for capital that <span className="inline-block pb-1 italic leading-[1.12] text-[var(--accent)]">demands more.</span>
          </h2>
          <p className="mt-10 max-w-xl text-lg font-light leading-8 text-[rgba(232,228,220,0.5)]">
            Traditional private credit is opaque, illiquid, and often reserved for institutions. Arc brings the same yield
            to verifiable onchain infrastructure, with full transparency and no custody risk.
          </p>
          <Link href="/vaults" className="arc-button-outline mono-label mt-14 inline-flex px-6 py-3 text-xs transition">
            Start earning
          </Link>
        </div>

        <div className="space-y-8">
          <Principle number="01" title="Non-custodial by design" description="Your assets never leave your control. Smart contract infrastructure, transparent by default." />
          <Principle number="02" title="Real-world collateral" description="Yield is generated from verified RWA positions, not token emissions or circular lending." />
          <Principle number="03" title="Institutional-grade terms" description="Fixed APY, defined maturity dates, structured liquidity windows. No guessing." />
        </div>
      </section>

      <footer className="flex flex-col justify-between gap-4 py-10 text-[var(--muted)] sm:flex-row">
        <p className="font-display text-xl">Arc Capital</p>
        <p className="mono-label text-[10px]">Private banking, onchain. 2026</p>
      </footer>
    </div>
  );
}

function LandingStat({ value, label, isLast }: { value?: string; label: string; isLast?: boolean }) {
  return (
    <div className={`px-8 py-8 ${isLast ? "" : "border-b border-white/[0.08] sm:border-b-0 sm:border-r"}`}>
      {value ? <p className="font-display text-4xl">{value}</p> : <div className="skeleton h-10 w-36" />}
      <p className="mono-label mt-3 text-[10px] text-[var(--muted)]">{label}</p>
    </div>
  );
}

function ProductCard({
  tag,
  title,
  description,
  metrics,
  href,
  cta,
  withDivider,
}: {
  tag: string;
  title: string;
  description: string;
  metrics: Array<[string, string]>;
  href: string;
  cta: string;
  withDivider?: boolean;
}) {
  return (
    <article className={`p-10 sm:p-14 ${withDivider ? "border-t border-white/[0.08] lg:border-l lg:border-t-0" : ""}`}>
      <span className="mono-label inline-flex border border-white/[0.16] px-3 py-1 text-[9px] text-[var(--muted)]">{tag}</span>
      <h3 className="mt-9 break-words text-3xl">{title}</h3>
      <p className="mt-5 max-w-md text-base font-light leading-7 text-[rgba(232,228,220,0.5)]">{description}</p>
      <div className="mt-10 grid max-w-md grid-cols-2 border-t border-white/[0.08] pt-8">
        {metrics.map(([value, label]) => (
          <div key={label}>
            <p className="font-display text-2xl">{value}</p>
            <p className="mono-label mt-2 text-[9px] text-[var(--muted)]">{label}</p>
          </div>
        ))}
      </div>
      <Link href={href} className="mono-label mt-10 inline-flex text-[11px] text-[var(--muted)] transition hover:text-[var(--foreground)]">
        {cta}
      </Link>
    </article>
  );
}

function Principle({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <article className="border border-white/[0.08] p-8">
      <p className="mono-label text-[9px] text-[var(--accent)]">{number}</p>
      <h3 className="mt-4 font-sans text-lg font-light">{title}</h3>
      <p className="mt-3 max-w-md text-sm font-light leading-6 text-[rgba(232,228,220,0.5)]">{description}</p>
    </article>
  );
}
