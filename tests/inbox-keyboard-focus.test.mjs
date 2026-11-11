import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('inbox keyboard focus is visible without changing mouse or touch focus',()=>{
 const css=read('app/inbox-keyboard-focus.css');
 assert.match(css,/\.chat-item:focus-visible/);
 assert.match(css,/\.ik-chat-row-trigger:focus-visible/);
 assert.doesNotMatch(css,/:focus(?!-visible)/);
 assert.match(css,/outline:\s*2px solid/);
});

test('high contrast mode preserves a system-color focus indicator',()=>{
 const css=read('app/inbox-keyboard-focus.css');
 assert.match(css,/@media \(forced-colors: active\)/);
 assert.match(css,/outline-color:\s*Highlight/);
});

test('focus polish is loaded after the existing inbox theme',()=>{
 const layout=read('app/layout.tsx');
 assert.ok(layout.indexOf('import "./inbox-keyboard-focus.css"')>layout.indexOf('import "./inbox-unread-polish.css"'));
});
