export function SectionHeader({ title, eyebrow, description }: { title: string; eyebrow?: string; description?: string }) {
  return (
    <div className="mb-10">
      {eyebrow ? <p className="mono-label text-[10px] text-[var(--accent)]">{eyebrow}</p> : null}
      <h1 className="mt-4 max-w-4xl break-words text-3xl leading-tight sm:text-5xl">{title}</h1>
      {description ? <p className="mt-4 max-w-3xl text-sm font-light leading-7 text-[var(--muted)]">{description}</p> : null}
    </div>
  );
}
