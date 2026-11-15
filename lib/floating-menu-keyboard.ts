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

function normalizeMenuSearchText(value:string):string{
  return value.normalize('NFKD').replace(/\\p{M}/gu,'').toLocaleLowerCase();
}

/**
 * Find the next menu item whose accessible label starts with the query.
 * Repeated copies of one character cycle through matching items.
 */
export function nextFloatingMenuTypeaheadIndex(
  labels:readonly string[],
  currentIndex:number,
  query:string
):number|null{
  if(labels.length===0)return null;
  const normalizedQuery=normalizeMenuSearchText(query);
  if(!normalizedQuery)return null;
  const characters=Array.from(normalizedQuery);
  const needle=characters.length>1&&characters.every(character=>character===characters[0])
    ?characters[0]:normalizedQuery;
  const current=Number.isInteger(currentIndex)&&currentIndex>=0&&currentIndex<labels.length
    ?currentIndex:-1;
  const start=current<0?0:(current+1)%labels.length;
  for(let offset=0;offset<labels.length;offset+=1){
    const index=(start+offset)%labels.length;
    if(normalizeMenuSearchText(labels[index]??'').startsWith(needle))return index;
  }
  return null;
}
