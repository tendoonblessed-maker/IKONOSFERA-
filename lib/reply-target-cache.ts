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


/** Identity captured by a reply-target read. A chat ID alone is not an owner:
 * the same conversation can be visible under two accounts or after token rotation. */
export type ReplyTargetOwner = {
  chatId:string|null;
  userId:string;
  accessToken:string;
};

/** Reject a response as soon as the committed chat/account/session changes. */
export function isReplyTargetOwnerCurrent(
  expected:ReplyTargetOwner,
  current:ReplyTargetOwner
):boolean{
  return Boolean(expected.chatId&&expected.userId&&expected.accessToken)
    &&expected.chatId===current.chatId
    &&expected.userId===current.userId
    &&expected.accessToken===current.accessToken;
}


export type MapWithConcurrencyOptions={
  shouldContinue?:()=>boolean;
  onError?:(error:unknown)=>void;
};

/**
 * Run independent reads with a bounded number of workers while preserving
 * input order. Stop scheduling queued work after the first failure or when
 * the owning UI context is no longer current.
 */
export async function mapWithConcurrency<T,R>(
  items:readonly T[],
  concurrency:number,
  mapper:(item:T,index:number)=>Promise<R>,
  options:MapWithConcurrencyOptions={}
):Promise<R[]>{
  if(!Number.isInteger(concurrency)||concurrency<1){
    throw new RangeError('concurrency must be a positive integer');
  }
  const results=new Array<R>(items.length);
  let nextIndex=0;
  let failed=false;
  let failure:unknown;
  const shouldContinue=options.shouldContinue??(()=>true);
  const worker=async()=>{
    while(!failed&&shouldContinue()){
      const index=nextIndex++;
      if(index>=items.length)return;
      try{
        results[index]=await mapper(items[index],index);
      }catch(error){
        if(!failed){
          failed=true;
          failure=error;
          options.onError?.(error);
        }
        return;
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},()=>worker()));
  if(failed)throw failure;
  return results;
}
