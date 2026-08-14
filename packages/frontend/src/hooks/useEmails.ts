import { useState, useEffect, useCallback } from 'react';
import { getEmails } from '../api/emails';
import type { EmailJob } from '../types';

type StatusFilter = 'SCHEDULED' | 'SENT' | 'FAILED';

interface UseEmailsResult {
  data: EmailJob[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  refetch: () => void;
}

export default function useEmails(status: StatusFilter): UseEmailsResult {
  const [data, setData] = useState<EmailJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const limit = 20;

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getEmails(status, page, limit);
      setData(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch emails');
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const refetch = useCallback(() => {
    fetchEmails();
  }, [fetchEmails]);

  return { data, loading, error, total, page, totalPages, setPage, refetch };
}
