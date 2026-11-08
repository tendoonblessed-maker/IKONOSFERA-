type PausableMediaElement = Pick<HTMLMediaElement,'pause'>;
type RemovedNodeLike = {
  pause?: unknown;
  querySelectorAll?: (selectors:string)=>ArrayLike<PausableMediaElement>|null;
};
type MutationObserverLike = Pick<MutationObserver,'observe'|'disconnect'>;
type MutationObserverConstructor = new (callback:MutationCallback)=>MutationObserverLike;

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

/**
 * A removed post can contain a player that was still playing when React
 * removed its DOM subtree. Pause the node itself and any nested players.
 */
export function pauseRemovedMediaNodes(
  records:ArrayLike<Pick<MutationRecord,'removedNodes'>>|null|undefined
):void{
  if(!records)return;
  let recordCount=0;
  try{recordCount=records.length;}catch{return;}
  for(let recordIndex=0;recordIndex<recordCount;recordIndex++){
    let removedNodes:ArrayLike<Node>|undefined;
    try{removedNodes=records[recordIndex]?.removedNodes;}catch{continue;}
    if(!removedNodes)continue;
    let nodeCount=0;
    try{nodeCount=removedNodes.length;}catch{continue;}
    for(let nodeIndex=0;nodeIndex<nodeCount;nodeIndex++){
      let rawNode:unknown;
      try{rawNode=removedNodes[nodeIndex];}catch{continue;}
      if(!rawNode||typeof rawNode!=='object')continue;
      const node=rawNode as RemovedNodeLike;
      if(typeof node.pause==='function')pauseMediaElements([node as PausableMediaElement]);
      if(typeof node.querySelectorAll!=='function')continue;
      let descendants:ArrayLike<PausableMediaElement>|null|undefined;
      try{descendants=node.querySelectorAll('audio,video');}catch{continue;}
      pauseMediaElements(descendants);
    }
  }
}

/** Observe removed post subtrees so deleting/replacing a post stops its players. */
export function observeRemovedMediaElements(
  root:Element,
  Observer:MutationObserverConstructor=MutationObserver
):()=>void{
  const observer=new Observer(records=>pauseRemovedMediaNodes(records));
  observer.observe(root,{childList:true,subtree:true});
  return()=>observer.disconnect();
}
