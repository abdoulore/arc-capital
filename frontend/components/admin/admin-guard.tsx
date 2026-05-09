"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { useIsAdmin } from "@/hooks/useAdmin";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { isConnected, isAdmin } = useIsAdmin();

  if (!isConnected || !isAdmin) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        <h1 className="text-2xl font-semibold">Unauthorized</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6">
          Connect an approved operator wallet to access the admin console. This route is wallet-gated and hidden from non-admin accounts.
        </p>
        <Link href="/" className="mt-5 inline-flex rounded-md bg-amber-900 px-4 py-3 text-sm font-semibold text-white dark:bg-amber-200 dark:text-amber-950">
          Return to dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
