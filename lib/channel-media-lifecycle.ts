type PausableMediaElement = Pick<HTMLMediaElement,'pause'>;

/**
 * Pause every media element in a channel feed without letting one broken
 * browser media node prevent cleanup of the remaining players.
 */
export function pauseMediaElements(
  elements:ArrayLike<PausableMediaElement>|null|undefined
):void{
  if(!elements)return;
  let length=0;
  try{length=elements.length;}catch{return;}
  for(let index=0;index<length;index++){
    let element:PausableMediaElement|undefined;
    try{element=elements[index];}catch{continue;}
    if(!element||typeof element.pause!=='function')continue;
    try{element.pause();}catch{
      // A detached or already-disposed browser player must not block others.
    }
  }
}
