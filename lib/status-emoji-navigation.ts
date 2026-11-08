/** Roving-focus navigation for the status radio group.
 * Index 0 is the "no status" option; emoji choices follow in display order.
 */
export function getNextStatusEmojiFocusIndex(
 currentIndex:number,
 key:string,
 itemCount:number
):number|null{
 if(!Number.isSafeInteger(itemCount)||itemCount<1)return null;
 const current=Number.isSafeInteger(currentIndex)&&currentIndex>=0&&currentIndex<itemCount
  ?currentIndex:0;
 switch(key){
  case 'ArrowRight':
  case 'ArrowDown':
   return (current+1)%itemCount;
  case 'ArrowLeft':
  case 'ArrowUp':
   return (current-1+itemCount)%itemCount;
  case 'Home':
   return 0;
  case 'End':
   return itemCount-1;
  default:
   return null;
 }
}
