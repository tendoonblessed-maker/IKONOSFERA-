import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('touch devices suppress sticky hover highlights in both inbox row types',()=>{
 const css=read('app/mobile-inbox-ergonomics.css');
 assert.match(css,/@media \(hover: none\)/);
 assert.match(css,/\.chat-row-wrap:hover:not\(\.active\)/);
 assert.match(css,/\.ik-group-inbox:hover:not\(\.active\)/);
 assert.match(css,/background:\s*#fff\s*!important/);
});

test('active chat selection is excluded from the touch hover reset',()=>{
 const css=read('app/mobile-inbox-ergonomics.css');
 const rule=css.slice(css.indexOf('@media (hover: none)'));
 assert.doesNotMatch(rule,/\.chat-row-wrap\.active|\.ik-group-inbox\.active/);
 assert.match(rule,/hover:not\(\.active\)/);
});

test('desktop hover remains intact and touch ergonomics still apply to hybrids',()=>{
 const css=read('app/mobile-inbox-ergonomics.css');
 assert.ok(css.includes('@media (any-pointer: coarse)'));
 assert.ok(!css.includes('@media (hover: hover)'));
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
});
