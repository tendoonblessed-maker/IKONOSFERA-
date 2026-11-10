import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 getAttachmentPreviewTabTarget,isAttachmentPreviewTabStop,preferNonTextFocusForAttachment
} from '../lib/attachment-preview-focus.ts';

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

test('Tab and Shift+Tab stay inside the dialog when controls are available',()=>{
 const first={},middle={},last={};
 const controls=[first,middle,last];
 const dialog={contains:node=>controls.includes(node)};
 assert.equal(getAttachmentPreviewTabTarget(dialog,dialog,controls,false),first);
 assert.equal(getAttachmentPreviewTabTarget(dialog,dialog,controls,true),last);
 assert.equal(getAttachmentPreviewTabTarget(first,dialog,controls,true),last);
 assert.equal(getAttachmentPreviewTabTarget(last,dialog,controls,false),first);
 assert.equal(getAttachmentPreviewTabTarget({},dialog,controls,false),first);
 assert.equal(getAttachmentPreviewTabTarget({},dialog,controls,true),last);
 assert.equal(getAttachmentPreviewTabTarget(middle,dialog,controls,false),null);
});

test('native audio and video controls participate in the attachment dialog tab order',()=>{
 const close={},media={},caption={},cancel={},send={};
 const controls=[close,media,caption,cancel,send];
 const dialog={contains:node=>controls.includes(node)};
 assert.equal(getAttachmentPreviewTabTarget(send,dialog,controls,false),close);
 assert.equal(getAttachmentPreviewTabTarget(close,dialog,controls,true),send);
 assert.equal(getAttachmentPreviewTabTarget(media,dialog,controls,false),null);
 assert.equal(getAttachmentPreviewTabTarget(media,dialog,controls,true),null);
 const component=load('components/ChatAttachmentPreview.tsx');
 assert.match(component,/audio\[controls\],video\[controls\]/);
 assert.match(component,/<video src=\{src\} controls playsInline/);
 assert.match(component,/<audio src=\{src\} controls/);
});

test('focus stays on the dialog while sending disables every control',()=>{
 const dialog={contains:()=>true};
 assert.equal(getAttachmentPreviewTabTarget(dialog,dialog,[],false),dialog);
 assert.equal(getAttachmentPreviewTabTarget(dialog,dialog,[],true),dialog);
 assert.equal(getAttachmentPreviewTabTarget(null,dialog,[],false),dialog);
});

test('attachment dialog retains focus through busy state and restores it without scrolling',()=>{
 const component=load('components/ChatAttachmentPreview.tsx');
 assert.match(component,/getAttachmentPreviewTabTarget\(document.activeElement,dialog,controls,event.shiftKey\)/);
 assert.match(component,/if\(sending\)dialogRef.current\?\.focus\(\{preventScroll:true\}\)/);
 assert.match(component,/aria-busy=\{sending\} tabIndex=\{-1\}/);
 assert.match(component,/previouslyFocused\.focus\(\{preventScroll:true\}\)/);
 assert.match(component,/button:not\(\[disabled\]\)/);
 assert.match(component,/textarea:not\(\[disabled\]\)/);
 assert.match(component,/document.addEventListener\('keydown',onKeyDown\)/);
 assert.match(component,/onClick=\{onSend\}/);
 assert.match(component,/disabled=\{sending\|\|!online\}/);
});

test('iPhone caption font stays large enough to prevent focus zoom after a user tap',()=>{
 const css=load('app/globals.css');
 assert.match(css, /\.ik-attachment-preview-caption textarea\{[^}]*font-size:16px/s);
});

test('hidden, inert, disabled and negative-tabindex controls are excluded from the tab order',()=>{
 const candidate=({
  tabIndex=0,disabled=false,hidden=false,ariaHidden=false,
  ancestorHidden=false,ancestorInert=false,ancestorAriaHidden=false,visible=true
 }={})=>({
  tabIndex,
  matches:selector=>selector===':disabled,[hidden],[aria-hidden="true"]'
   &&(disabled||hidden||ariaHidden),
  closest:selector=>selector==='[hidden],[inert],[aria-hidden="true"]'
   &&(ancestorHidden||ancestorInert||ancestorAriaHidden)?{}:null,
  getClientRects:()=>visible?[{}]:[]
 });
 assert.equal(isAttachmentPreviewTabStop(candidate()),true);
 assert.equal(isAttachmentPreviewTabStop(candidate({tabIndex:2})),true);
 assert.equal(isAttachmentPreviewTabStop(candidate({tabIndex:-2})),false);
 assert.equal(isAttachmentPreviewTabStop(candidate({disabled:true})),false);
 assert.equal(isAttachmentPreviewTabStop(candidate({hidden:true})),false);
 assert.equal(isAttachmentPreviewTabStop(candidate({ariaHidden:true})),false);
 assert.equal(isAttachmentPreviewTabStop(candidate({ancestorHidden:true})),false);
 assert.equal(isAttachmentPreviewTabStop(candidate({ancestorInert:true})),false);
 assert.equal(isAttachmentPreviewTabStop(candidate({ancestorAriaHidden:true})),false);
 assert.equal(isAttachmentPreviewTabStop(candidate({visible:false})),false);
 const component=load('components/ChatAttachmentPreview.tsx');
 assert.match(component,/\)\.filter\(isAttachmentPreviewTabStop\)/);
 assert.match(component,/\[tabindex\]/);
});
