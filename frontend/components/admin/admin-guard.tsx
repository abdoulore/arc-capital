"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useIsAdmin } from "@/hooks/useAdmin";

export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isConnected, isAdmin, status } = useIsAdmin();
  const [mounted, setMounted] = useState(false);
  const accountReady = mounted && status !== "connecting" && status !== "reconnecting";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!accountReady) return;
    if (!isConnected || !isAdmin) router.replace("/");
  }, [accountReady, isAdmin, isConnected, router]);

  if (!accountReady || !isConnected || !isAdmin) {
    return null;
  }

  return <>{children}</>;
}
