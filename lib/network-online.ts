'use client';

import {useSyncExternalStore} from 'react';

type NetworkWindow=Pick<Window,'addEventListener'|'removeEventListener'>;
type NetworkDocument=Pick<Document,'addEventListener'|'removeEventListener'>;
type NetworkNavigator=Pick<Navigator,'onLine'>;

/** Subscribe to browser connectivity and mobile page-resume signals. */
export function subscribeNetworkOnline(
 onStoreChange:()=>void,
 win?:NetworkWindow,
 doc?:NetworkDocument
):()=>void{
 const targetWindow=win??(typeof window==='undefined'?undefined:window);
 const targetDocument=doc??(typeof document==='undefined'?undefined:document);
 if(!targetWindow||!targetDocument)return ()=>{};

 targetWindow.addEventListener('online',onStoreChange);
 targetWindow.addEventListener('offline',onStoreChange);
 targetWindow.addEventListener('pageshow',onStoreChange);
 targetWindow.addEventListener('focus',onStoreChange);
 targetDocument.addEventListener('visibilitychange',onStoreChange);

 return ()=>{
  targetWindow.removeEventListener('online',onStoreChange);
  targetWindow.removeEventListener('offline',onStoreChange);
  targetWindow.removeEventListener('pageshow',onStoreChange);
  targetWindow.removeEventListener('focus',onStoreChange);
  targetDocument.removeEventListener('visibilitychange',onStoreChange);
 };
}

/** Read the live browser snapshot; SSR falls back to the hydration-safe value. */
export function getNetworkOnlineSnapshot(
 source:NetworkNavigator|null|undefined=typeof navigator==='undefined'?undefined:navigator
):boolean{
 return source?.onLine??true;
}

/** Keep server markup deterministic, then reconcile with navigator.onLine after hydration. */
export function getNetworkOnlineServerSnapshot():boolean{
 return true;
}

export function useNetworkOnline():boolean{
 return useSyncExternalStore(
  subscribeNetworkOnline,
  getNetworkOnlineSnapshot,
  getNetworkOnlineServerSnapshot
 );
}
