import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {truncatePreviewText} from '../lib/text-preview.ts';

const source=readFileSync(new URL('../components/ReplyQuote.tsx',import.meta.url),'utf8');

test('reply quote preview truncation never splits extended grapheme clusters',()=>{
 const prefix='x'.repeat(139);
 for(const cluster of ['👨‍👩‍👧‍👦','🇸🇪','👩🏽‍💻','e\\u0301']){
  assert.equal(truncatePreviewText(prefix+cluster,140),prefix);
 }
});

test('reply quote preview keeps a complete grapheme when it fits the 140-unit cap',()=>{
 const combining='x'.repeat(138)+'e\\u0301';
 assert.equal(combining.length,140);
 assert.equal(truncatePreviewText(combining,140),combining);

 const family='x'.repeat(120)+'👨‍👩‍👧‍👦';
 assert.equal(truncatePreviewText(family,140),family);
});

test('code-point fallback never returns an isolated UTF-16 surrogate',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');
 assert.ok(descriptor,'test runtime should expose Intl.Segmenter for fallback simulation');
 try{
  Object.defineProperty(Intl,'Segmenter',{...descriptor,value:undefined});
  const prefix='x'.repeat(139);
  const result=truncatePreviewText(prefix+'😀tail',140);
  assert.equal(result,prefix);
  if(result.length){
   const last=result.charCodeAt(result.length-1);
   assert.ok(!(last>=0xd800&&last<=0xdbff),'preview must not end with an unmatched high surrogate');
  }
 }finally{
  Object.defineProperty(Intl,'Segmenter',descriptor);
 }
});

test('ReplyQuote uses the shared grapheme-safe helper while preserving reply fallbacks',()=>{
 assert.ok(source.includes("truncatePreviewText(bodyPreview,140)"));
 assert.ok(source.includes("target?.deleted_for_everyone"));
 assert.ok(source.includes("target?.media_type?'Вложение':'Исходное сообщение недоступно'"));
 assert.ok(source.includes("target?.body?.replace(/\\\\s+/g,' ').trim() ?? ''"));
 assert.ok(!source.includes('.slice(0,140)'));
});
