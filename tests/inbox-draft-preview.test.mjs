import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {inboxDraftPreview} from '../lib/inbox-draft-preview.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('inbox draft previews normalize whitespace before applying the existing 110-unit budget',()=>{
 assert.equal(inboxDraftPreview('  first\\n   second  '),'first second');
 assert.equal(inboxDraftPreview('short draft'), 'short draft');
 assert.equal(inboxDraftPreview('anything',0),'');
 assert.equal(inboxDraftPreview('anything',Number.NaN),'');
});

test('Intl.Segmenter truncation never leaves a partial emoji or combining sequence',()=>{
 assert.equal(inboxDraftPreview('x'.repeat(109)+'😀'),'x'.repeat(109));
 assert.equal(inboxDraftPreview('x'.repeat(109)+'e\\u0301'),'x'.repeat(109));
 assert.equal(inboxDraftPreview('x'.repeat(108)+'👋🏽'),'x'.repeat(108));
 assert.equal(inboxDraftPreview('x'.repeat(100)+'👨‍👩‍👧‍👦'),'x'.repeat(100));
});

test('complete grapheme clusters are preserved when they fit exactly',()=>{
 assert.equal(inboxDraftPreview('x'.repeat(108)+'😀'),'x'.repeat(108)+'😀');
 assert.equal(inboxDraftPreview('x'.repeat(108)+'e\\u0301'),'x'.repeat(108)+'e\\u0301');
});

test('older-browser fallback preserves surrogate pairs, flags, modifiers, ZWJ and combining marks',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');
 assert.ok(descriptor,'the test runtime should expose Intl.Segmenter for fallback simulation');
 const original=Intl.Segmenter;
 try{
  Object.defineProperty(Intl,'Segmenter',{...descriptor,value:undefined});
  assert.equal(inboxDraftPreview('x'.repeat(109)+'😀'),'x'.repeat(109));
  assert.equal(inboxDraftPreview('x'.repeat(108)+'🇸🇪'),'x'.repeat(108));
  assert.equal(inboxDraftPreview('x'.repeat(108)+'👋🏽'),'x'.repeat(108));
  assert.equal(inboxDraftPreview('x'.repeat(100)+'👨‍👩‍👧‍👦'),'x'.repeat(100));
  assert.equal(inboxDraftPreview('x'.repeat(109)+'e\\u0301'),'x'.repeat(109));
 }finally{
  Object.defineProperty(Intl,'Segmenter',{...descriptor,value:original});
 }
});

test('direct and group inbox rows both use the shared grapheme-safe draft formatter',()=>{
 const direct=source('components/ChatInboxRow.tsx');
 const group=source('components/GroupInboxRow.tsx');
 assert.match(direct,/inboxDraftPreview\\(draft\\)/);
 assert.match(group,/inboxDraftPreview\\(draft\\?\\?''\\)/);
 assert.doesNotMatch(direct,/draft\\.trim\\(\\)\\.replace\\([\\s\\S]*?\\)\\.slice\\(0,110\\)/);
 assert.doesNotMatch(group,/draft\\?\\.trim\\(\\)[\\s\\S]*?\\.slice\\(0,110\\)/);
});
