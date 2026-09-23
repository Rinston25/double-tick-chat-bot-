import type { CrmActivityEntry } from '@/lib/types';

function StatusIcon({ status }: { status: CrmActivityEntry['status'] }) {
  if (status === 'pending') {
    return (
      <span
        className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-brand dark:border-neutral-700 dark:border-t-brand-light"
        aria-hidden
      />
    );
  }
  if (status === 'ok') {
    return (
      <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>
        ✓
      </span>
    );
  }
  return (
    <span className="text-red-600 dark:text-red-400" aria-hidden>
      ✗
    </span>
  );
}

function humanToolName(name: string): string {
  return name
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

export function CrmActivityLog({ entries }: { entries: CrmActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        No CRM activity yet this session.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex items-center gap-2">
            <StatusIcon status={entry.status} />
            <span className="font-medium">{humanToolName(entry.name)}</span>
          </div>
          {entry.summary && (
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{entry.summary}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
