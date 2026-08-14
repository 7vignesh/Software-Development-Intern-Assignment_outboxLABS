import { Router, Request, Response } from 'express';
import {
  initiateGoogleAuth,
  handleGoogleCallback,
  createSession,
  invalidateSession,
} from '../services/authService';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/auth/google
 * Initiates the Google OAuth 2.0 flow by redirecting to Google's consent screen.
 * Requirements: 5.1, 10.3
 */
router.get('/google', (_req: Request, res: Response) => {
  const authUrl = initiateGoogleAuth();
  res.redirect(authUrl);
});

/**
 * GET /api/auth/google/callback
 * Handles the OAuth callback from Google.
 * Exchanges the authorization code for tokens, upserts the user,
 * creates a session, sets an httpOnly secure cookie, and redirects to the frontend.
 * Requirements: 5.2, 5.3, 10.3
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  try {
    const user = await handleGoogleCallback(code);
    const sessionToken = await createSession(user.id);

    // Set httpOnly secure session cookie
    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    // Redirect to frontend dashboard with token in URL for cross-port persistence
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/dashboard?token=${sessionToken}`);
  } catch (error) {
    console.error('[Auth] Google callback error:', (error as Error).message);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
});

/**
 * GET /api/auth/me
 * Returns the authenticated user's profile.
 * Requirements: 5.3, 10.4
 */
router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json(req.user);
});

/**
 * POST /api/auth/logout
 * Invalidates the session and clears the session cookie.
 * Requirements: 5.5
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  const token =
    req.cookies?.session_token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (token) {
    await invalidateSession(token);
  }

  // Clear the session cookie
  res.clearCookie('session_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  res.json({ message: 'Logged out successfully' });
});

export default router;
