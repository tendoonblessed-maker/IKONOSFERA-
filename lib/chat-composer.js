/**
 * Keep chat composers usable on browsers that do not implement CSS field-sizing.
 * Reset to auto before reading scrollHeight so the textarea can also shrink.
 * @param {Pick<HTMLTextAreaElement, 'style' | 'scrollHeight'> | null | undefined} element
 */
function resizeChatComposer(element) {
  if (!element) return;
  element.style.height = 'auto';
  const contentHeight = element.scrollHeight;
  if (!Number.isFinite(contentHeight) || contentHeight < 0) return;
  element.style.height = `${Math.min(contentHeight, 136)}px`;
}

module.exports = { resizeChatComposer };
