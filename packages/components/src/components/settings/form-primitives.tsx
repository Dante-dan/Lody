import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/ui/label';

/**
 * The shared grammar of the settings editors.
 *
 * Every settings form — MCP connection, Agent Role — is the same stack of
 * bordered sections holding labelled fields, so the spacing and typography live
 * here once. A local copy per editor is how three dialogs that are supposed to
 * look like one surface drift apart one padding value at a time.
 */

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border/70 bg-card/60 p-3">
      <header>
        <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
        {hint ? (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/90">{hint}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function Field({
  htmlFor,
  label,
  hint,
  icon,
  children,
}: {
  /** Associates the label with a control that owns an id; omit for a group. */
  htmlFor?: string;
  label: string;
  hint?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        <Label htmlFor={htmlFor} className="text-xs font-medium">
          {label}
        </Label>
      </div>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * An inline message inside a settings editor.
 *
 * `error` blocks the save that is about to be attempted; `warning` states a
 * consequence the author should read before saving. Both carry the icon, so a
 * reader who cannot see the tint still gets the signal.
 */
export function FormMessage({
  tone,
  children,
  className,
}: {
  tone: 'error' | 'warning';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-snug',
        tone === 'error'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-status-warning/30 bg-status-warning/10 text-foreground/90',
        className
      )}
    >
      <AlertTriangle
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0',
          tone === 'error' ? 'text-destructive' : 'text-status-warning'
        )}
        aria-hidden="true"
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
