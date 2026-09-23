import { STAGE_LABELS, type Stage } from '@/lib/types';

const STAGE_COLORS: Record<Stage, string> = {
  NEW_LEAD: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  ONGOING_PIPELINE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  BOOKED_VEHICLE: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  POST_PURCHASE_SERVICE: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  GENERAL: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
};

export function StageBadge({ stage, confidence }: { stage: Stage; confidence: number }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STAGE_COLORS[stage]}`}
      >
        {STAGE_LABELS[stage]}
      </span>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">
        {Math.round(confidence * 100)}% confidence
      </span>
    </div>
  );
}
