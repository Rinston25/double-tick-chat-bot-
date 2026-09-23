'use client';

import type { CrmActivityEntry, SessionDetails, Stage } from '@/lib/types';
import { StageBadge } from './StageBadge';
import { CrmActivityLog } from './CrmActivityLog';
import { SessionDetailsPanel } from './SessionDetailsPanel';

function PanelBody({
  stage,
  confidence,
  activity,
  details,
}: {
  stage: Stage;
  confidence: number;
  activity: CrmActivityEntry[];
  details: SessionDetails | null;
}) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Detected stage
        </h2>
        <StageBadge stage={stage} confidence={confidence} />
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          CRM activity
        </h2>
        <CrmActivityLog entries={activity} />
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Collected details
        </h2>
        <SessionDetailsPanel details={details} />
      </section>
    </div>
  );
}

export function SidePanel(props: {
  stage: Stage;
  confidence: number;
  activity: CrmActivityEntry[];
  details: SessionDetails | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Desktop: static sidebar */}
      <aside className="hidden w-80 shrink-0 border-l border-neutral-200 bg-neutral-50 md:block dark:border-neutral-800 dark:bg-neutral-900">
        <PanelBody
          stage={props.stage}
          confidence={props.confidence}
          activity={props.activity}
          details={props.details}
        />
      </aside>

      {/* Mobile: drawer */}
      {props.open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close details panel"
            className="absolute inset-0 bg-black/40"
            onClick={props.onClose}
          />
          <aside className="absolute right-0 top-0 h-full w-[85%] max-w-xs bg-neutral-50 shadow-xl dark:bg-neutral-950">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <span className="text-sm font-semibold">Session details</span>
              <button
                aria-label="Close"
                onClick={props.onClose}
                className="rounded-md px-2 py-1 text-lg leading-none text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                &times;
              </button>
            </div>
            <PanelBody
              stage={props.stage}
              confidence={props.confidence}
              activity={props.activity}
              details={props.details}
            />
          </aside>
        </div>
      )}
    </>
  );
}
