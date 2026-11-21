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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
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
  if (!isNullableString(value.selectedChatId)
    || !isNullableString(value.selectedGroupId)
    || !isNullableString(value.selectedChannelId)
    || !isNullableString(value.profileTargetId)) return null;
  if (value.selectedBot !== null && value.selectedBot !== 'days' && value.selectedBot !== 'mood') return null;

  return {
    tab: value.tab as MobileDetailTab,
    selectedChatId: value.selectedChatId,
    selectedGroupId: value.selectedGroupId,
    selectedChannelId: value.selectedChannelId,
    profileTargetId: value.profileTargetId,
    selectedBot: value.selectedBot
  };
}
