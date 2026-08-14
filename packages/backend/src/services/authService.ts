import crypto from 'crypto';
import config from '../config';
import prisma from '../lib/prisma';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

/**
 * Build and return the Google OAuth 2.0 consent URL.
 * Redirects the user to Google's consent screen requesting email and profile scopes.
 */
export function initiateGoogleAuth(): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleCallbackUrl,
    scope: 'email profile',
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange the authorization code for tokens, fetch user info from Google,
 * and upsert the user record in the database.
 * @param code - The authorization code returned by Google
 * @returns The upserted user profile
 */
export async function handleGoogleCallback(code: string) {
  // Exchange authorization code for tokens
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: config.googleCallbackUrl,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`Failed to exchange authorization code: ${errorBody}`);
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    id_token?: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  // Fetch user profile from Google userinfo endpoint
  const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoResponse.ok) {
    const errorBody = await userInfoResponse.text();
    throw new Error(`Failed to fetch user info: ${errorBody}`);
  }

  const userInfo = (await userInfoResponse.json()) as {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };

  // Upsert user in the database
  const user = await prisma.user.upsert({
    where: { googleId: userInfo.id },
    update: {
      email: userInfo.email,
      name: userInfo.name,
      avatarUrl: userInfo.picture || null,
    },
    create: {
      googleId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      avatarUrl: userInfo.picture || null,
    },
  });

  return user;
}

/**
 * Create a new session for the given user.
 * Generates a cryptographically random 64-byte hex token with 24-hour expiry.
 * @param userId - The user's database ID
 * @returns The session token string
 */
export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

/**
 * Validate a session token. Checks that the session exists and has not expired.
 * @param token - The session token to validate
 * @returns The associated user or null if the session is invalid/expired
 */
export async function validateSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    // Session has expired — clean it up
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return session.user;
}

/**
 * Invalidate (delete) a session by its token.
 * @param token - The session token to invalidate
 */
export async function invalidateSession(token: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { token },
  });
}
