import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 getProfilePhotoLightboxTabTarget,isProfilePhotoLightboxTabStop,
 restoreProfilePhotoLightboxFocus,shouldCloseProfilePhotoLightbox
} from '../lib/profile-photo-lightbox-focus.ts';

const key=(changes={})=>({key:'Escape',isComposing:false,keyCode:27,...changes});
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Escape closes the profile photo viewer but never interrupts IME confirmation',()=>{
 assert.equal(shouldCloseProfilePhotoLightbox(key()),true);
 assert.equal(shouldCloseProfilePhotoLightbox(key({key:'Tab'})),false);
 assert.equal(shouldCloseProfilePhotoLightbox(key({isComposing:true})),false);
 assert.equal(shouldCloseProfilePhotoLightbox(key({isComposing:false,keyCode:229})),false);
});

test('Tab and Shift+Tab stay within visible lightbox controls',()=>{
 const first={},middle={},last={};
 const controls=[first,middle,last];
 const dialog={contains:node=>controls.includes(node)};
 assert.equal(getProfilePhotoLightboxTabTarget(dialog,dialog,controls,false),first);
 assert.equal(getProfilePhotoLightboxTabTarget(dialog,dialog,controls,true),last);
 assert.equal(getProfilePhotoLightboxTabTarget(first,dialog,controls,true),last);
 assert.equal(getProfilePhotoLightboxTabTarget(last,dialog,controls,false),first);
 assert.equal(getProfilePhotoLightboxTabTarget({},dialog,controls,false),first);
 assert.equal(getProfilePhotoLightboxTabTarget({},dialog,controls,true),last);
 assert.equal(getProfilePhotoLightboxTabTarget(middle,dialog,controls,false),null);
});

test('a lightbox with no visible controls keeps focus on its dialog container',()=>{
 const dialog={contains:()=>false};
 assert.equal(getProfilePhotoLightboxTabTarget(null,dialog,[],false),dialog);
 assert.equal(getProfilePhotoLightboxTabTarget({},dialog,[],true),dialog);
});

test('hidden, inert, disabled and non-rendered elements are excluded from tab order',()=>{
 const candidate=({
  tabIndex=0,disabled=false,hidden=false,ariaHidden=false,
  ancestorHidden=false,ancestorInert=false,ancestorAriaHidden=false,visible=true
 }={})=>({
  tabIndex,
  matches:selector=>selector===':disabled,[hidden],[aria-hidden="true"]'&&(disabled||hidden||ariaHidden),
  closest:selector=>selector==='[hidden],[inert],[aria-hidden="true"]'
   &&(ancestorHidden||ancestorInert||ancestorAriaHidden)?{}:null,
  getClientRects:()=>visible?[{}]:[]
 });
 assert.equal(isProfilePhotoLightboxTabStop(candidate()),true);
 assert.equal(isProfilePhotoLightboxTabStop(candidate({tabIndex:-1})),false);
 assert.equal(isProfilePhotoLightboxTabStop(candidate({disabled:true})),false);
 assert.equal(isProfilePhotoLightboxTabStop(candidate({hidden:true})),false);
 assert.equal(isProfilePhotoLightboxTabStop(candidate({ariaHidden:true})),false);
 assert.equal(isProfilePhotoLightboxTabStop(candidate({ancestorHidden:true})),false);
 assert.equal(isProfilePhotoLightboxTabStop(candidate({ancestorInert:true})),false);
 assert.equal(isProfilePhotoLightboxTabStop(candidate({ancestorAriaHidden:true})),false);
 assert.equal(isProfilePhotoLightboxTabStop(candidate({visible:false})),false);
});

test('restoring the gallery opener prevents scroll and skips disconnected elements',()=>{
 const calls=[];
 const opener={isConnected:true,focus:options=>calls.push(options)};
 restoreProfilePhotoLightboxFocus(opener);
 restoreProfilePhotoLightboxFocus({...opener,isConnected:false});
 restoreProfilePhotoLightboxFocus(null);
 assert.deepEqual(calls,[{preventScroll:true}]);
});

test('profile lightbox traps programmatic focus and restores its opener on close',()=>{
 const component=load('components/ProfilePhotoLightbox.tsx');
 assert.match(component,/closeButtonRef\.current\?\.focus\(\{preventScroll:true\}\)/);
 assert.match(component,/document\.addEventListener\('focusin',onFocusIn\)/);
 assert.match(component,/document\.removeEventListener\('focusin',onFocusIn\)/);
 assert.match(component,/getProfilePhotoLightboxTabTarget\(document\.activeElement,dialog,tabStops\(\),event\.shiftKey\)/);
 assert.match(component,/restoreProfilePhotoLightboxFocus\(previousFocus\)/);
 assert.match(component,/aria-modal="true"/);
 assert.match(component,/tabIndex=\{-1\}/);
 assert.match(component,/document\.body\.style\.overflow='hidden'/);
 assert.match(component,/document\.body\.style\.overflow=previousOverflow/);
});

test('ProfilePanel delegates its profile photo overlay to the accessible lightbox',()=>{
 const panel=load('components/ProfilePanel.tsx');
 assert.match(panel,/import ProfilePhotoLightbox from ["']@\/components\/ProfilePhotoLightbox["']/);
 assert.match(panel,/<ProfilePhotoLightbox url=\{viewer\.url\} caption=\{viewer\.caption\} onClose=\{\(\)=>setViewer\(null\)\}\/\>/);
});
