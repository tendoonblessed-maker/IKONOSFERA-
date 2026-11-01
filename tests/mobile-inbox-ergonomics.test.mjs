import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('touch inbox rows have a comfortable minimum height',()=>{
 const css=read('app/mobile-inbox-ergonomics.css');
 assert.match(css,/@media \(any-pointer: coarse\)/);
 assert.match(css,/\.telegram-chat-row/);
 assert.match(css,/\.ik-group-inbox/);
 assert.match(css,/min-height:\s*68px/);
 assert.match(css,/touch-action:\s*manipulation/);
});
test('long previews clip instead of widening the mobile inbox',()=>{
 const css=read('app/mobile-inbox-ergonomics.css');
 assert.match(css,/\.ik-chat-preview/);
 assert.match(css,/\.ik-group-inbox-text small/);
 assert.match(css,/text-overflow:\s*ellipsis/);
 assert.match(css,/white-space:\s*nowrap/);
 assert.match(css,/min-width:\s*0/);
});
test('reduced motion disables chat-row transitions',()=>{
 const css=read('app/mobile-inbox-ergonomics.css');
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
 assert.match(css,/transition:\s*none\s*!important/);
});
test('mobile polish loads after touch action target rules',()=>{
 const layout=read('app/layout.tsx');
 assert.ok(layout.indexOf('import "./mobile-inbox-ergonomics.css"')>layout.indexOf('import "./mobile-inbox-actions.css"'));
});

test('touch ergonomics cover hybrid devices with a mouse as primary pointer',()=>{
 const actions=read('app/mobile-inbox-actions.css');
 const rows=read('app/mobile-inbox-ergonomics.css');
 for(const css of [actions,rows]){
  assert.ok(css.includes('@media (any-pointer: coarse)'));
  assert.ok(!css.includes('@media (pointer: coarse)'));
 }
});
