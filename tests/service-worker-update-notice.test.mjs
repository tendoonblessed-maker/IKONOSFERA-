import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  controllerChangeResult,
  shouldShowWaitingServiceWorkerUpdate,
} from '../lib/service-worker-update.ts';

const load=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

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

test('update notice registers the existing worker and observes controller replacement',()=>{
  const ui=load('components/ServiceWorkerUpdateNotice.tsx');
  assert.match(ui,/navigator\.serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(ui,/addEventListener\('controllerchange'/);
  assert.match(ui,/removeEventListener\('controllerchange'/);
  assert.match(ui,/registration\.waiting/);
  assert.match(ui,/window\.location\.reload\(\)/);
  assert.match(ui,/role="status"/);
  assert.match(ui,/aria-live="polite"/);
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
