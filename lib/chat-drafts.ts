/**
 * Private per-account chat drafts for the lifetime of this browser tab.
 * No message text is sent to a server or shared across accounts/windows.
 * sessionStorage is deliberately used instead of durable localStorage.
 */
const PREFIX='ikonosfera-drafts-tab-v1:';
const MAX_CHATS=48;
const MAX_TEXT=4000;
const CHAT_ID=/^[a-f0-9-]{36}$/i;
const USER_ID=/^[a-f0-9-]{36}$/i;

export type ChatDrafts=Record<string,string>;

function store():Storage|null{
  try{return typeof window==='undefined'?null:window.sessionStorage;}
  catch{return null;} // Safari private mode and disabled storage must work.
}
function key(userId:string){return PREFIX+userId;}
export function cleanChatDrafts(input:unknown):ChatDrafts{
  if(!input||typeof input!=='object'||Array.isArray(input))return {};
  const output:ChatDrafts={};
  for(const [chatId,text] of Object.entries(input).slice(0,MAX_CHATS)){
    if(!CHAT_ID.test(chatId)||typeof text!=='string')continue;
    const trimmed=text.slice(0,MAX_TEXT);
    if(trimmed.trim())output[chatId]=trimmed;
  }
  return output;
}
export function readChatDrafts(userId:string):ChatDrafts{
  if(!USER_ID.test(userId))return {};
  try{
    const value=store()?.getItem(key(userId));
    return value?cleanChatDrafts(JSON.parse(value)):{};
  }catch{return {};}
}
export function writeChatDrafts(userId:string,drafts:ChatDrafts):void{
  if(!USER_ID.test(userId))return;
  try{
    const storage=store();
    if(!storage)return;
    const clean=cleanChatDrafts(drafts);
    if(Object.keys(clean).length)storage.setItem(key(userId),JSON.stringify(clean));
    else storage.removeItem(key(userId));
  }catch{/* Storage quotas/disabled cookies must never block message typing. */}
}
export function clearChatDrafts(userId:string):void{
  if(!USER_ID.test(userId))return;
  try{store()?.removeItem(key(userId));}catch{}
}
