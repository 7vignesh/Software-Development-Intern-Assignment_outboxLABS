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
 * On mount, checks the URL for a session token (from OAuth redirect),
 * stores it in localStorage, then verifies authentication via the API.
 * Provides login (redirect to OAuth) and logout functions.
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Extract token from URL query params (set during OAuth redirect)
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');
    if (tokenFromUrl) {
      localStorage.setItem('session_token', tokenFromUrl);
      // Clean the token from the URL without triggering a navigation
      params.delete('token');
      const cleanSearch = params.toString();
      const newUrl =
        window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '') + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }

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
      localStorage.removeItem('session_token');
      setUser(null);
    } catch (err) {
      setError('Logout failed. Please try again.');
    }
  }, []);

  return { user, loading, error, login, logout };
}
