import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const component=readFileSync(new URL('../components/ChatMedia.tsx',import.meta.url),'utf8');

test('loading and error live regions stay mounted outside conditional media content',()=>{
 assert.match(component,/return <>\s*<span className="sr-only" role="status" aria-live="polite" aria-atomic="true">\{statusMessage\}<\/span>\s*<span className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">\{alertMessage\}<\/span>\s*\{mediaContent\}\s*<\/>;/);
 assert.match(component,/const statusMessage=loadingScope===scope\?/);
 assert.match(component,/const alertMessage=error\?/);
});

test('loading is announced after the request effect starts and clears on completion',()=>{
 assert.match(component,/const \[loadingScope,setLoadingScope\]=useState<string\|null>\(null\)/);
 assert.match(component,/setLoadingScope\(scope\)/);
 assert.match(component,/setLoadingScope\(null\)/);
 assert.match(component,/className="chat-media-loading" aria-hidden="true">Загружаем вложение…/);
});

test('private attachment failures are announced while the retry action remains available',()=>{
 assert.match(component,/if\(error\)mediaContent=<button type="button" className="chat-media-retry"/);
 assert.match(component,/Не удалось загрузить вложение · Повторить/);
 assert.match(component,/setErrorScope\(scope\);\s*setLoadingScope\(null\)/);
});

test('media accessibility states do not expose signed URLs or change account scoping',()=>{
 assert.ok(component.includes("const scope=token+':'+path;"));
 assert.match(component,/signed\?\.scope===scope\?signed\.url:null/);
 assert.doesNotMatch(component,/aria-label=\{[^}]*url/);
});
