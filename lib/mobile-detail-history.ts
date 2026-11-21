export type MobileDetailTab = 'chats' | 'contacts' | 'channels' | 'profile' | 'settings';

export type MobileDetailHistorySnapshot = {
  tab: MobileDetailTab;
  selectedChatId: string | null;
  selectedGroupId: string | null;
  selectedChannelId: string | null;
  profileTargetId: string | null;
  selectedBot: 'days' | 'mood' | null;
};

export const MOBILE_DETAIL_HISTORY_KEY = '__ikonosferaMobileDetail';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNullableId(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && UUID.test(value));
}

/** Preserve framework-owned history fields while attaching only view identifiers. */
export function createMobileDetailHistoryState(
  currentState: unknown,
  snapshot: MobileDetailHistorySnapshot
): Record<string, unknown> {
  const existing = isRecord(currentState) ? currentState : {};
  return { ...existing, [MOBILE_DETAIL_HISTORY_KEY]: snapshot };
}

/** Read a validated messenger view snapshot from a browser history entry. */
export function readMobileDetailHistorySnapshot(state: unknown): MobileDetailHistorySnapshot | null {
  if (!isRecord(state)) return null;
  const value = state[MOBILE_DETAIL_HISTORY_KEY];
  if (!isRecord(value)) return null;

  const validTabs: MobileDetailTab[] = ['chats', 'contacts', 'channels', 'profile', 'settings'];
  if (!validTabs.includes(value.tab as MobileDetailTab)) return null;
  if (!isNullableId(value.selectedChatId)
    || !isNullableId(value.selectedGroupId)
    || !isNullableId(value.selectedChannelId)
    || !isNullableId(value.profileTargetId)) return null;
  if (value.selectedBot !== null && value.selectedBot !== 'days' && value.selectedBot !== 'mood') return null;

  // AppShell only pushes a history entry for one active detail view. Reject
  // stale or hand-crafted state that combines unrelated views or opens none.
  const activeViews = [
    value.selectedChatId,
    value.selectedGroupId,
    value.selectedChannelId,
    value.profileTargetId,
    value.selectedBot
  ].filter(item => item !== null).length;
  if (activeViews !== 1) return null;

  return {
    tab: value.tab as MobileDetailTab,
    selectedChatId: value.selectedChatId,
    selectedGroupId: value.selectedGroupId,
    selectedChannelId: value.selectedChannelId,
    profileTargetId: value.profileTargetId,
    selectedBot: value.selectedBot
  };
}
