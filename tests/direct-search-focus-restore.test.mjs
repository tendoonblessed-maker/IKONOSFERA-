import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const source=readFileSync(
  new URL('../components/DirectMessageSearchPanel.tsx',import.meta.url),
  'utf8'
);

test('Escape closes direct-message search only when the IME does not own the key',()=>{
  assert.ok(source.includes('shouldCloseSearchOnEscape(event.nativeEvent)'));
  assert.ok(source.includes('event.preventDefault();event.stopPropagation();onClose()'));
});

test('direct-message search focuses its input and restores the invoking control on close',()=>{
  assert.ok(source.includes('previousFocusRef=useRef<HTMLElement|null>(null)'));
  assert.ok(source.includes('const active=document.activeElement'));
  assert.ok(source.includes('previousFocusRef.current=active instanceof HTMLElement?active:null'));
  assert.ok(source.includes('inputRef.current?.focus()'));
  assert.ok(source.includes('if(target?.isConnected&&panel?.contains(active))target.focus({preventScroll:true})'));
  assert.ok(source.includes('previousFocusRef.current=null'));
  assert.ok(source.includes('useLayoutEffect(()=>{'));
});

test('focus restoration is safe when the invoking control was removed',()=>{
  assert.ok(source.includes('if(target?.isConnected&&panel?.contains(active))target.focus({preventScroll:true})'));
  assert.ok(source.includes('target?.isConnected'));
});

test('focus restoration does not steal focus from a control outside the closing search panel',()=>{
  assert.ok(source.includes('panelRef=useRef<HTMLElement|null>(null)'));
  assert.ok(source.includes('<section ref={panelRef}'));
  assert.ok(source.includes('const panel=panelRef.current'));
  assert.ok(source.includes('if(target?.isConnected&&panel?.contains(active))target.focus({preventScroll:true})'));
});

test('restoring the opener does not scroll the mobile conversation viewport',()=>{
  assert.ok(source.includes('target.focus({preventScroll:true})'));
});

test('search input keeps its accessible name and avoids competing autoFocus',()=>{
  assert.ok(source.includes('<input ref={inputRef} aria-label="Поиск сообщений в текущем чате"'));
  assert.ok(!source.includes('autoFocus'));
});

test('search announces one concise status and keeps the visual loading hint silent',()=>{
  assert.ok(source.includes('<span role="status" aria-live="polite">'));
  assert.ok(source.includes('className="ik-direct-search-results" role="region" aria-label="Результаты поиска" aria-busy={loading}'));
  assert.ok(!source.includes('ik-direct-search-results" aria-live='));
  assert.equal((source.match(/role="status"/g)||[]).length,1);
  assert.ok(source.includes('<p className="ik-direct-search-hint" aria-hidden="true">Ищем сообщения…</p>'));
});
