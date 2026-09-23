const CHIPS = [
  'Price of Thar LX diesel?',
  'Check my test drive — 9123456780',
  'Status of booking MAH-9921',
  'Book service for MH02AB1234',
];

export function QuickStartChips({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-2">
      {CHIPS.map((chip) => (
        <button
          key={chip}
          type="button"
          disabled={disabled}
          onClick={() => onPick(chip)}
          className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-brand-light dark:hover:text-brand-light"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
