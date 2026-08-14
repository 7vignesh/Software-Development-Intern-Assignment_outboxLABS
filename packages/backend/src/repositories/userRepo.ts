import prisma from '../lib/prisma';

/**
 * Find a user by their Google ID.
 * @param googleId - The Google OAuth user ID
 * @returns The user record or null if not found
 */
export async function findByGoogleId(googleId: string) {
  return prisma.user.findUnique({
    where: { googleId },
  });
}

/**
 * Create or update a user by their Google ID.
 * If the user exists, updates their email, name, and avatarUrl.
 * If not, creates a new user record.
 * @param googleId - The Google OAuth user ID
 * @param email - The user's email address
 * @param name - The user's display name
 * @param avatarUrl - The user's avatar URL (optional)
 * @returns The created or updated user record
 */
export async function upsert(
  googleId: string,
  email: string,
  name: string,
  avatarUrl: string | null
) {
  return prisma.user.upsert({
    where: { googleId },
    update: {
      email,
      name,
      avatarUrl,
    },
    create: {
      googleId,
      email,
      name,
      avatarUrl,
    },
  });
}
