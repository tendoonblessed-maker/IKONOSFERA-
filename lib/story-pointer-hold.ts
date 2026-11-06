/** Return true only when the pointer ending is the one that paused a story. */
export function isActiveStoryPointer(activePointerId:number|null,eventPointerId:number):boolean{
 return activePointerId!==null&&activePointerId===eventPointerId;
}
