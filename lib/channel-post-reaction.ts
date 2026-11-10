export type ChannelPostReactionRefreshResult<T> =
  | { status: "updated"; value: T }
  | { status: "refresh-failed"; error: unknown };

/**
 * Synchronous per-key lock for channel reaction mutations.
 * The key should include the current channel/account scope and post ID.
 */
export function createChannelPostReactionGate() {
  const pending = new Set<string>();
  return {
    run<T>(key: string, operation: () => Promise<T>): Promise<T> | null {
      if (pending.has(key)) return null;
      pending.add(key);
      return Promise.resolve()
        .then(operation)
        .finally(() => {
          pending.delete(key);
        });
    },
  };
}

/**
 * Distinguish a confirmed reaction write from a best-effort list refresh.
 * The optimistic local update runs only after the server confirms the write.
 */
export async function updateChannelPostReaction<T>(
  update: () => Promise<unknown>,
  onConfirmed: () => void,
  refresh: () => Promise<T>,
): Promise<ChannelPostReactionRefreshResult<T>> {
  await update();
  onConfirmed();
  try {
    return { status: "updated", value: await refresh() };
  } catch (error) {
    return { status: "refresh-failed", error };
  }
}

/** Replace only the current user's reaction for one post, preserving others. */
export function applyOwnPostReaction<T extends { post_id: string; user_id: string; emoji: string }>(
  reactions: T[],
  postId: string,
  userId: string,
  emoji: string | null,
): T[] {
  const others = reactions.filter((reaction) => !(reaction.post_id === postId && reaction.user_id === userId));
  return emoji === null ? others : [...others, { post_id: postId, user_id: userId, emoji } as T];
}
