/** Keyboard movement for the responsive status-emoji button grid. */
export function getStatusEmojiGridTarget(
 currentIndex:number,
 key:string,
 itemCount:number,
 columnCount:number
):number|null{
 if(!Number.isInteger(currentIndex)||!Number.isInteger(itemCount)||!Number.isInteger(columnCount)
  ||itemCount<1||columnCount<1||currentIndex<0||currentIndex>=itemCount)return null;
 if(key==='Home')return 0;
 if(key==='End')return itemCount-1;
 const row=Math.floor(currentIndex/columnCount);
 const column=currentIndex%columnCount;
 if(key==='ArrowLeft')return column>0?currentIndex-1:null;
 if(key==='ArrowRight'){
  const rowStart=row*columnCount;
  const rowLength=Math.min(columnCount,itemCount-rowStart);
  return column+1<rowLength?currentIndex+1:null;
 }
 if(key==='ArrowUp'){
  if(row===0)return null;
  const targetStart=(row-1)*columnCount;
  const targetLength=Math.min(columnCount,itemCount-targetStart);
  return targetStart+Math.min(column,targetLength-1);
 }
 if(key==='ArrowDown'){
  const targetStart=(row+1)*columnCount;
  if(targetStart>=itemCount)return null;
  const targetLength=Math.min(columnCount,itemCount-targetStart);
  return targetStart+Math.min(column,targetLength-1);
 }
 return null;
}
