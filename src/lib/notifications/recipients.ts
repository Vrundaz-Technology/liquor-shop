import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { parseUserPreferencesOrUndefined } from "@/lib/db/user-preferences";
import type { UserPreferences } from "@/types";

function parsePreferences(raw: unknown): UserPreferences | undefined {
  return parseUserPreferencesOrUndefined(raw);
}

export async function loadNotifyRecipient(userId: string | null | undefined): Promise<{
  userId: string;
  email: string;
  name: string;
  prefs: UserPreferences | undefined;
} | null> {
  if (!userId || !isDbConfigured()) return null;
  try {
    const rows = await prisma.$queryRawUnsafe<
      { id: string; email: string; name: string; preferences: unknown }[]
    >(
      `SELECT id, email, name, preferences FROM users WHERE id = ? AND active = true LIMIT 1`,
      userId,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.id,
      email: row.email,
      name: row.name,
      prefs: parsePreferences(row.preferences),
    };
  } catch {
    // preferences column may be missing on older DBs briefly
    const user = await prisma.user.findFirst({
      where: { id: userId, active: true },
      select: { id: true, email: true, name: true },
    });
    if (!user) return null;
    return { userId: user.id, email: user.email, name: user.name, prefs: undefined };
  }
}
