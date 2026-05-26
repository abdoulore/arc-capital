"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const adminItems = [
  { href: "/admin/overview", label: "Overview", icon: "O" },
  { href: "/admin/monthly-vault", label: "Monthly Vault", icon: "M" },
  { href: "/admin/long-term", label: "Long-Term", icon: "L" },
  { href: "/admin/deals", label: "Deals", icon: "D" },
  { href: "/admin/marketplace", label: "Marketplace", icon: "X" },
  { href: "/admin/treasury", label: "Treasury", icon: "T" },
  { href: "/admin/users", label: "Users", icon: "U" },
  { href: "/admin/activity", label: "Activity", icon: "A" },
  { href: "/admin/settings", label: "Settings", icon: "S" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border border-white/[0.08] bg-transparent p-3 lg:sticky lg:top-24 lg:h-fit">
      <div className="px-3 py-2">
        <p className="text-xl">Operator Console</p>
        <p className="mt-1 text-xs font-light text-[var(--muted)]">RWA platform controls</p>
      </div>
      <nav className="mt-3 grid gap-1">
        {adminItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm text-[var(--muted)] transition hover:border-white/[0.08] hover:text-[var(--foreground)]",
                active && "border-[var(--accent)]/35 text-[var(--foreground)]"
              )}
            >
              <span className="mono-label grid h-6 w-6 place-items-center rounded-sm border border-white/[0.08] text-[9px]">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
