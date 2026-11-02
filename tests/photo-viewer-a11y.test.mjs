import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldClosePhotoViewerOnKeydown,restorePhotoViewerFocus} from '../lib/photo-viewer-a11y.ts';

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

test('photo modal uses guarded Escape, restores focus safely and retains keyboard trap',()=>{
 const ui=source();
 assert.match(ui,/shouldClosePhotoViewerOnKeydown\(event\)/);
 assert.match(ui,/restorePhotoViewerFocus\(previousFocus\)/);
 assert.match(ui,/document\.addEventListener\('keydown',handleKeyboard\)/);
 assert.match(ui,/event\.key!=='Tab'/);
 assert.match(ui,/closeButtonRef\.current\?\.focus\(\)/);
 assert.match(ui,/aria-modal="true"/);
});
