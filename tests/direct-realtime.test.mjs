import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('private Realtime attaches only to the selected chat and existing JWT',()=>{
 const helper=load('lib/direct-realtime.ts');
 const shell=load('components/AppShell.tsx');
 assert.match(helper,/createClient\(apiUrl,key/);
 assert.match(helper,/persistSession:false,autoRefreshToken:false,detectSessionInUrl:false/);
 assert.match(helper,/client\.realtime\.setAuth\(token\)/);
 assert.match(helper,/filter:'chat_id=eq\.'\+chatId/);
 assert.match(helper,/schema:'public' as const,table:'messages'/);
 assert.match(helper,/event:'INSERT'/);
 assert.match(helper,/event:'UPDATE'/);
 assert.match(helper,/payload\.new\?\.id/);
 assert.match(helper,/onChanged:\(messageId\?:string\)=>void/);
 assert.doesNotMatch(helper,/payload\.new\.body|payload\.new\.deleted_for_everyone/);
 assert.doesNotMatch(helper,/process\.env\.(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)|client\.from\('messages'\)/i);
 assert.match(shell,/subscribeDirectChatChanges\(token,chatId,onRealtimeChange\)/);
 assert.match(shell,/\},\[selected,session\?\.access_token,userId,chatReloadNonce\]\)/);
 assert.match(helper,/if\(stopped\)return;/);
 assert.match(helper,/client\.removeChannel\(channel\)/);
 assert.match(helper,/client\.realtime\.disconnect\(\)/);
 assert.match(shell,/unsubscribeRealtime\(\)/);
 assert.match(shell,/if\(realtimeTimer!==null\)window\.clearTimeout\(realtimeTimer\)/);
});

test('Realtime wakes server-authoritative read, preserves offline fallback and coalesces concurrent events',()=>{
 const shell=load('components/AppShell.tsx');
 const helper=load('lib/direct-realtime.ts');
 const section=shell.slice(shell.indexOf('const sync=async(first=false)'),shell.indexOf('  },[selected,session?.access_token,userId,chatReloadNonce]);'));
 assert.match(section,/if\(inFlight\)\{queuedSync=true;return;\}/);
 assert.match(section,/if\(queuedSync&&!cancelled\)\{queuedSync=false;void sync\(\);\}/);
 assert.match(section,/const messages=\(await listMessages\(token,chatId,controller\.signal\)\)\.reverse\(\)/);
 assert.match(section,/mergeConfirmedRecentPage\(/);
 assert.match(section,/const onRealtimeChange=\(messageId\?:string\)=>\{/);
 assert.match(section,/if\(messageId\)invalidateReplyTarget\(messageId\)/);
 assert.match(shell,/replyTargetsRefreshIdsRef/);
 assert.match(shell,/filterReplyTargetsForCurrentVersion/);
 assert.match(shell,/replyTargets\[message\.reply_to_message_id\]\?\.refreshing/);
 assert.match(shell,/hidden=\{Boolean\(/);
 const quote=load('components/ReplyQuote.tsx');
 const rest=load('lib/supabase-rest.ts');
 assert.match(quote,/hidden\?:boolean/);
 assert.match(quote,/hidden\s*\?\s*'Исходное сообщение скрыто'/);
 assert.match(rest,/select=id,sender_id,body,deleted_for,deleted_for_everyone,media_type/);
 assert.match(section,/if\(cancelled\|\|document\.visibilityState==='hidden'\|\|!navigator\.onLine\)return;/);
 assert.match(section,/window\.setTimeout\(\(\)=>\{/);
 assert.match(section,/},150\)/);
 assert.match(section,/startVisiblePolling\(/);
 assert.match(section,/void sync\(true\)/);
 assert.match(section,/stopVisiblePolling\(\)/);
 assert.doesNotMatch(section,/window\.setInterval\(\(\)=>void sync\(\),6000\)/);
 assert.doesNotMatch(section,/window\.addEventListener\('online',onConnected\)/);
 assert.doesNotMatch(section,/document\.addEventListener\('visibilitychange',onVisible\)/);
 assert.match(helper,/status==='SUBSCRIBED'\)changed\(\)/);
 assert.match(shell,/for\(const id of replyReferenceIdsRef\.current\)replyTargetsRefreshIdsRef\.current\.add\(id\)/);
 assert.doesNotMatch(helper,/setChatMessages|JSON\.parse\(payload/);
});

test('Realtime is a deliberately narrow private messages rollout',()=>{
 const helper=load('lib/direct-realtime.ts');
 const pkg=JSON.parse(load('package.json'));
 const migration=load('supabase/migrations/20261029065959_enable_direct_message_realtime.sql');
 assert.equal(pkg.dependencies['@supabase/supabase-js'],'2.118.0');
 assert.match(helper,/return\(\)=>\{\};/);
 assert.match(helper,/const UUID=/);
 assert.match(migration,/pg_publication_tables/);
 assert.match(migration,/ALTER PUBLICATION supabase_realtime ADD TABLE public\.messages/);
 assert.doesNotMatch(migration,/replica identity full|drop publication|disable row level security/i);
 assert.doesNotMatch(migration,/group_messages|profiles|user_blocks/i);
});
