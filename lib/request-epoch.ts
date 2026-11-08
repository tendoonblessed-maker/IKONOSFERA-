/** Monotonic request generation: only the latest UI request may commit results. */
export function createRequestEpoch() {
  let current = 0;
  return {
    begin(): number {
      current += 1;
      return current;
    },
    isCurrent(epoch: number): boolean {
      return epoch === current;
    },
    invalidate(): void {
      current += 1;
    },
  };
}
