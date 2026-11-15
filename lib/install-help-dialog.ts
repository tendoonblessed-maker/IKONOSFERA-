export type DialogFocusTarget = Pick<HTMLElement, 'focus'>;

/** Keep the one-action install-help dialog keyboard accessible. */
export function handleInstallHelpDialogKeydown(
  event: Pick<KeyboardEvent, 'key' | 'preventDefault'>,
  focusTarget: DialogFocusTarget | null,
  close: () => void
): boolean {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return true;
  }

  if (event.key === 'Tab') {
    event.preventDefault();
    focusTarget?.focus({preventScroll:true});
    return true;
  }

  return false;
}
