import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const helper=readFileSync(new URL('../lib/social-upload-id.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(helper,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(source){
 const exports={};
 vm.runInNewContext(compiled,{exports,Uint8Array,Array,Error,RegExp,String,globalThis:{crypto:source}}, {timeout:1000});
 return exports.createSocialUploadId;
}
const valid='12345678-1234-4123-8123-123456789abc';

test('prefers a valid native randomUUID',()=>{
 let fallbackCalls=0;
 const create=load({randomUUID:()=>valid,getRandomValues(){fallbackCalls++;}});
 assert.equal(create(),valid);
 assert.equal(fallbackCalls,0);
});

test('uses a cryptographic UUID v4 fallback when randomUUID is absent',()=>{
 const create=load({getRandomValues(bytes){bytes.set(Array.from({length:16},(_,i)=>i));return bytes;}});
 assert.equal(create(), '00010203-0405-4607-8809-0a0b0c0d0e0f');
});

test('falls back when native randomUUID throws',()=>{
 const create=load({randomUUID(){throw Error('partial implementation');},getRandomValues(bytes){bytes.fill(0);return bytes;}});
 assert.equal(create(),'00000000-0000-4000-8000-000000000000');
});

test('falls back when native randomUUID returns a malformed ID',()=>{
 const create=load({randomUUID:()=> 'not-an-id',getRandomValues(bytes){bytes.fill(0);return bytes;}});
 assert.equal(create(),'00000000-0000-4000-8000-000000000000');
});

test('fails closed if secure randomness is unavailable or throws',()=>{
 const create=load({});
 assert.throws(()=>create(),/Безопасная генерация/);
 const broken=load({getRandomValues(){throw Error('blocked');}});
 assert.throws(()=>broken(),/Безопасная генерация/);
});

test('profile and story uploads use the portable secure ID helper',()=>{
 const social=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');
 assert.match(social,/import\s*\{\s*createSocialUploadId\s*\}\s*from\s*['"]@\/lib\/social-upload-id['"]/);
 assert.match(social,/createSocialUploadId\(\)/);
 assert.doesNotMatch(social,/crypto\.randomUUID\(\)/);
});
