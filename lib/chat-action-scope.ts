/** Scope guard for asynchronous actions on one private conversation.
 * A response is allowed to update UI only while the same account, chat and
 * chat-context generation are still active.
 */
export type ChatActionScope = {
  chatId: string;
  userId: string;
  generation: number;
};

export function isCurrentChatAction(
  started: ChatActionScope,
  current: ChatActionScope
): boolean {
  return Boolean(
    started.chatId &&
    started.userId &&
    started.chatId === current.chatId &&
    started.userId === current.userId &&
    started.generation === current.generation
  );
}
