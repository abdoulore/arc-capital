"use client";

import Link from "next/link";
import { SectionHeader } from "@/components/section-header";

export default function DealDetailPage() {
  return (
    <div>
      <Link href="/deals" className="arc-link mb-4 inline-flex text-sm font-medium">
        Back to deals
      </Link>
      <SectionHeader eyebrow="Deal detail" title="Awaiting Live Data" description="Deal detail indexing is pending integration." />

      <section className="arc-panel p-6 text-sm text-[var(--muted)]">
        Pending Integration
      </section>
    </div>
  );
}
