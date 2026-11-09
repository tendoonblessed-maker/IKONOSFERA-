/**
 * Synchronous, account/chat-scoped lease for direct text message submissions.
 * React state is a render signal, not a same-turn mutex. A lease token ensures
 * that an older completion cannot release a newer submission for the same chat.
 */
export class DirectMessageSendLock {
  private sequence = 0;
  private readonly active = new Map<string, number>();

  acquire(key: string): number | null {
    if (!key || this.active.has(key)) return null;
    const token = ++this.sequence;
    this.active.set(key, token);
    return token;
  }

  release(key: string, token: number): boolean {
    if (this.active.get(key) !== token) return false;
    this.active.delete(key);
    return true;
  }
}

/**
 * Clear a submitted draft only if the exact chat draft has not changed since
 * the request started. The revision catches a user retyping identical text.
 */
export function shouldClearSubmittedDraft(
  submittedRevision: number,
  currentRevision: number,
  submittedText: string,
  currentText: string
): boolean {
  const submitted = submittedText.trim();
  return submittedRevision === currentRevision
    && Boolean(submitted)
    && currentText.trim() === submitted;
}
