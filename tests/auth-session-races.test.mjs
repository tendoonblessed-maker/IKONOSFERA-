import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const reply=(value,status=200)=>({
 ok:status>=200&&status<300,status,
 text:async()=>JSON.stringify(value)
});
const defer=()=>{
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};
};
function scenario(handler){
 const data=new Map();
 const storage={
  getItem:key=>data.get(key)??null,
  setItem:(key,value)=>data.set(key,value),
  removeItem:key=>data.delete(key)
 };
 const calls=[];
 const ctx={
  exports:{},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon-test'}},
  window:{},localStorage:storage,AbortSignal,URLSearchParams,
  fetch:(url,options)=>{
   calls.push({url,options});
   return handler(url,options,calls.length);
  }
 };
 vm.runInNewContext(compiled,ctx,{filename:'supabase-rest.cjs',timeout:2500});
 return {api:ctx.exports,calls,storage,data};
}
const expired=(access_token,refresh_token)=>({access_token,refresh_token,expires_at:0});
const future=(access_token,refresh_token)=>({access_token,refresh_token,expires_at:Date.now()/1000+7200});
const tokenResponse=(access_token,refresh_token)=>reply({access_token,refresh_token,expires_in:3600});

test('concurrent validSession calls rotate the same refresh token only once',async()=>{
 const pending=defer();
 const {api,calls}=scenario(()=>pending.promise);
 api.saveSession(expired('old-a','old-r'));
 const first=api.validSession(),second=api.validSession();
 assert.equal(calls.length,1,'two refresh requests for one rotated token would race');
 pending.resolve(tokenResponse('next-a','next-r'));
 const [one,two]=await Promise.all([first,second]);
 assert.equal(one.access_token,'next-a');
 assert.equal(two.access_token,'next-a');
 assert.equal(api.loadSession().refresh_token,'next-r');
});

test('log out while refresh is pending: old reply cannot revive a signed-out session',async()=>{
 const waiting=defer();
 const {api,calls}=scenario((url)=>url.includes('grant_type=refresh_token')?waiting.promise:Promise.resolve(reply({})));
 api.saveSession(expired('old-access','old-refresh'));
 const refresh=api.validSession();
 const logout=api.signOut('old-access');
 assert.equal(api.loadSession(),null,'sign-out must clear browser credentials before HTTP resolves');
 await logout;
 waiting.resolve(tokenResponse('resurrected-access','resurrected-refresh'));
 assert.equal(await refresh,null);
 assert.equal(api.loadSession(),null);
 assert.equal(calls.length,2);
});

test('account switch during old pending refresh starts a new independent refresh',async()=>{
 const old=defer(),fresh=defer();
 const {api,calls}=scenario((url,options)=>{
  const token=JSON.parse(options.body).refresh_token;
  if(token==='old-r')return old.promise;
  if(token==='new-r')return fresh.promise;
  throw Error('unknown refresh token');
 });
 api.saveSession(expired('old-a','old-r'));
 const oldTask=api.validSession();
 api.saveSession(expired('new-a','new-r'));
 const newTask=api.validSession();
 assert.equal(calls.length,2,'a newer account must not reuse the old account refresh promise');
 // Complete old after the new request exists: it cannot clear that promise.
 old.resolve(tokenResponse('old-restored','old-restored-r'));
 assert.equal(await oldTask,null);
 fresh.resolve(tokenResponse('new-valid','new-valid-r'));
 assert.equal((await newTask).access_token,'new-valid');
 assert.equal(api.loadSession().access_token,'new-valid');
});

test('old invalid-token response cannot clear newly signed-in account',async()=>{
 const delayed=defer();
 const {api}=scenario(()=>delayed.promise);
 api.saveSession(expired('old-a','old-r'));
 const oldTask=api.validSession();
 api.saveSession(future('new-a','new-r'));
 delayed.resolve(reply({message:'Refresh Token Not Found'},401));
 assert.equal(await oldTask,null);
 assert.equal(api.loadSession().access_token,'new-a');
});

test('offline refresh keeps the session for retry, and a late network error cannot break new login',async()=>{
 const first=defer(),second=defer();
 let i=0;
 const {api}=scenario(()=>++i===1?first.promise:second.promise);
 api.saveSession(expired('old-a','old-r'));
 const request=api.validSession();
 first.reject(Error('temporary network loss'));
 await assert.rejects(request,/temporary network loss/);
 assert.equal(api.loadSession().refresh_token,'old-r');
 const oldRetry=api.validSession();
 api.saveSession(future('new-a','new-r'));
 second.reject(Error('old tab went offline'));
 assert.equal(await oldRetry,null);
 assert.equal(api.loadSession().refresh_token,'new-r');
});

test('late logout completion cannot remove account logged in after logout started',async()=>{
 const pending=defer();
 const {api,calls}=scenario(()=>pending.promise);
 api.saveSession(future('old-access','old-refresh'));
 const logout=api.signOut('old-access');
 assert.equal(api.loadSession(),null);
 api.saveSession(future('new-access','new-refresh'));
 pending.resolve(reply({}));
 await logout;
 assert.equal(api.loadSession().access_token,'new-access');
 assert.equal(calls[0].options.headers.Authorization,'Bearer old-access');
});

test('second browser tab overwriting stored session invalidates old refresh response',async()=>{
 const pending=defer();
 const {api,storage}=scenario(()=>pending.promise);
 api.saveSession(expired('tab-one','same-refresh'));
 const wait=api.validSession();
 storage.setItem('ikonosfera-session-v1',JSON.stringify(future('tab-two','different-refresh')));
 pending.resolve(tokenResponse('tab-one-rotated','tab-one-new-refresh'));
 assert.equal(await wait,null);
 assert.equal(api.loadSession().access_token,'tab-two');
});

test('logout of a previously expired account never clears a different current session',async()=>{
 const {api,calls}=scenario(()=>Promise.resolve(reply({})));
 api.saveSession(future('new-access','new-refresh'));
 await api.signOut('unrelated-old-token');
 assert.equal(api.loadSession().access_token,'new-access');
 assert.equal(calls.length,1);
});

test('application resets sensitive caches and chat state before server logout settles',()=>{
 const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
 const start=shell.indexOf('async function logout(){');
 const end=shell.indexOf('\n  async function install()',start);
 assert.ok(start>0&&end>start);
 const method=shell.slice(start,end);
 const cleanup=method.indexOf('setSession(null)');
 const awaited=method.indexOf('await revokeOnServer');
 assert.ok(cleanup>0&&awaited>cleanup,'account UI must clear before awaiting remote logout');
 assert.match(method,/clearChatDrafts\(userId\)/);
 assert.match(method,/clearGroupDrafts\(userId\)/);
 assert.match(method,/clearAllGroupSendAttempts\(userId\)/);
 assert.match(method,/setChatMessages\(\[\]\)/);
 assert.match(method,/setChannels\(\[\]\)/);
 assert.doesNotMatch(method,/clearSession\(\)/);
});

test('refresh response must match both session generation and refresh token',()=>{
 assert.match(source,/sessionGeneration!==generation\|\|loadSession\(\)\?\.refresh_token!==s\.refresh_token/);
 assert.match(source,/if\(sessionRefreshPromise===pending\)sessionRefreshPromise=null/);
 assert.match(source,/if\(loadSession\(\)\?\.access_token===token\)clearSession\(\)/);
 assert.doesNotMatch(source,/finally \{ clearSession\(\); \}/);
});
