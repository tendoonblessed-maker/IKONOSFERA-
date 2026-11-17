import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const source=readFileSync(
  new URL('../components/DirectMessageSearchPanel.tsx',import.meta.url),
  'utf8'
);

test('Escape closes direct-message search only when the IME does not own the key',()=>{
  assert.match(source,/shouldCloseSearchOnEscape\\(event\\.nativeEvent\\)/);
  assert.match(source,/event\\.preventDefault\\(\\);event\\.stopPropagation\\(\\);onClose\\(\\)/);
});

test('direct-message search focuses its input and restores the invoking control on close',()=>{
  assert.match(source,/previousFocusRef=useRef<HTMLElement\\|null>\\(null\\)/);
  assert.match(source,/const active=document\\.activeElement/);
  assert.match(source,/previousFocusRef\\.current=active instanceof HTMLElement\\?active:null/);
  assert.match(source,/inputRef\\.current\\?\\.focus\\(\\)/);
  assert.match(source,/if\\(target\\?\\.isConnected&&panel\\?\\.contains\\(active\\)\\)target\\.focus\\(\\{preventScroll:true\\}\\)/);
  assert.match(source,/previousFocusRef\\.current=null/);
  assert.match(source,/useLayoutEffect\\(\\(\\)=>\\{/);
});

test('focus restoration is safe when the invoking control was removed',()=>{
  assert.match(source,/if\\(target\\?\\.isConnected&&panel\\?\\.contains\\(active\\)\\)target\\.focus\\(\\{preventScroll:true\\}\\)/);
  assert.doesNotMatch(source,/target\\.focus\\(\\);[^}]*else/);
});

test('focus restoration does not steal focus from a control outside the closing search panel',()=>{
  assert.match(source,/panelRef=useRef<HTMLElement\\|null>\\(null\\)/);
  assert.match(source,/<section ref=\\{panelRef\\}/);
  assert.match(source,/const panel=panelRef\\.current/);
  assert.match(source,/if\\(target\\?\\.isConnected&&panel\\?\\.contains\\(active\\)\\)target\\.focus\\(\\{preventScroll:true\\}\\)/);
});

test('restoring the opener does not scroll the mobile conversation viewport',()=>{
  assert.match(source,/target\\.focus\\(\\{preventScroll:true\\}\\)/);
});

test('search input keeps its accessible name and avoids competing autoFocus',()=>{
  assert.match(source,/<input ref=\\{inputRef\\} aria-label="Поиск сообщений в текущем чате"/);
  assert.doesNotMatch(source,/autoFocus/);
});

test('search announces one concise status and keeps the visual loading hint silent',()=>{
  assert.match(source,/<span role="status" aria-live="polite">/);
  assert.match(source,/className="ik-direct-search-results" role="region" aria-label="Результаты поиска" aria-busy=\\{loading\\}/);
  assert.doesNotMatch(source,/ik-direct-search-results"[^>]*aria-live=/);
  assert.equal((source.match(/role="status"/g)||[]).length,1);
  assert.match(source,/<p className="ik-direct-search-hint" aria-hidden="true">Ищем сообщения…<\\/p>/);
});
