import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {clearGroupOfflineDraftError,GROUP_OFFLINE_DRAFT_ERROR} from '../lib/group-network.ts';
import {clearDirectOfflineHint,DIRECT_MESSAGE_OFFLINE_ERROR,DIRECT_ATTACHMENT_OFFLINE_ERROR} from '../lib/direct-network.ts';
import {subscribeNetworkOnline} from '../lib/network-online.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const shell=load('components/AppShell.tsx');
const groupPanel=load('components/GroupPanel.tsx');
const network=load('lib/network-online.ts');

function makeTarget(){
 const listeners=new Map();
 return {
  addEventListener(name,listener){const set=listeners.get(name)??new Set();set.add(listener);listeners.set(name,set);},
  removeEventListener(name,listener){listeners.get(name)?.delete(listener);},
  dispatch(name){for(const listener of [...(listeners.get(name)??[])])listener();},
  listenerCount(name){return listeners.get(name)?.size??0;}
 };
}

test('network external store refreshes on online, offline, pageshow, focus and visibility',()=>{
 assert.match(network,/targetWindow\.addEventListener\('online',onStoreChange\)/);
 assert.match(network,/targetWindow\.addEventListener\('offline',onStoreChange\)/);
 assert.match(network,/targetWindow\.addEventListener\('pageshow',onStoreChange\)/);
 assert.match(network,/targetWindow\.addEventListener\('focus',onStoreChange\)/);
 assert.match(network,/targetDocument\.addEventListener\('visibilitychange',onStoreChange\)/);
});

test('network external store removes all listeners on unsubscribe',()=>{
 for(const event of ['online','offline','pageshow','focus'])
  assert.match(network,new RegExp(`targetWindow\\.removeEventListener\\('${event}',onStoreChange\\)`));
 assert.match(network,/targetDocument\.removeEventListener\('visibilitychange',onStoreChange\)/);
});

test('focus refreshes the store and cleanup prevents late notifications',()=>{
 const win=makeTarget(),doc=makeTarget();
 let updates=0;
 const unsubscribe=subscribeNetworkOnline(()=>updates++,win,doc);
 assert.equal(win.listenerCount('focus'),1);
 win.dispatch('focus');
 assert.equal(updates,1);
 unsubscribe();
 assert.equal(win.listenerCount('focus'),0);
 win.dispatch('focus');
 assert.equal(updates,1);
});

test('AppShell clears only its local direct offline hints on focus or reconnect',()=>{
 assert.match(shell,/import \{clearDirectOfflineHint,DIRECT_MESSAGE_OFFLINE_ERROR,DIRECT_ATTACHMENT_OFFLINE_ERROR\} from '@\/lib\/direct-network';/);
 for(const event of ['online','pageshow','focus'])
  assert.match(shell,new RegExp(`window\\.addEventListener\\('${event}',clearOfflineHint\\)`));
 assert.match(shell,/document\.addEventListener\('visibilitychange',clearOfflineHint\)/);
 for(const event of ['online','pageshow','focus'])
  assert.match(shell,new RegExp(`window\\.removeEventListener\\('${event}',clearOfflineHint\\)`));
 assert.match(shell,/document\.removeEventListener\('visibilitychange',clearOfflineHint\)/);
 assert.match(shell,/if\(navigator\.onLine\)setError\(previous=>clearDirectOfflineHint\(previous,true\)\)/);
});

test('GroupPanel clears only its local offline-draft hint on focus or reconnect',()=>{
 assert.match(groupPanel,/import \{clearGroupOfflineDraftError,GROUP_OFFLINE_DRAFT_ERROR\} from '@\/lib\/group-network';/);
 for(const event of ['online','pageshow','focus'])
  assert.match(groupPanel,new RegExp(`window\\.addEventListener\\('${event}',clearOfflineHint\\)`));
 assert.match(groupPanel,/document\.addEventListener\('visibilitychange',clearOfflineHint\)/);
 for(const event of ['online','pageshow','focus'])
  assert.match(groupPanel,new RegExp(`window\\.removeEventListener\\('${event}',clearOfflineHint\\)`));
 assert.match(groupPanel,/document\.removeEventListener\('visibilitychange',clearOfflineHint\)/);
 assert.match(groupPanel,/if\(navigator\.onLine\)setError\(current=>clearGroupOfflineDraftError\(current,true\)\)/);
});

test('reconnecting clears only the stale offline-draft error',()=>{
 assert.equal(clearGroupOfflineDraftError(GROUP_OFFLINE_DRAFT_ERROR,true),'');
 assert.equal(clearGroupOfflineDraftError(GROUP_OFFLINE_DRAFT_ERROR,false),GROUP_OFFLINE_DRAFT_ERROR);
 assert.equal(clearGroupOfflineDraftError('Ошибка отправки · Черновик сохранён.',true),'Ошибка отправки · Черновик сохранён.');
});

test('direct reconnect clears only the exact local message and attachment hints',()=>{
 assert.equal(clearDirectOfflineHint(DIRECT_MESSAGE_OFFLINE_ERROR,true),'');
 assert.equal(clearDirectOfflineHint(DIRECT_ATTACHMENT_OFFLINE_ERROR,true),'');
 assert.equal(clearDirectOfflineHint(DIRECT_MESSAGE_OFFLINE_ERROR,false),DIRECT_MESSAGE_OFFLINE_ERROR);
 assert.equal(clearDirectOfflineHint(DIRECT_ATTACHMENT_OFFLINE_ERROR,false),DIRECT_ATTACHMENT_OFFLINE_ERROR);
 assert.equal(clearDirectOfflineHint('Нет соединения с интернетом. Ошибка сервера.',true),'Нет соединения с интернетом. Ошибка сервера.');
 assert.equal(clearDirectOfflineHint(DIRECT_MESSAGE_OFFLINE_ERROR+' Дополнительная информация.',true),DIRECT_MESSAGE_OFFLINE_ERROR+' Дополнительная информация.');
 assert.equal(clearDirectOfflineHint('Ошибка отправки сообщения.',true),'Ошибка отправки сообщения.');
});

test('AppShell and GroupPanel use shared offline hints and the external network store',()=>{
 assert.match(shell,/setError\(DIRECT_MESSAGE_OFFLINE_ERROR\)/);
 assert.match(shell,/setError\(DIRECT_ATTACHMENT_OFFLINE_ERROR\)/);
 assert.match(groupPanel,/setError\(GROUP_OFFLINE_DRAFT_ERROR\)/);
 assert.match(shell,/const networkOnline=useNetworkOnline\(\)/);
 assert.match(groupPanel,/const online=useNetworkOnline\(\)/);
 assert.match(groupPanel,/if\(!online\|\|!navigator\.onLine\)\{setError\(GROUP_OFFLINE_DRAFT_ERROR\);return;\}/);
 assert.match(groupPanel,/disabled=\{busy\|\|!draft\.trim\(\)\|\|!online\}/);
});
