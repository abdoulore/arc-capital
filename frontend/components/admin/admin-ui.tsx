import { ReactNode } from "react";
import { formatUSDC } from "@/lib/utils";

export function AdminHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <p className="mono-label text-[10px] text-[var(--accent)]">Admin</p>
      <h1 className="mt-3 text-4xl leading-tight">{title}</h1>
      <p className="mt-3 max-w-3xl text-sm font-light leading-6 text-[var(--muted)]">{description}</p>
    </div>
  );
}

export function AdminMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 border border-white/[0.08] bg-transparent p-4">
      <p className="mono-label text-[9px] text-[var(--muted)]">{label}</p>
      <p className="mt-3 min-w-0 break-words text-xl leading-tight sm:text-2xl">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p> : null}
    </div>
  );
}

export function AdminPanel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border border-white/[0.08] bg-transparent p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-2xl">{title}</h2>
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
      className="arc-button-outline px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
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
      className="w-full rounded-none border border-white/[0.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
    />
  );
}

export function formatUsdc(value?: bigint) {
  if (typeof value !== "bigint") return "Awaiting Live Data";
  return formatUSDC(value);
}
