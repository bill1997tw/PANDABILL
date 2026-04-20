import type { PropsWithChildren, ReactNode } from "react";

type SectionCardProps = PropsWithChildren<{
  title: string;
  description?: string;
  action?: ReactNode;
}>;

export function SectionCard({
  title,
  description,
  action,
  children
}: SectionCardProps) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-soft backdrop-blur sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
