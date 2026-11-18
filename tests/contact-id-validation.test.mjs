import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/contacts.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const OWNER='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const CONTACT='BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB';
const OTHER='CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC';
function setup(fetcher){
 const calls=[];
 const exports={};
 const context={
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-key'}},
  fetch:async(url,options)=>{calls.push({url,options});return fetcher(url,options,calls.length);},
  require(name){
   if(name==='@/lib/supabase-rest')return {apiUrl:'https://unit.test'};
   throw new Error('Unexpected module: '+name);
  }
 };
 vm.runInNewContext(compiled,context,{timeout:2500,filename:'contacts.cjs'});
 return {api:exports,calls};
}
const response=(body,status=200)=>({ok:true,status,json:async()=>body});
const jsonBody=call=>JSON.parse(call.options.body);

test('contact and blocklist read requests reject malformed owner UUIDs before network access',async()=>{
 const {api,calls}=setup(async()=>response([]));
 await assert.rejects(api.listSavedContacts('token','----'),/идентификатор пользователя/);
 await assert.rejects(api.listBlockedUsers('token','11111111111111111111111111111111'),/идентификатор пользователя/);
 assert.equal(calls.length,0);
});

test('adding self as contact or block is rejected case-insensitively',async()=>{
 const {api,calls}=setup(async()=>response(null,201));
 await assert.rejects(api.addSavedContact('token',OWNER,OWNER.toLowerCase()),/Нельзя добавить себя/);
 await assert.rejects(api.addBlockedUser('token',OWNER,OWNER.toLowerCase()),/Нельзя заблокировать себя/);
 assert.equal(calls.length,0);
});

test('contact and blocklist read responses normalize valid UUIDs and ignore malformed rows and duplicates',async()=>{
 const {api,calls}=setup(async(url)=>url.includes('user_contacts')
  ?response([{contact_id:CONTACT.toLowerCase()},{contact_id:CONTACT},{contact_id:OTHER.toLowerCase()},{contact_id:'---'},null])
  :response([{blocked_id:CONTACT.toLowerCase()},{blocked_id:OTHER.toLowerCase()},{blocked_id:'not-a-uuid'}]));
 const contacts=Array.from(await api.listSavedContacts('token',OWNER.toLowerCase()));
 const blocked=Array.from(await api.listBlockedUsers('token',OWNER));
 assert.deepEqual(contacts,[CONTACT.toLowerCase(),OTHER.toLowerCase()]);
 assert.deepEqual(blocked,[CONTACT.toLowerCase(),OTHER.toLowerCase()]);
 assert.equal(calls.length,2);
 assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer token'));
 assert.ok(calls.every(call=>call.url.includes(OWNER.toLowerCase())));
});

test('add and remove mutations canonicalize UUIDs before body or filters',async()=>{
 const {api,calls}=setup(async(_url,options)=>response(null,options.method==='POST'?201:204));
 await api.addSavedContact('token',OWNER.toUpperCase(),CONTACT.toUpperCase());
 await api.removeSavedContact('token',OWNER.toUpperCase(),CONTACT.toUpperCase());
 await api.addBlockedUser('token',OWNER.toUpperCase(),OTHER.toUpperCase());
 await api.removeBlockedUser('token',OWNER.toUpperCase(),OTHER.toUpperCase());
 assert.equal(calls.length,4);
 assert.deepEqual(jsonBody(calls[0]),{owner_id:OWNER.toLowerCase(),contact_id:CONTACT.toLowerCase()});
 assert.ok(calls[1].url.includes('owner_id=eq.'+OWNER.toLowerCase()));
 assert.ok(calls[1].url.includes('contact_id=eq.'+CONTACT.toLowerCase()));
 assert.deepEqual(jsonBody(calls[2]),{owner_id:OWNER.toLowerCase(),blocked_id:OTHER.toLowerCase()});
 assert.ok(calls[3].url.includes('owner_id=eq.'+OWNER.toLowerCase()));
 assert.ok(calls[3].url.includes('blocked_id=eq.'+OTHER.toLowerCase()));
});

test('malformed target UUIDs are rejected for every mutation before fetch',async()=>{
 const {api,calls}=setup(async()=>response(null,201));
 await assert.rejects(api.addSavedContact('token',OWNER,'36-dashes'),/идентификатор пользователя/);
 await assert.rejects(api.removeSavedContact('token',OWNER,'bad-id'),/идентификатор пользователя/);
 await assert.rejects(api.addBlockedUser('token',OWNER,'bad-id'),/идентификатор пользователя/);
 await assert.rejects(api.removeBlockedUser('token',OWNER,'bad-id'),/идентификатор пользователя/);
 assert.equal(calls.length,0);
});

test('a non-array list response is treated as empty',async()=>{
 const {api,calls}=setup(async()=>response({unexpected:'object'}));
 assert.deepEqual(Array.from(await api.listSavedContacts('token',OWNER)),[]);
 assert.deepEqual(Array.from(await api.listBlockedUsers('token',OWNER)),[]);
 assert.equal(calls.length,2);
});
