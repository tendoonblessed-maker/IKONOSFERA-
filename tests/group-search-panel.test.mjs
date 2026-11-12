import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../components/GroupSearchPanel.tsx',import.meta.url),'utf8');

test('Escape closes group history search from anywhere inside the panel',()=>{
 assert.match(source,/onKeyDown=\{event=>\{\s*if\(event\.key==='Escape'\)\{\s*event\.preventDefault\(\);\s*onClose\(\);\s*\}\s*\}\}/);
});

test('group search restores the invoking control focus after close',()=>{
 assert.match(source,/previousFocusRef=useRef<HTMLElement\|null>\(null\)/);
 assert.match(source,/previousFocusRef\.current=active instanceof HTMLElement\?active:null/);
 assert.match(source,/inputRef\.current\?\.focus\(\)/);
 assert.match(source,/if\(target\?\.isConnected\)target\.focus\(\)/);
});

test('search input keeps its accessible name and avoids competing autoFocus',()=>{
 assert.match(source,/ref=\{inputRef\} type="search" aria-label="Найти сообщение в группе"/);
 assert.doesNotMatch(source,/autoFocus/);
});
