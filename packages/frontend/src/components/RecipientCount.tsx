interface RecipientCountProps {
  validCount: number;
  invalidCount: number;
}

/**
 * Displays the count of valid recipients and a warning for invalid entries.
 * Does not render if validCount is 0.
 */
export function RecipientCount({ validCount, invalidCount }: RecipientCountProps) {
  if (validCount === 0) return null;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-green-700 font-medium">
        {validCount} valid recipient{validCount !== 1 ? 's' : ''}
      </span>
      {invalidCount > 0 && (
        <span className="text-amber-600">
          {invalidCount} invalid entr{invalidCount !== 1 ? 'ies' : 'y'} skipped
        </span>
      )}
    </div>
  );
}
