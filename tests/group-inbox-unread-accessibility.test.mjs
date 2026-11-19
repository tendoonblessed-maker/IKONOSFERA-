import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('direct and group inbox rows use the shared unread badge formatter',()=>{
 const direct=load('components/ChatInboxRow.tsx');
 const group=load('components/GroupInboxRow.tsx');
 assert.match(direct,/formatUnreadBadge\(preview\?\.unread_count\)/);
 assert.match(group,/formatUnreadBadge\(overview\?\.unread_count\)/);
 assert.match(direct,/aria-label=\{unreadBadge\.ariaLabel\}/);
 assert.match(group,/aria-label=\{unreadBadge\.ariaLabel\}/);
 assert.match(direct,/\{unreadBadge\.visible\}/);
 assert.match(group,/\{unreadBadge\.visible\}/);
});

test('group unread badge announces what its number means to assistive technology',()=>{
 const group=load('components/GroupInboxRow.tsx');
 assert.match(group,/aria-label=\{unreadBadge\.ariaLabel\}/);
});

test('direct and group inbox rows preserve the exact accessible count when visual text is capped',()=>{
 const direct=load('components/ChatInboxRow.tsx');
 const group=load('components/GroupInboxRow.tsx');
 assert.match(direct,/\{unreadBadge\.visible\}/);
 assert.match(group,/\{unreadBadge\.visible\}/);
});
