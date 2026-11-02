import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {assertValidUserId,assertDifferentUser} from '../lib/contact-ids.ts';

const A='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const B='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

test('contact actions reject invalid owner and target IDs before making a request',()=>{
 for(const invalid of ['','not-a-uuid','a'.repeat(36),'12345678-1234-1234-1234-1234567890zz',' '+A,A+'%2C',A+'\n',A+'\u2028']) {
  assert.throws(()=>assertValidUserId(invalid),/Некорректный идентификатор/);
  assert.throws(()=>assertDifferentUser(A,invalid,'contact'),/Некорректный идентификатор/);
  assert.throws(()=>assertDifferentUser(invalid,B,'block'),/Некорректный идентификатор/);
 }
});

test('valid UUIDs are accepted, including mixed-case identifiers',()=>{
 assert.doesNotThrow(()=>assertValidUserId(A.toUpperCase()));
 assert.doesNotThrow(()=>assertDifferentUser(A,B,'contact'));
 assert.doesNotThrow(()=>assertDifferentUser(A,B,'block'));
});

test('cannot add or block own account with differently cased UUID',()=>{
 assert.throws(()=>assertDifferentUser(A,A.toUpperCase(),'contact'),/Нельзя добавить себя в контакты/);
 assert.throws(()=>assertDifferentUser(A.toUpperCase(),A,'block'),/Нельзя заблокировать себя/);
});

test('all contact and block operations validate IDs before network requests',()=>{
 const source=readFileSync(new URL('../lib/contacts.ts',import.meta.url),'utf8');
 const guards={
  listSavedContacts:['assertValidUserId(ownerId)'],
  addSavedContact:['assertDifferentUser(ownerId,contactId,"contact")'],
  removeSavedContact:['assertValidUserId(ownerId)','assertValidUserId(contactId)'],
  listBlockedUsers:['assertValidUserId(ownerId)'],
  addBlockedUser:['assertDifferentUser(ownerId,blockedId,"block")'],
  removeBlockedUser:['assertValidUserId(ownerId)','assertValidUserId(blockedId)']
 };
 for(const [name,checks] of Object.entries(guards)){
  const start=source.indexOf('export async function '+name+'(');
  assert.ok(start>=0,name+' exists');
  const end=source.indexOf('\n}',start);
  const body=source.slice(start,end);
  const request=body.indexOf('await request');
  assert.ok(request>=0,name+' sends an HTTP request');
  for(const check of checks){
   const guard=body.indexOf(check);
   assert.ok(guard>=0&&guard<request,name+' must validate '+check+' before fetch');
  }
 }
});
