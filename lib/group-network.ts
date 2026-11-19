export const GROUP_OFFLINE_DRAFT_ERROR = 'Нет интернета. Сообщение осталось в черновике.';

export function clearGroupOfflineDraftError(error: string, isOnline: boolean): string {
  return isOnline && error === GROUP_OFFLINE_DRAFT_ERROR ? '' : error;
}
