import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { UserProfile } from '../types';

/**
 * Express middleware that authenticates requests by validating session tokens.
 *
 * Token resolution order:
 * 1. Cookie named 'session_token'
 * 2. Authorization header with Bearer scheme
 *
 * On success, attaches the authenticated user as req.user (UserProfile).
 * On failure, responds with 401 { error: 'Unauthorized' }.
 *
 * Requirements: 5.4
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt <= new Date()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userProfile: UserProfile = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatarUrl: session.user.avatarUrl,
    };

    req.user = userProfile;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/**
 * Extracts a session token from the request.
 * Checks the 'session_token' cookie first, then the Authorization Bearer header.
 */
function extractToken(req: Request): string | null {
  // 1. Check cookie
  const cookieToken = req.cookies?.session_token;
  if (cookieToken) {
    return cookieToken;
  }

  // 2. Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}
