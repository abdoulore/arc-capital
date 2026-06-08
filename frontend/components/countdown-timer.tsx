"use client";

import { useEffect, useState } from "react";
import { daysUntil } from "@/lib/utils";

export function CountdownTimer({ date }: { date: string }) {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDays(daysUntil(date)), 0);
    return () => window.clearTimeout(timer);
  }, [date]);

  return (
    <div className="border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--foreground)]">
      <span className="mono-label text-[9px] text-[var(--muted)]">Next window</span>
      <span className="ml-2 font-semibold">{days === null ? "Loading" : days === 0 ? "Open now" : `${days} days`}</span>
    </div>
  );
}
