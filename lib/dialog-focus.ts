export type DialogTabEvent = {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
};

/** Keep keyboard Tab navigation inside a modal dialog. */
export function trapDialogTab(
  event: DialogTabEvent,
  dialog: HTMLElement | null,
  activeElement: Element | null
): boolean {
  if (event.key !== 'Tab' || !dialog) return false;

  const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  ));
  if (!controls.length) {
    event.preventDefault();
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
  if (previousFocus?.isConnected && !previousFocus.hasAttribute('hidden')) {
    previousFocus.focus({preventScroll: true});
  }
}
