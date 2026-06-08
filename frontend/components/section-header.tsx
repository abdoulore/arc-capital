export function SectionHeader({ title, eyebrow, description }: { title: string; eyebrow?: string; description?: string }) {
  return (
    <div className="mb-12">
      {eyebrow ? (
        <p className="mono-label flex items-center gap-4 text-[10px] text-[var(--accent)] before:h-px before:w-6 before:bg-[var(--accent)]">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="mt-5 max-w-5xl break-words text-4xl leading-[1.08] text-[var(--foreground)] sm:text-5xl lg:text-6xl">{title}</h1>
      {description ? <p className="mt-5 max-w-3xl text-base font-light leading-8 text-[var(--muted)]">{description}</p> : null}
    </div>
  );
}
