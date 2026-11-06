/**
 * Synchronous, context-scoped single-flight guard for group message submits.
 * React state is only a render signal; it cannot prevent two submit handlers
 * from entering before the next render. Tokens ensure a stale completion
 * cannot release a newer request for the same account/group.
 */
export class GroupSendLock {
  private sequence = 0;
  private readonly active = new Map<string, number>();

  acquire(key: string): number | null {
    if (!key || this.active.has(key)) return null;
    const token = ++this.sequence;
    this.active.set(key, token);
    return token;
  }

  isLocked(key: string): boolean {
    return this.active.has(key);
  }

  release(key: string, token: number): boolean {
    if (this.active.get(key) !== token) return false;
    this.active.delete(key);
    return true;
  }
}
