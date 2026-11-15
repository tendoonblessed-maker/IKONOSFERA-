import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');

test('message action sheet exposes a modal dialog and focuses its primary action',()=>{
 assert.match(source,/ref=\{messageMenuDialogRef\} className="ik-message-menu-sheet" role="dialog" aria-modal="true" aria-label="Действия с сообщением" tabIndex=\{-1\}/);
 assert.match(source,/data-dialog-initial-focus onClick=\{\(\)=>replyToMessage\(menuMessage\)\}/);
 assert.match(source,/const focusStart=\(\)=>\{/);
 assert.match(source,/target\.focus\(\{preventScroll:true\}\)/);
});

test('both long-press and the visible action button use the same focus-aware opener',()=>{
 assert.match(source,/onOpenMenu=\{!message\.deleted_for_everyone\?\(\)=>openMessageMenu\(message\.id\):undefined\}/);
 assert.match(source,/id=\{'ik-message-menu-toggle-'\+message\.id\} className="ik-message-menu-toggle" aria-label="Действия с сообщением" onClick=\{\(\)=>openMessageMenu\(message\.id\)\}/);
 assert.match(source,/trigger\.focus\(\{preventScroll:true\}\)/);
});

test('Tab and Shift+Tab remain inside the message action dialog',()=>{
 assert.match(source,/document\.addEventListener\('keydown',onKeyDown\)/);
 assert.match(source,/if\(event\.key!=='Tab'\)return/);
 assert.match(source,/event\.shiftKey&&\(document\.activeElement===first\|\|!dialog\.contains\(document\.activeElement\)\)/);
 assert.match(source,/!event\.shiftKey&&\(document\.activeElement===last\|\|!dialog\.contains\(document\.activeElement\)\)/);
});

test('Escape closes the dialog and programmatic focus escape is redirected',()=>{
 assert.match(source,/if\(event\.key==='Escape'\)\{\s*event\.preventDefault\(\);\s*setMessageMenuId\(null\);/);
 assert.match(source,/document\.addEventListener\('focusin',onFocusIn\)/);
 assert.match(source,/event\.target instanceof Node&&!dialog\.contains\(event\.target\)/);
 assert.match(source,/focusStart\(\);/);
});

test('closing restores focus without scrolling, cleans listeners, and does not steal reply focus',()=>{
 assert.match(source,/document\.removeEventListener\('focusin',onFocusIn\)/);
 assert.match(source,/document\.removeEventListener\('keydown',onKeyDown\)/);
 assert.match(source,/if\(trigger\?\.isConnected&&!trigger\.hasAttribute\('disabled'\)\)trigger\.focus\(\{preventScroll:true\}\)/);
 assert.match(source,/else composerRef\.current\?\.focus\(\{preventScroll:true\}\)/);
 assert.match(source,/if\(messageMenuTriggerRef\.current\)skipMessageMenuFocusRestoreRef\.current=true;\s*setMessageMenuId\(null\)/);
});
