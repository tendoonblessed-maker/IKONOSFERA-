/**
 * An inbox query may finish after a newer poll, a Realtime refresh or logout.
 * Its response must not overwrite the latest snapshot or another account's
 * cached previews. IDs are monotonically increasing only within a component.
 */
function isValidSnapshotGeneration(value:number):boolean{
 return Number.isSafeInteger(value)&&value>0;
}

export function isLatestAccountSnapshot(
 requestId:number,
 latestRequestId:number,
 requestOwnerId:string,
 activeOwnerId:string
):boolean{
 // Fail closed if a corrupted counter (NaN, Infinity, a fraction or an
 // exhausted safe-integer range) could make an old response look current.
 return isValidSnapshotGeneration(requestId)
  &&isValidSnapshotGeneration(latestRequestId)
  &&requestId===latestRequestId
  &&typeof requestOwnerId==='string'
  &&requestOwnerId.trim().length>0
  &&requestOwnerId===activeOwnerId;
}
