import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');

test('attachment preview uses the visual viewport height while the mobile keyboard is open',()=>{
 assert.match(shell,/window\.visualViewport/);
 assert.match(shell,/--ik-visible-viewport-height/);
 assert.match(css,/\.ik-attachment-preview-backdrop\{[^}]*height:var\(--ik-visible-viewport-height,100dvh\)/s);
 assert.match(css,/max-height:min\(770px,calc\(var\(--ik-visible-viewport-height,100dvh\) - 30px\)\)/);
 assert.match(css,/max-height:calc\(var\(--ik-visible-viewport-height,100dvh\) - 24px\)/);
});

test('attachment preview retains dynamic viewport fallbacks outside mobile visual-viewport support',()=>{
 assert.match(css,/var\(--ik-visible-viewport-height,100dvh\)/);
 assert.match(css,/safe-area-inset-top/);
 assert.match(css,/safe-area-inset-bottom/);
});
