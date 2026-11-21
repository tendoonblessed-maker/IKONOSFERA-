/**
 * Protect profile panels from overlapping async reloads. A newer load or an
 * effect cleanup invalidates older results before they can update the UI.
 */
export function createProfileReloadGate(){
 let latest=0;
 return {
  begin(){return ++latest;},
  isCurrent(requestId:number){return Number.isSafeInteger(requestId)&&requestId>0&&requestId===latest;},
  invalidate(){latest+=1;},
 };
}
