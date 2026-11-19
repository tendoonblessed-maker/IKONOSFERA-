import assert from 'node:assert/strict';
import {test} from 'node:test';
import {formatUnreadBadge} from '../lib/unread-count.mjs';

test('unread badge omits zero, negative and invalid values',()=>{
 for(const value of [0,'0',-1,-4,NaN,Infinity,-Infinity,'not-a-count',null,undefined,0.5])
  assert.equal(formatUnreadBadge(value),null,'value '+String(value)+' should not create a badge');
});

test('unread badge displays counts up to 99 without changing their accessible label',()=>{
 assert.deepEqual(formatUnreadBadge(1),{count:1,visible:'1',ariaLabel:'Непрочитанных: 1'});
 assert.deepEqual(formatUnreadBadge(99),{count:99,visible:'99',ariaLabel:'Непрочитанных: 99'});
});

test('unread badge caps the visible count but keeps the full count accessible',()=>{
 assert.deepEqual(formatUnreadBadge(100),{count:100,visible:'99+',ariaLabel:'Непрочитанных: 100'});
 assert.deepEqual(formatUnreadBadge('125'),{count:125,visible:'99+',ariaLabel:'Непрочитанных: 125'});
});

test('malformed fractional values are normalized to a whole unread count',()=>{
 assert.deepEqual(formatUnreadBadge(3.9),{count:3,visible:'3',ariaLabel:'Непрочитанных: 3'});
});
