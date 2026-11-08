/** Decide whether Enter should submit the group composer.
 * IME confirmation keys must remain text input, even on Safari where
 * isComposing can be false while the legacy keyCode is still 229.
 */
type GroupComposerKeyboardEvent = Pick<
  KeyboardEvent,
  'key' | 'isComposing' | 'keyCode' | 'repeat' | 'ctrlKey' | 'metaKey' | 'shiftKey'
>;

export function shouldSubmitGroupMessage(
  event: GroupComposerKeyboardEvent,
  finePointer: boolean
): boolean {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || event.repeat) {
    return false;
  }

  // Desktop: Enter submits. Mobile: use Ctrl/Cmd+Enter to submit.
  // Shift+Enter always inserts a newline unless an explicit Ctrl/Cmd shortcut is used.
  return event.ctrlKey || event.metaKey || (!event.shiftKey && finePointer);
}
