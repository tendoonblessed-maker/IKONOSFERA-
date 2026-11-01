import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {preferNonTextFocusForAttachment} from '../lib/attachment-preview-focus.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('iPhone and Android touch input avoids automatic caption focus',()=>{
 assert.equal(preferNonTextFocusForAttachment(true,5),true);
 assert.equal(preferNonTextFocusForAttachment(true,0),true,'coarse media query works when touch points are unavailable');
});

test('hybrid touch devices also avoid automatically opening the keyboard',()=>{
 assert.equal(preferNonTextFocusForAttachment(false,10),true);
 assert.equal(preferNonTextFocusForAttachment(false,1),true);
});

test('non-touch desktops retain fast caption keyboard entry',()=>{
 assert.equal(preferNonTextFocusForAttachment(false,0),false);
 assert.equal(preferNonTextFocusForAttachment(false,Number.NaN),false);
 assert.equal(preferNonTextFocusForAttachment(false,-1),false);
});

test('attachment dialog keeps focus inside, without scrolling or changing send/cancel actions',()=>{
 const component=load('components/ChatAttachmentPreview.tsx');
 assert.match(component,/preferNonTextFocusForAttachment\(/);
 assert.match(component,/matchMedia\?\.\('\(pointer: coarse\)'\)/);
 assert.match(component,/navigator\.maxTouchPoints/);
 assert.match(component,/if\(touchFirst\)dismissRef\.current\?\.focus\(\{preventScroll:true\}\)/);
 assert.match(component,/else captionRef\.current\?\.focus\(\{preventScroll:true\}\)/);
 assert.match(component,/<button ref=\{dismissRef\} type="button" onClick=\{onCancel\}/);
 assert.match(component,/document\.addEventListener\('keydown',onKeyDown\)/);
 assert.match(component,/if\(event\.key==='Escape'&&!busyRef\.current\)/);
 assert.match(component,/if\(event\.key!=='Tab'\)return/);
 assert.match(component,/document\.body\.style\.overflow='hidden'/);
 assert.match(component,/if\(previouslyFocused\?\.isConnected\)previouslyFocused\.focus\(\)/);
 assert.match(component,/onClick=\{onSend\}/);
 assert.match(component,/disabled=\{sending\|\|!online\}/);
});

test('iPhone caption font stays large enough to prevent focus zoom after a user tap',()=>{
 const css=load('app/globals.css');
 assert.match(css,/\.ik-attachment-preview-caption textarea\{[^}]*font-size:16px/s);
});
