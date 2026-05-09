export function SectionHeader({ title, eyebrow, description }: { title: string; eyebrow?: string; description?: string }) {
  return (
    <div className="mb-6">
      {eyebrow ? <p className="text-sm font-medium uppercase tracking-normal text-blue-600 dark:text-blue-400">{eyebrow}</p> : null}
      <h1 className="mt-2 text-3xl font-semibold tracking-normal">{title}</h1>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
    </div>
  );
}
