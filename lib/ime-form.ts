/** Prevent a single-line form from submitting when Enter only confirms IME text. */
type ImeFormKeyEvent = Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode'>;

export function shouldPreventImeFormSubmit(event: ImeFormKeyEvent): boolean {
  return event.key === 'Enter' && (event.isComposing || event.keyCode === 229);
}
