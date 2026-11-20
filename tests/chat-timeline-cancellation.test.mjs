import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('active direct-chat history GET is abortable and scoped to its effect lifetime',()=>{
 const api=load('lib/supabase-rest.ts');
 const shell=load('components/AppShell.tsx');
 assert.match(api,/export async function listMessages\\(token:string,chatId:string,signal\\?:AbortSignal\\)/);
 assert.match(api,/return http<ChatMessage\\[\\]>\\([\\s\\S]*?\\{token,signal\\}\\);/);
 assert.match(shell,/const controller=new AbortController\\(\\);\\s*activeController=controller;/);
 assert.match(shell,/listMessages\\(token,chatId,controller\\.signal\\)/);
 assert.match(shell,/!controller\\.signal\\.aborted&&first/);
 assert.match(shell,/cancelled=true;activeController\\?\\.abort\\(\\);window\\.clearInterval\\(timer\\)/);
});

test('active group-chat history GET composes caller abort with its request deadline',()=>{
 const api=load('lib/groups.ts');
 const panel=load('components/GroupPanel.tsx');
 assert.match(api,/timeout=method==='GET',signal\\?:AbortSignal/);
 assert.match(api,/createHttpRequestSignal\\(signal\\)/);
 assert.match(api,/export async function groupMessages\\(token:string,id:string,signal\\?:AbortSignal\\)/);
 assert.match(api,/request<GroupMessage\\[\\]>\\([\\s\\S]*?true,signal\\)/);
 assert.match(panel,/const refresh=useCallback\\(async\\(signal\\?:AbortSignal\\)=>/);
 assert.match(panel,/groupMessages\\(token,group\\.id,signal\\)/);
 assert.match(panel,/void refresh\\(controller\\.signal\\)/);
 assert.match(panel,/!controller\\.signal\\.aborted/);
 assert.match(panel,/cancelled=true;\\s*activeController\\?\\.abort\\(\\);\\s*requestSequenceRef\\.current\\+\\+/);
});

test('aborted timeline reads do not replace the current chat with a fetch error',()=>{
 const shell=load('components/AppShell.tsx');
 const panel=load('components/GroupPanel.tsx');
 assert.match(shell,/if\\(!cancelled&&!controller\\.signal\\.aborted&&first\\)/);
 assert.match(panel,/if\\(!cancelled&&!controller\\.signal\\.aborted\\)/);
});
