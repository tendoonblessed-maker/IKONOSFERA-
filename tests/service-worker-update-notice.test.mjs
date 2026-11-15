import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  BEFORE_APP_UPDATE_EVENT,
  controllerChangeResult,
  createServiceWorkerUpdateChecker,
  reloadAfterPersistingDrafts,
  shouldAnnounceInstalledWorkerUpdate,
  shouldCheckServiceWorkerUpdate,
  shouldShowWaitingServiceWorkerUpdate,
} from '../lib/service-worker-update.ts';

const load=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('the update action flushes composer drafts synchronously before reload',()=>{
  const calls=[];
  reloadAfterPersistingDrafts(()=>calls.push('persist'),()=>calls.push('reload'));
  assert.deepEqual(calls,['persist','reload']);
  assert.equal(BEFORE_APP_UPDATE_EVENT,'ikonosfera:before-app-update');
});

test('first Service Worker control is silent and a later controller change announces an update',()=>{
  const first=controllerChangeResult(false);
  assert.deepEqual(first,{controlled:true,updateAvailable:false});
  const replacement=controllerChangeResult(first.controlled);
  assert.deepEqual(replacement,{controlled:true,updateAvailable:true});
});

test('a waiting worker is an update only when this page was already controlled',()=>{
  assert.equal(shouldShowWaitingServiceWorkerUpdate(false,true),false);
  assert.equal(shouldShowWaitingServiceWorkerUpdate(true,false),false);
  assert.equal(shouldShowWaitingServiceWorkerUpdate(true,true),true);
});

test('an updatefound worker announces only after installation when an older worker controls the page',()=>{
  assert.equal(shouldAnnounceInstalledWorkerUpdate(false,'installed',true),false);
  assert.equal(shouldAnnounceInstalledWorkerUpdate(true,'installing',true),false);
  assert.equal(shouldAnnounceInstalledWorkerUpdate(true,'installed',false),false);
  assert.equal(shouldAnnounceInstalledWorkerUpdate(true,'installed',true),true);
  assert.equal(shouldAnnounceInstalledWorkerUpdate(true,'redundant',true),false);
});

test('background update checks require a mounted, controlled, visible and online page',()=>{
  const ready={disposed:false,controlled:true,visible:true,online:true,updateAvailable:false};
  assert.equal(shouldCheckServiceWorkerUpdate(ready),true);
  assert.equal(shouldCheckServiceWorkerUpdate({...ready,disposed:true}),false);
  assert.equal(shouldCheckServiceWorkerUpdate({...ready,controlled:false}),false);
  assert.equal(shouldCheckServiceWorkerUpdate({...ready,visible:false}),false);
  assert.equal(shouldCheckServiceWorkerUpdate({...ready,online:false}),false);
  assert.equal(shouldCheckServiceWorkerUpdate({...ready,updateAvailable:true}),false);
});

test('overlapping lifecycle events share one update check and allow a later check',async()=>{
  const run=createServiceWorkerUpdateChecker();
  let calls=0;
  let release;
  const update=()=>{calls++;return new Promise(resolve=>{release=resolve;});};
  const first=run(update);
  const overlapping=run(update);
  assert.strictEqual(overlapping,first);
  await Promise.resolve();
  assert.equal(calls,1);
  release();
  await first;
  await run(async()=>{calls++;});
  assert.equal(calls,2);
});

test('a rejected update check is swallowed and does not prevent a later retry',async()=>{
  const run=createServiceWorkerUpdateChecker();
  let calls=0;
  await run(async()=>{calls++;throw new Error('offline');});
  await run(async()=>{calls++;});
  assert.equal(calls,2);
});

test('a stalled browser update check times out and permits a later retry',async()=>{
  const run=createServiceWorkerUpdateChecker(8);
  let calls=0;
  const stalled=run(()=>{calls++;return new Promise(()=>{});});
  await stalled;
  assert.equal(calls,1);
  await run(async()=>{calls++;});
  assert.equal(calls,2);
});

test('a late settlement from a timed-out check cannot clear a newer in-flight check',async()=>{
  const run=createServiceWorkerUpdateChecker(8);
  let resolveFirst;
  let resolveSecond;
  let calls=0;

  const first=run(()=>{calls++;return new Promise(resolve=>{resolveFirst=resolve;});});
  await Promise.resolve();
  await first;

  const second=run(()=>{calls++;return new Promise(resolve=>{resolveSecond=resolve;});});
  await Promise.resolve();
  assert.equal(calls,2);

  resolveFirst();
  await Promise.resolve();
  await Promise.resolve();

  const overlapping=run(async()=>{calls++;});
  assert.strictEqual(overlapping,second,
    'the late first completion must not release the second request slot');
  assert.equal(calls,2);

  resolveSecond();
  await second;
});

test('update notice registers the worker and rechecks after resume or connectivity recovery',()=>{
  const ui=load('components/ServiceWorkerUpdateNotice.tsx');
  assert.match(ui,/navigator\.serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(ui,/activeRegistration\.update\(\)/);
  assert.match(ui,/addEventListener\('controllerchange'/);
  assert.match(ui,/addEventListener\('updatefound', onUpdateFound\)/);
  assert.match(ui,/registration\.installing\) watchInstallingWorker/);
  assert.match(ui,/addEventListener\('statechange', onStateChange\)/);
  assert.match(ui,/removeEventListener\('statechange', listener\)/);
  assert.match(ui,/removeEventListener\('updatefound', onUpdateFound\)/);
  assert.match(ui,/addEventListener\('visibilitychange'/);
  assert.match(ui,/addEventListener\('online'/);
  assert.match(ui,/addEventListener\('focus'/);
  assert.match(ui,/removeEventListener\('visibilitychange'/);
  assert.match(ui,/removeEventListener\('online'/);
  assert.match(ui,/removeEventListener\('focus'/);
  assert.match(ui,/window\.location\.reload\(\)/);
  assert.match(ui,/role="status"/);
  assert.match(ui,/aria-live="polite"/);
});

test('PWA update cannot interrupt an active IME composition',()=>{
  const ui=load('components/ServiceWorkerUpdateNotice.tsx');
  assert.match(ui,/addEventListener\('compositionstart', onCompositionStart, true\)/);
  assert.match(ui,/addEventListener\('compositionend', onCompositionEnd, true\)/);
  assert.match(ui,/removeEventListener\('compositionstart', onCompositionStart, true\)/);
  assert.match(ui,/removeEventListener\('compositionend', onCompositionEnd, true\)/);
  assert.match(ui,/disabled=\{composing\}/);
  assert.match(ui,/Завершите ввод, затем обновите приложение/);
});

test('both active chat composers flush their DOM value before a PWA update',()=>{
  const shell=load('components/AppShell.tsx');
  const group=load('components/GroupPanel.tsx');
  const ui=load('components/ServiceWorkerUpdateNotice.tsx');
  assert.ok(ui.includes('reloadAfterPersistingDrafts('));
  assert.ok(ui.includes('new Event(BEFORE_APP_UPDATE_EVENT)'));
  assert.ok(shell.includes('addEventListener(BEFORE_APP_UPDATE_EVENT,persistActiveDirectDraft)'));
  assert.ok(shell.includes('updateChatDraft(chatId,field.value)'));
  assert.ok(shell.includes('removeEventListener(BEFORE_APP_UPDATE_EVENT,persistActiveDirectDraft)'));
  assert.ok(group.includes('addEventListener(BEFORE_APP_UPDATE_EVENT,persistActiveGroupDraft)'));
  assert.ok(group.includes('onDraftChange(group.id,field.value)'));
  assert.ok(group.includes('removeEventListener(BEFORE_APP_UPDATE_EVENT,persistActiveGroupDraft)'));
});

test('layout owns one update notice and AppShell no longer registers a duplicate worker',()=>{
  const layout=load('app/layout.tsx');
  const shell=load('components/AppShell.tsx');
  assert.match(layout,/import ServiceWorkerUpdateNotice/);
  assert.match(layout,/<ServiceWorkerUpdateNotice \/>/);
  assert.doesNotMatch(shell,/navigator\.serviceWorker\.register/);
});

test('update notice respects mobile safe area and keyboard focus visibility',()=>{
  const css=load('app/globals.css');
  assert.match(css,/\.ik-sw-update-notice/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/\.ik-sw-update-notice button:focus-visible/);
  assert.match(css,/min-height:44px/);
});
