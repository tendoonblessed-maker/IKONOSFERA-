export type ConcurrencyGate = {
  run<T>(task:()=>Promise<T>,signal?:AbortSignal):Promise<T>;
};

type Waiter={
  resolve:()=>void;
  reject:(reason:unknown)=>void;
  signal?:AbortSignal;
  onAbort?:()=>void;
};

function abortedError():Error{
  const error=new Error('The operation was aborted while waiting for a concurrency slot');
  error.name='AbortError';
  return error;
}

/**
 * Share one concurrency budget across overlapping refresh generations.
 * Queued work is removed immediately when its owning request is aborted.
 */
export function createConcurrencyGate(limit:number):ConcurrencyGate{
  if(!Number.isInteger(limit)||limit<1){
    throw new RangeError('limit must be a positive integer');
  }

  let active=0;
  const queue:Waiter[]=[];

  const drain=()=>{
    while(active<limit&&queue.length){
      const waiter=queue.shift()!;
      if(waiter.signal?.aborted){
        if(waiter.onAbort)waiter.signal.removeEventListener('abort',waiter.onAbort);
        waiter.reject(abortedError());
        continue;
      }
      if(waiter.signal&&waiter.onAbort){
        waiter.signal.removeEventListener('abort',waiter.onAbort);
      }
      active++;
      waiter.resolve();
    }
  };

  const acquire=(signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
    if(signal?.aborted){
      reject(abortedError());
      return;
    }
    const waiter:Waiter={resolve,reject,signal};
    if(signal){
      waiter.onAbort=()=>{
        const index=queue.indexOf(waiter);
        if(index<0)return;
        queue.splice(index,1);
        if(waiter.onAbort)signal.removeEventListener('abort',waiter.onAbort);
        reject(abortedError());
      };
      signal.addEventListener('abort',waiter.onAbort,{once:true});
    }
    queue.push(waiter);
    drain();
  });

  return {
    async run<T>(task:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
      await acquire(signal);
      try{
        if(signal?.aborted)throw abortedError();
        return await task();
      }finally{
        active--;
        drain();
      }
    }
  };
}
