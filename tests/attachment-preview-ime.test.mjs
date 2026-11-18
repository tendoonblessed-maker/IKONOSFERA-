import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldSendAttachmentPreviewOnShortcut} from '../lib/attachment-preview-ime.ts';

const key=(overrides={})=>({
  key:'Enter',ctrlKey:true,metaKey:false,isComposing:false,keyCode:13,...overrides
});
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Ctrl+Enter and Cmd+Enter send only when composition is not active',()=>{
  assert.equal(shouldSendAttachmentPreviewOnShortcut(key()),true);
  assert.equal(shouldSendAttachmentPreviewOnShortcut(key({ctrlKey:false,metaKey:true})),true);
});

test('ordinary Enter, other keys and IME confirmation do not send the attachment',()=>{
  assert.equal(shouldSendAttachmentPreviewOnShortcut(key({ctrlKey:false})),false);
  assert.equal(shouldSendAttachmentPreviewOnShortcut(key({key:'a'})),false);
  assert.equal(shouldSendAttachmentPreviewOnShortcut(key({isComposing:true})),false);
  assert.equal(shouldSendAttachmentPreviewOnShortcut(key({isComposing:false,keyCode:229})),false);
});

test('attachment caption uses the tested guard before triggering the send button',()=>{
  const preview=source('components/ChatAttachmentPreview.tsx');
  assert.match(preview,/shouldSendAttachmentPreviewOnShortcut\(event\.nativeEvent\)/);
  assert.match(preview,/event\.preventDefault\(\);\s*sendRef\.current\?\.click\(\);/);
});
