import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {truncatePreviewText} from '../lib/text-preview.ts';

const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

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

test('code-point fallback remains safe when Intl.Segmenter is unavailable',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');
 try{
  Object.defineProperty(Intl,'Segmenter',{configurable:true,writable:true,value:undefined});
  const prefix='a'.repeat(109);
  assert.equal(truncatePreviewText(prefix+'😀tail'),prefix);
 }finally{
  if(descriptor)Object.defineProperty(Intl,'Segmenter',descriptor);
 }
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
