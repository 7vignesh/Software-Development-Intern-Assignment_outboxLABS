import client, { API_BASE } from './client';
import type { User } from '../types';

/**
 * Returns the URL to initiate Google OAuth login.
 */
export function getLoginUrl(): string {
  return `${API_BASE}/auth/google`;
}

/**
 * Fetches the currently authenticated user's profile.
 * Throws on 401 (unauthenticated).
 */
export async function getCurrentUser(): Promise<User> {
  const response = await client.get<User>('/auth/me');
  return response.data;
}

/**
 * Logs out the current user by invalidating the session.
 */
export async function logout(): Promise<void> {
  await client.post('/auth/logout');
}
