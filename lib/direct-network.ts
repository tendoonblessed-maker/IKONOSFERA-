export const DIRECT_MESSAGE_OFFLINE_ERROR = 'Нет соединения с интернетом. Сообщение осталось в черновике.';
export const DIRECT_ATTACHMENT_OFFLINE_ERROR = 'Нет соединения с интернетом. Вложение осталось в предпросмотре.';

/**
 * Clear only locally generated preflight hints after connectivity returns.
 * A server/network error that happens to share the same prefix must remain visible.
 */
export function clearDirectOfflineHint(error: string, isOnline: boolean): string {
  if (!isOnline) return error;
  return error === DIRECT_MESSAGE_OFFLINE_ERROR || error === DIRECT_ATTACHMENT_OFFLINE_ERROR
    ? ''
    : error;
}
