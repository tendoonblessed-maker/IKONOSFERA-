import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

const load = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('PWA manifest has required icons and standalone mode', () => {
  const m = JSON.parse(load('public/manifest.webmanifest'));
  assert.equal(m.name, 'IKONOSFERA');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/');
  for (const purpose of ['any', 'maskable']) assert.ok(m.icons.some(icon => icon.purpose === purpose));
  for (const entry of m.icons) assert.ok(existsSync(new URL(`../public/${entry.src.replace(/^\//, '')}`, import.meta.url)));
});

test('original SPEC is retained in docs', () => {
  assert.ok(load('docs/SPEC.md').includes('Мессенджер для людей, у которых слишком много чатов'));
});

test('source application contains no fake messages or fake-send API', () => {
  const shell = load('components/AppShell.tsx');
  assert.ok(!/seedMessages|mockMessages|fakeSend|sendFake|setMessages/.test(shell));
  assert.match(shell, /disabled title=\{t.futureFeatures\}/);
});

test('stage zero worker does not cache page requests or responses', () => {
  const worker = load('public/sw.js');
  assert.match(worker, /request\.mode !== "navigate"/);
  assert.match(worker, /fetch\(request\)\.catch/);
  assert.ok(!worker.includes('cache.put(request'));
});

test('design tokens include baseline palette and reduced motion', () => {
  const css = load('app/globals.css');
  for (const color of ['#000000', '#0a0a0a', '#111111', '#161616', '#f5f5f5', '#a1a1a1', '#8a8a8a']) assert.ok(css.includes(color));
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
