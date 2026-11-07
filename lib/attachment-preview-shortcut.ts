/** Safe keyboard shortcut for sending a prepared attachment.
 * IME confirmation keys and auto-repeat must never trigger an upload.
 */
export type AttachmentPreviewKey = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  keyCode?: number;
};

export function shouldSendAttachmentPreview(event: AttachmentPreviewKey): boolean {
  return event.key === 'Enter' &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.repeat &&
    !event.isComposing &&
    event.keyCode !== 229;
}
