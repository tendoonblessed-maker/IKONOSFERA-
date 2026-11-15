/** Return the next enabled item index for a vertical ARIA menu. */
export function nextFloatingMenuIndex(key:string,currentIndex:number,itemCount:number):number|null{
  if(!Number.isInteger(itemCount)||itemCount<=0)return null;
  const current=Number.isInteger(currentIndex)&&currentIndex>=0&&currentIndex<itemCount
    ?currentIndex:-1;
  if(key==='Home')return 0;
  if(key==='End')return itemCount-1;
  if(key==='ArrowDown')return (current+1)%itemCount;
  if(key==='ArrowUp')return current<0?itemCount-1:(current-1+itemCount)%itemCount;
  return null;
}
