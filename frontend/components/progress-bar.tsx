export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden bg-white/[0.08]">
      <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
