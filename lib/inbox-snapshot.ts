/**
 * An inbox query may finish after a newer poll, a Realtime refresh or logout.
 * Its response must not overwrite the latest snapshot or another account's
 * cached previews. IDs are monotonically increasing only within a component.
 */
export function isLatestAccountSnapshot(
 requestId:number,
 latestRequestId:number,
 requestOwnerId:string,
 activeOwnerId:string
):boolean{
 return requestId===latestRequestId
  &&Boolean(requestOwnerId)
  &&requestOwnerId===activeOwnerId;
}
