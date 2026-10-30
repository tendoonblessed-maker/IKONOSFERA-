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
  try{
    const value=store()?.getItem(key(userId));
    return value?cleanChatDrafts(JSON.parse(value)):{};
  }catch{return {};}
}
export function writeChatDrafts(userId:string,drafts:ChatDrafts):void{
  if(!UUID.test(userId))return;
  try{
    const storage=store();
    if(!storage)return;
    const clean=cleanChatDrafts(drafts);
    if(Object.keys(clean).length)storage.setItem(key(userId),JSON.stringify(clean));
    else storage.removeItem(key(userId));
  }catch{/* Storage quotas/disabled cookies must never block message typing. */}
}
export function clearChatDrafts(userId:string):void{
  if(!UUID.test(userId))return;
  try{store()?.removeItem(key(userId));}catch{}
}
