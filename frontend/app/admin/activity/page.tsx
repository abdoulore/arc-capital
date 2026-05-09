"use client";

import { useEffect, useState } from "react";
import { AdminHeader, AdminPanel } from "@/components/admin/admin-ui";

type Activity = {
  id: string;
  timestamp: string;
  operator?: string;
  action: string;
  summary: string;
  hash?: string;
};

export default function AdminActivityPage() {
  const [activity, setActivity] = useState<Activity[]>([]);

  useEffect(() => {
    fetch("/api/admin/activity").then((res) => res.json()).then(setActivity).catch(() => setActivity([]));
  }, []);

  return (
    <div>
      <AdminHeader title="Audit log" description="Admin actions, treasury movements, configuration changes, and intervention events." />
      <AdminPanel title="Operational activity">
        <div className="divide-y divide-[var(--line)]">
          {activity.length === 0 ? <p className="text-sm text-[var(--muted)]">No admin activity logged yet.</p> : null}
          {activity.map((item) => (
            <div key={item.id} className="grid gap-2 py-3 text-sm lg:grid-cols-[180px_160px_1fr_180px]">
              <span>{new Date(item.timestamp).toLocaleString()}</span>
              <span className="font-medium">{item.action}</span>
              <span>{item.summary}</span>
              <span className="truncate text-[var(--muted)]">{item.hash ?? item.operator}</span>
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  );
}
