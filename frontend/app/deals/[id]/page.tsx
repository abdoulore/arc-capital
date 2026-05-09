"use client";

import Link from "next/link";
import { SectionHeader } from "@/components/section-header";

export default function DealDetailPage() {
  return (
    <div>
      <Link href="/deals" className="mb-4 inline-flex text-sm font-medium text-blue-600 dark:text-blue-400">
        Back to deals
      </Link>
      <SectionHeader eyebrow="Deal detail" title="Awaiting Live Data" description="Deal detail indexing is pending integration." />

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 text-sm text-[var(--muted)] shadow-sm">
        Pending Integration
      </section>
    </div>
  );
}
