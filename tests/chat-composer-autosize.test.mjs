import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { resizeChatComposer } = require('../lib/chat-composer.js');
const load = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('chat composer resets its height before measuring so it can grow and shrink', () => {
  let measuredHeight = null;
  const element = {
    style: { height: '136px' },
    get scrollHeight() {
      measuredHeight = this.style.height;
      return 72;
    }
  };
  resizeChatComposer(element);
  assert.equal(measuredHeight, 'auto');
  assert.equal(element.style.height, '72px');
});

test('chat composer never grows beyond the shared 136px limit', () => {
  const element = { style: { height: '47px' }, scrollHeight: 260 };
  resizeChatComposer(element);
  assert.equal(element.style.height, '136px');
});

test('chat composer returns to its natural one-line height after the draft is cleared', () => {
  const element = { style: { height: '136px' }, scrollHeight: 47 };
  resizeChatComposer(element);
  assert.equal(element.style.height, '47px');
});

test('chat composer leaves message text and selection untouched', () => {
  const element = {
    style: { height: '47px' },
    scrollHeight: 92,
    value: 'Привет 👋\\nещё строка',
    selectionStart: 5,
    selectionEnd: 5
  };
  const before = { value: element.value, start: element.selectionStart, end: element.selectionEnd };
  resizeChatComposer(element);
  assert.deepEqual(
    { value: element.value, start: element.selectionStart, end: element.selectionEnd },
    before
  );
});

test('direct and group composers share the fallback and resize restored drafts before paint', () => {
  const direct = load('components/AppShell.tsx');
  const group = load('components/GroupPanel.tsx');
  assert.ok(direct.includes("import {resizeChatComposer} from '@/lib/chat-composer';"));
  assert.ok(group.includes("import {resizeChatComposer} from '@/lib/chat-composer';"));
  assert.ok(direct.includes('useLayoutEffect(()=>{resizeChatComposer(composerRef.current);},[draft,selected,userId]);'));
  assert.ok(group.includes('useLayoutEffect(()=>{resizeChatComposer(composerRef.current);},[draft,group.id,userId]);'));
  assert.ok(direct.includes('onInput={e=>resizeChatComposer(e.currentTarget)}'));
  assert.ok(group.includes('aria-label="Сообщение группе" ref={composerRef}'));
  assert.ok(group.includes('onInput={e=>resizeChatComposer(e.currentTarget)}'));
});
