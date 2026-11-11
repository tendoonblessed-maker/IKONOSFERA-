import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {truncatePreviewText} from '../lib/text-preview.ts';

const source=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function withoutIntlSegmenter(run){
 const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');
 try{
  Object.defineProperty(Intl,'Segmenter',{configurable:true,writable:true,value:undefined});
  return run();
 }finally{
  if(descriptor)Object.defineProperty(Intl,'Segmenter',descriptor);
  else delete Intl.Segmenter;
 }
}

test('draft preview truncation never leaves an isolated UTF-16 surrogate',()=>{
 const prefix='a'.repeat(109);
 assert.equal(truncatePreviewText(prefix+'😀tail'),prefix);
 assert.equal(truncatePreviewText(prefix+'🧑🏽‍🚀tail'),prefix);
});

test('Intl.Segmenter keeps combining marks, flags and ZWJ emoji together',()=>{
 const prefix='a'.repeat(109);
 for(const cluster of ['e\u0301','🇸🇪','👩🏽‍💻','👨‍👩‍👧‍👦']){
  assert.equal(truncatePreviewText(prefix+cluster+'tail'),prefix);
 }
});

test('fallback keeps common grapheme sequences intact without Intl.Segmenter',()=>{
 withoutIntlSegmenter(()=>{
  const cases=[
   ['a'.repeat(109),'e\u0301'],
   ['a'.repeat(108),'🇸🇪'],
   ['a'.repeat(108),'👩🏽'],
   ['a'.repeat(108),'👨‍👩‍👧‍👦'],
   ['a'.repeat(108),'1️⃣'],
   ['a'.repeat(108),'한'],
   ['a'.repeat(108),'🏴\u{E0067}\u{E0062}\u{E007F}']
  ];
  for(const [prefix,cluster] of cases){
   assert.equal(truncatePreviewText(prefix+cluster+'tail'),prefix,JSON.stringify(cluster));
  }
 });
});

test('fallback retains a complete grapheme when it exactly fits the code-unit limit',()=>{
 withoutIntlSegmenter(()=>{
  const combiningPrefix='a'.repeat(109);
  const flagPrefix='a'.repeat(106);
  assert.equal(truncatePreviewText(combiningPrefix+'e\u0301tail',111),combiningPrefix+'e\u0301');
  assert.equal(truncatePreviewText(flagPrefix+'🇸🇪tail',110),flagPrefix+'🇸🇪');
 });
});

test('short text and explicit limits remain predictable',()=>{
 assert.equal(truncatePreviewText('Привет 😀'),'Привет 😀');
 assert.equal(truncatePreviewText('abcdef',3),'abc');
 assert.equal(truncatePreviewText('abcdef',0),'');
 assert.equal(truncatePreviewText('abcdef',Number.NaN),'abcdef');
});

test('direct and group inbox draft previews use the shared grapheme-safe helper',()=>{
 const direct=source('components/ChatInboxRow.tsx');
 const group=source('components/GroupInboxRow.tsx');
 assert.ok(direct.includes("truncatePreviewText(draft.trim().replace(/\\s+/g,' '))"));
 assert.ok(group.includes("truncatePreviewText((draft??'').trim().replace(/\\s+/g,' '))"));
 assert.ok(!direct.includes(".slice(0,110)"));
 assert.ok(!group.includes("{draft.trim()}"));
});
