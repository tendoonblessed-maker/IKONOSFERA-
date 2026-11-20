export type UnreadBadge = {
  count: number;
  visible: string;
  ariaLabel: string;
};
export function formatUnreadBadge(value: unknown): UnreadBadge | null;
