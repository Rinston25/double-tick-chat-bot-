import type { SessionDetails } from '@/lib/types';

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-right font-medium text-neutral-800 dark:text-neutral-200">{value}</dd>
    </div>
  );
}

export function SessionDetailsPanel({ details }: { details: SessionDetails | null }) {
  if (!details) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">No details collected yet.</p>
    );
  }

  const { identity, knownIds } = details;
  const hasAny =
    identity.fullName ||
    identity.phone ||
    identity.email ||
    knownIds.vehicleModel ||
    knownIds.preferredCity ||
    knownIds.registrationNumber ||
    knownIds.dealId ||
    knownIds.bookingId ||
    knownIds.caseId;

  if (!hasAny) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">No details collected yet.</p>
    );
  }

  return (
    <dl className="flex flex-col gap-1.5">
      <Row label="Name" value={identity.fullName} />
      <Row label="Phone" value={identity.phone} />
      <Row label="Email" value={identity.email} />
      <Row label="Vehicle" value={knownIds.vehicleModel} />
      <Row label="Preferred city" value={knownIds.preferredCity} />
      <Row label="Registration no." value={knownIds.registrationNumber} />
      <Row label="Deal ID" value={knownIds.dealId} />
      <Row label="Booking ID" value={knownIds.bookingId} />
      <Row label="Case ID" value={knownIds.caseId} />
    </dl>
  );
}
