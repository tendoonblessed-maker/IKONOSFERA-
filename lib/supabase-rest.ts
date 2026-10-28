/* Dependency-free Supabase Auth + PostgREST client.
   Never put a service-role or database password in NEXT_PUBLIC_* variables. */
export const apiUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const backendReady = Boolean(apiUrl && anonKey);

export type Session = { access_token: string; refresh_token: string; expires_at: number };
export type Profile = { id: string; username: string; display_name: string; avatar_path?: string|null; cover_path?: string|null; bio?: string };
export type DirectChat = { id: string; user_a: string; user_b: string; created_at: string; hidden_for?:string[]; pinned_for?:string[] };
export type ChatMessage = { id: string; chat_id: string; sender_id: string; body: string; created_at: string; media_path: string|null; media_type: "image"|"video"|"audio"|"file"|null; read_at: string|null; edited_at?:string|null; deleted_for?:string[]; deleted_for_everyone?:boolean };
const STORAGE = 'ikonosfera-session-v1';

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
    throw Error(error || `Запрос не выполнен (${response.status})`);
  }
  return value as T;
}
export function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try { const s = JSON.parse(localStorage.getItem(STORAGE) || 'null') as Session | null; return s?.access_token && s.refresh_token ? s : null; } catch { return null; }
}
export function saveSession(s: { access_token: string; refresh_token: string; expires_in?: number; expires_at?: number }) {
  const session: Session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? (Math.floor(Date.now()/1000) + (s.expires_in ?? 3600) - 60) };
  localStorage.setItem(STORAGE, JSON.stringify(session));
  return session;
}
export function clearSession() { localStorage.removeItem(STORAGE); }
export async function validSession(): Promise<Session | null> {
  const s = loadSession(); if (!s) return null;
  if (s.expires_at > Math.floor(Date.now()/1000)) return s;
  try {
    const next = await http<{access_token: string;refresh_token:string;expires_in:number}>(`/auth/v1/token?grant_type=refresh_token`, {method:'POST',body:{refresh_token:s.refresh_token}});
    return saveSession(next);
  } catch { clearSession(); return null; }
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
export async function signOut(token: string) { try { await http('/auth/v1/logout',{token,method:'POST'}); } finally { clearSession(); } }
export async function myProfile(token: string, id: string) {
  const profiles=await http<Profile[]>(`/rest/v1/profiles?select=id,username,display_name,avatar_path,cover_path,bio&id=eq.${encodeURIComponent(id)}&limit=1`,{token});
  return profiles[0] ?? null;
}
export async function changeProfile(token: string, id: string, username: string, display_name: string) {
  const profiles=await http<Profile[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,username,display_name,avatar_path,cover_path,bio`,{token,method:'PATCH',body:{username,display_name},extraHeaders:{Prefer:'return=representation'}});
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
  return http<Profile[]>(`/rest/v1/profiles?select=id,username,display_name,avatar_path,cover_path,bio&id=in.(${ids.map(encodeURIComponent).join(',')})`,{token});
}
export async function listMessages(token: string, chatId: string) {
  return http<ChatMessage[]>(`/rest/v1/messages?select=id,chat_id,sender_id,body,created_at,media_path,media_type,read_at,edited_at,deleted_for,deleted_for_everyone&chat_id=eq.${encodeURIComponent(chatId)}&order=created_at.desc&limit=100`,{token});
}
export async function postMessage(token: string, chatId: string, userId: string, body: string, clientMessageId: string = crypto.randomUUID()) {
  void userId;
  const message=await http<ChatMessage>('/rest/v1/rpc/send_direct_message',{token,method:'POST',body:{p_chat_id:chatId,p_body:body,p_client_message_id:clientMessageId}});
  if(!message?.id)throw Error('Сообщение не сохранено');
  return message;
}

export async function uploadDirectMedia(token:string,chatId:string,userId:string,file:File):Promise<{path:string;type:"image"|"video"|"audio"|"file"}>{
 const allowed:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","audio/mpeg":"mp3","audio/mp4":"m4a","audio/wav":"wav","audio/ogg":"ogg","application/pdf":"pdf","text/plain":"txt","application/zip":"zip","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx","application/msword":"doc","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"xlsx","application/vnd.ms-excel":"xls"};
 const ext=allowed[file.type];
 if(!ext)throw Error("Неподдерживаемый формат. Можно отправлять фото, видео, музыку и документы.");
 if(file.size===0||file.size>25*1024*1024)throw Error("Размер фото или видео должен быть до 25 МБ.");
 const path=chatId+"/"+userId+"/"+crypto.randomUUID()+"."+ext;
 const res=await fetch(apiUrl+"/storage/v1/object/ikonosfera-direct-media/"+path,{
  method:"POST",headers:{apikey:anonKey,Authorization:"Bearer "+token,"Content-Type":file.type,"x-upsert":"false"},body:file
 });
 if(!res.ok){const err=await res.json().catch(()=>null);throw Error(err?.message||err?.error||"Не удалось загрузить файл");}
 return {path,type:file.type.startsWith("image/")?"image":file.type.startsWith("video/")?"video":file.type.startsWith("audio/")?"audio":"file"};
}
export async function sendDirectMedia(token:string,chatId:string,userId:string,file:File,caption=""){
 const {path,type}=await uploadDirectMedia(token,chatId,userId,file);
 try{
  const messages=await http<ChatMessage[]>('/rest/v1/messages?select=id,chat_id,sender_id,body,created_at,media_path,media_type,read_at',{
   token,method:"POST",body:{chat_id:chatId,sender_id:userId,body:caption.trim().slice(0,4000),media_path:path,media_type:type},
   extraHeaders:{Prefer:"return=representation"}
  });
  if(!messages[0])throw Error("Медиа не отправлено");
  return messages[0];
 }catch(e){
  await fetch(apiUrl+"/storage/v1/object/ikonosfera-direct-media/"+path,{method:"DELETE",headers:{apikey:anonKey,Authorization:"Bearer "+token}}).catch(()=>{});
  throw e;
 }
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
 const rows=await http<Profile[]>('/rest/v1/profiles?select=id,username,display_name,avatar_path,cover_path,bio&username=eq.'+encodeURIComponent(value)+'&limit=1',{token});
 return rows[0]??null;
}

export async function reopenChat(token:string,chatId:string){
 return http('/rest/v1/rpc/reopen_direct_chat',{token,method:'POST',body:{p_chat_id:chatId}});
}
