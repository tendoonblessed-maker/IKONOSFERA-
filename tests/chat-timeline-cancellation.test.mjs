import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('active direct-chat history GET is abortable and scoped to its effect lifetime',()=>{
 const api=load('lib/supabase-rest.ts');
 const shell=load('components/AppShell.tsx');
 assert.ok(api.includes('export async function listMessages(token:string,chatId:string,signal?:AbortSignal)'));
 assert.ok(api.includes('{token,signal}'));
 assert.ok(shell.includes('const controller=new AbortController();\n      activeController=controller;'));
 assert.ok(shell.includes('listMessages(token,chatId,controller.signal)'));
 assert.ok(shell.includes('!controller.signal.aborted&&first'));
 assert.ok(shell.includes('cancelled=true;activeController?.abort();window.clearInterval(timer);'));
});

test('active group-chat history GET composes caller abort with its request deadline',()=>{
 const api=load('lib/groups.ts');
 const panel=load('components/GroupPanel.tsx');
 assert.ok(api.includes("timeout=method==='GET',signal?:AbortSignal"));
 assert.ok(api.includes('createHttpRequestSignal(signal)'));
 assert.ok(api.includes('export async function groupMessages(token:string,id:string,signal?:AbortSignal)'));
 assert.ok(api.includes(",'GET',undefined,{},true,signal)"));
 assert.ok(panel.includes('const refresh=useCallback(async(signal?:AbortSignal)=>'));
 assert.ok(panel.includes('groupMessages(token,group.id,signal)'));
 assert.ok(panel.includes('void refresh(controller.signal)'));
 assert.ok(panel.includes('!controller.signal.aborted'));
 assert.ok(panel.includes('cancelled=true;\n    activeController?.abort();\n    requestSequenceRef.current++'));
});

test('aborted timeline reads do not replace the current chat with a fetch error',()=>{
 const shell=load('components/AppShell.tsx');
 const panel=load('components/GroupPanel.tsx');
 assert.ok(shell.includes('if(!cancelled&&!controller.signal.aborted&&first)'));
 assert.ok(panel.includes('if(!cancelled&&!controller.signal.aborted)'));
});
