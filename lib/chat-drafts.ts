/**
 * Private per-account chat drafts for the lifetime of this browser tab.
 * No message text is sent to a server or shared across accounts/windows.
 * sessionStorage is deliberately used instead of durable localStorage.
 */
const PREFIX='ikonosfera-drafts-tab-v1:';
const MAX_CHATS=48;
const MAX_TEXT=4000;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type ChatDrafts=Record<string,string>;

// Keep the latest draft in this tab when sessionStorage is temporarily
// unavailable (private browsing, quota errors, blocked cookies). Pending
// writes are retried before a read, including empty writes from sign-out:
// otherwise a failed removeItem could resurrect an old private draft.
const memoryDrafts=new Map<string,ChatDrafts>();
const pendingOwners=new Set<string>();

function flushPendingDrafts(userId:string):void{
  if(!pendingOwners.has(userId))return;
  try{
    const storage=store();
    if(!storage)return;
    const drafts=memoryDrafts.get(userId)??{};
    if(Object.keys(drafts).length)storage.setItem(key(userId),JSON.stringify(drafts));
    else storage.removeItem(key(userId));
    pendingOwners.delete(userId);
  }catch{/* Keep the pending draft/tombstone until storage recovers. */}
}

function store():Storage|null{
  try{return typeof window==='undefined'?null:window.sessionStorage;}
  catch{return null;} // Safari private mode and disabled storage must work.
}
function key(userId:string){return PREFIX+userId;}
/** Keep the most recently edited valid drafts when the storage cap is reached.
 * Object insertion order records edits: writers move changed IDs to the end.
 * Invalid/blank entries must not consume one of the 48 slots.
 */
export function cleanChatDrafts(input:unknown):ChatDrafts{
  if(!input||typeof input!=='object'||Array.isArray(input))return {};
  const recent=new Map<string,string>();
  for(const [chatId,text] of Object.entries(input)){
    if(!UUID.test(chatId)||typeof text!=='string')continue;
    const limited=text.slice(0,MAX_TEXT);
    if(!limited.trim())continue;
    recent.set(chatId,limited);
    if(recent.size>MAX_CHATS){
      const oldest=recent.keys().next().value;
      if(oldest!==undefined)recent.delete(oldest);
    }
  }
  return Object.fromEntries(recent);
}

/** Update both the draft contents and its recency, bounded in memory as well. */
export function updateChatDraftEntry(drafts:ChatDrafts,chatId:string,text:string):ChatDrafts{
  const next=cleanChatDrafts(drafts);
  if(!UUID.test(chatId))return next;
  delete next[chatId];
  if(text.trim())next[chatId]=text.slice(0,MAX_TEXT);
  return cleanChatDrafts(next);
}
export function readChatDrafts(userId:string):ChatDrafts{
  if(!UUID.test(userId))return {};
  flushPendingDrafts(userId);
  // A stale storage value must never override an unsaved edit or logout.
  if(pendingOwners.has(userId))return {...(memoryDrafts.get(userId)??{})};
  try{
    const storage=store();
    if(!storage)return {...(memoryDrafts.get(userId)??{})};
    const value=storage.getItem(key(userId));
    const clean=value?cleanChatDrafts(JSON.parse(value)):{};
    memoryDrafts.set(userId,clean);
    return {...clean};
  }catch{return {...(memoryDrafts.get(userId)??{})};}
}
export function writeChatDrafts(userId:string,drafts:ChatDrafts):void{
  if(!UUID.test(userId))return;
  memoryDrafts.set(userId,cleanChatDrafts(drafts));
  pendingOwners.add(userId);
  flushPendingDrafts(userId);
}
export function clearChatDrafts(userId:string):void{
  if(!UUID.test(userId))return;
  memoryDrafts.set(userId,{});
  pendingOwners.add(userId);
  flushPendingDrafts(userId);
}
