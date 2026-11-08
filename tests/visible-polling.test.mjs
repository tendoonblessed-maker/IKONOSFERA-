import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {startVisiblePolling} from '../lib/visible-polling.ts';

function createHarness(initialVisibility = 'visible') {
  const listeners = new Set();
  const intervals = new Map();
  let nextId = 1;
  const documentRef = {
    visibilityState: initialVisibility,
    addEventListener(type, listener) {
      if (type === 'visibilitychange') listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'visibilitychange') listeners.delete(listener);
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
    }
  };
  return {
    documentRef,
    windowRef,
    intervals,
    listeners,
    setVisibility(value) {
      documentRef.visibilityState = value;
      for (const listener of [...listeners]) listener();
    },
    tick() {
      for (const interval of [...intervals.values()]) interval.callback();
    }
  };
}

test('group polling pauses while hidden and refreshes once before resuming', () => {
  const harness = createHarness();
  let calls = 0;
  const stop = startVisiblePolling(() => calls++, 6000, harness.documentRef, harness.windowRef);

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
  assert.equal(harness.listeners.size, 0);
  harness.setVisibility('hidden');
  harness.setVisibility('visible');
  assert.equal(calls, 2, 'disposed pollers never restart');
});

test('a group opened in the background starts polling only after becoming visible', () => {
  const harness = createHarness('hidden');
  let calls = 0;
  const stop = startVisiblePolling(() => calls++, 6000, harness.documentRef, harness.windowRef);

  assert.equal(harness.intervals.size, 0);
  assert.equal(calls, 0);

  harness.setVisibility('visible');
  assert.equal(calls, 1);
  assert.equal(harness.intervals.size, 1);
  stop();
});

test('GroupPanel uses the visibility-aware poller instead of a permanent interval', () => {
  const panel = readFileSync(new URL('../components/GroupPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /startVisiblePolling\(sync,6000\)/);
  assert.match(panel, /stopVisiblePolling\(\)/);
  assert.doesNotMatch(panel, /window\.setInterval\(sync,6000\)/);
});
