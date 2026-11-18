/** Keep the attachment caption shortcut from sending an IME confirmation keystroke. */
export type AttachmentPreviewKeyboardEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'isComposing' | 'keyCode'>;

export function shouldSendAttachmentPreviewOnShortcut(event: AttachmentPreviewKeyboardEvent): boolean {
  return event.key === 'Enter'
    && (event.ctrlKey || event.metaKey)
    && !event.isComposing
    && event.keyCode !== 229;
}
