import useEmails from '../hooks/useEmails';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Pagination } from '../components/Pagination';
import type { EmailJob } from '../types';

/**
 * Sent emails list view matching Figma design.
 * Shows email rows with To, green "Sent" badge, subject, and preview.
 */
export function Sent() {
  const { data, loading, error, page, totalPages, setPage, refetch } =
    useEmails('SENT');

  if (loading) {
    return (
      <div className="p-6">
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="p-6">
        <EmptyState message="No sent emails" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Top Bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search"
            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-lg text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-green-300"
          />
        </div>
        <button className="p-2.5 bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </button>
        <button onClick={refetch} className="p-2.5 bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Email List */}
      <div className="bg-white rounded-lg border border-gray-200">
        {data.map((email: EmailJob) => (
          <EmailRow key={email.id} email={email} />
        ))}
      </div>

      <div className="mt-4">
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}

function EmailRow({ email }: { email: EmailJob }) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer">
      {/* Recipient */}
      <div className="w-40 flex-shrink-0">
        <span className="text-sm text-gray-700 font-medium">To: {getRecipientName(email.recipient)}</span>
      </div>

      {/* Status Badge */}
      <div className="w-36 flex-shrink-0">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          Sent
        </span>
      </div>

      {/* Subject + Body preview */}
      <div className="flex-1 min-w-0 mx-4">
        <span className="text-sm font-semibold text-gray-800">{email.subject}</span>
        <span className="text-sm text-gray-400"> – </span>
        <span className="text-sm text-gray-500 truncate">{email.body}</span>
      </div>

      {/* Star icon */}
      <div className="flex-shrink-0">
        <svg className="w-5 h-5 text-gray-300 hover:text-yellow-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      </div>
    </div>
  );
}

function getRecipientName(email: string): string {
  const parts = email.split('@');
  const name = parts[0] || email;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
