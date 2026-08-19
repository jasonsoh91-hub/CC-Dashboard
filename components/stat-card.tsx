import Link from 'next/link';

type Tone = 'default' | 'amber' | 'emerald' | 'red';

const TONES: Record<Tone, { value: string; icon: string }> = {
  default: { value: 'text-slate-900 dark:text-white', icon: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  amber: { value: 'text-amber-600 dark:text-amber-400', icon: 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400' },
  emerald: { value: 'text-emerald-600 dark:text-emerald-400', icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' },
  red: { value: 'text-red-600 dark:text-red-400', icon: 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400' },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  href?: string;
}) {
  const t = TONES[tone];
  const body = (
    <div
      className={
        'h-full rounded-xl bg-card ring-1 ring-foreground/10 p-4 ' +
        (href ? 'transition-shadow hover:ring-foreground/25 hover:shadow-sm' : '')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-slate-500">{label}</span>
        {Icon && (
          <span className={'grid place-items-center size-8 rounded-lg shrink-0 ' + t.icon}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className={'mt-2 text-3xl font-bold tabular-nums tracking-tight ' + t.value}>{value}</div>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
