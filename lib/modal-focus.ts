/**
 * Keyboard focus must remain inside an open modal. This pure helper only
 * chooses a wrap target; callers own DOM focus and preventDefault().
 * When focus escaped to the background, recover at the appropriate edge.
 */
export function focusWrapTarget<T>(
 focusable:readonly T[],active:T|null,backwards:boolean
):T|null{
 if(focusable.length===0)return null;
 const first=focusable[0];
 const last=focusable[focusable.length-1];
 if(!focusable.includes(active as T))return backwards?last:first;
 if(backwards&&active===first)return last;
 if(!backwards&&active===last)return first;
 return null;
}
