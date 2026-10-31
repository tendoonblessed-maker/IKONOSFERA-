/* Dependency-free Supabase Auth + PostgREST client.
   Never put a service-role or database password in NEXT_PUBLIC_* variables. */
export const apiUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const backendReady = Boolean(apiUrl && anonKey);

export type Session = { access_token: string; refresh_token: string; expires_at: number };
export type Profile = { id: string; username: string; display_name: string; avatar_path?: string|null; cover_path?: string|null; bio?: string; status_emoji?:number|null; age_years?:number|null };
export type DirectChat = { id: string; user_a: string; user_b: string; created_at: string; hidden_for?:string[]; pinned_for?:string[] };
export type ChatMessage = { id: string; chat_id: string; sender_id: string; body: string; created_at: string; media_path: string|null; media_type: "image"|"video"|"audio"|"file"|null; read_at: string|null; edited_at?:string|null; deleted_for?:string[]; deleted_for_everyone?:boolean; reply_to_message_id?:string|null };
const STORAGE = 'ikonosfera-session-v1';

class SupabaseHttpError extends Error {
  constructor(message:string,readonly status:number){super(message);this.name='SupabaseHttpError';}
}
type PendingRefresh={refreshToken:string;generation:number;promise:Promise<Session|null>};
let sessionRefreshPromise:PendingRefresh|null=null;
// Invalidate old async responses after logout, a new login, or another token
// rotation. Another browser tab is covered by rechecking localStorage.
let sessionGeneration=0;

function ensureReady() { if (!backendReady) throw Error('Сервер пока не подключён'); }
function headers(token?: string, extras?: Record<string,string>) {
  return { apikey: anonKey, Authorization: `Bearer ${token || anonKey}`, 'Content-Type': 'application/json', ...extras };
}
async function http<T>(path: string, options: { method?: string; token?: string; body?: unknown; extraHeaders?: Record<string,string> } = {}): Promise<T> {
  ensureReady();
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: headers(options.token, options.extraHeaders),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
    // Fail visibly instead of showing a perpetual spinner during network stalls.
    signal: AbortSignal.timeout(18000),
  });
  const raw = await response.text();
  let value: unknown;
  try { value = raw ? JSON.parse(raw) : null; } catch { value = raw; }
  if (!response.ok) {
    const error = value && typeof value === 'object' ? (value as { msg?: string; message?: string; error_description?: string }).message ?? (value as { msg?: string }).msg ?? (value as { error_description?: string }).error_description : null;
    throw new SupabaseHttpError(error || `Запрос не выполнен (${response.status})`,response.status);
  }
  return value as T;
}
export function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try { const s = JSON.parse(localStorage.getItem(STORAGE) || 'null') as Session | null; return s?.access_token && s.refresh_token ? s : null; } catch { return null; }
}
export function saveSession(s: { access_token: string; refresh_token: string; expires_in?: number; expires_at?: number }) {
  if(!s.access_token||!s.refresh_token)throw Error('Сервер не выдал действительную сессию.');
  const session: Session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? (Math.floor(Date.now()/1000) + (s.expires_in ?? 3600) - 60) };
  localStorage.setItem(STORAGE, JSON.stringify(session));
  sessionGeneration++;
  return session;
}
export function clearSession() { sessionGeneration++; localStorage.removeItem(STORAGE); }
export async function validSession(): Promise<Session | null> {
  const s=loadSession();
  if(!s)return null;
  if(s.expires_at>Math.floor(Date.now()/1000))return s;
  // A refresh token is single-use: concurrent UI requests must not refresh it
  // twice, otherwise the second request may invalidate an otherwise valid login.
  const generation=sessionGeneration;
  // Only share an in-flight refresh for the EXACT same session and generation.
  // A second login must never receive the previous account's access token.
  if(sessionRefreshPromise?.refreshToken===s.refresh_token
     &&sessionRefreshPromise.generation===generation)
    return sessionRefreshPromise.promise;
  const pending:PendingRefresh={refreshToken:s.refresh_token,generation,promise:null!};
  pending.promise=(async()=>{
    try{
      const next=await http<{access_token:string;refresh_token:string;expires_in:number}>(
        '/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:s.refresh_token}}
      );
      if(sessionGeneration!==generation||loadSession()?.refresh_token!==s.refresh_token)
        return null; // Logout, account switch, or another tab changed the session.
      return saveSession(next);
    }catch(error){
      // A revoked token only clears the session that initiated this request.
      // Network errors never silently erase the login.
      if(error instanceof SupabaseHttpError&&[400,401,403].includes(error.status)){
        if(sessionGeneration===generation&&loadSession()?.refresh_token===s.refresh_token)
          clearSession();
        return null;
      }
      // A stale network error should not disrupt a newer signed-in account.
      if(sessionGeneration!==generation||loadSession()?.refresh_token!==s.refresh_token)
        return null;
      throw error;
    }
  })().finally(()=>{
    // A delayed older request must not delete a newer refresh in progress.
    if(sessionRefreshPromise===pending)sessionRefreshPromise=null;
  });
  sessionRefreshPromise=pending;
  return pending.promise;
}
/** Development-only anonymous account. No email and no recovery after local data is lost.
 * Requires Anonymous Sign-Ins enabled in Supabase Authentication settings.
 */
export async function createTemporaryAccount() {
  const response = await http<{access_token:string;refresh_token:string;expires_in:number}>('/auth/v1/signup', { method:'POST', body: {data:{}} });
  if (!response.access_token || !response.refresh_token) throw Error('Не удалось создать тестовый аккаунт. Проверь разрешение анонимных входов в Supabase.');
  return saveSession(response);
}
export async function sendEmailCode(email: string) {
  const redirect=typeof window!=='undefined'?`?redirect_to=${encodeURIComponent(window.location.origin+'/')}`:'';
  await http(`/auth/v1/otp${redirect}`, {method:'POST',body:{email,create_user:true}});
}
/** Supabase default email templates often send a magic link, not a 6-digit OTP.
 * The implicit link redirects back with a session in the URL hash.
 * Clear credentials from the URL immediately after extracting them. */
export function consumeEmailLinkSession(): Session | null {
 if(typeof window==='undefined')return null;
 const fragment=window.location.hash.replace(/^#/,'');
 if(!fragment)return null;
 const params=new URLSearchParams(fragment);
 const access_token=params.get('access_token');
 const refresh_token=params.get('refresh_token');
 if(!access_token||!refresh_token)return null;
 const expires_in=Number(params.get('expires_in')||3600);
 window.history.replaceState({},'',window.location.pathname+window.location.search);
 return saveSession({access_token,refresh_token,expires_in:Number.isFinite(expires_in)?expires_in:3600});
}
export async function verifyEmailCode(email: string, token: string) {
  const response = await http<{access_token:string;refresh_token:string;expires_in:number}>(`/auth/v1/verify`,{method:'POST',body:{email,token,type:'email'}});
  return saveSession(response);
}
export async function currentUser(token: string) { return http<{id:string;email?:string;is_anonymous?:boolean}>('/auth/v1/user',{token}); }
export async function signOut(token: string) {
  // Local sign-out is immediate, even when the network is offline. Never clear
  // a *different* account signed in while an older logout request was pending.
  if(loadSession()?.access_token===token)clearSession();
  await http('/auth/v1/logout',{token,method:'POST'});
}
export async function myProfile(token: string, id: string) {
  const profiles=await http<Profile[]>(`/rest/v1/profiles?select=id,username,display_name,avatar_path,cover_path,bio,status_emoji&id=eq.${encodeURIComponent(id)}&limit=1`,{token});
  return profiles[0] ?? null;
}
export async function changeProfile(token: string, id: string, username: string, display_name: string) {
  const profiles=await http<Profile[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,username,display_name,avatar_path,cover_path,bio,status_emoji`,{token,method:'PATCH',body:{username,display_name},extraHeaders:{Prefer:'return=representation'}});
  if (!profiles[0]) throw Error('Профиль не найден');
  return profiles[0];
}
export async function startDirectChat(token: string, username: string) {
  return http<string>('/rest/v1/rpc/start_direct_chat',{token,method:'POST',body:{target_username:username}});
}
export async function listChats(token: string) {
  return http<DirectChat[]>('/rest/v1/rpc/list_active_chats',{token});
}
/** Single RLS-protected inbox query for last message previews and unread badges. */
export type ChatPreview = {
 chat_id:string;
 last_body:string|null;
 last_created_at:string|null;
 last_media_type:string|null;
 last_sender_id:string|null;
 unread_count:number;
};
export async function listChatPreviews(token:string):Promise<ChatPreview[]>{
 return http<ChatPreview[]>('/rest/v1/rpc/list_chat_previews',{token});
}

/** One-way saved contacts. Entries survive removing or hiding a chat. */
export type SavedContactRow = {contact_id:string};
export async function listSavedContactIds(token:string,ownerId:string):Promise<string[]>{
 const entries=await http<SavedContactRow[]>('/rest/v1/user_contacts?select=contact_id&owner_id=eq.'+encodeURIComponent(ownerId)+'&order=created_at.desc&limit=500',{token});
 return entries.map(entry=>entry.contact_id);
}
export async function saveContact(token:string,ownerId:string,contactId:string):Promise<void>{
 if(!contactId||ownerId===contactId)throw Error('Нельзя добавить себя в контакты.');
 await http('/rest/v1/user_contacts?on_conflict=owner_id,contact_id',{token,method:'POST',
  body:{owner_id:ownerId,contact_id:contactId},extraHeaders:{Prefer:'resolution=ignore-duplicates,return=minimal'}});
}
export async function deleteContact(token:string,ownerId:string,contactId:string):Promise<void>{
 await http('/rest/v1/user_contacts?owner_id=eq.'+encodeURIComponent(ownerId)+'&contact_id=eq.'+encodeURIComponent(contactId),{token,method:'DELETE'});
}

export async function listProfiles(token: string, ids: string[]) {
  if (!ids.length) return [];
  return http<Profile[]>(`/rest/v1/profiles?select=id,username,display_name,avatar_path,cover_path,bio,status_emoji,age_years&id=in.(${ids.map(encodeURIComponent).join(',')})`,{token});
}
export const CHAT_MESSAGE_PAGE_SIZE=100;
const CHAT_MESSAGE_COLUMNS='id,chat_id,sender_id,body,created_at,media_path,media_type,read_at,edited_at,deleted_for,deleted_for_everyone,reply_to_message_id';
/** Newest page first. Sort ties by ID so pagination has a stable boundary. */
export async function listMessages(token:string,chatId:string):Promise<ChatMessage[]>{
  return http<ChatMessage[]>(`/rest/v1/messages?select=${CHAT_MESSAGE_COLUMNS}&chat_id=eq.${encodeURIComponent(chatId)}&order=created_at.desc,id.desc&limit=${CHAT_MESSAGE_PAGE_SIZE}`,{token});
}
/** Older than the earliest loaded message; server RLS still checks membership. */
export async function listOlderMessages(token:string,chatId:string,before:Pick<ChatMessage,'id'|'created_at'>):Promise<ChatMessage[]>{
  const time=encodeURIComponent(before.created_at),id=encodeURIComponent(before.id);
  const cursor=`or=(created_at.lt.${time},and(created_at.eq.${time},id.lt.${id}))`;
  return http<ChatMessage[]>(`/rest/v1/messages?select=${CHAT_MESSAGE_COLUMNS}&chat_id=eq.${encodeURIComponent(chatId)}&${cursor}&order=created_at.desc,id.desc&limit=${CHAT_MESSAGE_PAGE_SIZE}`,{token});
}
/** Load original messages referenced by older replies, subject to normal chat RLS. */
export type ReplyTarget=Pick<ChatMessage,'id'|'sender_id'|'body'|'deleted_for_everyone'|'media_type'>;
export async function listReplyTargets(token:string,chatId:string,ids:string[]):Promise<ReplyTarget[]>{
  const unique=[...new Set(ids)].filter(id=>/^[a-f0-9-]{36}$/i.test(id)).slice(0,100);
  if(!unique.length)return [];
  return http<ReplyTarget[]>('/rest/v1/messages?select=id,sender_id,body,deleted_for_everyone,media_type&chat_id=eq.'+encodeURIComponent(chatId)+'&id=in.('+unique.map(encodeURIComponent).join(',')+')',{token});
}

/** Text-only matches from the entire RLS-visible chat history, newest first.
 * A 31st match signals that the current 30-result page has more results. */
export type DirectMessageSearchResult=Pick<ChatMessage,'id'|'sender_id'|'body'|'created_at'>;
export const DIRECT_MESSAGE_SEARCH_PAGE_SIZE=30;
export async function searchDirectMessages(
 token:string,chatId:string,query:string,offset=0
):Promise<DirectMessageSearchResult[]>{
 const term=query.trim();
 if(term.length<2||term.length>120)return [];
 return http<DirectMessageSearchResult[]>('/rest/v1/rpc/search_direct_messages',{
  token,method:'POST',body:{
   p_chat_id:chatId,p_query:term,
   p_limit:DIRECT_MESSAGE_SEARCH_PAGE_SIZE+1,
   p_offset:Math.max(0,Math.min(600,Math.floor(offset)))
  }
 });
}

export async function postMessage(token: string, chatId: string, userId: string, body: string, clientMessageId: string = crypto.randomUUID(), replyToMessageId:string|null=null) {
  void userId;
  const endpoint=replyToMessageId?'/rest/v1/rpc/send_direct_reply':'/rest/v1/rpc/send_direct_message';
  const payload={p_chat_id:chatId,p_body:body,p_client_message_id:clientMessageId};
  const message=await http<ChatMessage>(endpoint,{token,method:'POST',body:replyToMessageId?{...payload,p_reply_to_message_id:replyToMessageId}:payload});
  if(!message?.id)throw Error('Сообщение не сохранено');
  return message;
}

export const DIRECT_MEDIA_FORMATS:Record<string,string>={
 "image/jpeg":"jpg","image/png":"png","image/webp":"webp",
 "video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov",
 "audio/mpeg":"mp3","audio/mp4":"m4a","audio/wav":"wav","audio/ogg":"ogg","audio/webm":"webm",
 "application/pdf":"pdf","text/plain":"txt","application/zip":"zip",
 "application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx",
 "application/msword":"doc","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"xlsx",
 "application/vnd.ms-excel":"xls"
};
export const DIRECT_MEDIA_MAX_BYTES=25*1024*1024;
export function validateDirectMediaFile(file:Pick<File,'type'|'size'>):string|null{
 if(!Object.prototype.hasOwnProperty.call(DIRECT_MEDIA_FORMATS,file.type))
  return "Неподдерживаемый формат. Можно отправлять фото, видео, музыку и документы.";
 if(file.size===0||file.size>DIRECT_MEDIA_MAX_BYTES)
  return "Размер вложения должен быть от 1 байта до 25 МБ.";
 return null;
}

/** An upload is a single logical attachment while the same File stays in
 * the preview. Keep the UUID and storage path stable across manual retries,
 * but never reuse them for a different user, chat, caption or File object.
 * We do not persist File bytes or bearer tokens in web storage.
 */
type DirectMediaKind="image"|"video"|"audio"|"file";
type DirectMediaAttempt={
  chatId:string;userId:string;caption:string;path:string;kind:DirectMediaKind;
  clientMessageId:string;uploaded:boolean;insertAttempted:boolean;
};
const mediaSendAttempts=new WeakMap<File,DirectMediaAttempt>();
function mediaKind(file:File):DirectMediaKind{
  return file.type.startsWith("image/")?"image":file.type.startsWith("video/")?"video":file.type.startsWith("audio/")?"audio":"file";
}
function mediaAttempt(file:File,chatId:string,userId:string,caption:string):DirectMediaAttempt{
  const old=mediaSendAttempts.get(file);
  if(old&&old.chatId===chatId&&old.userId===userId&&old.caption===caption)return old;
  const attempt:DirectMediaAttempt={
    chatId,userId,caption,kind:mediaKind(file),
    path:chatId+"/"+userId+"/"+crypto.randomUUID()+"."+DIRECT_MEDIA_FORMATS[file.type],
    clientMessageId:crypto.randomUUID(),uploaded:false,insertAttempted:false
  };
  mediaSendAttempts.set(file,attempt);
  return attempt;
}
function assertMediaMessage(row:ChatMessage & {client_message_id?:string|null},
  attempt:DirectMediaAttempt):ChatMessage{
  if(!row?.id||row.chat_id!==attempt.chatId||row.sender_id!==attempt.userId
     ||row.body!==attempt.caption||row.media_path!==attempt.path
     ||row.media_type!==attempt.kind||row.client_message_id!==attempt.clientMessageId){
    throw Error("Не удалось подтвердить отправку именно этого вложения.");
  }
  return row;
}
async function findDirectMediaMessage(token:string,attempt:DirectMediaAttempt):Promise<ChatMessage|null>{
  const query="/rest/v1/messages?select=id,chat_id,sender_id,body,created_at,media_path,media_type,read_at,client_message_id"
    +"&chat_id=eq."+encodeURIComponent(attempt.chatId)
    +"&sender_id=eq."+encodeURIComponent(attempt.userId)
    +"&client_message_id=eq."+encodeURIComponent(attempt.clientMessageId)+"&limit=1";
  const rows=await http<(ChatMessage & {client_message_id?:string|null})[]>(query,{token});
  return rows[0]?assertMediaMessage(rows[0],attempt):null;
}
async function confirmStoredMedia(token:string,path:string,file:File):Promise<boolean>{
  // Storage object info returns metadata only: never download private files
  // to discover whether a timed-out upload already committed.
  const res=await fetch(apiUrl+"/storage/v1/object/info/authenticated/ikonosfera-direct-media/"+path,{
    method:"GET",headers:{apikey:anonKey,Authorization:"Bearer "+token},
    cache:"no-store",signal:AbortSignal.timeout(18000)
  });
  if(!res.ok)return false;
  const info=await res.json() as {name?:string;bucket_id?:string;metadata?:{size?:number;mimetype?:string}};
  if(info?.name!==path||info.bucket_id!=="ikonosfera-direct-media"
     ||Number(info.metadata?.size)!==file.size||info.metadata?.mimetype!==file.type){
    throw Error("Загруженный файл не совпадает с предпросмотром. Выбери файл заново.");
  }
  return true;
}
export async function uploadDirectMedia(token:string,chatId:string,userId:string,file:File,pathOverride?:string):Promise<{path:string;type:DirectMediaKind}>{
  const problem=validateDirectMediaFile(file);
  if(problem)throw Error(problem);
  const ext=DIRECT_MEDIA_FORMATS[file.type];
  const path=pathOverride??chatId+"/"+userId+"/"+crypto.randomUUID()+"."+ext;
  // Never allow a supplied retry path to point into another user's folder.
  if(pathOverride&&!new RegExp("^"+chatId+"/"+userId+"/[a-f0-9-]{36}\\."+ext+"$","i").test(pathOverride))
    throw Error("Некорректный путь вложения.");
  let error:unknown=null;
  try{
    const res=await fetch(apiUrl+"/storage/v1/object/ikonosfera-direct-media/"+path,{
      method:"POST",headers:{apikey:anonKey,Authorization:"Bearer "+token,"Content-Type":file.type,"x-upsert":"false"},
      body:file,signal:AbortSignal.timeout(120000)
    });
    if(res.ok)return {path,type:mediaKind(file)};
    const err=await res.json().catch(()=>null);
    const message=err?.message||err?.error||"Не удалось загрузить файл";
    error=new Error(message);
    const duplicate=res.status===409||(res.status===400&&/already exists|already_exists|keyalreadyexists/i.test(String(message)));
    if(!duplicate&&res.status<500&&res.status!==408&&res.status!==429)throw error;
  }catch(e){
    // A lost response after Storage committed must not create a second object.
    error=e;
    if(e instanceof Error&&(/Некорректный путь/.test(e.message)))throw e;
  }
  try{
    if(await confirmStoredMedia(token,path,file))return {path,type:mediaKind(file)};
  }catch(e){
    // Do not mask a metadata mismatch; an unknown storage result is retriable.
    if(e instanceof Error&&e.message.includes("не совпадает с предпросмотром"))throw e;
  }
  throw error instanceof Error?error:Error("Не удалось подтвердить загрузку файла. Повтори отправку вручную.");
}
export async function sendDirectMedia(token:string,chatId:string,userId:string,file:File,caption=""){
  const problem=validateDirectMediaFile(file);
  if(problem)throw Error(problem);
  const normalizedCaption=caption.trim().slice(0,4000);
  const attempt=mediaAttempt(file,chatId,userId,normalizedCaption);
  const complete=(row:ChatMessage & {client_message_id?:string|null})=>{
    const sent=assertMediaMessage(row,attempt);
    if(mediaSendAttempts.get(file)===attempt)mediaSendAttempts.delete(file);
    return sent;
  };
  // A previous POST may already have committed. Read back first when retrying
  // rather than uploading or INSERTing anything a second time.
  if(attempt.insertAttempted){
    try{
      const prior=await findDirectMediaMessage(token,attempt);
      if(prior)return complete(prior);
    }catch(e){
      if(e instanceof Error&&e.message.includes("именно этого вложения"))throw e;
      // Temporary read failure: the manual retry is still idempotent.
    }
  }
  if(!attempt.uploaded){
    const uploaded=await uploadDirectMedia(token,chatId,userId,file,attempt.path);
    if(uploaded.path!==attempt.path||uploaded.type!==attempt.kind)throw Error("Вложение не подтверждено.");
    attempt.uploaded=true;
  }
  // Do not delete storage objects when the POST result is unknown: another
  // request may already have created a message referencing this exact path.
  attempt.insertAttempted=true;
  let postError:unknown=null;
  try{
    const messages=await http<(ChatMessage & {client_message_id?:string|null})[]>('/rest/v1/messages?select=id,chat_id,sender_id,body,created_at,media_path,media_type,read_at,client_message_id',{
      token,method:"POST",body:{
        chat_id:chatId,sender_id:userId,body:caption.trim().slice(0,4000),
        media_path:attempt.path,media_type:attempt.kind,client_message_id:attempt.clientMessageId
      },
      extraHeaders:{Prefer:"return=representation"}
    });
    if(messages[0])return complete(messages[0]);
  }catch(e){postError=e;}
  try{
    const existing=await findDirectMediaMessage(token,attempt);
    if(existing)return complete(existing);
  }catch(e){
    if(e instanceof Error&&e.message.includes("именно этого вложения"))throw e;
  }
  if(postError instanceof Error&&postError.message.includes("именно этого вложения"))throw postError;
  if(postError instanceof SupabaseHttpError&&postError.status>=400&&postError.status<500
     &&postError.status!==408&&postError.status!==429)throw postError;
  throw Error("Отправка вложения не подтверждена. Файл остался в предпросмотре — повтори вручную.");
}
// Signed URLs remain private, short-lived and in memory only. Sharing one
// in-flight signing request prevents dozens of requests for the same image.
const signedMediaCache=new Map<string,{promise:Promise<string>;validUntil:number}>();
const SIGNED_URL_CACHE_MS=15*60*1000;
const SIGNED_URL_CACHE_LIMIT=120;
/** Force a fresh private URL when media loading itself fails. */
export function invalidateDirectMediaUrl(token:string,path:string):void{
 signedMediaCache.delete(token+':'+path);
}
export async function getDirectMediaUrl(token:string,path:string):Promise<string>{
 if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z0-9]+$/i.test(path)){
   throw Error('Недопустимый путь вложения');
 }
 const key=token+':'+path;
 const cached=signedMediaCache.get(key);
 if(cached&&cached.validUntil>Date.now())return cached.promise;
 if(cached)signedMediaCache.delete(key);
 const request=(async()=>{
   const res=await fetch(apiUrl+"/storage/v1/object/sign/ikonosfera-direct-media/"+path,{
    method:"POST",headers:{apikey:anonKey,Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({expiresIn:3600}),cache:"no-store",
    signal:AbortSignal.timeout(18000)
   });
   const value=await res.json().catch(()=>null);
   if(!res.ok||!value?.signedURL)throw Error("Не удалось открыть вложение");
   const signed=value.signedURL as string;
   return signed.startsWith("http")?signed:apiUrl+"/storage/v1"+(signed.startsWith("/")?signed:"/"+signed);
 })();
 signedMediaCache.set(key,{promise:request,validUntil:Date.now()+SIGNED_URL_CACHE_MS});
 if(signedMediaCache.size>SIGNED_URL_CACHE_LIMIT){
   const first=signedMediaCache.keys().next().value;
   if(first)signedMediaCache.delete(first);
 }
 request.catch(()=>signedMediaCache.delete(key));
 return request;
}

export async function markChatRead(token:string,chatId:string):Promise<number>{
 return http<number>('/rest/v1/rpc/mark_chat_messages_read',{token,method:'POST',body:{p_chat_id:chatId}});
}

export type MessageReaction={message_id:string;user_id:string;emoji:string};
export async function listMessageReactions(token:string,messageIds:string[]):Promise<MessageReaction[]>{
 if(!messageIds.length)return [];
 return http<MessageReaction[]>('/rest/v1/message_reactions?select=message_id,user_id,emoji&message_id=in.('+messageIds.map(encodeURIComponent).join(',')+')&limit=3000',{token});
}
export async function setMessageReaction(token:string,userId:string,messageId:string,emoji:string|null):Promise<void>{
 await http('/rest/v1/message_reactions?message_id=eq.'+encodeURIComponent(messageId)+'&user_id=eq.'+encodeURIComponent(userId),{token,method:'DELETE'});
 if(emoji)await http('/rest/v1/message_reactions',{token,method:'POST',body:{message_id:messageId,user_id:userId,emoji}});
}
export function validateUsername(username:string):string|null{
 const value=username.trim().replace(/^@/,'').toLowerCase();
 if(!value)return 'Введи юзернейм.';
 if(value.length<3)return 'Юзернейм слишком короткий: нужно минимум 3 символа.';
 if(value.length>24)return 'Юзернейм слишком длинный: максимум 24 символа.';
 if(!/^[a-z0-9_]+$/.test(value))return 'Разрешены только латинские буквы a–z, цифры 0–9 и нижнее подчёркивание _.';
 if(/^_+$/.test(value))return 'Юзернейм не может состоять только из подчёркиваний.';
 return null;
}
export function explainProfileError(error:unknown):string{
 const text=error instanceof Error?error.message:String(error);
 if(/23505|duplicate key|unique constraint|profiles_username_key/i.test(text))return 'Этот юзернейм уже занят. Попробуй другой.';
 if(/23514|check constraint|username_check/i.test(text))return 'Недопустимый юзернейм. Используй 3–24 символа: латинские буквы, цифры и _.';
 if(/42501|permission denied|row-level security/i.test(text))return 'Не удалось сохранить профиль: нет доступа. Войди в аккаунт заново.';
 return text;
}

export async function manageChat(token:string,chatId:string,action:"hide"|"delete_self"|"pin"|"unpin"|"delete_everyone"){
 return http('/rest/v1/rpc/manage_direct_chat',{token,method:'POST',body:{p_chat_id:chatId,p_action:action}});
}

export type UserBlock={owner_id:string;blocked_id:string;created_at:string};
/** RLS limits this list to the signed-in user's own blacklist. */
export async function listBlockedUsers(token:string,userId:string):Promise<UserBlock[]>{
 return http<UserBlock[]>('/rest/v1/user_blocks?select=owner_id,blocked_id,created_at&owner_id=eq.'+encodeURIComponent(userId)+'&order=created_at.desc',{token});
}
export async function blockUser(token:string,userId:string,targetId:string):Promise<void>{
 if(!targetId||userId===targetId)throw Error('Нельзя заблокировать самого себя.');
 await http('/rest/v1/user_blocks?on_conflict=owner_id,blocked_id',{token,method:'POST',
  body:{owner_id:userId,blocked_id:targetId},extraHeaders:{Prefer:'resolution=ignore-duplicates,return=minimal'}});
}
export async function unblockUser(token:string,userId:string,targetId:string):Promise<void>{
 await http('/rest/v1/user_blocks?owner_id=eq.'+encodeURIComponent(userId)+'&blocked_id=eq.'+encodeURIComponent(targetId),{token,method:'DELETE'});
}
export async function manageMessage(token:string,messageId:string,action:"hide"|"delete_everyone"|"edit",body?:string){
 return http('/rest/v1/rpc/manage_direct_message',{token,method:'POST',body:{p_message_id:messageId,p_action:action,p_body:body??null}});
}

export async function findProfileByUsername(token:string,username:string):Promise<Profile|null>{
 const value=username.trim().replace(/^@/,"").toLowerCase();
 if(!/^[a-z0-9_]{3,24}$/.test(value))throw Error("Введи юзернейм: 3–24 латинских символа, цифры или _.");
 const rows=await http<Profile[]>('/rest/v1/profiles?select=id,username,display_name,avatar_path,cover_path,bio,status_emoji&username=eq.'+encodeURIComponent(value)+'&limit=1',{token});
 return rows[0]??null;
}

export async function reopenChat(token:string,chatId:string){
 return http('/rest/v1/rpc/reopen_direct_chat',{token,method:'POST',body:{p_chat_id:chatId}});
}
