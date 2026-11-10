/** Optional Web App Badging API integration; never requests notification permission. */
export type AppBadgeApi={
 setAppBadge?:(contents?:number)=>Promise<void>|void;
 clearAppBadge?:()=>Promise<void>|void;
};

export type AppBadgeSynchronizer=(unreadCount:number)=>Promise<void>;

/** Serialize updates so a slow earlier badge call cannot overwrite a newer count. */
export function createAppBadgeSynchronizer(
 api:AppBadgeApi|null|undefined
):AppBadgeSynchronizer{
 let generation=0;
 let queue:Promise<void>=Promise.resolve();
 return unreadCount=>{
  const request=++generation;
  const count=Number.isFinite(unreadCount)?Math.max(0,Math.floor(unreadCount)):0;
  queue=queue.catch(()=>undefined).then(async()=>{
   // Collapse queued intermediate values; an already-running call is followed
   // by the newest value, preserving the correct final badge.
   if(request!==generation||!api)return;
   try{
    if(count>0){
     if(typeof api.setAppBadge==='function')await api.setAppBadge(count);
    }else if(typeof api.clearAppBadge==='function'){
     await api.clearAppBadge();
    }
   }catch{
    // Badge support is optional. A browser/OS rejection must never affect chat.
   }
  });
  return queue;
 };
}
