/**
 * Decide whether a cross-tab auth change crossed an account boundary.
 *
 * The JWT subject is read only to decide whether tab-local drafts must be
 * cleared. This is not authentication or token validation; Supabase Auth
 * remains the authority for accepting the session.
 */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function subjectFromAccessToken(token:unknown):string|null{
  if(typeof token!=='string')return null;
  const parts=token.split('.');
  if(parts.length!==3||!parts[1]||!/^[A-Za-z0-9_-]+$/.test(parts[1]))return null;
  try{
    const base64=parts[1].replace(/-/g,'+').replace(/_/g,'/');
    const padded=base64+'='.repeat((4-base64.length%4)%4);
    const binary=atob(padded);
    const bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
    const payload:unknown=JSON.parse(new TextDecoder().decode(bytes));
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return null;
    const sub=(payload as {sub?:unknown}).sub;
    return typeof sub==='string'&&UUID.test(sub)?sub.toLowerCase():null;
  }catch{
    return null;
  }
}

/**
 * Return true only when the current tab must discard drafts owned by the
 * signed-in user before it reloads for a cross-tab session change.
 *
 * A refresh-token/access-token rotation for the same user preserves drafts.
 * Logout, account switch, or an unreadable token fails closed and clears them.
 */
export function shouldClearPrivateDraftsAfterSessionChange(
  currentUserId:string,
  nextAccessToken:unknown
):boolean{
  if(!currentUserId)return false;
  if(!UUID.test(currentUserId))return true;
  const nextUserId=subjectFromAccessToken(nextAccessToken);
  return !nextUserId||nextUserId!==currentUserId.toLowerCase();
}
