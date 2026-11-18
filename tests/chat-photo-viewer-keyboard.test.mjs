import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldCloseChatPhotoViewer} from '../lib/chat-photo-viewer-keyboard.ts';

const key=(overrides={})=>({key:'Escape',isComposing:false,keyCode:27,...overrides});
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('photo viewer closes only for a non-composing Escape',()=>{
 assert.equal(shouldCloseChatPhotoViewer(key()),true);
 assert.equal(shouldCloseChatPhotoViewer(key({isComposing:true})),false);
 assert.equal(shouldCloseChatPhotoViewer(key({isComposing:false,keyCode:229})),false);
 assert.equal(shouldCloseChatPhotoViewer(key({key:'Tab'})),false);
 assert.equal(shouldCloseChatPhotoViewer(key({keyCode:0})),true);
});

test('chat photo viewer uses the IME-safe close guard without weakening its modal focus behavior',()=>{
 const viewer=source('components/ChatPhotoViewer.tsx');
 assert.match(viewer,/shouldCloseChatPhotoViewer\(event\)/);
 assert.match(viewer,/closeButtonRef\.current\?\.focus\(\)/);
 assert.match(viewer,/aria-modal="true"/);
 assert.match(viewer,/document\.addEventListener\('keydown',handleKeyboard\)/);
 assert.match(viewer,/previousFocus\?\.isConnected/);
});
