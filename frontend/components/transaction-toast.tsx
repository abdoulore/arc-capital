"use client";

import { useEffect } from "react";
import { useTransactionToast } from "@/store/useTransactionToast";

const tone = {
  pending: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  error: "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
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
        <div key={toast.id} className={`rounded-lg border p-4 text-sm shadow-lg ${tone[toast.status]}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">{toast.title}</p>
              {toast.message ? <p className="mt-1 opacity-80">{toast.message}</p> : null}
              {toast.hash ? <p className="mt-2 break-all text-xs opacity-70">Tx: {toast.hash}</p> : null}
            </div>
            <button type="button" onClick={() => removeToast(toast.id)} className="text-xs font-semibold opacity-70">
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
