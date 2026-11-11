export type ReplyTargetVersions=Map<string,number>;

export function bumpReplyTargetVersion(versions:ReplyTargetVersions,id:string):number{
  const next=(versions.get(id)??0)+1;
  versions.set(id,next);
  return next;
}

export function snapshotReplyTargetVersions(
  ids:readonly string[],
  versions:ReadonlyMap<string,number>
):Map<string,number>{
  const snapshot=new Map<string,number>();
  for(const id of ids)snapshot.set(id,versions.get(id)??0);
  return snapshot;
}

export function isReplyTargetVersionCurrent(
  id:string,
  versions:ReadonlyMap<string,number>,
  snapshot:ReadonlyMap<string,number>
):boolean{
  return (versions.get(id)??0)===(snapshot.get(id)??0);
}

/** A Realtime hint invalidates only the matching target; stale GET results are discarded. */
export function filterReplyTargetsForCurrentVersion<T extends {id:string}>(
  targets:T[],
  versions:ReadonlyMap<string,number>,
  snapshot:ReadonlyMap<string,number>
):T[]{
  return targets.filter(target=>isReplyTargetVersionCurrent(target.id,versions,snapshot));
}
