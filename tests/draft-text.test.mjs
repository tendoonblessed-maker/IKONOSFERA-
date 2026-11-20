import assert from 'node:assert/strict';
import {test} from 'node:test';
import {truncateDraftText} from '../lib/draft-text.mjs';

function hasUnpairedSurrogate(text){
 for(let i=0;i<text.length;i++){
  const code=text.charCodeAt(i);
  if(code>=0xd800&&code<=0xdbff){
   const next=text.charCodeAt(i+1);
   if(next<0xdc00||next>0xdfff)return true;
   i++;
  }else if(code>=0xdc00&&code<=0xdfff)return true;
 }
 return false;
}

test('truncation does not leave a high surrogate at the 4000-code-unit boundary',()=>{
 const prefix='x'.repeat(3999);
 const truncated=truncateDraftText(prefix+'😀tail',4000);
 assert.equal(truncated,prefix);
 assert.equal(truncated.length,3999);
 assert.equal(hasUnpairedSurrogate(truncated),false);
});

test('a supplementary character is preserved when its full pair fits',()=>{
 const prefix='x'.repeat(3998);
 const truncated=truncateDraftText(prefix+'😀tail',4000);
 assert.equal(truncated,prefix+'😀');
 assert.equal(truncated.length,4000);
 assert.equal(hasUnpairedSurrogate(truncated),false);
});

test('grapheme segmentation keeps combining marks, flags, modifiers and ZWJ emoji together',()=>{
 assert.equal(truncateDraftText('abc e\u0301tail',5),'abc ');
 assert.equal(truncateDraftText('x🇪🇪y',3),'x');
 assert.equal(truncateDraftText('x👍🏽y',3),'x');
 assert.equal(truncateDraftText('ab👨‍👩‍👧‍👦z',6),'ab');
});

test('portable fallback preserves common grapheme clusters without Intl.Segmenter',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');
 try{
  Object.defineProperty(Intl,'Segmenter',{value:undefined,configurable:true,writable:true});
  assert.equal(truncateDraftText('abc e\u0301tail',5),'abc ');
  assert.equal(truncateDraftText('x🇪🇪y',3),'x');
  assert.equal(truncateDraftText('x👍🏽y',3),'x');
  assert.equal(truncateDraftText('ab👨‍👩‍👧‍👦z',6),'ab');
  assert.equal(truncateDraftText('x\u1100\u1161\u11a8y',2),'x');
  assert.equal(truncateDraftText('x\r\ny',2),'x');
  assert.equal(truncateDraftText('a\u{1e944}b',1),'');
  assert.equal(truncateDraftText('a\u{1e944}b',3),'a\u{1e944}');
 }finally{
  if(descriptor)Object.defineProperty(Intl,'Segmenter',descriptor);
  else delete Intl.Segmenter;
 }
});

test('portable fallback keeps Indic virama conjuncts intact at draft boundaries',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');
 try{
  Object.defineProperty(Intl,'Segmenter',{value:undefined,configurable:true,writable:true});
  assert.equal(truncateDraftText('xक्षy',3),'x');
  assert.equal(truncateDraftText('xक्षy',4),'xक्ष');
  assert.equal(truncateDraftText('xক্কy',3),'x');
  assert.equal(truncateDraftText('xક્‍ષy',4),'x');
  assert.equal(truncateDraftText('xக்ஷy',3),'x');
  assert.equal(truncateDraftText('xक्!y',3),'xक्');
 }finally{
  if(descriptor)Object.defineProperty(Intl,'Segmenter',descriptor);
  else delete Intl.Segmenter;
 }
});

test('Intl.Segmenter keeps Prepend characters joined to the following grapheme',()=>{
 if(typeof Intl.Segmenter!=='function')return;
 assert.equal(truncateDraftText('\u0600A',1),'');
 assert.equal(truncateDraftText('\u0600A',2),'\u0600A');
 assert.equal(truncateDraftText('x\u0600A',2),'x');
});

test('portable fallback keeps Prepend sequences intact without Intl.Segmenter',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');
 try{
  Object.defineProperty(Intl,'Segmenter',{value:undefined,configurable:true,writable:true});
  assert.equal(truncateDraftText('\u0600A',1),'');
  assert.equal(truncateDraftText('\u0600A',2),'\u0600A');
  assert.equal(truncateDraftText('x\u0600A',2),'x');
  assert.equal(truncateDraftText('\u0600\u0601A',2),'');
  assert.equal(truncateDraftText('\u0600\u0601A',3),'\u0600\u0601A');
 }finally{
  if(descriptor)Object.defineProperty(Intl,'Segmenter',descriptor);
  else delete Intl.Segmenter;
 }
});

test('small boundaries and already-short drafts remain unchanged',()=>{
 assert.equal(truncateDraftText('a😀b',2),'a');
 assert.equal(truncateDraftText('a😀b',3),'a😀');
 assert.equal(truncateDraftText('a😀b',4),'a😀b');
 assert.equal(truncateDraftText('a😀b',0),'');
});
