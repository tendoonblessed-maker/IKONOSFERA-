import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const component=readFileSync(new URL('../components/ChatMedia.tsx',import.meta.url),'utf8');

test('private attachment loading is announced as a polite status',()=>{
 assert.match(component,/className="chat-media-loading"\s+role="status"\s+aria-atomic="true"/);
 assert.match(component,/Загружаем вложение…/);
});

test('private attachment failures are announced without removing the retry action',()=>{
 assert.match(component,/<span role="alert" aria-atomic="true">\s*<button type="button" className="chat-media-retry"/);
 assert.match(component,/Не удалось загрузить вложение · Повторить/);
 assert.match(component,/onClick=\{\(\)=>setRetry\(value=>value\+1\)\}/);
});

test('media accessibility states do not expose signed URLs or change account scoping',()=>{
 assert.ok(component.includes("const scope=token+':'+path;"));
 assert.match(component,/signed\?\.scope===scope\?signed\.url:null/);
 assert.doesNotMatch(component,/aria-label=\{[^}]*url/);
});
