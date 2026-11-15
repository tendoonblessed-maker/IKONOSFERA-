type SessionIdentity = {
  access_token: string;
  refresh_token: string;
} | null | undefined;

/**
 * A BFCache document may miss cross-tab storage events while suspended.
 * Compare both tokens so logout, account replacement, and refresh-token
 * rotation force a clean bootstrap before the old private UI is reused.
 */
export function shouldReloadAfterBfcacheRestore(
  persisted: boolean,
  expected: SessionIdentity,
  stored: SessionIdentity
): boolean {
  if (!persisted) return false;
  return expected?.access_token !== stored?.access_token
    || expected?.refresh_token !== stored?.refresh_token;
}


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
 * When a BFCache page detects a changed session, discard the old owner's
 * tab-local drafts only if the account boundary changed. Token rotation for
 * the same subject must preserve drafts. An unreadable next subject fails
 * closed because the old private text must not survive an unknown identity.
 */
export function shouldClearDraftsAfterBfcacheRestore(
  persisted:boolean,
  currentUserId:string,
  storedAccessToken:unknown
):boolean{
  if(!persisted||!currentUserId)return false;
  if(!UUID.test(currentUserId))return true;
  const nextUserId=subjectFromAccessToken(storedAccessToken);
  return !nextUserId||nextUserId!==currentUserId.toLowerCase();
}
