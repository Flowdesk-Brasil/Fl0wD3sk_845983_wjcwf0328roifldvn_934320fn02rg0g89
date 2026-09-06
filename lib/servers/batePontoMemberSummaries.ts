import { fetchGuildMemberSummaryByBot } from "@/lib/auth/discordGuildAccess";

export type BatePontoMemberProfile = {
  userId: string;
  displayName: string;
  mentionLabel: string;
  avatarUrl: string | null;
};

const MEMBER_FETCH_CHUNK_SIZE = 12;

export async function enrichBatePontoMemberProfiles(
  guildId: string,
  userIds: string[],
): Promise<Record<string, BatePontoMemberProfile>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const profiles: Record<string, BatePontoMemberProfile> = {};

  for (let index = 0; index < uniqueIds.length; index += MEMBER_FETCH_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + MEMBER_FETCH_CHUNK_SIZE);
    const summaries = await Promise.all(
      chunk.map((userId) => fetchGuildMemberSummaryByBot(guildId, userId)),
    );

    chunk.forEach((userId, chunkIndex) => {
      const summary = summaries[chunkIndex];
      profiles[userId] = {
        userId,
        displayName: summary?.displayName || userId,
        mentionLabel: summary?.mentionLabel || `@${userId}`,
        avatarUrl: summary?.avatarUrl || null,
      };
    });
  }

  return profiles;
}

export function attachBatePontoMemberProfile<T extends { userId: string }>(
  entry: T,
  profiles: Record<string, BatePontoMemberProfile>,
) {
  const profile = profiles[entry.userId];
  return {
    ...entry,
    displayName: profile?.displayName || entry.userId,
    mentionLabel: profile?.mentionLabel || `@${entry.userId}`,
    avatarUrl: profile?.avatarUrl || null,
  };
}
