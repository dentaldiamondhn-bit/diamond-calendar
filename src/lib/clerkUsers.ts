import { createClerkClient } from '@clerk/backend';

/**
 * User identity fields sourced from Clerk (the app-wide source of truth for
 * staff users). The local Supabase `users` table is vestigial (seeded demo row
 * only), so every feature that shows names/avatars resolves identities through
 * the Clerk API instead.
 */
export interface ClerkUserIdentity {
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  profileImageUrl: string | null;
}

const FALLBACK_IDENTITY: ClerkUserIdentity = {
  first_name: 'Usuario',
  last_name: '',
  name: 'Usuario',
  email: '',
  profileImageUrl: null,
};

/**
 * Fetch identities for the given Clerk user ids. Unknown ids are omitted from
 * the map; callers should fall back to {@link FALLBACK_IDENTITY}.
 */
export async function getClerkUserIdentities(
  userIds: string[]
): Promise<Map<string, ClerkUserIdentity>> {
  const result = new Map<string, ClerkUserIdentity>();
  const ids = [...new Set((userIds || []).filter(Boolean))];

  if (ids.length === 0) return result;

  try {
    const clerk = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    const { data } = await clerk.users.getUserList({
      userId: ids,
      limit: Math.max(ids.length, 100),
    });

    for (const user of data) {
      const firstName = user.firstName || '';
      const lastName = user.lastName || '';
      result.set(user.id, {
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`.trim(),
        email: user.emailAddresses?.[0]?.emailAddress || '',
        profileImageUrl: user.imageUrl || null,
      });
    }
  } catch (err) {
    console.error('[clerkUsers] getUserList failed', err);
  }

  return result;
}

export function clerkIdentityOf(
  userMap: Map<string, ClerkUserIdentity>,
  id: string | undefined
): ClerkUserIdentity {
  if (!id) return FALLBACK_IDENTITY;
  return userMap.get(id) || FALLBACK_IDENTITY;
}