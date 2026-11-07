import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldSendAttachmentPreview} from '../lib/attachment-preview-shortcut.ts';

const key=(changes={})=>({
  key:'Enter',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,
  repeat:false,isComposing:false,...changes
});

test('Ctrl+Enter and Cmd+Enter send a prepared attachment',()=>{
  assert.equal(shouldSendAttachmentPreview(key({ctrlKey:true})),true);
  assert.equal(shouldSendAttachmentPreview(key({metaKey:true})),true);
});

test('plain Enter and modified combinations do not send an attachment',()=>{
  assert.equal(shouldSendAttachmentPreview(key()),false);
  assert.equal(shouldSendAttachmentPreview(key({ctrlKey:true,altKey:true})),false);
  assert.equal(shouldSendAttachmentPreview(key({metaKey:true,shiftKey:true})),false);
  assert.equal(shouldSendAttachmentPreview(key({key:'Escape',ctrlKey:true})),false);
});

test('IME composition and Safari keyCode 229 never trigger attachment sending',()=>{
  assert.equal(shouldSendAttachmentPreview(key({ctrlKey:true,isComposing:true})),false);
  assert.equal(shouldSendAttachmentPreview(key({metaKey:true,keyCode:229})),false);
});

test('auto-repeat cannot issue repeated attachment sends',()=>{
  assert.equal(shouldSendAttachmentPreview(key({ctrlKey:true,repeat:true})),false);
  assert.equal(shouldSendAttachmentPreview(key({metaKey:true,repeat:true})),false);
});

test('attachment preview routes only the guarded shortcut to its explicit send button',()=>{
  const source=readFileSync(new URL('../components/ChatAttachmentPreview.tsx',import.meta.url),'utf8');
  assert.match(source,/import \{shouldSendAttachmentPreview\} from '@\/lib\/attachment-preview-shortcut'/);
  assert.match(source,/shouldSendAttachmentPreview\(\{/);
  assert.match(source,/isComposing:event\.nativeEvent\.isComposing/);
  assert.match(source,/keyCode:event\.nativeEvent\.keyCode/);
  assert.match(source,/repeat:event\.repeat/);
  assert.match(source,/if\(shouldSendAttachmentPreview\(\{/);
  assert.match(source,/event\.preventDefault\(\);\s*sendRef\.current\?\.click\(\)/);
});
