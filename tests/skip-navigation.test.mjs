import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('skip navigation targets the active conversation or visible section',()=>{
 const shell=load('components/AppShell.tsx');
 assert.match(shell,/<a className="ik-skip-link" href=\{detailOpen\?'#ik-main-content':'#ik-current-view'\}>Перейти к содержимому<\/a>/);
 assert.match(shell,/<h1 id="ik-current-view" tabIndex=\{-1\}>/);
 assert.match(shell,/<main id="ik-main-content" tabIndex=\{-1\} className=/);
});

test('skip link is visually hidden until keyboard focus and has a touch-sized target',()=>{
 const css=load('app/globals.css');
 assert.match(css,/\.ik-skip-link\{[^}]*position:fixed/);
 assert.match(css,/\.ik-skip-link\{[^}]*min-height:44px/);
 assert.match(css,/\.ik-skip-link\{[^}]*transform:translateY\(-200%\)/);
 assert.match(css,/\.ik-skip-link:focus-visible\{[^}]*transform:translateY\(0\)/);
 assert.match(css,/top:max\(12px,env\(safe-area-inset-top,0px\)\)/);
});
