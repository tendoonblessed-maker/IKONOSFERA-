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
 assert.doesNotMatch(helper,/service.role|service_role|client\.from\('messages'\)/i);
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
 assert.match(section,/const messages=\(await listMessages\(token,chatId\)\)\.reverse\(\)/);
 assert.match(section,/mergeConfirmedRecentPage\(/);
 assert.match(section,/const onRealtimeChange=\(\)=>\{/);
 assert.match(section,/if\(cancelled\|\|document\.visibilityState==='hidden'\|\|!navigator\.onLine\)return;/);
 assert.match(section,/window\.setTimeout\(\(\)=>\{/);
 assert.match(section,/},150\)/);
 assert.match(section,/window\.setInterval\(\(\)=>void sync\(\),6000\)/);
 assert.match(section,/window\.addEventListener\('online',onConnected\)/);
 assert.match(section,/document\.addEventListener\('visibilitychange',onVisible\)/);
 assert.match(helper,/status==='SUBSCRIBED'\)changed\(\)/);
 assert.doesNotMatch(helper,/setChatMessages|JSON\.parse\(payload/);
});

test('Realtime is a deliberately narrow private messages rollout',()=>{
 const helper=load('lib/direct-realtime.ts');
 const pkg=JSON.parse(load('package.json'));
 const migration=load('supabase/migrations/20261029_090000_enable_direct_message_realtime.sql');
 assert.equal(pkg.dependencies['@supabase/supabase-js'],'2.118.0');
 assert.match(helper,/return\(\)=>\{\};/);
 assert.match(helper,/const UUID=/);
 assert.match(migration,/pg_publication_tables/);
 assert.match(migration,/ALTER PUBLICATION supabase_realtime ADD TABLE public\.messages/);
 assert.doesNotMatch(migration,/replica identity full|drop publication|disable row level security/i);
 assert.doesNotMatch(migration,/group_messages|profiles|user_blocks/i);
});
