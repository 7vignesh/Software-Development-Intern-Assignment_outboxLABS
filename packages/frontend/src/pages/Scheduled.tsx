import useEmails from '../hooks/useEmails';
import EmailTable, { Column } from '../components/EmailTable';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Pagination } from '../components/Pagination';
import type { EmailJob } from '../types';

const columns: Column<EmailJob>[] = [
  { key: 'recipient', header: 'Recipient' },
  { key: 'subject', header: 'Subject' },
  {
    key: 'scheduledTime',
    header: 'Scheduled Time',
    render: (value: string) => new Date(value).toLocaleString(),
  },
  { key: 'status', header: 'Status' },
];

export function Scheduled() {
  const { data, loading, error, page, totalPages, setPage, refetch } =
    useEmails('SCHEDULED');

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={refetch} />;
  }

  if (data.length === 0) {
    return <EmptyState message="No scheduled emails" />;
  }

  return (
    <div>
      <EmailTable columns={columns} data={data} keyField="id" />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
