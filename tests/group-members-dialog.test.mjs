import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../components/GroupPanel.tsx',import.meta.url),'utf8');

test('group members dialog moves focus inside and restores it after close',()=>{
 assert.match(source,/membersDialogRef=useRef<HTMLDivElement\|null>\(null\)/);
 assert.match(source,/membersSearchRef=useRef<HTMLInputElement\|null>\(null\)/);
 assert.match(source,/membersSearchRef\.current\?\.focus\(\)/);
 assert.match(source,/const previouslyFocused=document\.activeElement instanceof HTMLElement/);
 assert.match(source,/previouslyFocused\?\.isConnected\)previouslyFocused\.focus\(\)/);
});

test('group members dialog traps Tab and Shift+Tab inside its focusable controls',()=>{
 assert.match(source,/event\.key!=='Tab'\)return/);
 assert.match(source,/querySelectorAll<HTMLElement>\(/);
 assert.match(source,/event\.shiftKey&&\(document\.activeElement===first\|\|!dialog\.contains\(document\.activeElement\)\)/);
 assert.match(source,/last\.focus\(\)/);
 assert.match(source,/!event\.shiftKey&&\(document\.activeElement===last\|\|!dialog\.contains\(document\.activeElement\)\)/);
 assert.match(source,/first\.focus\(\)/);
 assert.match(source,/if\(!dialog\|\|!controls\?\.length\)\{/);
});

test('Escape closes the dialog and background scrolling is restored',()=>{
 assert.match(source,/event\.key==='Escape'/);
 assert.match(source,/setMembersOpen\(false\)/);
 assert.match(source,/import \{lockBodyScroll\} from '@\/lib\/body-scroll-lock'/);
 assert.match(source,/const releaseBodyScroll=lockBodyScroll\(document,window\)/);
 assert.match(source,/releaseBodyScroll\(\)/);
 assert.match(source,/document\.removeEventListener\('keydown',onKey\)/);
});

test('dialog semantics belong to the modal container and the search field receives initial focus',()=>{
 assert.match(source,/<div ref=\{membersDialogRef\} className="ik-members-modal" role="dialog" aria-modal="true"/);
 assert.match(source,/<input ref=\{membersSearchRef\} className="ik-members-search"/);
 assert.doesNotMatch(source,/<div className="ik-members-backdrop" role="dialog"/);
});

test('opening a member profile transfers focus instead of restoring the hidden group trigger',()=>{
 assert.match(source,/skipMembersFocusRestoreRef\.current=true;setMembersOpen\(false\);onShowProfile\(p\.id\)/);
 assert.match(source,/if\(!skipMembersFocusRestoreRef\.current&&previouslyFocused\?\.isConnected\)/);
 assert.match(source,/skipMembersFocusRestoreRef\.current=false/);
});

test('programmatic focus cannot escape the group members dialog',()=>{
 assert.match(source,/const onFocusIn=\(event:FocusEvent\)=>\{/);
 assert.match(source,/event\.target instanceof Node&&!dialog\.contains\(event\.target\)/);
 assert.match(source,/membersSearchRef\.current\?\?dialog\)\.focus\(\)/);
 assert.match(source,/document\.addEventListener\('focusin',onFocusIn\)/);
 assert.match(source,/document\.removeEventListener\('focusin',onFocusIn\)/);
 assert.match(source,/!skipMembersFocusRestoreRef\.current&&dialog/);
});

test('group members dialog locks body scroll before paint and restores the original scroll position',()=>{
 assert.match(source,/useLayoutEffect\(\(\)=>\{\s*if\(!membersOpen\)return;/);
 assert.match(source,/const releaseBodyScroll=lockBodyScroll\(document,window\)/);
 assert.match(source,/releaseBodyScroll\(\)/);
 assert.doesNotMatch(source,/document\.body\.style\.overflow='hidden'/);
});
