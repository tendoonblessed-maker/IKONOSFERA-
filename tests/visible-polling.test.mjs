import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {startVisiblePolling} from '../lib/visible-polling.ts';

function createHarness(initialVisibility = 'visible', initiallyOnline = true) {
  const documentListeners = new Set();
  const windowListeners = new Map([['online', new Set()], ['offline', new Set()]]);
  const intervals = new Map();
  let nextId = 1;
  const documentRef = {
    visibilityState: initialVisibility,
    addEventListener(type, listener) {
      if (type === 'visibilitychange') documentListeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'visibilitychange') documentListeners.delete(listener);
    }
  };
  const windowRef = {
    setInterval(callback, delay) {
      const id = nextId++;
      intervals.set(id, {callback, delay});
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    addEventListener(type, listener) {
      windowListeners.get(type)?.add(listener);
    },
    removeEventListener(type, listener) {
      windowListeners.get(type)?.delete(listener);
    }
  };
  const navigatorRef = {onLine: initiallyOnline};
  return {
    documentRef,
    windowRef,
    navigatorRef,
    intervals,
    documentListeners,
    windowListeners,
    setVisibility(value) {
      documentRef.visibilityState = value;
      for (const listener of [...documentListeners]) listener();
    },
    setOnline(value) {
      navigatorRef.onLine = value;
      const type = value ? 'online' : 'offline';
      for (const listener of [...windowListeners.get(type)]) listener();
    },
    tick() {
      for (const interval of [...intervals.values()]) interval.callback();
    }
  };
}

test('group polling pauses while hidden and refreshes once before resuming', () => {
  const harness = createHarness();
  let calls = 0;
  const stop = startVisiblePolling(
    () => calls++, 6000, harness.documentRef, harness.windowRef, harness.navigatorRef
  );

  assert.equal(harness.intervals.size, 1);
  assert.equal([...harness.intervals.values()][0].delay, 6000);
  assert.equal(calls, 0, 'initial fetch remains owned by the component');

  harness.setVisibility('hidden');
  assert.equal(harness.intervals.size, 0);
  harness.tick();
  assert.equal(calls, 0, 'hidden documents do not poll');

  harness.setVisibility('visible');
  assert.equal(calls, 1, 'resume immediately repairs missed Realtime events');
  assert.equal(harness.intervals.size, 1);
  harness.tick();
  assert.equal(calls, 2);

  stop();
  assert.equal(harness.intervals.size, 0);
  assert.equal(harness.documentListeners.size, 0);
  assert.equal(harness.windowListeners.get('online').size, 0);
  assert.equal(harness.windowListeners.get('offline').size, 0);
  harness.setVisibility('hidden');
  harness.setVisibility('visible');
  harness.setOnline(false);
  harness.setOnline(true);
  assert.equal(calls, 2, 'disposed pollers never restart');
});

test('a group opened in the background starts polling only after becoming visible', () => {
  const harness = createHarness('hidden');
  let calls = 0;
  const stop = startVisiblePolling(
    () => calls++, 6000, harness.documentRef, harness.windowRef, harness.navigatorRef
  );

  assert.equal(harness.intervals.size, 0);
  assert.equal(calls, 0);

  harness.setVisibility('visible');
  assert.equal(calls, 1);
  assert.equal(harness.intervals.size, 1);
  stop();
});

test('offline state stops polling and reconnect refreshes before restarting it', () => {
  const harness = createHarness('visible', false);
  let polls = 0;
  let resumes = 0;
  const stop = startVisiblePolling(
    () => polls++, 6000, harness.documentRef, harness.windowRef, harness.navigatorRef,
    () => resumes++
  );

  assert.equal(harness.intervals.size, 0, 'an offline page must not start a timer');
  harness.tick();
  assert.equal(polls, 0);

  harness.setOnline(true);
  assert.equal(resumes, 1, 'reconnect triggers one authoritative refresh');
  assert.equal(harness.intervals.size, 1);
  harness.tick();
  assert.equal(polls, 1);

  harness.setOnline(false);
  assert.equal(harness.intervals.size, 0);
  harness.tick();
  assert.equal(polls, 1, 'offline pages do not keep waking for fallback polls');

  harness.setOnline(true);
  assert.equal(resumes, 2);
  assert.equal(harness.intervals.size, 1);
  stop();
  assert.equal(harness.intervals.size, 0);
});

test('pause callback invalidates work when visibility or connectivity is lost', () => {
  const harness = createHarness();
  let pauses = 0;
  let resumes = 0;
  const stop = startVisiblePolling(
    () => {}, 6000, harness.documentRef, harness.windowRef, harness.navigatorRef,
    () => resumes++, () => pauses++
  );

  harness.setVisibility('hidden');
  assert.equal(pauses, 1, 'hiding invalidates the active request generation');
  assert.equal(resumes, 0);

  harness.setVisibility('visible');
  assert.equal(resumes, 1);

  harness.setOnline(false);
  assert.equal(pauses, 2, 'going offline invalidates the next active generation');
  harness.setOnline(true);
  assert.equal(resumes, 2);

  stop();
  assert.equal(pauses, 2, 'unmount cleanup does not report a background pause');
});

test('visibility resume uses the dedicated resume callback, not the periodic poll callback', () => {
  const harness = createHarness();
  let polls = 0;
  let resumes = 0;
  const stop = startVisiblePolling(
    () => polls++, 6000, harness.documentRef, harness.windowRef, harness.navigatorRef,
    () => resumes++
  );

  harness.setVisibility('hidden');
  harness.setVisibility('visible');
  assert.equal(resumes, 1);
  assert.equal(polls, 0);
  harness.tick();
  assert.equal(polls, 1);
  stop();
});

test('GroupPanel and private chats share the visibility- and network-aware poller', () => {
  const panel = readFileSync(new URL('../components/GroupPanel.tsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
  assert.match(panel, /startVisiblePolling\(sync,6000,document,window,navigator,undefined,\(\)=>\{/);
  assert.match(panel, /requestGeneration\+\+/);
  assert.match(panel, /requestSequenceRef\.current\+\+/);
  assert.match(panel, /stopVisiblePolling\(\)/);
  assert.doesNotMatch(panel, /window\.setInterval\(sync,6000\)/);
  assert.match(shell, /startVisiblePolling\(/);
  assert.match(shell, /\(\)=>void sync\(true\),\(\)=>\{requestGeneration\+\+;\}/);
  assert.match(shell, /generation!==requestGeneration/);
  assert.match(shell, /generation===requestGeneration&&document\.visibilityState==='visible'&&navigator\.onLine/);
  assert.match(shell, /stopVisiblePolling\(\)/);
  assert.doesNotMatch(shell, /window\.setInterval\(\(\)=>void sync\(\),6000\)/);
});

test('ProfilePanel pauses activity polling while hidden or offline and scopes results to the current profile', () => {
  const panel = readFileSync(new URL('../components/ProfilePanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /startVisiblePolling\(poll,30000,document,window,navigator,poll,\(\)=>\{requestGeneration\+\+;\}\)/);
  assert.match(panel, /generation===requestGeneration/);
  assert.match(panel, /if\(!mounted\|\|document\.visibilityState!=='visible'\|\|!navigator\.onLine\)return/);
  assert.match(panel, /scopedProfileActivity\(activitySnapshot,userId,targetId\)/);
  assert.match(panel, /setActivitySnapshot\(\{ownerId:userId,targetId,value:rows\[targetId\]\|\|null\}\)/);
  assert.match(panel, /return\(\)=>\{mounted=false;stopPolling\(\);\}/);
  const effect = panel.slice(
    panel.indexOf('useEffect(()=>{let mounted=true;const poll='),
    panel.indexOf(' const run=async')
  );
  assert.doesNotMatch(effect, /window\.setInterval/);
});
