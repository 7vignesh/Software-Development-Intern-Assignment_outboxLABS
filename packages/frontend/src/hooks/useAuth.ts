import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser, getLoginUrl, logout as apiLogout } from '../api/auth';
import type { User } from '../types';

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: () => void;
  logout: () => Promise<void>;
}

/**
 * Custom hook for managing authentication state.
 * On mount, checks if the user is authenticated by calling the API.
 * Provides login (redirect to OAuth) and logout functions.
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const currentUser = await getCurrentUser();
        if (!cancelled) {
          setUser(currentUser);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setError(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    window.location.href = getLoginUrl();
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
      setUser(null);
    } catch (err) {
      setError('Logout failed. Please try again.');
    }
  }, []);

  return { user, loading, error, login, logout };
}
