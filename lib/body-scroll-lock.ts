type ScrollLockDocument = Pick<Document, 'body' | 'documentElement'>;
type ScrollLockWindow = Pick<Window, 'scrollX' | 'scrollY' | 'innerWidth' | 'getComputedStyle' | 'scrollTo'>;

/**
 * Freeze the document body without losing the page position.
 * Fixed positioning is required for reliable background-scroll prevention on iOS Safari.
 */
export function lockBodyScroll(doc: ScrollLockDocument, win: ScrollLockWindow): () => void {
  const body = doc.body;
  const scrollX = Math.max(0, win.scrollX);
  const scrollY = Math.max(0, win.scrollY);
  const previous = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    overscrollBehavior: body.style.overscrollBehavior,
    paddingRight: body.style.paddingRight,
  };

  // Removing a desktop scrollbar widens the layout. Compensate while locked,
  // but preserve the exact inline value so cleanup is lossless.
  const scrollbarGap = Math.max(0, win.innerWidth - doc.documentElement.clientWidth);
  const computedPaddingRight = Number.parseFloat(win.getComputedStyle(body).paddingRight);

  body.style.position = 'fixed';
  body.style.top = scrollY === 0 ? '0px' : `-${scrollY}px`;
  body.style.left = scrollX === 0 ? '0px' : `-${scrollX}px`;
  body.style.right = '0';
  body.style.width = 'auto';
  body.style.overflow = 'hidden';
  body.style.overscrollBehavior = 'none';
  if (scrollbarGap > 0 && Number.isFinite(computedPaddingRight)) {
    body.style.paddingRight = `${computedPaddingRight + scrollbarGap}px`;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    Object.assign(body.style, previous);
    win.scrollTo(scrollX, scrollY);
  };
}
