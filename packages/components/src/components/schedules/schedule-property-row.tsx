import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The schedule editor's one layout primitive.
 *
 * A grouped card of quiet rows — label on the left, the live value on the
 * right — so Frequency and Run configuration read as the same object rather
 * than as two unrelated forms. Rows appear only when they apply, which is what
 * keeps the surface short without hiding anything behind a mode switch.
 */
export const scheduleCardClass =
  'divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-card/40';

/** Right-aligned ghost control, matching the property-row triggers elsewhere. */
export const ghostValueClass =
  'flex h-8 min-w-0 max-w-full items-center justify-end gap-1.5 rounded-md bg-transparent px-2 text-[13px] text-foreground transition-colors hover:bg-hover focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-hover';

export const ghostSelectTriggerClass = cn(
  ghostValueClass,
  'w-auto shrink-0 border-0 py-0 shadow-none data-placeholder:text-muted-foreground [&>span]:truncate'
);

export function ScheduleSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex min-h-5 items-center gap-2 px-1">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <div className={scheduleCardClass}>{children}</div>
    </section>
  );
}

export function PropertyRow({
  label,
  hint,
  children,
  align = 'center',
}: {
  label: string;
  /** Small explanation under the value; only for rows that genuinely need one. */
  hint?: string;
  children: ReactNode;
  align?: 'center' | 'start';
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)] gap-3 px-3 py-1.5 sm:grid-cols-[8rem_minmax(0,1fr)]',
        align === 'center' ? 'items-center' : 'items-start'
      )}
    >
      <span className={cn('text-[13px] text-muted-foreground', align === 'start' && 'pt-2')}>
        {label}
      </span>
      <div className="flex min-w-0 flex-col items-end gap-0.5">
        <div className="flex min-w-0 max-w-full items-center justify-end">{children}</div>
        {hint ? <p className="text-right text-xs text-muted-foreground/80">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Full-bleed row for controls that own the whole width (Agent, Project). */
export function PropertyRowWide({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)] items-center gap-3 py-1.5 pl-3 pr-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <div className="flex min-w-0 justify-end [&>*]:min-w-0 [&>*]:max-w-full">{children}</div>
    </div>
  );
}
