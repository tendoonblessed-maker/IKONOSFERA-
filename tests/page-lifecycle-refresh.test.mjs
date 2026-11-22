import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { shouldRefreshAfterPageShow } from '../lib/page-lifecycle.mjs';

const load = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('refreshes a visible online page restored from the back-forward cache', () => {
  assert.equal(shouldRefreshAfterPageShow({ persisted: true }, 'visible', true), true);
});

test('does not duplicate the normal initial-navigation bootstrap', () => {
  assert.equal(shouldRefreshAfterPageShow({ persisted: false }, 'visible', true), false);
  assert.equal(shouldRefreshAfterPageShow({}, 'visible', true), false);
});

test('does not start network reads while the restored page is hidden or offline', () => {
  assert.equal(shouldRefreshAfterPageShow({ persisted: true }, 'hidden', true), false);
  assert.equal(shouldRefreshAfterPageShow({ persisted: true }, 'visible', false), false);
});

test('fails closed for malformed page lifecycle signals', () => {
  assert.equal(shouldRefreshAfterPageShow(null, 'visible', true), false);
  assert.equal(shouldRefreshAfterPageShow({ persisted: 1 }, 'visible', true), false);
  assert.equal(shouldRefreshAfterPageShow({ persisted: true }, 'prerender', true), false);
});

test('direct and group chat panels register and clean up BFCache resync listeners', () => {
  for (const path of ['components/AppShell.tsx', 'components/GroupPanel.tsx']) {
    const source = load(path);
    assert.match(source, /shouldRefreshAfterPageShow\(event,document\.visibilityState,navigator\.onLine\)/);
    assert.match(source, /window\.addEventListener\('pageshow',onPageShow\)/);
    assert.match(source, /window\.removeEventListener\('pageshow',onPageShow\)/);
  }
});

test('group composer connectivity state is refreshed and cleaned up on BFCache pageshow', () => {
  const source = load('components/GroupPanel.tsx');
  const effect = source.match(/const update=\(\)=>setOnline\(navigator\.onLine\);[\s\S]*?\},\[\]\);/);
  assert.ok(effect, 'group connectivity effect should remain a mount-scoped lifecycle effect');
  assert.match(effect[0], /window\.addEventListener\('pageshow',update\)/);
  assert.match(effect[0], /window\.removeEventListener\('pageshow',update\)/);
});
