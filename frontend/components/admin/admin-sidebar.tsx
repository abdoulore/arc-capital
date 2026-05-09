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
    <aside className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 shadow-sm lg:sticky lg:top-24 lg:h-fit">
      <div className="px-3 py-2">
        <p className="text-sm font-semibold">Operator Console</p>
        <p className="mt-1 text-xs text-[var(--muted)]">RWA platform controls</p>
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
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-slate-100 hover:text-[var(--foreground)] dark:hover:bg-slate-900",
                active && "bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-900"
              )}
            >
              <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-100 text-xs dark:bg-slate-900">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
