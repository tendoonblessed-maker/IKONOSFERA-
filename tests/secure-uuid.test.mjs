import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createSecureUuid} from '../lib/secure-uuid.mjs';

const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('prefers a valid native UUID v4',()=>{
 const native='12345678-1234-4234-8234-123456789abc';
 assert.equal(createSecureUuid({randomUUID:()=>native,getRandomValues(){throw Error('unused');}}),native);
});

test('falls back to secure random bytes when randomUUID is absent',()=>{
 const source={getRandomValues(bytes){bytes.set(Array.from({length:16},(_,i)=>i));return bytes;}};
 assert.equal(createSecureUuid(source),'00010203-0405-4607-8809-0a0b0c0d0e0f');
});

test('falls back when native UUID generation throws or returns malformed data',()=>{
 const bytes={getRandomValues(target){target.fill(0);return target;}};
 assert.match(createSecureUuid({randomUUID(){throw Error('unsupported');},...bytes}),UUID_V4);
 assert.match(createSecureUuid({randomUUID:()=> 'not-a-uuid',...bytes}),UUID_V4);
});

test('fails closed when secure randomness is unavailable or fails',()=>{
 assert.throws(()=>createSecureUuid(undefined),/Безопасная генерация идентификатора/);
 assert.throws(()=>createSecureUuid({getRandomValues(){throw Error('blocked');}}),/Безопасная генерация идентификатора/);
});

test('group send attempts use the secure UUID helper instead of randomUUID directly',()=>{
 const source=readFileSync(new URL('../lib/group-send-attempts.ts',import.meta.url),'utf8');
 assert.match(source,/import \{createSecureUuid\} from '\.\/secure-uuid\.mjs'/);
 assert.match(source,/id:createSecureUuid\(\)/);
 assert.doesNotMatch(source,/crypto\.randomUUID\(\)/);
});
