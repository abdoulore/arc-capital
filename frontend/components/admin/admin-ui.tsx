import { ReactNode } from "react";
import { formatUSDC } from "@/lib/utils";

export function AdminHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <p className="text-sm font-medium uppercase tracking-normal text-blue-600 dark:text-blue-400">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{description}</p>
    </div>
  );
}

export function AdminMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 min-w-0 break-words text-xl font-semibold leading-tight sm:text-2xl">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p> : null}
    </div>
  );
}

export function AdminPanel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AdminButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
    >
      {children}
    </button>
  );
}

export function AdminInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

export function formatUsdc(value?: bigint) {
  if (typeof value !== "bigint") return "Awaiting Live Data";
  return formatUSDC(value);
}
