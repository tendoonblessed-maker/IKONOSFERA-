/* Dependency-free Supabase Auth + PostgREST client.
   Never put a service-role or database password in NEXT_PUBLIC_* variables. */
export const apiUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const backendReady = Boolean(apiUrl && anonKey);

export type Session = { access_token: string; refresh_token: string; expires_at: number };
export type Profile = { id: string; username: string; display_name: string };
export type DirectChat = { id: string; user_a: string; user_b: string; created_at: string };
export type ChatMessage = { id: string; chat_id: string; sender_id: string; body: string; created_at: string };
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
  await http('/auth/v1/otp', {method:'POST',body:{email,create_user:true}});
}
export async function verifyEmailCode(email: string, token: string) {
  const response = await http<{access_token:string;refresh_token:string;expires_in:number}>(`/auth/v1/verify`,{method:'POST',body:{email,token,type:'email'}});
  return saveSession(response);
}
export async function currentUser(token: string) { return http<{id:string;email?:string;is_anonymous?:boolean}>('/auth/v1/user',{token}); }
export async function signOut(token: string) { try { await http('/auth/v1/logout',{token,method:'POST'}); } finally { clearSession(); } }
export async function myProfile(token: string, id: string) {
  const profiles=await http<Profile[]>(`/rest/v1/profiles?select=id,username,display_name&id=eq.${encodeURIComponent(id)}&limit=1`,{token});
  return profiles[0] ?? null;
}
export async function changeProfile(token: string, id: string, username: string, display_name: string) {
  const profiles=await http<Profile[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,username,display_name`,{token,method:'PATCH',body:{username,display_name},extraHeaders:{Prefer:'return=representation'}});
  if (!profiles[0]) throw Error('Профиль не найден');
  return profiles[0];
}
export async function startDirectChat(token: string, username: string) {
  return http<string>('/rest/v1/rpc/start_direct_chat',{token,method:'POST',body:{target_username:username}});
}
export async function listChats(token: string) {
  return http<DirectChat[]>('/rest/v1/chats?select=id,user_a,user_b,created_at&order=created_at.desc&limit=100',{token});
}
export async function listProfiles(token: string, ids: string[]) {
  if (!ids.length) return [];
  return http<Profile[]>(`/rest/v1/profiles?select=id,username,display_name&id=in.(${ids.map(encodeURIComponent).join(',')})`,{token});
}
export async function listMessages(token: string, chatId: string) {
  return http<ChatMessage[]>(`/rest/v1/messages?select=id,chat_id,sender_id,body,created_at&chat_id=eq.${encodeURIComponent(chatId)}&order=created_at.desc&limit=100`,{token});
}
export async function postMessage(token: string, chatId: string, userId: string, body: string) {
  const result=await http<ChatMessage[]>('/rest/v1/messages?select=id,chat_id,sender_id,body,created_at',{token,method:'POST',body:{chat_id:chatId,sender_id:userId,body},extraHeaders:{Prefer:'return=representation'}});
  if (!result[0]) throw Error('Сообщение не сохранено'); return result[0];
}
