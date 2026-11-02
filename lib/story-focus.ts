/** Decide whether Tab must wrap within the story viewer's focusable controls.
 * A focus outside the dialog is brought back inside on the next Tab press. */
export function getStoryTabTarget(
 activeIndex:number,
 controlCount:number,
 shiftKey:boolean
):number|null{
 if(controlCount<=0)return null;
 if(activeIndex<0)return shiftKey?controlCount-1:0;
 if(shiftKey&&activeIndex===0)return controlCount-1;
 if(!shiftKey&&activeIndex===controlCount-1)return 0;
 return null;
}
