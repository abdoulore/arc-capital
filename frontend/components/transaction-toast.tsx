"use client";

import { useEffect } from "react";
import { useTransactionToast } from "@/store/useTransactionToast";

const tone = {
  pending: "border-white/[0.14] bg-[#080c10] text-[var(--foreground)]",
  success: "border-[var(--accent)]/45 bg-[#080c10] text-[var(--foreground)]",
  error: "border-[var(--danger)]/55 bg-[#080c10] text-[var(--foreground)]",
};

export function TransactionToastHost() {
  const { toasts, removeToast } = useTransactionToast();

  useEffect(() => {
    const timers = toasts
      .filter((toast) => toast.status !== "pending")
      .map((toast) => window.setTimeout(() => removeToast(toast.id), 4500));
    return () => timers.forEach(window.clearTimeout);
  }, [removeToast, toasts]);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-3">
      {toasts.map((toast) => (
        <div key={toast.id} className={`border p-4 text-sm ${tone[toast.status]}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{toast.title}</p>
              {toast.message ? <p className="mt-1 text-[var(--muted)]">{toast.message}</p> : null}
              {toast.hash ? <p className="mt-2 break-all font-mono text-xs text-[var(--muted)]">Tx: {toast.hash}</p> : null}
            </div>
            <button type="button" onClick={() => removeToast(toast.id)} className="arc-link text-xs font-semibold">
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
