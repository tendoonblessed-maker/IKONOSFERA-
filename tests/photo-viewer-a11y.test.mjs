import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 shouldClosePhotoViewerOnKeydown,
 restorePhotoViewerFocus,
 isPhotoViewerTabStop,
 getPhotoViewerTabTarget
} from '../lib/photo-viewer-a11y.ts';

const key=(overrides={})=>({key:'Escape',isComposing:false,keyCode:27,...overrides});
const source=()=>readFileSync(new URL('../components/ChatPhotoViewer.tsx',import.meta.url),'utf8');

test('photo viewer Escape closes normally but never interrupts IME composition',()=>{
 assert.equal(shouldClosePhotoViewerOnKeydown(key()),true);
 assert.equal(shouldClosePhotoViewerOnKeydown(key({key:'Tab'})),false);
 assert.equal(shouldClosePhotoViewerOnKeydown(key({isComposing:true})),false);
 assert.equal(shouldClosePhotoViewerOnKeydown(key({keyCode:229})),false);
});

test('restoring photo focus never scrolls the chat and skips removed elements',()=>{
 const calls=[];
 const active={isConnected:true,focus:options=>calls.push(options)};
 restorePhotoViewerFocus(active);
 assert.deepEqual(calls,[{preventScroll:true}]);
 restorePhotoViewerFocus({...active,isConnected:false});
 restorePhotoViewerFocus(null);
 assert.equal(calls.length,1);
});

test('Tab and Shift+Tab wrap around visible controls and recover escaped focus',()=>{
 const first={},middle={},last={},dialog={contains:node=>[first,middle,last].includes(node)};
 const controls=[first,middle,last];
 assert.equal(getPhotoViewerTabTarget(dialog,dialog,controls,false),first);
 assert.equal(getPhotoViewerTabTarget(dialog,dialog,controls,true),last);
 assert.equal(getPhotoViewerTabTarget(first,dialog,controls,true),last);
 assert.equal(getPhotoViewerTabTarget(last,dialog,controls,false),first);
 assert.equal(getPhotoViewerTabTarget({},dialog,controls,false),first);
 assert.equal(getPhotoViewerTabTarget({},dialog,controls,true),last);
 assert.equal(getPhotoViewerTabTarget(middle,dialog,controls,false),null);
});

test('when no visible controls remain, Tab stays on the dialog instead of escaping',()=>{
 const dialog={contains:()=>false};
 assert.equal(getPhotoViewerTabTarget(null,dialog,[],false),dialog);
 assert.equal(getPhotoViewerTabTarget({},dialog,[],true),dialog);
});

test('hidden, inert, disabled and negative-tabindex elements are not tab stops',()=>{
 const candidate=({
  tabIndex=0,disabled=false,hidden=false,ariaHidden=false,
  ancestorHidden=false,ancestorInert=false,ancestorAriaHidden=false,visible=true
 }={})=>({
  tabIndex,
  matches:selector=>selector===':disabled,[hidden],[aria-hidden="true"]'&&(disabled||hidden||ariaHidden),
  closest:selector=>selector==='[hidden],[inert],[aria-hidden="true"]'&&(ancestorHidden||ancestorInert||ancestorAriaHidden)?{}:null,
  getClientRects:()=>visible?[{}]:[]
 });
 assert.equal(isPhotoViewerTabStop(candidate()),true);
 assert.equal(isPhotoViewerTabStop(candidate({tabIndex:2})),true);
 assert.equal(isPhotoViewerTabStop(candidate({tabIndex:-1})),false);
 assert.equal(isPhotoViewerTabStop(candidate({disabled:true})),false);
 assert.equal(isPhotoViewerTabStop(candidate({hidden:true})),false);
 assert.equal(isPhotoViewerTabStop(candidate({ariaHidden:true})),false);
 assert.equal(isPhotoViewerTabStop(candidate({ancestorHidden:true})),false);
 assert.equal(isPhotoViewerTabStop(candidate({ancestorInert:true})),false);
 assert.equal(isPhotoViewerTabStop(candidate({ancestorAriaHidden:true})),false);
 assert.equal(isPhotoViewerTabStop(candidate({visible:false})),false);
});

test('photo modal applies the filtered focus trap and focuses the dialog fallback',()=>{
 const ui=source();
 assert.match(ui,/shouldClosePhotoViewerOnKeydown\(event\)/);
 assert.match(ui,/restorePhotoViewerFocus\(previousFocus\)/);
 assert.match(ui,/querySelectorAll<HTMLElement>\(/);
 assert.match(ui,/audio\[controls\],video\[controls\],\[tabindex\]/);
 assert.match(ui, /\.filter\(isPhotoViewerTabStop\)/);
 assert.match(ui,/getPhotoViewerTabTarget\(document\.activeElement,dialog,controls,event\.shiftKey\)/);
 assert.match(ui,/target\.focus\(\{preventScroll:true\}\)/);
 assert.match(ui,/tabIndex=\{-1\}/);
 assert.match(ui,/document\.addEventListener\('keydown',handleKeyboard\)/);
 assert.match(ui,/aria-modal="true"/);
});
