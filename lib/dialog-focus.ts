/** Returns the focusable index to use when Tab leaves a dialog boundary. */
export function dialogTabTarget(currentIndex:number,count:number,shiftKey:boolean):number|null{
 if(count<=0)return -1;
 if(shiftKey&&currentIndex<=0)return count-1;
 if(!shiftKey&&(currentIndex<0||currentIndex>=count-1))return 0;
 return null;
}
