export type DialogTabEvent = {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
};

function isDialogTabStop(element: HTMLElement): boolean {
  if (element.tabIndex < 0) return false;
  if (element.matches(':disabled,[hidden],[aria-hidden="true"]')) return false;
  if (element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;

  // getClientRects catches display:none on the element or one of its ancestors.
  if (element.getClientRects().length === 0) return false;

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) {
    return false;
  }
  return true;
}

/** Keep keyboard Tab navigation inside a modal dialog. */
export function trapDialogTab(
  event: DialogTabEvent,
  dialog: HTMLElement | null,
  activeElement: Element | null
): boolean {
  if (event.key !== 'Tab' || !dialog) return false;

  const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href],area[href],button,input,select,textarea,summary,iframe,audio[controls],video[controls],[contenteditable="true"],[contenteditable="plaintext-only"],[tabindex]'
  )).filter(isDialogTabStop);
  if (!controls.length) {
    event.preventDefault();
    dialog.focus({preventScroll: true});
    return true;
  }

  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/** Return focus to the opener without jumping the underlying chat/profile scroll. */
export function restoreDialogFocus(previousFocus: HTMLElement | null): void {
  // The opener can become disabled, hidden or inert while the dialog is open.
  // Reuse the tab-stop guard so focus is never restored behind an inaccessible ancestor.
  if (previousFocus?.isConnected && isDialogTabStop(previousFocus)) {
    previousFocus.focus({preventScroll: true});
  }
}
