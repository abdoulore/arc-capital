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
    <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
      <span className="text-blue-600 dark:text-blue-300">Next window</span>
      <span className="ml-2 font-semibold">{days === null ? "Loading" : days === 0 ? "Open now" : `${days} days`}</span>
    </div>
  );
}
