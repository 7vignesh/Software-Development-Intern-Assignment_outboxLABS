/**
 * Animated table loading placeholder with pulsing gray bars.
 * Renders 5 skeleton rows, each with 4 columns.
 */
export function LoadingSkeleton() {
  return (
    <div className="w-full animate-pulse">
      {/* Header row */}
      <div className="flex gap-4 p-3 border-b border-gray-200">
        <div className="h-4 bg-gray-300 rounded w-1/4" />
        <div className="h-4 bg-gray-300 rounded w-1/4" />
        <div className="h-4 bg-gray-300 rounded w-1/4" />
        <div className="h-4 bg-gray-300 rounded w-1/4" />
      </div>
      {/* Data rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3 border-b border-gray-100">
          <div className="h-4 bg-gray-200 rounded w-1/4" />
          <div className="h-4 bg-gray-200 rounded w-1/4" />
          <div className="h-4 bg-gray-200 rounded w-1/4" />
          <div className="h-4 bg-gray-200 rounded w-1/4" />
        </div>
      ))}
    </div>
  );
}
