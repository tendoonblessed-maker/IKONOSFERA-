/**
 * Copy text using the async Clipboard API when available, with a synchronous
 * selection-based fallback for browsers and installed PWAs that lack it.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof text !== 'string') throw new TypeError('Clipboard text must be a string');

  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission or secure-context failures may still allow the legacy fallback.
    }
  }

  if (typeof document === 'undefined' || !document.body || typeof document.execCommand !== 'function') {
    throw new Error('Clipboard copy is unavailable in this browser');
  }

  const activeElement = document.activeElement as HTMLElement | null;
  const selection = document.getSelection();
  const savedRanges: Range[] = [];
  // DOM Selection does not represent the caret/range inside an input or
  // textarea. Preserve that control-specific selection separately.
  let controlSelection: {
    element: HTMLInputElement | HTMLTextAreaElement;
    start: number;
    end: number;
    direction: 'forward' | 'backward' | 'none' | null;
  } | null = null;
  if (activeElement && 'selectionStart' in activeElement && 'selectionEnd' in activeElement) {
    const control = activeElement as HTMLInputElement | HTMLTextAreaElement;
    try {
      const start = control.selectionStart;
      const end = control.selectionEnd;
      if (typeof start === 'number' && typeof end === 'number') {
        controlSelection = {
          element: control,
          start,
          end,
          direction: control.selectionDirection
        };
      }
    } catch {
      // Some input types (for example, number) do not expose text selection.
    }
  }
  if (selection) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      try {
        savedRanges.push(selection.getRangeAt(index).cloneRange());
      } catch {
        // A selection can disappear while the browser changes focus.
      }
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.tabIndex = -1;
  Object.assign(textarea.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    padding: '0',
    border: '0',
    opacity: '0',
    fontSize: '16px'
  });

  document.body.appendChild(textarea);
  let copied = false;
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
    if (activeElement?.isConnected) {
      try {
        activeElement.focus({ preventScroll: true });
      } catch {
        // Focus restoration is best-effort and must not hide the copy result.
      }
    }
    if (selection) {
      try {
        selection.removeAllRanges();
        savedRanges.forEach(range => selection.addRange(range));
      } catch {
        // Restoring a stale browser selection is best-effort.
      }
    }
    if (controlSelection?.element.isConnected) {
      try {
        const { element, start, end, direction } = controlSelection;
        if (direction) element.setSelectionRange(start, end, direction);
        else element.setSelectionRange(start, end);
      } catch {
        // Selection restoration is best-effort for unsupported input types.
      }
    }
  }

  if (!copied) throw new Error('Clipboard copy is unavailable in this browser');
}
