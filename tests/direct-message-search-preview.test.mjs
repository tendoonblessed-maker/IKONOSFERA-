import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {slicePreviewText,truncatePreviewText} from '../lib/text-preview.ts';

const source=readFileSync(new URL('../components/DirectMessageSearchPanel.tsx',import.meta.url),'utf8');
const groupSource=readFileSync(new URL('../components/GroupSearchPanel.tsx',import.meta.url),'utf8');
const helperSource=readFileSync(new URL('../lib/direct-message-search-preview.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(helperSource,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const exports={};
vm.runInNewContext(compiled,{
 exports,Intl,
 require(name){
  assert.equal(name,'./text-preview');
  return {slicePreviewText,truncatePreviewText};
 }
},{filename:'direct-message-search-preview.cjs',timeout:2000});
const {directMessageSearchExcerpt}=exports;

function assertWellFormedUnicode(value){
 for(let i=0;i<value.length;i++){
  const code=value.charCodeAt(i);
  if(code>=0xD800&&code<=0xDBFF){
   assert.ok(i+1<value.length,'high surrogate must have a following low surrogate');
   const next=value.charCodeAt(i+1);
   assert.ok(next>=0xDC00&&next<=0xDFFF,'high surrogate must be paired');
   i++;
  }else{
   assert.ok(code<0xDC00||code>0xDFFF,'low surrogate must have a preceding high surrogate');
  }
 }
}

test('direct search excerpt keeps a complete grapheme when its start offset falls inside it',()=>{
 const family='👨‍👩‍👧‍👦';
 const body='x'.repeat(50)+family+'y'.repeat(30)+'needle'+'z'.repeat(240);
 const excerpt=directMessageSearchExcerpt(body,'NEEDLE');
 assert.ok(excerpt.startsWith('…'+family),'the leading excerpt must not detach the family emoji');
 assert.ok(excerpt.includes('needle'));
 assert.ok(excerpt.endsWith('…'));
 assertWellFormedUnicode(excerpt);
});

test('direct search excerpt never splits a trailing emoji at the 210-unit boundary',()=>{
 const body='needle'+'x'.repeat(203)+'😀'+'tail';
 const excerpt=directMessageSearchExcerpt(body,'needle');
 assert.equal(excerpt,'needle'+'x'.repeat(203)+'…');
 assertWellFormedUnicode(excerpt);
});

test('locale-lowercase expansion maps the match back to the original message offset',()=>{
 const body='a'.repeat(50)+'İ'+'b'.repeat(40)+'Needle'+'c'.repeat(240);
 const excerpt=directMessageSearchExcerpt(body,'needle');
 assert.ok(excerpt.startsWith('…'+'b'.repeat(38)+'Needle'));
 assertWellFormedUnicode(excerpt);
});

test('fallback without Intl.Segmenter keeps common ZWJ graphemes intact',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');
 assert.ok(descriptor,'test runtime should expose Intl.Segmenter for fallback simulation');
 try{
  Object.defineProperty(Intl,'Segmenter',{...descriptor,value:undefined});
  const family='👨‍👩‍👧‍👦';
  const body='x'.repeat(50)+family+'y'.repeat(30)+'needle'+'z'.repeat(240);
  const excerpt=directMessageSearchExcerpt(body,'needle');
  assert.ok(excerpt.startsWith('…'+family));
  assertWellFormedUnicode(excerpt);
 }finally{
  Object.defineProperty(Intl,'Segmenter',descriptor);
 }
});

test('direct search panel renders the shared grapheme-safe excerpt helper',()=>{
 assert.match(source,/import \{directMessageSearchExcerpt\} from '@\/lib\/direct-message-search-preview'/);
 assert.match(source,/directMessageSearchExcerpt\(message\.body,needle\)/);
 assert.doesNotMatch(source,/full\.slice\(start,start\+210\)/);
});

test('direct and group search inputs follow the first strong character direction',()=>{
 assert.match(source,/<input autoFocus dir="auto" aria-label="Поиск сообщений в текущем чате"/);
 assert.match(groupSource,/<input autoFocus dir="auto" type="search" aria-label="Найти сообщение в группе"/);
});

test('direct and group search snippets are isolated from surrounding bidirectional text',()=>{
 assert.match(source,/<span className="ik-direct-search-result-text"><bdi dir="auto">\{snippet\}<\/bdi><\/span>/);
 assert.match(groupSource,/<span className="ik-group-search-snippet"><bdi dir="auto">\{groupSearchExcerpt\(message\.body,term\)\}<\/bdi><\/span>/);
});
